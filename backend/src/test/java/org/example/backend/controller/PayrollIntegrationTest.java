package org.example.backend.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.example.backend.entity.*;
import org.example.backend.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayInputStream;
import java.time.LocalDate;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = "spring.jpa.show-sql=false")
@AutoConfigureMockMvc
@Transactional
class PayrollIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired UserRepository users;
    @Autowired TeamRepository teams;
    @Autowired TeamMemberRepository members;
    @Autowired AttendanceRepository attendances;
    @Autowired TaskRepository tasks;
    @Autowired GoalRepository goals;
    @Autowired EntityManager em;
    @Autowired org.example.backend.service.PayrollMemberRateService rateService;
    User owner;
    User employee;
    Team team;

    @BeforeEach
    void setup() {
        owner = person("payroll-owner-" + UUID.randomUUID());
        employee = person("tran.quoc.bao");
        team = workshop(owner);
        membership(team, owner, GroupRole.ADMIN);
        membership(team, employee, GroupRole.MEMBER);
    }

    private User person(String username) {
        User p = new User(); p.setUsername(username); p.setPassword("unused-test-only");
        return users.save(p);
    }

    private Team workshop(User admin) {
        Team t = new Team(); t.setName("Payroll workshop"); t.setOwner(admin);
        return teams.save(t);
    }

    private void membership(Team t, User p, GroupRole role) {
        TeamMember m = new TeamMember(); m.setTeam(t); m.setUser(p); m.setGroupRole(role);
        members.save(m);
    }

    private JsonNode report() throws Exception {
        return json.readTree(mvc.perform(get("/api/payroll/teams/" + team.getId())
                .param("year", "2026").param("month", "9").with(user(owner)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private JsonNode employeeItem(JsonNode report) {
        for (JsonNode item : report.path("items")) {
            if (employee.getId().toString().equals(item.path("memberId").asText())) return item;
        }
        fail("Employee missing from payroll"); return null;
    }

    private Attendance shift(Team t, LocalDate day, Integer endHour) {
        Attendance a = new Attendance(); a.setUser(employee); a.setTeam(t); a.setDate(day);
        a.setCheckInTime(day.atTime(8, 0));
        if (endHour != null) a.setCheckOutTime(day.atTime(endHour, 0));
        a.setBreakMinutes(60); a.setStandardHours(8.0); a.setHourlyRateVnd(60000.0);
        a.setOvertimeMultiplier(2.0);
        // Persisted cached hours can be stale: timestamps are the payroll source.
        a.setRegularHours(999.0); a.setOvertimeHours(999.0);
        return attendances.save(a);
    }

    @Test
    void closedAttendanceUsesSnapshotRatesAndOnlyRequestedTeamMonth() throws Exception {
        Attendance expected = shift(team, LocalDate.of(2026, 9, 12), 19);
        shift(team, LocalDate.of(2026, 8, 31), 19);
        Team other = workshop(owner); membership(other, employee, GroupRole.MEMBER);
        shift(other, LocalDate.of(2026, 9, 12), 19);
        JsonNode r = report(); JsonNode item = employeeItem(r);
        assertEquals(8, item.path("regularHours").asDouble());
        assertEquals(2, item.path("overtimeHours").asDouble());
        assertEquals(480000, item.path("regularPayVnd").asDouble());
        assertEquals(240000, item.path("overtimePayVnd").asDouble());
        assertEquals(720000, r.path("summary").path("netPayVnd").asDouble());
        assertEquals(1, item.path("attendanceDays").asInt());
        assertEquals(1, item.path("attendanceLines").size());
        JsonNode line = item.path("attendanceLines").get(0);
        assertEquals(expected.getId().toString(), line.path("id").asText());
        assertTrue(line.path("payable").asBoolean());
        assertEquals(10, line.path("workedHours").asDouble());
        assertEquals(60000, line.path("hourlyRateVnd").asDouble());
        assertEquals(2, line.path("overtimeMultiplier").asDouble());
    }

    @Test
    void openShiftAndUntrustedEvidenceStayZeroPayAndUnverified() throws Exception {
        Attendance open = shift(team, LocalDate.of(2026, 9, 15), null);
        open.setLocationVerified(true); // Untrusted draft row without locationStatus.
        open.setCheckInPhotoUrl("https://example.test/not-persisted-evidence.jpg");
        attendances.save(open);
        JsonNode r = report(); JsonNode item = employeeItem(r);
        assertEquals(0, r.path("summary").path("netPayVnd").asDouble());
        assertEquals(1, r.path("summary").path("missingCheckoutCount").asInt());
        assertEquals(1, item.path("missingCheckoutDays").asInt());
        JsonNode line = item.path("attendanceLines").get(0);
        assertFalse(line.path("payable").asBoolean());
        assertEquals(0, line.path("workedHours").asDouble());
        assertEquals(0, line.path("totalPayVnd").asDouble());
        assertTrue(line.path("locationVerified").isNull());
        assertEquals("UNVERIFIED", line.path("locationStatus").asText());
        assertFalse(line.path("hasCheckInPhoto").asBoolean());
    }

    @Test
    void memberRatePersistsForNewShiftsWithoutMutatingExistingSnapshots() throws Exception {
        Attendance historical = shift(team, LocalDate.of(2026, 9, 10), 17);
        mvc.perform(put("/api/payroll/teams/" + team.getId() + "/members/" + employee.getId() + "/rate")
                .with(user(owner)).contentType("application/json").content("{\"hourlyRateVnd\":85000}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.hourlyRateVnd").value(85000.0))
                .andExpect(jsonPath("$.items").doesNotExist());
        em.flush(); em.clear();
        JsonNode r = report(); JsonNode item = employeeItem(r);
        assertEquals(85000, item.path("hourlyRateVnd").asDouble());
        JsonNode line = item.path("attendanceLines").get(0);
        assertEquals(historical.getId().toString(), line.path("id").asText());
        assertEquals(60000, line.path("hourlyRateVnd").asDouble());
        assertEquals(480000, item.path("regularPayVnd").asDouble());
        assertEquals(85000, rateService.getHourlyRate(team.getId(), employee.getId(), 50000));
        assertEquals(50000, rateService.getHourlyRate(team.getId(), owner.getId(), 50000));
        mvc.perform(put("/api/payroll/teams/" + team.getId() + "/members/" + UUID.randomUUID() + "/rate")
                .with(user(owner)).contentType("application/json").content("{\"hourlyRateVnd\":85000}"))
                .andExpect(status().isBadRequest());
        mvc.perform(put("/api/payroll/teams/" + team.getId() + "/members/" + employee.getId() + "/rate")
                .with(user(owner)).contentType("application/json").content("{\"hourlyRateVnd\":500}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void payrollRequiresTeamAdminAndExportMatchesCalculatedReport() throws Exception {
        User outsider = person("outsider-" + UUID.randomUUID());
        mvc.perform(get("/api/payroll/teams/" + team.getId()).with(user(employee)))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/payroll/teams/" + team.getId()).with(user(outsider)))
                .andExpect(status().isForbidden());
        mvc.perform(put("/api/payroll/teams/" + team.getId() + "/members/" + employee.getId() + "/rate")
                .with(user(employee)).contentType("application/json").content("{\"hourlyRateVnd\":70000}"))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/payroll/teams/" + team.getId() + "/export").with(user(employee)))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/payroll/teams/" + team.getId()).param("year", "1899").param("month", "9")
                .with(user(owner))).andExpect(status().isBadRequest());
        mvc.perform(get("/api/payroll/teams/" + team.getId() + "/export").param("year", "2026").param("month", "13")
                .with(user(owner))).andExpect(status().isBadRequest());

        shift(team, LocalDate.of(2026, 9, 12), 19);
        byte[] bytes = mvc.perform(get("/api/payroll/teams/" + team.getId() + "/export-excel")
                .param("year", "2026").param("month", "9").with(user(owner)))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", "attachment; filename=\"bang-luong-2026-09.xlsx\""))
                .andReturn().getResponse().getContentAsByteArray();
        try (XSSFWorkbook wb = new XSSFWorkbook(new ByteArrayInputStream(bytes))) {
            var sheet = wb.getSheetAt(0);
            var totalRow = sheet.getRow(sheet.getLastRowNum());
            assertEquals("TỔNG QUỸ LƯƠNG THÁNG", totalRow.getCell(2).getStringCellValue());
            assertEquals(720000.0, totalRow.getCell(11).getNumericCellValue());
        }
    }

    @Test
    void legacyTaskSalaryEndpointsRejectTaskHourFallbackAndFakePayout() throws Exception {
        Goal g = new Goal(); g.setTitle("Legacy salary goal"); g.setTeam(team); g.setOwner(owner); goals.save(g);
        Task t = new Task(); t.setTitle("Task with workload"); t.setGoal(g); t.setMember(employee);
        t.setStatus("COMPLETED"); t.setWorkload(80.0); t.setActualWorkload(80.0); t.setHourlyRate(100000.0);
        tasks.save(t);
        mvc.perform(get("/api/tasks/salary/" + team.getId()).with(user(employee)))
                .andExpect(status().isForbidden());
        JsonNode legacy = json.readTree(mvc.perform(get("/api/tasks/salary/" + team.getId())
                .param("year", "2026").param("month", "9").with(user(owner)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        for (JsonNode row : legacy) {
            if (employee.getId().toString().equals(row.path("memberId").asText())) {
                assertEquals(0.0, row.path("estimatedSalary").asDouble());
                assertEquals(0.0, row.path("regularHours").asDouble());
            }
        }
        byte[] excel = mvc.perform(get("/api/tasks/salary/" + team.getId() + "/export-excel")
                .param("year", "2026").param("month", "9").with(user(owner)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray();
        try (XSSFWorkbook wb = new XSSFWorkbook(new ByteArrayInputStream(excel))) {
            var sheet = wb.getSheetAt(0);
            assertEquals(0.0, sheet.getRow(sheet.getLastRowNum()).getCell(7).getNumericCellValue());
        }
        mvc.perform(post("/api/tasks/salary/" + team.getId() + "/payout")
                .param("year", "2026").param("month", "9").with(user(owner)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void noAttendanceNeverCreatesPayFromDemoNamesOrCompletedTaskHours() throws Exception {
        Goal g = new Goal(); g.setTitle("Completed roast"); g.setTeam(team); g.setOwner(owner); goals.save(g);
        Task t = new Task(); t.setTitle("Task is not attendance"); t.setGoal(g); t.setMember(employee);
        t.setStatus("COMPLETED"); t.setWorkload(100.0); t.setActualWorkload(100.0); t.setHourlyRate(999999.0);
        tasks.save(t);
        JsonNode r = report();
        assertEquals(0, r.path("summary").path("netPayVnd").asDouble());
        JsonNode item = employeeItem(r);
        assertEquals(0, item.path("regularHours").asDouble());
        assertEquals(0, item.path("allowanceVnd").asDouble());
        assertTrue(item.path("attendanceLines").isEmpty());
        assertTrue(item.path("lastCheckInAddress").isNull());
        assertTrue(item.path("lastLatitude").isNull());
        assertEquals("DRAFT", r.path("status").asText());
        assertEquals(team.getId() + ":2026-09", r.path("runId").asText());
        assertEquals(r.path("runId"), report().path("runId"));
    }
}
