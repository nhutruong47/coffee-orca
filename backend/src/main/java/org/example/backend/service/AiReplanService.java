package org.example.backend.service;

import org.example.backend.dto.ReplanDTO;
import org.example.backend.dto.ReplanDTO.ReplanDay;
import org.example.backend.entity.*;
import org.example.backend.entity.DailyTarget.TargetStatus;
import org.example.backend.entity.ProductionPlan.PlanStatus;
import org.example.backend.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Service
public class AiReplanService {

    private final ProductionPlanRepository planRepo;
    private final ProductionOrderRepository orderRepo;
    private final DailyTargetRepository targetRepo;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private AttendanceRepository attendanceRepo;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private InventoryRepository inventoryRepo;

    public AiReplanService(ProductionPlanRepository planRepo,
                           ProductionOrderRepository orderRepo,
                           DailyTargetRepository targetRepo) {
        this.planRepo = planRepo;
        this.orderRepo = orderRepo;
        this.targetRepo = targetRepo;
    }

    public ReplanDTO analyzeReplan(UUID orderId) {
        ProductionOrder order = orderRepo.findById(orderId)
                .orElseThrow(() -> new RuntimeException("Khong tim thay don hang"));

        ProductionPlan plan = planRepo.findTopByOrderIdOrderByCreatedAtDesc(orderId)
                .orElseThrow(() -> new RuntimeException("Chua co ke hoach san xuat"));

        List<DailyTarget> allTargets = targetRepo.findByOrderIdOrderByTargetDateAsc(orderId);
        LocalDate today = LocalDate.now();

        double completedKg = allTargets.stream()
                .filter(t -> t.getTotalActualKg() != null)
                .mapToDouble(DailyTarget::getTotalActualKg)
                .sum();

        double outputTarget = order.getOutputTarget() != null ? order.getOutputTarget() : 0;
        double remainingKg = Math.max(0, outputTarget - completedKg);

        List<DailyTarget> pastTargets = allTargets.stream()
                .filter(t -> !t.getTargetDate().isAfter(today))
                .filter(t -> t.getIsHoliday() == null || !t.getIsHoliday())
                .toList();

        List<DailyTarget> futureTargets = allTargets.stream()
                .filter(t -> t.getTargetDate().isAfter(today))
                .filter(t -> t.getIsHoliday() == null || !t.getIsHoliday())
                .toList();

        int originalWorkingDays = (int) allTargets.stream()
                .filter(t -> t.getIsHoliday() == null || !t.getIsHoliday())
                .count();
        int remainingWorkingDays = futureTargets.size();

        double avgDailyActual = pastTargets.isEmpty() ? plan.getDailyTargetKg()
                : pastTargets.stream().filter(t -> t.getTotalActualKg() != null)
                        .mapToDouble(DailyTarget::getTotalActualKg)
                        .average().orElse(plan.getDailyTargetKg());

        boolean underperforming = avgDailyActual < plan.getDailyTargetKg() * 0.8;

        ReplanDTO dto = new ReplanDTO();
        dto.setPlanId(plan.getId());
        dto.setOrderId(orderId);
        dto.setOrderCode(order.getOrderCode());
        dto.setOriginalTargetKg(plan.getDailyTargetKg());
        dto.setCompletedKg(Math.round(completedKg * 100.0) / 100.0);
        dto.setRemainingKg(Math.round(remainingKg * 100.0) / 100.0);
        dto.setShortFall(Math.round((plan.getDailyTargetKg() - avgDailyActual) * 100.0) / 100.0);
        dto.setOriginalWorkingDays(originalWorkingDays);
        dto.setRemainingWorkingDays(remainingWorkingDays);

        int newDaysNeeded = remainingWorkingDays > 0
                ? (int) Math.ceil(remainingKg / avgDailyActual)
                : remainingWorkingDays;
        dto.setNewWorkingDaysNeeded(Math.max(0, newDaysNeeded - remainingWorkingDays));

        List<ReplanDay> revisedDays = buildRevisedDays(futureTargets, completedKg, remainingKg, avgDailyActual, plan.getDailyTargetKg());
        dto.setRevisedDays(revisedDays);

        List<String> recommendations = buildRecommendations(avgDailyActual, plan.getDailyTargetKg(), remainingKg,
                remainingWorkingDays, newDaysNeeded, order, underperforming);
        dto.setRecommendations(recommendations);

        String riskLevel = calcRiskLevel(order, remainingKg, remainingWorkingDays, avgDailyActual);
        dto.setRiskLevel(riskLevel);

        boolean needsReplan = underperforming
                || remainingKg > 0 && remainingWorkingDays == 0
                || (remainingWorkingDays > 0 && newDaysNeeded > remainingWorkingDays);
        dto.setNeedsReplan(needsReplan);

        if (needsReplan) {
            dto.setReplanStrategy(underperforming ? "TANG_NGAY_CONG"
                    : remainingWorkingDays == 0 ? "KE_DAIL"
                    : "CAN_CHINH_MUC_TIEU");
        } else {
            dto.setReplanStrategy("KHONG_CAN");
        }

        return dto;
    }

    @Transactional
    public void applyReplan(UUID orderId, List<Map<String, Object>> revisedTargets) {
        ProductionOrder order = orderRepo.findById(orderId)
                .orElseThrow(() -> new RuntimeException("Khong tim thay don hang"));

        ProductionPlan plan = planRepo.findTopByOrderIdOrderByCreatedAtDesc(orderId)
                .orElseThrow(() -> new RuntimeException("Chua co ke hoach"));

        for (Map<String, Object> revised : revisedTargets) {
            String targetIdStr = (String) revised.get("targetId");
            if (targetIdStr == null) continue;
            UUID targetId = UUID.fromString(targetIdStr);
            Optional<DailyTarget> tOpt = targetRepo.findById(targetId);
            if (tOpt.isEmpty()) continue;
            DailyTarget t = tOpt.get();

            if (revised.get("targetQuantityKg") != null) {
                t.setTargetQuantityKg(((Number) revised.get("targetQuantityKg")).doubleValue());
            }
            if (revised.get("targetRoastKg") != null) {
                t.setTargetRoastKg(((Number) revised.get("targetRoastKg")).doubleValue());
            }
            if (revised.get("targetQcKg") != null) {
                t.setTargetQcKg(((Number) revised.get("targetQcKg")).doubleValue());
            }
            if (revised.get("targetPackagedKg") != null) {
                t.setTargetPackagedKg(((Number) revised.get("targetPackagedKg")).doubleValue());
            }
            targetRepo.save(t);
        }

        plan.setDailyTargetKg(plan.getDailyTargetKg());
        plan.setRiskFactors("Da duoc AI replan luc " + LocalDate.now());
        planRepo.save(plan);

        order.setStatus("IN_PRODUCTION");
        orderRepo.save(order);
    }

    private List<ReplanDay> buildRevisedDays(List<DailyTarget> futureTargets,
                                              double completedKg, double remainingKg,
                                              double avgDailyActual, double originalTarget) {
        List<ReplanDay> days = new ArrayList<>();
        double cumulativeActual = completedKg;

        for (int i = 0; i < futureTargets.size(); i++) {
            DailyTarget t = futureTargets.get(i);
            ReplanDay r = new ReplanDay();
            r.setDayIndex(i + 1);
            r.setDate(t.getTargetDate().toString());
            r.setOriginalTargetKg(t.getTargetQuantityKg() != null ? t.getTargetQuantityKg() : 0);
            r.setActualKg(t.getTotalActualKg() != null ? t.getTotalActualKg() : 0);
            r.setCumulativeActual(Math.round(cumulativeActual * 100.0) / 100.0);
            r.setCumulativeTarget(Math.round(r.getOriginalTargetKg() * (i + 1) * 100.0) / 100.0);

            double revised = Math.min(avgDailyActual * 1.2, remainingKg / Math.max(1, futureTargets.size()));
            r.setRevisedTargetKg(Math.round(revised * 100.0) / 100.0);

            if (t.getStatus() == TargetStatus.COMPLETED) {
                r.setStatus("DA_HOAN_THANH");
            } else if (t.getTotalActualKg() != null && t.getTotalActualKg() > 0) {
                r.setStatus("DANG_THUC_HIEN");
            } else {
                r.setStatus("CHUA_THUC_HIEN");
            }

            cumulativeActual += r.getActualKg();
            days.add(r);
        }
        return days;
    }

    private List<String> buildRecommendations(double avgActual, double originalTarget, double remainingKg,
                                               int remainingDays, int newDaysNeeded,
                                               ProductionOrder order, boolean underperforming) {
        List<String> recs = new ArrayList<>();

        double greenNeededKg = Math.ceil(remainingKg / 0.85 * 10.0) / 10.0;
        if (remainingKg > 0) {
            recs.add("Định mức hạt nhân xanh cần chuẩn bị cho " + Math.round(remainingKg * 10.0) / 10.0
                    + " kg thành phẩm còn lại (bù hao hụt rang 15%): " + greenNeededKg + " kg nhân xanh.");
        }

        if (order.getTeam() != null && inventoryRepo != null && remainingKg > 0) {
            UUID teamId = order.getTeam().getId();
            double greenStock = inventoryRepo.findByTeamIdOrderByProductTypeAscProductStateAsc(teamId).stream()
                    .filter(i -> "GREEN".equalsIgnoreCase(i.getProductState()))
                    .mapToDouble(i -> i.getQuantity() != null ? i.getQuantity() : 0.0)
                    .sum();
            if (greenStock < greenNeededKg) {
                recs.add("⚠️ Cảnh báo nguyên liệu: Kho hạt xanh hiện còn " + Math.round(greenStock * 10.0) / 10.0
                        + " kg, thiếu " + Math.round((greenNeededKg - greenStock) * 10.0) / 10.0
                        + " kg nhân xanh để hoàn thành đơn.");
            } else {
                recs.add("✅ Tồn kho hạt nhân xanh khả dụng (" + Math.round(greenStock * 10.0) / 10.0
                        + " kg) đủ đáp ứng định mức rang còn lại.");
            }
        }

        if (order.getTeam() != null && attendanceRepo != null) {
            List<Attendance> todayAtt = attendanceRepo.findByTeamIdAndDate(order.getTeam().getId(), LocalDate.now());
            long roasters = todayAtt.stream().filter(a -> a.getStage() == Attendance.ProductionStage.RANG).count();
            if (todayAtt.isEmpty()) {
                recs.add("⚠️ Cảnh báo ca làm hôm nay: Chưa có nhân sự nào điểm danh vào ca tại xưởng.");
            } else {
                recs.add("Nhân sự điểm danh hôm nay: " + todayAtt.size() + " người (Công đoạn Rang: " + roasters + " người).");
            }
        }

        if (underperforming) {
            recs.add("Sản lượng thực tế (" + Math.round(avgActual * 100.0) / 100.0 + " kg/ngày) đang thấp hơn kế hoạch (" + Math.round(originalTarget * 100.0) / 100.0 + " kg/ngày).");
        }

        if (remainingDays == 0 && remainingKg > 0) {
            recs.add("Đã hết ngày làm việc theo lịch nhưng còn " + Math.round(remainingKg * 100.0) / 100.0 + " kg chưa hoàn thành. Cần gia hạn thêm " + newDaysNeeded + " ngày.");
        }

        if (remainingDays > 0 && newDaysNeeded > remainingDays) {
            int extraDays = newDaysNeeded - remainingDays;
            recs.add("Dự kiến cần thêm " + extraDays + " ngày làm việc để đạt mục tiêu. Đề xuất tăng ca hoặc bổ sung thợ rang.");
        }

        if (avgActual > 0 && remainingKg / avgActual <= 2) {
            recs.add("Khả năng hoàn thành đúng hạn: Cao. Tiến độ các mẻ rang hiện tại ổn định.");
        }

        if (order.getInternalDeadline() != null) {
            long daysLeft = ChronoUnit.DAYS.between(LocalDate.now(), order.getInternalDeadline().toLocalDate());
            if (daysLeft <= 2) {
                recs.add("🚨 Khẩn cấp: Hạn nội bộ chỉ còn " + daysLeft + " ngày. Ưu tiên tối đa cho công đoạn Đóng gói & QC xuất xưởng.");
            }
        }

        double shortfallPercent = originalTarget > 0 ? (originalTarget - avgActual) / originalTarget * 100 : 0;
        if (shortfallPercent > 20) {
            recs.add("Hụt " + Math.round(shortfallPercent) + "% sản lượng ngày so với định mức. Đề xuất mở thêm 2 giờ tăng ca/ngày.");
        }

        return recs;
    }

    private String calcRiskLevel(ProductionOrder order, double remainingKg, int remainingDays, double avgDailyActual) {
        if (remainingKg <= 0) return "NONE";
        if (order.getInternalDeadline() == null) return avgDailyActual < 50 ? "HIGH" : "MEDIUM";

        long daysLeft = ChronoUnit.DAYS.between(LocalDate.now(), order.getInternalDeadline().toLocalDate());
        if (daysLeft <= 0) return "CRITICAL";
        if (daysLeft <= 2) return "HIGH";
        if (daysLeft <= 5) return "MEDIUM";

        double projectedCompletion = remainingDays * avgDailyActual;
        if (projectedCompletion < remainingKg) return "HIGH";
        return "LOW";
    }
}
