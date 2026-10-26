package org.example.backend.service;

import org.example.backend.dto.DailyBoardDTO;
import org.example.backend.dto.DailyBoardDTO.OrderStageRow;
import org.example.backend.dto.DailyBoardDTO.StageSummary;
import org.example.backend.entity.*;
import org.example.backend.entity.Attendance.ProductionStage;
import org.example.backend.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

@Service
@Transactional
public class ProductionBoardService {

    private final DailyTargetRepository targetRepo;
    private final ProductionOrderRepository orderRepo;
    private final AttendanceRepository attendanceRepo;
    private final ProductionPlanRepository planRepo;

    public ProductionBoardService(DailyTargetRepository targetRepo,
                                  ProductionOrderRepository orderRepo,
                                  AttendanceRepository attendanceRepo,
                                  ProductionPlanRepository planRepo) {
        this.targetRepo = targetRepo;
        this.orderRepo = orderRepo;
        this.attendanceRepo = attendanceRepo;
        this.planRepo = planRepo;
    }

    public DailyBoardDTO getDailyBoard(UUID teamId, LocalDate date) {
        DailyBoardDTO board = new DailyBoardDTO();
        board.setDate(date);

        List<ProductionOrder> activeOrders = orderRepo.findByTeamIdAndStatusInOrderByDeadline(teamId,
                List.of("CONFIRMED", "PLANNING", "IN_PRODUCTION"));

        List<DailyTarget> todayTargets = targetRepo.findByTeamIdAndDate(teamId, date)
                .map(t -> List.of(t))
                .orElse(List.of());

        StageSummary roast = buildStageSummary(todayTargets, "roast");
        StageSummary qc = buildStageSummary(todayTargets, "qc");
        StageSummary packaging = buildStageSummary(todayTargets, "packaging");
        board.setRoast(roast);
        board.setQc(qc);
        board.setPackaging(packaging);

        double totalTarget = roast.getTargetKg() + qc.getTargetKg() + packaging.getTargetKg();
        double totalActual = roast.getActualKg() + qc.getActualKg() + packaging.getActualKg();
        board.setTotalTargetKg(totalTarget);
        board.setTotalActualKg(totalActual);
        board.setCompletionRate(totalTarget > 0 ? Math.round(totalActual / totalTarget * 10000.0) / 100.0 : 0.0);

        List<OrderStageRow> orderRows = activeOrders.stream()
                .map(order -> buildOrderRow(order, date))
                .filter(r -> r.getRoastTarget() > 0 || r.getQcTarget() > 0 || r.getPackagingTarget() > 0)
                .collect(Collectors.toList());
        board.setOrderRows(orderRows);

        List<Attendance> attendances = attendanceRepo.findByTeamIdAndDate(teamId, date);
        board.setTotalWorkers(attendances.size());
        double totalHours = attendances.stream()
                .filter(a -> a.getCheckOutTime() != null)
                .mapToDouble(a -> a.getRegularHours() + a.getOvertimeHours())
                .sum();
        board.setTotalWorkerHours(Math.round(totalHours * 10.0) / 10.0);

        return board;
    }

    public List<DailyBoardDTO> getCalendarBoard(UUID teamId, LocalDate startDate, LocalDate endDate) {
        List<DailyBoardDTO> days = new ArrayList<>();
        LocalDate current = startDate;
        while (!current.isAfter(endDate)) {
            days.add(getDailyBoard(teamId, current));
            current = current.plusDays(1);
        }
        return days;
    }

    private StageSummary buildStageSummary(List<DailyTarget> targets, String stage) {
        StageSummary s = new StageSummary();
        double targetKg = 0, actualKg = 0, workerHours = 0;
        int orderCount = 0;
        Set<UUID> seenOrders = new HashSet<>();

        for (DailyTarget t : targets) {
            if (t.getIsHoliday() != null && t.getIsHoliday()) continue;

            if ("roast".equals(stage)) {
                if (t.getTargetRoastKg() != null) targetKg += t.getTargetRoastKg();
                if (t.getActualRoastKg() != null) actualKg += t.getActualRoastKg();
            } else if ("qc".equals(stage)) {
                if (t.getTargetQcKg() != null) targetKg += t.getTargetQcKg();
                if (t.getActualQcKg() != null) actualKg += t.getActualQcKg();
            } else if ("packaging".equals(stage)) {
                if (t.getTargetPackagedKg() != null) targetKg += t.getTargetPackagedKg();
                if (t.getActualPackagedKg() != null) actualKg += t.getActualPackagedKg();
            }

            if (t.getTotalWorkerHours() != null) workerHours += t.getTotalWorkerHours();
            if (seenOrders.add(t.getOrder().getId())) orderCount++;
        }

        s.setTargetKg(targetKg);
        s.setActualKg(actualKg);
        s.setCompletionRate(targetKg > 0 ? Math.round(actualKg / targetKg * 10000.0) / 100.0 : 0.0);
        s.setOrderCount(orderCount);
        s.setWorkerHours(Math.round(workerHours * 10.0) / 10.0);
        return s;
    }

    private OrderStageRow buildOrderRow(ProductionOrder order, LocalDate date) {
        OrderStageRow r = new OrderStageRow();
        r.setOrderId(order.getId().toString());
        r.setOrderCode(order.getOrderCode());
        r.setTitle(order.getTitle());
        r.setCustomerName(order.getCustomerName());
        r.setOutputTarget(order.getOutputTarget() != null ? order.getOutputTarget() : 0);
        r.setCompletedQuantity(order.getCompletedQuantity() != null ? order.getCompletedQuantity() : 0);
        double remQty = order.getRemainingQuantity();
        r.setRemainingQuantity(remQty);
        double progPct = order.getProgressPercent();
        r.setProgressPercent(progPct);
        r.setRiskLevel(calcRiskLevel(order));

        Optional<DailyTarget> targetOpt = targetRepo.findByOrderIdAndTargetDate(order.getId(), date);
        if (targetOpt.isPresent()) {
            DailyTarget t = targetOpt.get();
            r.setRoastTarget(t.getTargetRoastKg() != null ? t.getTargetRoastKg() : 0);
            r.setQcTarget(t.getTargetQcKg() != null ? t.getTargetQcKg() : 0);
            r.setPackagingTarget(t.getTargetPackagedKg() != null ? t.getTargetPackagedKg() : 0);
            r.setRoastActual(t.getActualRoastKg() != null ? t.getActualRoastKg() : 0);
            r.setQcActual(t.getActualQcKg() != null ? t.getActualQcKg() : 0);
            r.setPackagingActual(t.getActualPackagedKg() != null ? t.getActualPackagedKg() : 0);
            r.setStageStatus(t.getStatus() != null ? t.getStatus().name() : "PENDING");
        }

        if (order.getInternalDeadline() != null) {
            r.setDaysToDeadline((int) ChronoUnit.DAYS.between(date, order.getInternalDeadline().toLocalDate()));
        } else {
            r.setDaysToDeadline(-1);
        }

        return r;
    }

    private String calcRiskLevel(ProductionOrder order) {
        if (order.getInternalDeadline() == null) return "NONE";
        if ("COMPLETED".equals(order.getStatus()) || "DELIVERED".equals(order.getStatus())) return "NONE";
        long daysLeft = ChronoUnit.DAYS.between(LocalDateTime.now(), order.getInternalDeadline());
        if (daysLeft <= 0) return "CRITICAL";
        if (daysLeft <= 2) return "HIGH";
        if (daysLeft <= 5) return "MEDIUM";
        return "LOW";
    }

    public Map<String, Object> getWorkforceToday(UUID teamId) {
        Map<String, Object> result = new LinkedHashMap<>();
        LocalDate today = LocalDate.now();

        List<Attendance> attendances = attendanceRepo.findByTeamIdAndDate(teamId, today);

        List<ProductionOrder> activeOrders = orderRepo.findByTeamIdAndStatusInOrderByDeadline(teamId,
                List.of("CONFIRMED", "PLANNING", "IN_PRODUCTION"));

        List<Map<String, Object>> checkedIn = new ArrayList<>();
        List<Map<String, Object>> checkedOut = new ArrayList<>();
        List<Map<String, Object>> notCheckedIn = new ArrayList<>();

        for (Attendance a : attendances) {
            Map<String, Object> w = new LinkedHashMap<>();
            w.put("id", a.getId().toString());
            w.put("userId", a.getUser().getId().toString());
            String name = (a.getUser().getFullName() != null && !a.getUser().getFullName().isBlank())
                    ? a.getUser().getFullName()
                    : a.getUser().getUsername();
            w.put("userName", name);
            w.put("shiftType", a.getShiftType() != null ? a.getShiftType().name() : null);
            w.put("stage", a.getStage() != null ? a.getStage().name() : null);
            w.put("checkInTime", a.getCheckInTime());
            w.put("checkOutTime", a.getCheckOutTime());
            w.put("attendanceStatus", a.getAttendanceStatus() != null ? a.getAttendanceStatus().name() : null);
            w.put("actualWorkHours", a.getActualWorkHours());
            w.put("regularHours", a.getRegularHours());
            w.put("overtimeHours", a.getOvertimeHours());
            w.put("checkInAddress", a.getCheckInAddress());
            w.put("latitude", a.getLatitude());
            w.put("longitude", a.getLongitude());
            w.put("distanceMeters", a.getDistanceMeters());
            w.put("locationStatus", a.getLocationStatus() == null ? "UNVERIFIED" : a.getLocationStatus());
            w.put("locationVerified", "WITHIN_RADIUS".equals(a.getLocationStatus()) ? Boolean.TRUE
                    : "OUTSIDE_RADIUS".equals(a.getLocationStatus()) ? Boolean.FALSE : null);
            w.put("hasCheckInPhoto", a.getCheckInPhotoUrl() != null);
            w.put("notes", a.getNotes());
            w.put("productivity", a.getActualWorkHours() != null && a.getActualWorkHours() > 0
                    ? Math.round((a.getActualWorkHours() > 0 ? a.getActualWorkHours() : 0) * 10.0) / 10.0
                    : null);
            if (a.getProductionOrder() != null) {
                w.put("orderId", a.getProductionOrder().getId().toString());
                w.put("orderTitle", a.getProductionOrder().getTitle());
            }
            if (a.getCheckOutTime() != null) {
                checkedOut.add(w);
            } else {
                checkedIn.add(w);
            }
        }

        double totalHours = checkedOut.stream()
                .mapToDouble(w -> {
                    Double h = (Double) w.get("actualWorkHours");
                    return h != null ? h : 0;
                })
                .sum();

        Map<String, Double> stageHours = new LinkedHashMap<>();
        stageHours.put("RANG", 0.0);
        stageHours.put("RANH_VA_CHON", 0.0);
        stageHours.put("XAY", 0.0);
        stageHours.put("DONG_GOI", 0.0);
        stageHours.put("QA", 0.0);
        for (Attendance a : attendances) {
            if (a.getStage() != null) {
                double hours = (a.getCheckOutTime() != null)
                        ? ((a.getRegularHours() != null ? a.getRegularHours() : 0.0)
                                + (a.getOvertimeHours() != null ? a.getOvertimeHours() : 0.0))
                        : 0.0;
                stageHours.merge(a.getStage().name(), hours, Double::sum);
            }
        }

        List<Map<String, Object>> lateWorkers = attendances.stream()
                .filter(a -> "LATE".equals(a.getAttendanceStatus() != null ? a.getAttendanceStatus().name() : null))
                .map(a -> {
                    Map<String, Object> w = new LinkedHashMap<>();
                    w.put("userId", a.getUser().getId().toString());
                    w.put("userName", a.getUser().getFullName());
                    w.put("checkInTime", a.getCheckInTime());
                    return w;
                })
                .collect(Collectors.toList());

        long notCheckedOut = attendances.stream().filter(a -> a.getCheckOutTime() == null).count();

        result.put("totalWorkers", attendances.size());
        result.put("checkedIn", checkedIn);
        result.put("checkedOut", checkedOut);
        result.put("totalWorkHours", Math.round(totalHours * 10.0) / 10.0);
        result.put("stageHours", stageHours);
        result.put("lateWorkers", lateWorkers);
        result.put("notCheckedOut", notCheckedOut);
        result.put("activeOrders", activeOrders.stream().limit(5).map(o -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", o.getId().toString());
            m.put("title", o.getTitle());
            m.put("progressPercent", o.getProgressPercent());
            m.put("remainingQuantity", o.getRemainingQuantity());
            return m;
        }).collect(Collectors.toList()));

        return result;
    }
}
