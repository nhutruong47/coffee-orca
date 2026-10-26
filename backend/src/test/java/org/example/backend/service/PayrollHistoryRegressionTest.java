package org.example.backend.service;

import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.example.backend.entity.*;
import org.example.backend.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayInputStream;
import java.time.LocalDate;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(properties = "spring.jpa.show-sql=false")
@Transactional
class PayrollHistoryRegressionTest {
    @Autowired PayrollService payroll;
    @Autowired UserRepository users;
    @Autowired TeamRepository teams;
    @Autowired TeamMemberRepository members;
    @Autowired AttendanceRepository attendances;
    @Autowired PayrollMemberRateService rateService;
    User worker;
    Team team;
    TeamMember membership;

    @BeforeEach
    void setup() {
        worker = new User(); worker.setUsername("payroll-history-" + UUID.randomUUID());
        worker.setPassword("unused-test-only"); worker = users.save(worker);
        team = team();
        membership = new TeamMember(); membership.setTeam(team); membership.setUser(worker);
        membership = members.save(membership);
    }

    private Team team() {
        Team t = new Team(); t.setName("Historical payroll"); t.setOwner(worker);
        return teams.save(t);
    }

    private Attendance shift(Team t, LocalDate day) {
        Attendance a = new Attendance(); a.setTeam(t); a.setUser(worker); a.setDate(day);
        a.setCheckInTime(day.atTime(8, 0)); a.setCheckOutTime(day.atTime(18, 0));
        a.setBreakMinutes(0); a.setStandardHours(8.0); a.setHourlyRateVnd(60000.0);
        a.setOvertimeMultiplier(2.0);
        return attendances.save(a);
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> items(Map<String, Object> report) {
        return (List<Map<String, Object>>) report.get("items");
    }

    private XSSFWorkbook excel() throws Exception {
        return new XSSFWorkbook(new ByteArrayInputStream(payroll.exportExcel(team.getId(), 2026, 9)));
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"missingRate", "zeroRate", "negativeRate", "missingStandard", "zeroStandard", "missingMultiplier", "lowMultiplier", "missingBreak", "negativeBreak"})
    void unknownSnapshotNeverInventsPayAndRequiresReview(String invalid) throws Exception {
        Attendance a = shift(team, LocalDate.of(2026, 9, 12));
        switch (invalid) {
            case "missingRate" -> a.setHourlyRateVnd(null);
            case "zeroRate" -> a.setHourlyRateVnd(0.0);
            case "negativeRate" -> a.setHourlyRateVnd(-1.0);
            case "missingStandard" -> a.setStandardHours(null);
            case "zeroStandard" -> a.setStandardHours(0.0);
            case "missingMultiplier" -> a.setOvertimeMultiplier(null);
            case "lowMultiplier" -> a.setOvertimeMultiplier(1.0);
            case "missingBreak" -> a.setBreakMinutes(null);
            case "negativeBreak" -> a.setBreakMinutes(-1);
        }
        attendances.saveAndFlush(a);
        var report = payroll.report(team.getId(), 2026, 9);
        var item = items(report).getFirst();
        assertEquals(0L, item.get("netPayVnd"), "Unknown historical snapshot must not produce invented wages");
        assertEquals(1, item.get("needsReviewCount"));
        assertEquals(1, ((Map<?, ?>) report.get("summary")).get("needsReviewCount"));
        @SuppressWarnings("unchecked")
        var line = ((List<Map<String, Object>>) item.get("attendanceLines")).getFirst();
        assertEquals(false, line.get("payable"));
        assertEquals("UNKNOWN", line.get("snapshotStatus"));
        assertNotNull(line.get("warning"));
        if (invalid.endsWith("Rate")) assertNull(line.get("hourlyRateVnd"));
        if (invalid.endsWith("Standard")) assertNull(line.get("standardHours"));
        if (invalid.endsWith("Multiplier")) assertNull(line.get("overtimeMultiplier"));
        try (var wb = excel()) {
            assertEquals(0, wb.getSheetAt(0).getRow(1).getCell(11).getNumericCellValue());
            assertEquals(1, wb.getSheetAt(0).getRow(1).getCell(13).getNumericCellValue());
        }
    }

    @Test
    void excelRateColumnReflectsHistoricalSnapshotOrMultipleRatesWithoutBreakingCurrentRateField() throws Exception {
        shift(team, LocalDate.of(2026, 9, 10));
        rateService.updateMemberRate(team.getId(), worker.getId(), Map.of("hourlyRateVnd", 90000));
        var single = items(payroll.report(team.getId(), 2026, 9)).getFirst();
        assertEquals(90000.0, single.get("hourlyRateVnd"), "UI current rate field must remain intact");
        assertEquals(60000.0, single.get("historicalHourlyRateVnd"));
        try (var wb = excel()) {
            assertEquals(60000.0, wb.getSheetAt(0).getRow(1).getCell(7).getNumericCellValue());
        }
        Attendance raised = shift(team, LocalDate.of(2026, 9, 20));
        raised.setHourlyRateVnd(75000.0); attendances.saveAndFlush(raised);
        var multi = items(payroll.report(team.getId(), 2026, 9)).getFirst();
        assertEquals(90000.0, multi.get("hourlyRateVnd"));
        assertNull(multi.get("historicalHourlyRateVnd"));
        assertTrue(multi.get("historicalRateLabel").toString().contains("60000"));
        assertTrue(multi.get("historicalRateLabel").toString().contains("75000"));
        try (var wb = excel()) {
            String cell = wb.getSheetAt(0).getRow(1).getCell(7).getStringCellValue();
            assertTrue(cell.contains("60000") && cell.contains("75000"), cell);
        }
    }

    @Test
    void removedMembershipPreservesOnlyThisTeamsPeriodAttendanceInReportAndExcel() throws Exception {
        Attendance earned = shift(team, LocalDate.of(2026, 9, 12));
        shift(team, LocalDate.of(2026, 8, 31));
        shift(team(), LocalDate.of(2026, 9, 12));
        members.delete(membership); members.flush();
        var report = payroll.report(team.getId(), 2026, 9);
        assertEquals(1, items(report).size(), "Former worker must remain in historical payroll");
        var item = items(report).getFirst();
        assertEquals(worker.getId().toString(), item.get("memberId"));
        assertEquals(720000L, item.get("netPayVnd"));
        @SuppressWarnings("unchecked")
        var lines = (List<Map<String, Object>>) item.get("attendanceLines");
        assertEquals(1, lines.size());
        assertEquals(earned.getId().toString(), lines.getFirst().get("id"));
        try (var wb = excel()) {
            assertEquals(worker.getUsername(), wb.getSheetAt(0).getRow(1).getCell(1).getStringCellValue());
            assertEquals(720000, wb.getSheetAt(0).getRow(1).getCell(11).getNumericCellValue());
        }
    }
}
