package org.example.backend.service;

import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.example.backend.entity.Attendance;
import org.example.backend.entity.TeamMember;
import org.example.backend.entity.User;
import org.example.backend.repository.AttendanceRepository;
import org.example.backend.repository.AttendanceSettingsRepository;
import org.example.backend.repository.TeamMemberRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.Duration;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.*;

@Service
@Transactional(readOnly = true)
public class PayrollService {
    private static final ZoneId VN_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

    private final TeamMemberRepository members;
    private final AttendanceRepository attendances;
    private final AttendanceSettingsRepository settings;
    private final PayrollMemberRateService rates;

    public PayrollService(TeamMemberRepository members, AttendanceRepository attendances,
            AttendanceSettingsRepository settings, PayrollMemberRateService rates) {
        this.members = members;
        this.attendances = attendances;
        this.settings = settings;
        this.rates = rates;
    }

    public YearMonth resolvePeriod(Integer year, Integer month) {
        LocalDate today = LocalDate.now(VN_ZONE);
        int targetYear = year == null ? today.getYear() : year;
        int targetMonth = month == null ? today.getMonthValue() : month;
        if (targetYear < 1900 || targetYear > 2200 || targetMonth < 1 || targetMonth > 12) {
            throw new RuntimeException("Kỳ lương không hợp lệ.");
        }
        return YearMonth.of(targetYear, targetMonth);
    }

    public Map<String, Object> report(UUID teamId, Integer year, Integer month) {
        YearMonth period = resolvePeriod(year, month);
        var teamSettings = settings.findByTeamId(teamId).orElse(null);
        double defaultRate = teamSettings != null && teamSettings.getHourlyRateVnd() != null
                ? teamSettings.getHourlyRateVnd() : 50000.0;
        double defaultOt = teamSettings != null && teamSettings.getOvertimeMultiplier() != null
                ? teamSettings.getOvertimeMultiplier() : 1.5;
        Map<UUID, Double> memberRates = rates.ratesForTeam(teamId);
        Map<UUID, TeamMember> currentMembers = new LinkedHashMap<>();
        Map<UUID, User> people = new LinkedHashMap<>();
        for (TeamMember member : members.findByTeamId(teamId)) {
            if (member.getUser() != null) {
                currentMembers.put(member.getUser().getId(), member);
                people.put(member.getUser().getId(), member.getUser());
            }
        }
        Map<UUID, List<Attendance>> shiftsByUser = new LinkedHashMap<>();
        for (Attendance shift : attendances.findByTeamIdAndDateBetween(
                teamId, period.atDay(1), period.atEndOfMonth())) {
            if (shift.getUser() != null) {
                UUID userId = shift.getUser().getId();
                people.putIfAbsent(userId, shift.getUser());
                shiftsByUser.computeIfAbsent(userId, ignored -> new ArrayList<>()).add(shift);
            }
        }
        List<Map<String, Object>> items = people.values().stream()
                .map(person -> memberRow(person, currentMembers.get(person.getId()),
                        shiftsByUser.getOrDefault(person.getId(), List.of()),
                        memberRates.getOrDefault(person.getId(), defaultRate), defaultOt))
                .toList();
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("memberCount", items.size());
        summary.put("paidMemberCount", (int) items.stream().filter(i -> num(i, "netPayVnd") > 0).count());
        summary.put("attendanceDays", items.stream().mapToInt(i -> (int) num(i, "attendanceDays")).sum());
        double reg = round4(items.stream().mapToDouble(i -> num(i, "regularHours")).sum());
        double ot = round4(items.stream().mapToDouble(i -> num(i, "overtimeHours")).sum());
        summary.put("regularHours", reg);
        summary.put("overtimeHours", ot);
        summary.put("totalHours", round4(reg + ot));
        long gross = items.stream().mapToLong(i -> Math.round(num(i, "regularPayVnd") + num(i, "overtimePayVnd"))).sum();
        summary.put("grossPayVnd", gross);
        summary.put("allowanceVnd", 0L);
        summary.put("deductionVnd", 0L);
        summary.put("advanceVnd", 0L);
        summary.put("netPayVnd", gross);
        summary.put("totalTasks", 0);
        summary.put("completedTasks", 0);
        summary.put("missingCheckoutCount", items.stream().mapToInt(i -> (int) num(i, "missingCheckoutDays")).sum());
        summary.put("needsReviewCount", items.stream().mapToInt(i -> (int) num(i, "needsReviewCount")).sum());
        Map<String, Object> report = new LinkedHashMap<>();
        report.put("runId", teamId + ":" + period);
        report.put("teamId", teamId.toString());
        report.put("year", period.getYear());
        report.put("month", period.getMonthValue());
        report.put("status", "DRAFT");
        report.put("updatedAt", LocalDate.now(VN_ZONE).toString());
        report.put("summary", summary);
        report.put("items", items);
        return report;
    }

    public byte[] exportExcel(UUID teamId, Integer year, Integer month) {
        Map<String, Object> report = report(teamId, year, month);
        int targetYear = ((Number) report.get("year")).intValue();
        int targetMonth = ((Number) report.get("month")).intValue();
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) report.get("items");
        try (Workbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = wb.createSheet("Bang luong thang " + targetMonth + "-" + targetYear);
            String[] headers = {
                    "STT", "Mã NV", "Họ và tên", "Vị trí / Công đoạn", "Số ngày công",
                    "Giờ thường (h)", "Giờ tăng ca (h)", "Đơn giá/giờ (VNĐ)",
                    "Lương cơ bản (VNĐ)", "Lương tăng ca (VNĐ)", "Phụ cấp & Thưởng (VNĐ)",
                    "Thực nhận (VNĐ)", "Địa điểm điểm danh gần nhất", "Số ca cần rà soát"
            };
            Row hRow = sheet.createRow(0);
            for (int i = 0; i < headers.length; i++) {
                hRow.createCell(i).setCellValue(headers[i]);
            }
            double totalNet = 0;
            for (int i = 0; i < items.size(); i++) {
                Map<String, Object> item = items.get(i);
                Row row = sheet.createRow(i + 1);
                row.createCell(0).setCellValue(i + 1);
                row.createCell(1).setCellValue(text(item, "memberCode"));
                row.createCell(2).setCellValue(text(item, "memberName"));
                row.createCell(3).setCellValue(text(item, "roleLabel"));
                row.createCell(4).setCellValue((int) num(item, "attendanceDays"));
                row.createCell(5).setCellValue(num(item, "regularHours"));
                row.createCell(6).setCellValue(num(item, "overtimeHours"));
                if (item.get("historicalHourlyRateVnd") instanceof Number rateCell) {
                    row.createCell(7).setCellValue(rateCell.doubleValue());
                } else {
                    row.createCell(7).setCellValue(text(item, "historicalRateLabel"));
                }
                row.createCell(8).setCellValue(num(item, "regularPayVnd"));
                row.createCell(9).setCellValue(num(item, "overtimePayVnd"));
                row.createCell(10).setCellValue(num(item, "allowanceVnd"));
                double net = num(item, "netPayVnd");
                totalNet += net;
                row.createCell(11).setCellValue(net);
                row.createCell(12).setCellValue(text(item, "lastCheckInAddress"));
                row.createCell(13).setCellValue(num(item, "needsReviewCount"));
            }
            Row totalRow = sheet.createRow(items.size() + 1);
            totalRow.createCell(2).setCellValue("TỔNG QUỸ LƯƠNG THÁNG");
            totalRow.createCell(11).setCellValue(totalNet);
            for (int i = 0; i < headers.length; i++) {
                sheet.autoSizeColumn(i);
            }
            wb.write(out);
            return out.toByteArray();
        } catch (IOException ex) {
            throw new RuntimeException("Không thể xuất bảng lương Excel.", ex);
        }
    }

    private Map<String, Object> memberRow(User person, TeamMember member, List<Attendance> attendance,
            double memberRate, double defaultOt) {
        List<Attendance> shifts = new ArrayList<>(attendance);
        shifts.sort((a, b) -> {
            LocalDate da = a.getDate() != null ? a.getDate() : LocalDate.MIN;
            LocalDate db = b.getDate() != null ? b.getDate() : LocalDate.MIN;
            return db.compareTo(da);
        });
        List<Map<String, Object>> lines = shifts.stream().map(this::line).toList();
        double regHours = round4(lines.stream().mapToDouble(l -> num(l, "regularHours")).sum());
        double otHours = round4(lines.stream().mapToDouble(l -> num(l, "overtimeHours")).sum());
        long regPay = lines.stream().mapToLong(l -> Math.round(num(l, "regularPayVnd"))).sum();
        long otPay = lines.stream().mapToLong(l -> Math.round(num(l, "overtimePayVnd"))).sum();
        int paidDays = (int) shifts.stream()
                .filter(s -> s.getCheckInTime() != null && s.getCheckOutTime() != null)
                .map(Attendance::getDate).filter(Objects::nonNull).distinct().count();
        int missingCheckouts = (int) shifts.stream()
                .filter(s -> s.getCheckInTime() != null && s.getCheckOutTime() == null).count();
        int lateDays = (int) shifts.stream()
                .filter(s -> s.getAttendanceStatus() == Attendance.AttendanceStatus.LATE).count();
        Attendance latest = shifts.isEmpty() ? null : shifts.get(0);
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("itemId", member == null ? "historical:" + person.getId() : member.getId().toString());
        item.put("currentMember", member != null);
        item.put("memberId", person.getId().toString());
        item.put("memberCode", person.getUsername());
        item.put("memberName", person.getFullName() == null || person.getFullName().isBlank()
                ? person.getUsername() : person.getFullName());
        item.put("roleLabel", member == null ? "" : String.join(", ", member.getJobLabels()));
        item.put("regularHours", regHours);
        item.put("overtimeHours", otHours);
        item.put("attendanceDays", paidDays);
        item.put("lateDays", lateDays);
        item.put("missingCheckoutDays", missingCheckouts);
        item.put("totalTasks", 0);
        item.put("completedTasks", 0);
        List<Double> snapshotRates = lines.stream()
                .filter(l -> Boolean.TRUE.equals(l.get("payable")) && l.get("hourlyRateVnd") instanceof Number)
                .map(l -> ((Number) l.get("hourlyRateVnd")).doubleValue())
                .distinct().sorted().toList();
        if (snapshotRates.isEmpty()) {
            snapshotRates = lines.stream()
                    .filter(l -> l.get("hourlyRateVnd") instanceof Number)
                    .map(l -> ((Number) l.get("hourlyRateVnd")).doubleValue())
                    .distinct().sorted().toList();
        }
        Double historicalRate = snapshotRates.size() == 1 ? snapshotRates.getFirst() : null;
        String historicalRateLabel = snapshotRates.size() == 1
                ? formatRate(snapshotRates.getFirst())
                : snapshotRates.size() > 1
                ? "Nhiều mức: " + snapshotRates.stream().map(PayrollService::formatRate).reduce((a, b) -> a + ", " + b).orElse("")
                : lines.isEmpty() ? "" : "Chưa rõ";
        item.put("hourlyRateVnd", memberRate);
        item.put("historicalHourlyRateVnd", historicalRate);
        item.put("historicalRateLabel", historicalRateLabel);
        item.put("overtimeMultiplier", defaultOt);
        item.put("regularPayVnd", regPay);
        item.put("overtimePayVnd", otPay);
        item.put("allowanceVnd", 0L);
        item.put("deductionVnd", 0L);
        item.put("advanceVnd", 0L);
        item.put("netPayVnd", regPay + otPay);
        item.put("lastCheckInAddress", latest == null ? null : blankToNull(latest.getCheckInAddress()));
        item.put("lastLatitude", latest == null ? null : latest.getLatitude());
        item.put("lastLongitude", latest == null ? null : latest.getLongitude());
        item.put("needsReviewCount", (int) lines.stream().filter(l -> Boolean.TRUE.equals(l.get("needsReview"))).count());
        item.put("attendanceLines", lines);
        return item;
    }

    private Map<String, Object> line(Attendance a) {
        Double standard = positiveFinite(a.getStandardHours()) ? a.getStandardHours() : null;
        Double rate = positiveFinite(a.getHourlyRateVnd()) ? a.getHourlyRateVnd() : null;
        Double multiplier = positiveFinite(a.getOvertimeMultiplier()) && a.getOvertimeMultiplier() >= 1.5
                ? a.getOvertimeMultiplier() : null;
        boolean knownBreak = a.getBreakMinutes() != null && a.getBreakMinutes() >= 0;
        boolean knownSnapshot = standard != null && rate != null && multiplier != null && knownBreak;
        boolean payable = knownSnapshot && a.getCheckInTime() != null && a.getCheckOutTime() != null;
        long elapsedMinutes = a.getCheckInTime() != null && a.getCheckOutTime() != null
                ? Math.max(0L, Duration.between(a.getCheckInTime(), a.getCheckOutTime()).toMinutes()) : 0L;
        long breakMinutes = Math.min(elapsedMinutes, Math.max(0, a.getBreakMinutes() == null ? 0 : a.getBreakMinutes()));
        double worked = round4((elapsedMinutes - breakMinutes) / 60.0);
        double reg = knownSnapshot ? round4(Math.min(worked, standard)) : 0.0;
        double ot = knownSnapshot ? round4(Math.max(0.0, worked - reg)) : 0.0;
        long regPay = payable ? Math.round(reg * rate) : 0L;
        long otPay = payable ? Math.round(ot * rate * multiplier) : 0L;
        Map<String, Object> line = new LinkedHashMap<>();
        line.put("id", a.getId().toString());
        line.put("date", a.getDate() == null ? null : a.getDate().toString());
        line.put("checkInTime", a.getCheckInTime() == null ? null : a.getCheckInTime().toString());
        line.put("checkOutTime", a.getCheckOutTime() == null ? null : a.getCheckOutTime().toString());
        line.put("regularHours", reg);
        line.put("overtimeHours", ot);
        line.put("workedHours", worked);
        line.put("snapshotStatus", knownSnapshot ? "KNOWN" : "UNKNOWN");
        line.put("needsReview", !knownSnapshot);
        line.put("warning", knownSnapshot ? null : "Thiếu hoặc không hợp lệ dữ liệu lương lịch sử — cần rà soát, chưa tính lương.");
        line.put("standardHours", standard);
        line.put("breakMinutes", knownBreak ? a.getBreakMinutes() : null);
        line.put("hourlyRateVnd", rate);
        line.put("overtimeMultiplier", multiplier);
        line.put("regularPayVnd", regPay);
        line.put("overtimePayVnd", otPay);
        line.put("totalPayVnd", regPay + otPay);
        line.put("payable", payable);
        String inStatus = normalizeStatus(a.getLocationStatus());
        String outStatus = normalizeStatus(a.getCheckOutLocationStatus());
        line.put("checkInAddress", blankToNull(a.getCheckInAddress()));
        line.put("latitude", a.getLatitude());
        line.put("longitude", a.getLongitude());
        line.put("locationAccuracyMeters", a.getLocationAccuracyMeters());
        line.put("distanceMeters", a.getDistanceMeters());
        line.put("locationStatus", inStatus);
        line.put("locationVerified", verifiedFrom(inStatus));
        line.put("locationUnavailableReason", blankToNull(a.getLocationUnavailableReason()));
        line.put("hasCheckInPhoto", isDataImage(a.getCheckInPhotoUrl()));
        line.put("checkOutAddress", blankToNull(a.getCheckOutAddress()));
        line.put("checkOutLatitude", a.getCheckOutLatitude());
        line.put("checkOutLongitude", a.getCheckOutLongitude());
        line.put("checkOutLocationAccuracyMeters", a.getCheckOutLocationAccuracyMeters());
        line.put("checkOutDistanceMeters", a.getCheckOutDistanceMeters());
        line.put("checkOutLocationStatus", outStatus);
        line.put("checkOutLocationVerified", verifiedFrom(outStatus));
        line.put("checkOutLocationUnavailableReason", blankToNull(a.getCheckOutLocationUnavailableReason()));
        line.put("hasCheckOutPhoto", isDataImage(a.getCheckOutPhotoUrl()));
        line.put("stage", a.getStage() == null ? null : a.getStage().name());
        line.put("shiftType", a.getShiftType() == null ? null : a.getShiftType().name());
        return line;
    }

    private static String normalizeStatus(String status) {
        return status != null && Set.of("WITHIN_RADIUS", "OUTSIDE_RADIUS", "LOW_ACCURACY", "NOT_CONFIGURED")
                .contains(status) ? status : "UNVERIFIED";
    }

    private static Boolean verifiedFrom(String status) {
        return "WITHIN_RADIUS".equals(status) ? Boolean.TRUE
                : "OUTSIDE_RADIUS".equals(status) ? Boolean.FALSE : null;
    }

    private static boolean isDataImage(String raw) {
        return raw != null && raw.startsWith("data:image/") && raw.contains(";base64,");
    }

    private static String blankToNull(String text) {
        return text == null || text.isBlank() ? null : text;
    }

    private static String text(Map<String, Object> row, String key) {
        Object value = row.get(key);
        return value == null ? "" : value.toString();
    }

    private static double num(Map<String, Object> row, String key) {
        return ((Number) row.getOrDefault(key, 0)).doubleValue();
    }

    private static String formatRate(double rate) {
        return rate == Math.rint(rate) ? Long.toString(Math.round(rate)) : Double.toString(rate);
    }

    private static boolean positiveFinite(Double value) {
        return value != null && Double.isFinite(value) && value > 0;
    }

    private static double round4(double value) {
        return Math.round(value * 10000.0) / 10000.0;
    }
}
