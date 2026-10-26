package org.example.backend.service;

import org.example.backend.dto.AttendanceDTO;
import org.example.backend.dto.AttendanceEvidenceRequest;
import org.example.backend.dto.UpdateAttendanceRequest;
import org.example.backend.entity.*;
import org.example.backend.repository.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.*;
import java.util.*;
import java.util.stream.Collectors;

@Service
@Transactional
public class AttendanceService {
    public static final ZoneId WORKSHOP_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    private final AttendanceRepository attendanceRepo;
    private final UserRepository userRepo;
    private final TeamRepository teamRepo;
    private final ProductionOrderRepository orderRepo;
    private final AttendanceSettingsRepository settingsRepo;
    private final TeamMemberRepository memberRepo;
    private final AttendanceCorrectionRepository correctionRepo;
    private final AttendanceEvidenceService evidenceService;
    private PayrollMemberRateService payrollMemberRateService;

    @org.springframework.beans.factory.annotation.Autowired
    public void setPayrollMemberRateService(PayrollMemberRateService payrollMemberRateService) {
        this.payrollMemberRateService = payrollMemberRateService;
    }

    public AttendanceService(AttendanceRepository attendanceRepo, UserRepository userRepo, TeamRepository teamRepo,
                             ProductionOrderRepository orderRepo, AttendanceSettingsRepository settingsRepo,
                             TeamMemberRepository memberRepo, AttendanceCorrectionRepository correctionRepo,
                             AttendanceEvidenceService evidenceService) {
        this.attendanceRepo = attendanceRepo;
        this.userRepo = userRepo;
        this.teamRepo = teamRepo;
        this.orderRepo = orderRepo;
        this.settingsRepo = settingsRepo;
        this.memberRepo = memberRepo;
        this.correctionRepo = correctionRepo;
        this.evidenceService = evidenceService;
    }

    public AttendanceDTO checkIn(UUID userId, UUID teamId, Attendance.ShiftType shiftType,
                                 Attendance.ProductionStage stage, UUID orderId, Integer ignoredClientBreak) {
        AttendanceEvidenceRequest request = new AttendanceEvidenceRequest();
        request.setShiftType(shiftType);
        request.setStage(stage);
        request.setOrderId(orderId);
        return checkIn(userId, teamId, request);
    }

    public AttendanceDTO checkIn(UUID userId, UUID teamId, AttendanceEvidenceRequest request) {
        lockMember(userId, teamId);
        if (openShift(userId, teamId).isPresent())
            throw conflict("Bạn còn ca chưa tan. Vui lòng tan ca hoặc yêu cầu quản lý sửa công.");
        AttendanceEvidenceRequest req = request != null ? request : new AttendanceEvidenceRequest();
        AttendanceSettings settings = settings(teamId);
        var evidence = evidenceService.validate(req, settings);
        LocalDateTime now = now();
        Attendance a = new Attendance();
        a.setUser(userRepo.findById(userId).orElseThrow(() -> missing("Không tìm thấy nhân viên.")));
        a.setTeam(teamRepo.findById(teamId).orElseThrow(() -> missing("Không tìm thấy xưởng.")));
        a.setDate(now.toLocalDate());
        a.setCheckInTime(now);
        a.setShiftType(req.getShiftType() != null ? req.getShiftType() : Attendance.ShiftType.NGAY);
        a.setStage(req.getStage());
        a.setBreakMinutes(settings.getBreakMinutes());
        a.setStandardHours(settings.getStandardHours());
        double effectiveHourlyRate = payrollMemberRateService != null
                ? payrollMemberRateService.getHourlyRate(teamId, userId, settings.getHourlyRateVnd())
                : settings.getHourlyRateVnd();
        a.setHourlyRateVnd(effectiveHourlyRate);
        a.setOvertimeMultiplier(settings.getOvertimeMultiplier());
        String[] hours = switch (a.getShiftType()) {
            case SANG -> new String[]{"06:00", "14:00"};
            case CHIEU -> new String[]{"14:00", "22:00"};
            case DEM -> new String[]{"22:00", "06:00"};
            case NGAY -> new String[]{settings.getWorkStartTime(), settings.getWorkEndTime()};
        };
        a.setShiftStartTime(hours[0]);
        a.setShiftEndTime(hours[1]);
        if (req.getOrderId() != null) {
            ProductionOrder order = orderRepo.findById(req.getOrderId()).orElseThrow(() -> missing("Không tìm thấy đơn sản xuất."));
            if (!order.getTeam().getId().equals(teamId)) throw forbidden();
            a.setProductionOrder(order);
        }
        evidenceService.apply(a, evidence, false);
        calculateHours(a);
        return toDTO(attendanceRepo.save(a));
    }

    public AttendanceDTO checkOut(UUID userId, UUID teamId) { return checkOut(userId, teamId, null); }

    public AttendanceDTO checkOut(UUID userId, UUID teamId, AttendanceEvidenceRequest request) {
        lockMember(userId, teamId);
        Attendance a = openShift(userId, teamId).orElseThrow(() -> conflict("Bạn chưa vào ca hoặc đã tan ca."));
        LocalDateTime out = now();
        validateInterval(a.getCheckInTime(), out);
        var evidence = evidenceService.validate(request, settings(teamId));
        a.setCheckOutTime(out);
        evidenceService.apply(a, evidence, true);
        calculateHours(a);
        return toDTO(attendanceRepo.save(a));
    }

    @Transactional(readOnly = true)
    public AttendanceDTO getTodayAttendance(UUID userId, UUID teamId) {
        return openShift(userId, teamId)
                .or(() -> attendanceRepo.findFirstByUserIdAndTeamIdAndDateOrderByCheckInTimeDesc(userId, teamId, today()))
                .map(this::toDTO).orElse(null);
    }

    @Transactional(readOnly = true)
    public List<AttendanceDTO> getAttendanceHistory(UUID userId, UUID teamId) {
        return sorted(attendanceRepo.findByUserIdAndTeamId(userId, teamId));
    }

    @Transactional(readOnly = true)
    public List<AttendanceDTO> getTeamAttendanceToday(UUID teamId) { return getTeamAttendanceByDate(teamId, today()); }

    @Transactional(readOnly = true)
    public List<AttendanceDTO> getTeamAttendanceByDate(UUID teamId, LocalDate date) {
        return sorted(attendanceRepo.findByTeamIdAndDate(teamId, date != null ? date : today()));
    }

    @Transactional(readOnly = true)
    public List<AttendanceDTO> getTeamAttendanceHistory(UUID teamId) { return sorted(attendanceRepo.findByTeamId(teamId)); }

    private List<AttendanceDTO> sorted(List<Attendance> rows) {
        return rows.stream().sorted(Comparator.comparing(Attendance::getCheckInTime,
                Comparator.nullsLast(Comparator.reverseOrder()))).map(this::toDTO).toList();
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getSettings(UUID teamId) { return settingsMap(settings(teamId)); }

    private AttendanceSettings settings(UUID teamId) {
        return settingsRepo.findByTeamId(teamId).orElseGet(AttendanceSettings::new);
    }

    public Map<String, Object> updateSettings(UUID teamId, Map<String, Object> payload) {
        AttendanceSettings s = settings(teamId);
        s.setTeam(teamRepo.findById(teamId).orElseThrow(() -> missing("Không tìm thấy xưởng.")));
        if (payload != null) {
            if (payload.get("workStartTime") != null) s.setWorkStartTime(LocalTime.parse(payload.get("workStartTime").toString()).toString());
            if (payload.get("workEndTime") != null) s.setWorkEndTime(LocalTime.parse(payload.get("workEndTime").toString()).toString());
            if (payload.get("standardHours") != null) s.setStandardHours(number(payload.get("standardHours")));
            if (payload.get("breakMinutes") != null) s.setBreakMinutes(integer(payload.get("breakMinutes")));
            if (payload.get("hourlyRateVnd") != null) s.setHourlyRateVnd(number(payload.get("hourlyRateVnd")));
            if (payload.get("overtimeMultiplier") != null) s.setOvertimeMultiplier(number(payload.get("overtimeMultiplier")));
            if (payload.containsKey("workshopAddress")) s.setWorkshopAddress(payload.get("workshopAddress") == null ? null : payload.get("workshopAddress").toString().trim());
            if (payload.containsKey("workshopLat")) s.setWorkshopLat(payload.get("workshopLat") == null ? null : number(payload.get("workshopLat")));
            if (payload.containsKey("workshopLng")) s.setWorkshopLng(payload.get("workshopLng") == null ? null : number(payload.get("workshopLng")));
            if (payload.get("allowedRadiusMeters") != null) s.setAllowedRadiusMeters(integer(payload.get("allowedRadiusMeters")));
            if (payload.get("requireLocation") != null) s.setRequireLocation(bool(payload.get("requireLocation")));
            if (payload.get("requirePhoto") != null) s.setRequirePhoto(bool(payload.get("requirePhoto")));
        }
        range(s.getStandardHours(), 0.25, 12, "Giờ chuẩn");
        range(s.getBreakMinutes(), 0, 240, "Phút nghỉ");
        range(s.getHourlyRateVnd(), 1000, 10_000_000, "Đơn giá");
        range(s.getOvertimeMultiplier(), 1.5, 4, "Hệ số tăng ca");
        range(s.getAllowedRadiusMeters(), 25, 5000, "Bán kính");
        if ((s.getWorkshopLat() == null) != (s.getWorkshopLng() == null)) throw new IllegalArgumentException("Cần cả vĩ độ và kinh độ xưởng.");
        if (s.getWorkshopLat() != null) {
            range(s.getWorkshopLat(), -90, 90, "Vĩ độ");
            range(s.getWorkshopLng(), -180, 180, "Kinh độ");
        }
        if (Boolean.TRUE.equals(s.getRequireLocation()) && s.getWorkshopLat() == null)
            throw new IllegalArgumentException("Phải cấu hình tọa độ xưởng trước khi bắt buộc GPS.");
        if (s.getWorkshopAddress() != null && s.getWorkshopAddress().length() > 500)
            throw new IllegalArgumentException("Địa chỉ tối đa 500 ký tự.");
        long shiftMinutes = Duration.between(LocalTime.parse(s.getWorkStartTime()), LocalTime.parse(s.getWorkEndTime())).toMinutes();
        if (shiftMinutes <= 0) shiftMinutes += 1440;
        if (s.getBreakMinutes() >= shiftMinutes || s.getStandardHours() * 60 > shiftMinutes - s.getBreakMinutes())
            throw new IllegalArgumentException("Giờ chuẩn và thời gian nghỉ phải nằm trong ca đã cấu hình.");
        return settingsMap(settingsRepo.save(s));
    }

    private Map<String, Object> settingsMap(AttendanceSettings s) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("workStartTime", s.getWorkStartTime()); m.put("workEndTime", s.getWorkEndTime());
        m.put("standardHours", s.getStandardHours()); m.put("breakMinutes", s.getBreakMinutes());
        m.put("hourlyRateVnd", s.getHourlyRateVnd()); m.put("overtimeMultiplier", s.getOvertimeMultiplier());
        m.put("workshopAddress", s.getWorkshopAddress()); m.put("workshopLat", s.getWorkshopLat()); m.put("workshopLng", s.getWorkshopLng());
        m.put("allowedRadiusMeters", s.getAllowedRadiusMeters()); m.put("requireLocation", s.getRequireLocation()); m.put("requirePhoto", s.getRequirePhoto());
        return m;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getCorrections(UUID attendanceId) {
        return correctionRepo.findByAttendanceIdOrderByCreatedAtDesc(attendanceId).stream().map(c -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", c.getId()); m.put("actorId", c.getActor().getId()); m.put("actorName", displayName(c.getActor()));
            m.put("oldCheckInTime", c.getOldCheckInTime()); m.put("oldCheckOutTime", c.getOldCheckOutTime());
            m.put("newCheckInTime", c.getNewCheckInTime()); m.put("newCheckOutTime", c.getNewCheckOutTime());
            m.put("reason", c.getReason()); m.put("createdAt", c.getCreatedAt());
            return m;
        }).toList();
    }

    public AttendanceDTO updateAttendance(UUID attendanceId, UpdateAttendanceRequest req, User actor) {
        Attendance a = attendanceRepo.findById(attendanceId).orElseThrow(() -> missing("Không tìm thấy chấm công."));
        lockMember(a.getUser().getId(), a.getTeam().getId());
        if (req.getReason() == null || req.getReason().trim().length() < 5 || req.getReason().length() > 500)
            throw new IllegalArgumentException("Lý do sửa công phải có 5–500 ký tự.");
        LocalDateTime in = req.getCheckInTime();
        LocalDateTime out = req.getCheckOutTime();
        validateInterval(in, out);
        if (!in.toLocalDate().equals(a.getDate())) throw new IllegalArgumentException("Giờ vào phải thuộc ngày công gốc.");
        for (Attendance other : attendanceRepo.findByUserIdAndTeamIdAndCheckInTimeBefore(a.getUser().getId(), a.getTeam().getId(), out)) {
            if (!other.getId().equals(a.getId()) && (other.getCheckOutTime() == null || other.getCheckOutTime().isAfter(in)))
                throw conflict("Khoảng giờ bị trùng với ca khác của nhân viên.");
        }
        AttendanceCorrection correction = new AttendanceCorrection();
        correction.setAttendance(a); correction.setActor(actor);
        correction.setOldCheckInTime(a.getCheckInTime()); correction.setOldCheckOutTime(a.getCheckOutTime());
        correction.setNewCheckInTime(in); correction.setNewCheckOutTime(out);
        correction.setReason(req.getReason().trim()); correction.setCreatedAt(now());
        a.setCheckInTime(in); a.setCheckOutTime(out);
        calculateHours(a);
        attendanceRepo.save(a);
        correctionRepo.save(correction);
        return toDTO(a);
    }

    public UUID attendanceTeamId(UUID id) { return attendanceRepo.findById(id).orElseThrow(() -> missing("Không tìm thấy chấm công.")).getTeam().getId(); }

    @Transactional(readOnly = true)
    public AttendanceEvidenceService.Photo getPhoto(UUID id, boolean checkout) {
        Attendance a = attendanceRepo.findById(id).orElseThrow(() -> missing("Không tìm thấy chấm công."));
        return evidenceService.photo(checkout ? a.getCheckOutPhotoUrl() : a.getCheckInPhotoUrl());
    }

    @Transactional(readOnly = true)
    public Map<String, Double> getStageWorkerHours(UUID teamId, LocalDate date) {
        return attendanceRepo.findByTeamIdAndDate(teamId, date).stream().filter(a -> a.getStage() != null && a.getCheckOutTime() != null)
                .collect(Collectors.groupingBy(a -> a.getStage().name(), Collectors.summingDouble(a -> value(a.getRegularHours()) + value(a.getOvertimeHours()))));
    }

    @Transactional(readOnly = true)
    public Double getOrderWorkerHours(UUID orderId) {
        return attendanceRepo.findByOrderId(orderId).stream().filter(a -> a.getCheckOutTime() != null)
                .mapToDouble(a -> value(a.getRegularHours()) + value(a.getOvertimeHours())).sum();
    }

    private void calculateHours(Attendance a) {
        if (a.getCheckOutTime() == null) {
            a.setActualWorkHours(0.0); a.setRegularHours(0.0); a.setOvertimeHours(0.0);
        } else {
            double minutes = Duration.between(a.getCheckInTime(), a.getCheckOutTime()).toMinutes();
            double net = Math.max(0, minutes - (a.getBreakMinutes() == null ? 30 : a.getBreakMinutes())) / 60.0;
            double regular = Math.min(net, a.getStandardHours() == null ? 8 : a.getStandardHours());
            a.setActualWorkHours(round(net)); a.setRegularHours(round(regular)); a.setOvertimeHours(round(Math.max(0, net - regular)));
        }
        if (a.getCheckInTime() != null && a.getShiftStartTime() != null) {
            LocalTime expected = LocalTime.parse(a.getShiftStartTime());
            LocalDateTime start = a.getDate().atTime(expected);
            if (a.getShiftEndTime() != null && !LocalTime.parse(a.getShiftEndTime()).isAfter(expected)
                    && a.getCheckInTime().toLocalTime().isBefore(LocalTime.parse(a.getShiftEndTime()))) start = start.minusDays(1);
            a.setAttendanceStatus(a.getCheckInTime().isAfter(start) ? Attendance.AttendanceStatus.LATE : Attendance.AttendanceStatus.ON_TIME);
        }
    }

    private AttendanceDTO toDTO(Attendance a) {
        AttendanceDTO d = new AttendanceDTO();
        d.setId(a.getId().toString()); d.setUserId(a.getUser().getId().toString()); d.setUserName(displayName(a.getUser()));
        d.setTeamId(a.getTeam().getId().toString()); d.setDate(a.getDate());
        d.setShiftType(a.getShiftType() == null ? null : a.getShiftType().name());
        d.setShiftStartTime(a.getShiftStartTime()); d.setShiftEndTime(a.getShiftEndTime());
        d.setCheckInTime(a.getCheckInTime()); d.setCheckOutTime(a.getCheckOutTime());
        d.setProductionStage(a.getStage() == null ? null : a.getStage().name());
        if (a.getProductionOrder() != null) { d.setOrderId(a.getProductionOrder().getId().toString()); d.setOrderTitle(a.getProductionOrder().getTitle()); }
        boolean payable = a.getCheckOutTime() != null;
        d.setBreakMinutes(a.getBreakMinutes()); d.setStandardHours(a.getStandardHours() == null ? 8 : a.getStandardHours());
        d.setHourlyRateVnd(a.getHourlyRateVnd() == null ? 50_000 : a.getHourlyRateVnd());
        d.setOvertimeMultiplier(a.getOvertimeMultiplier() == null ? 1.5 : a.getOvertimeMultiplier());
        d.setActualWorkHours(payable ? value(a.getActualWorkHours()) : 0.0);
        d.setRegularHours(payable ? value(a.getRegularHours()) : 0.0); d.setOvertimeHours(payable ? value(a.getOvertimeHours()) : 0.0);
        d.setRegularPayVnd((double) Math.round(d.getRegularHours() * d.getHourlyRateVnd()));
        d.setOvertimePayVnd((double) Math.round(d.getOvertimeHours() * d.getHourlyRateVnd() * d.getOvertimeMultiplier()));
        d.setTotalPayVnd(d.getRegularPayVnd() + d.getOvertimePayVnd());
        d.setAttendanceStatus(a.getAttendanceStatus() == null ? null : a.getAttendanceStatus().name()); d.setNotes(a.getNotes());
        d.setCheckInAddress(a.getCheckInAddress()); d.setLatitude(a.getLatitude()); d.setLongitude(a.getLongitude());
        d.setLocationAccuracyMeters(a.getLocationAccuracyMeters()); d.setDistanceMeters(a.getDistanceMeters());
        d.setLocationStatus(a.getLocationStatus() == null ? "UNVERIFIED" : a.getLocationStatus());
        d.setLocationVerified("WITHIN_RADIUS".equals(a.getLocationStatus()) ? Boolean.TRUE : "OUTSIDE_RADIUS".equals(a.getLocationStatus()) ? Boolean.FALSE : null);
        d.setLocationUnavailableReason(a.getLocationUnavailableReason()); d.setHasCheckInPhoto(a.getCheckInPhotoUrl() != null);
        d.setCheckOutAddress(a.getCheckOutAddress()); d.setCheckOutLatitude(a.getCheckOutLatitude()); d.setCheckOutLongitude(a.getCheckOutLongitude());
        d.setCheckOutLocationAccuracyMeters(a.getCheckOutLocationAccuracyMeters()); d.setCheckOutDistanceMeters(a.getCheckOutDistanceMeters());
        d.setCheckOutLocationStatus(a.getCheckOutLocationStatus() == null ? "UNVERIFIED" : a.getCheckOutLocationStatus());
        d.setCheckOutLocationVerified("WITHIN_RADIUS".equals(a.getCheckOutLocationStatus()) ? Boolean.TRUE : "OUTSIDE_RADIUS".equals(a.getCheckOutLocationStatus()) ? Boolean.FALSE : null);
        d.setCheckOutLocationUnavailableReason(a.getCheckOutLocationUnavailableReason()); d.setHasCheckOutPhoto(a.getCheckOutPhotoUrl() != null);
        return d;
    }

    private Optional<Attendance> openShift(UUID userId, UUID teamId) {
        return attendanceRepo.findFirstByUserIdAndTeamIdAndCheckOutTimeIsNullOrderByCheckInTimeDesc(userId, teamId);
    }
    private void lockMember(UUID userId, UUID teamId) { memberRepo.lockByTeamAndUser(teamId, userId).orElseThrow(AttendanceService::forbidden); }
    private void validateInterval(LocalDateTime in, LocalDateTime out) {
        if (in == null || out == null || !out.isAfter(in)) throw new IllegalArgumentException("Giờ tan ca phải sau giờ vào ca.");
        if (in.isAfter(now()) || out.isAfter(now().plusSeconds(1))) throw new IllegalArgumentException("Không được ghi công trong tương lai.");
        if (Duration.between(in, out).compareTo(Duration.ofHours(24)) > 0) throw conflict("Ca vượt 24 giờ. Hãy yêu cầu quản lý sửa công trước.");
    }
    private static LocalDateTime now() { return LocalDateTime.now(WORKSHOP_ZONE); }
    private static LocalDate today() { return LocalDate.now(WORKSHOP_ZONE); }
    private static String displayName(User u) { return u.getFullName() == null || u.getFullName().isBlank() ? u.getUsername() : u.getFullName(); }
    private static double value(Double d) { return d == null ? 0 : d; }
    private static double round(double n) { return Math.round(n * 10_000) / 10_000.0; }
    private static double number(Object n) { double d = Double.parseDouble(n.toString()); if (!Double.isFinite(d)) throw new IllegalArgumentException("Giá trị số không hợp lệ."); return d; }
    private static int integer(Object n) { double d = number(n); if (d != Math.rint(d) || d < Integer.MIN_VALUE || d > Integer.MAX_VALUE) throw new IllegalArgumentException("Cần số nguyên."); return (int) d; }
    private static boolean bool(Object value) { if (!(value instanceof Boolean b)) throw new IllegalArgumentException("Cần giá trị true/false."); return b; }
    private static void range(Number n, double min, double max, String label) { if (n == null || !Double.isFinite(n.doubleValue()) || n.doubleValue() < min || n.doubleValue() > max) throw new IllegalArgumentException(label + " phải từ " + min + " đến " + max + "."); }
    private static ResponseStatusException conflict(String m) { return new ResponseStatusException(HttpStatus.CONFLICT, m); }
    private static ResponseStatusException missing(String m) { return new ResponseStatusException(HttpStatus.NOT_FOUND, m); }
    private static ResponseStatusException forbidden() { return new ResponseStatusException(HttpStatus.FORBIDDEN, "Bạn không có quyền thao tác dữ liệu này."); }
}
