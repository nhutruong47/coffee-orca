package org.example.backend.service;

import org.example.backend.dto.DailyTargetDTO;
import org.example.backend.dto.ProductionPlanDTO;
import org.example.backend.entity.*;
import org.example.backend.entity.DailyTarget.TargetStatus;
import org.example.backend.entity.ProductionPlan.PlanStatus;
import org.example.backend.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class ProductionPlanService {

    private final ProductionPlanRepository planRepo;
    private final ProductionOrderRepository orderRepo;
    private final DailyTargetRepository targetRepo;
    private final AttendanceRepository attendanceRepo;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private InventoryService inventoryService;

    public ProductionPlanService(ProductionPlanRepository planRepo, ProductionOrderRepository orderRepo,
                                 DailyTargetRepository targetRepo, AttendanceRepository attendanceRepo) {
        this.planRepo = planRepo;
        this.orderRepo = orderRepo;
        this.targetRepo = targetRepo;
        this.attendanceRepo = attendanceRepo;
    }

    @Transactional
    public ProductionPlanDTO generatePlan(UUID orderId) {
        ProductionOrder order = orderRepo.findById(orderId)
                .orElseThrow(() -> new RuntimeException("Khong tim thay don hang"));

        double outputTarget = order.getOutputTarget() != null ? order.getOutputTarget() : 0;
        LocalDate startDate = order.getProductionStartDate() != null
                ? order.getProductionStartDate()
                : LocalDate.now();
        LocalDate endDate = order.getInternalDeadline() != null
                ? order.getInternalDeadline().toLocalDate()
                : startDate.plusDays(30);

        int totalDays = (int) (endDate.toEpochDay() - startDate.toEpochDay()) + 1;
        int workingDays = countWorkingDays(startDate, endDate);

        double dailyTargetKg = workingDays > 0
                ? Math.ceil((outputTarget / workingDays) * 100.0) / 100.0
                : outputTarget;

        double inputRequired = order.getInputRequired() != null ? order.getInputRequired() : outputTarget;
        double roastKg = inputRequired;
        double qcKg = outputTarget * 1.05;
        double packagedKg = outputTarget;
        int packages = order.getTotalPackages() != null ? order.getTotalPackages()
                : (int) Math.ceil(outputTarget / (order.getPackageSize() != null ? parsePackageSize(order.getPackageSize()) : 1.0));

        List<String> riskFactors = new ArrayList<>();
        if (dailyTargetKg > 100) {
            riskFactors.add("Muc tieu ngay cao (" + dailyTargetKg + " kg). Can kiem tra cong suat may.");
        }
        if (workingDays < 5) {
            riskFactors.add("So ngay lam viec it, can tang ca hoac them nhan su.");
        }

        String aiRecs = buildAiRecommendations(outputTarget, dailyTargetKg, workingDays, order);

        ProductionPlan plan = new ProductionPlan();
        plan.setOrder(order);
        plan.setTotalDays(totalDays);
        plan.setTotalWorkingDays(workingDays);
        plan.setDailyTargetKg(dailyTargetKg);
        plan.setTotalInputKg(inputRequired);
        plan.setTotalRoastKg(roastKg);
        plan.setTotalQcKg(qcKg);
        plan.setTotalPackagedKg(packagedKg);
        plan.setTotalPackages(packages);
        plan.setAiRecommendations(aiRecs);
        plan.setRiskFactors(riskFactors.isEmpty() ? null : String.join("; ", riskFactors));
        plan.setStatus(PlanStatus.DRAFT);

        List<DailyTarget> targets = buildDailyTargets(plan, order, startDate, endDate, dailyTargetKg);
        plan.setDailyTargets(targets);

        ProductionPlan savedPlan = planRepo.save(plan);
        targetRepo.saveAll(targets);
        return toPlanDTO(savedPlan);
    }

    public ProductionPlanDTO getPlanById(UUID planId) {
        ProductionPlan plan = planRepo.findById(planId)
                .orElseThrow(() -> new RuntimeException("Khong tim thay ke hoach"));
        return toPlanDTO(plan);
    }

    public List<ProductionPlanDTO> getPlansByOrder(UUID orderId) {
        return planRepo.findByOrderIdOrderByCreatedAtDesc(orderId).stream()
                .map(this::toPlanDTO)
                .collect(Collectors.toList());
    }

    @Transactional
    public ProductionPlanDTO approvePlan(UUID planId, UUID approvedBy) {
        ProductionPlan plan = planRepo.findById(planId)
                .orElseThrow(() -> new RuntimeException("Khong tim thay ke hoach"));
        plan.setStatus(PlanStatus.APPROVED);
        plan.setApprovedAt(LocalDateTime.now());
        plan.setApprovedBy(approvedBy);

        ProductionOrder order = plan.getOrder();
        order.setStatus("PLANNING");
        orderRepo.save(order);

        return toPlanDTO(planRepo.save(plan));
    }

    @Transactional
    public DailyTargetDTO updateDailyActual(UUID targetId, Double actualRoastKg, Double actualQcKg,
                                            Double actualQcFailKg, Double actualPackagedKg,
                                            Integer actualPackages, String notes, String issues) {
        DailyTarget target = targetRepo.findById(targetId)
                .orElseThrow(() -> new RuntimeException("Khong tim thay muc tieu ngay"));

        double prevRoast = target.getActualRoastKg() != null ? target.getActualRoastKg() : 0.0;
        double prevPackaged = target.getActualPackagedKg() != null ? target.getActualPackagedKg() : 0.0;

        if (actualRoastKg != null) target.setActualRoastKg(actualRoastKg);
        if (actualQcKg != null) target.setActualQcKg(actualQcKg);
        if (actualQcFailKg != null) target.setActualQcFailKg(actualQcFailKg);
        if (actualPackagedKg != null) target.setActualPackagedKg(actualPackagedKg);
        if (actualPackages != null) target.setActualPackages(actualPackages);
        if (notes != null) target.setNotes(notes);
        if (issues != null) target.setIssues(issues);

        if (inventoryService != null && target.getOrder() != null && target.getOrder().getTeam() != null) {
            UUID teamId = target.getOrder().getTeam().getId();
            String pType = target.getOrder().getProductType() != null && !target.getOrder().getProductType().isBlank()
                    ? target.getOrder().getProductType() : "Robusta";
            if (actualRoastKg != null && actualRoastKg > prevRoast) {
                double deltaRoast = actualRoastKg - prevRoast;
                try {
                    inventoryService.transferStock(teamId, pType, "GREEN", "ROASTED", deltaRoast);
                } catch (Exception ignored) {}
            }
            if (actualPackagedKg != null && actualPackagedKg > prevPackaged) {
                double deltaPkg = actualPackagedKg - prevPackaged;
                try {
                    inventoryService.transferStock(teamId, pType, "ROASTED", "PACKAGED", deltaPkg);
                } catch (Exception ignored) {}
            }
        }

        double totalActual = 0.0;
        if (target.getActualRoastKg() != null) totalActual += target.getActualRoastKg();
        if (target.getActualPackagedKg() != null) totalActual += target.getActualPackagedKg();
        else if (target.getActualQcKg() != null) totalActual += target.getActualQcKg();
        target.setTotalActualKg(totalActual);
        target.calculateCompletionRate();

        UUID orderId = target.getOrder().getId();
        Double workerHours = attendanceRepo.sumWorkerHoursByTeamAndDate(
                target.getOrder().getTeam().getId(), target.getTargetDate());
        if (workerHours != null && workerHours > 0) {
            target.setTotalWorkerHours(workerHours);
            target.calculateProductivity();
        }

        if (target.getCompletionRate() != null) {
            if (target.getCompletionRate() >= 100) {
                target.setStatus(TargetStatus.COMPLETED);
            } else if (target.getCompletionRate() > 0) {
                target.setStatus(TargetStatus.PARTIAL);
            } else {
                target.setStatus(TargetStatus.IN_PROGRESS);
            }
        }

        updateOrderCompletedQuantity(orderId);

        return toTargetDTO(targetRepo.save(target));
    }

    private void updateOrderCompletedQuantity(UUID orderId) {
        List<DailyTarget> allTargets = targetRepo.findByOrderIdOrderByTargetDateAsc(orderId);
        double totalCompleted = allTargets.stream()
                .filter(t -> t.getTotalActualKg() != null)
                .mapToDouble(DailyTarget::getTotalActualKg)
                .sum();
        ProductionOrder order = orderRepo.findById(orderId).orElse(null);
        if (order != null) {
            order.setCompletedQuantity(totalCompleted);
            if (totalCompleted >= (order.getOutputTarget() != null ? order.getOutputTarget() : 0)) {
                order.setStatus("COMPLETED");
            }
            orderRepo.save(order);
        }
    }

    public List<DailyTargetDTO> getDailyTargetsByPlan(UUID planId) {
        return targetRepo.findByPlanIdOrderByTargetDateAsc(planId).stream()
                .map(this::toTargetDTO)
                .collect(Collectors.toList());
    }

    public DailyTargetDTO getTodayTarget(UUID teamId) {
        return targetRepo.findByTeamIdAndDate(teamId, LocalDate.now())
                .map(this::toTargetDTO)
                .orElse(null);
    }

    private List<DailyTarget> buildDailyTargets(ProductionPlan plan, ProductionOrder order,
                                                  LocalDate startDate, LocalDate endDate,
                                                  double dailyTargetKg) {
        List<DailyTarget> targets = new ArrayList<>();
        LocalDate current = startDate;

        int packageSize = order.getPackageSize() != null ? parsePackageSize(order.getPackageSize()) : 1;
        int totalPackages = order.getTotalPackages() != null ? order.getTotalPackages() : (int) Math.ceil(order.getOutputTarget() / packageSize);

        int dayIndex = 0;
        while (!current.isAfter(endDate)) {
            DayOfWeek dow = current.getDayOfWeek();
            DailyTarget target = new DailyTarget();
            target.setPlan(plan);
            target.setOrder(order);
            target.setTargetDate(current);

            if (dow == DayOfWeek.SATURDAY || dow == DayOfWeek.SUNDAY) {
                target.setIsHoliday(true);
                target.setTargetQuantityKg(0.0);
                target.setTargetRoastKg(0.0);
                target.setTargetQcKg(0.0);
                target.setTargetPackagedKg(0.0);
                target.setTargetPackages(0);
                target.setStatus(TargetStatus.SKIPPED);
            } else {
                target.setIsHoliday(false);
                target.setTargetQuantityKg(dailyTargetKg);
                target.setStatus(TargetStatus.PENDING);

                if (dayIndex < 3) {
                    target.setTargetRoastKg(dailyTargetKg * 1.05);
                    target.setTargetQcKg(dailyTargetKg);
                    target.setTargetPackagedKg(0.0);
                } else if (dayIndex < 5) {
                    target.setTargetRoastKg(dailyTargetKg);
                    target.setTargetQcKg(dailyTargetKg * 1.05);
                    target.setTargetPackagedKg(dailyTargetKg * 0.9);
                } else {
                    target.setTargetRoastKg(0.0);
                    target.setTargetQcKg(0.0);
                    target.setTargetPackagedKg(dailyTargetKg);
                }
                target.setTargetPackages((int) Math.ceil(totalPackages * dailyTargetKg / order.getOutputTarget()));
            }

            targets.add(target);
            current = current.plusDays(1);
            dayIndex++;
        }
        return targets;
    }

    private int countWorkingDays(LocalDate start, LocalDate end) {
        int count = 0;
        LocalDate current = start;
        while (!current.isAfter(end)) {
            DayOfWeek dow = current.getDayOfWeek();
            if (dow != DayOfWeek.SATURDAY && dow != DayOfWeek.SUNDAY) count++;
            current = current.plusDays(1);
        }
        return count;
    }

    private String buildAiRecommendations(double outputTarget, double dailyTargetKg,
                                          int workingDays, ProductionOrder order) {
        StringBuilder sb = new StringBuilder();
        sb.append("- Muc tieu san xuat: ").append(outputTarget).append(" kg\n");
        sb.append("- Ngay lam viec: ").append(workingDays).append(" ngay\n");
        sb.append("- Muc tieu moi ngay: ").append(dailyTargetKg).append(" kg\n");
        if (order.getExpectedYield() != null) {
            sb.append("- Ty le thu hoi: ").append((order.getExpectedYield() * 100)).append("%\n");
        }
        if (order.getInputRequired() != null) {
            sb.append("- Nguyen lieu can: ").append(order.getInputRequired()).append(" kg\n");
        }
        sb.append("- Ngay bat dau: ").append(order.getProductionStartDate()).append("\n");
        sb.append("- Han noi bo: ").append(order.getInternalDeadline()).append("\n");
        return sb.toString();
    }

    private int parsePackageSize(String packageSize) {
        try {
            if (packageSize == null) return 1;
            String num = packageSize.replaceAll("[^0-9]", "");
            return num.isEmpty() ? 1 : Integer.parseInt(num);
        } catch (Exception e) {
            return 1;
        }
    }

    private ProductionPlanDTO toPlanDTO(ProductionPlan p) {
        ProductionPlanDTO dto = new ProductionPlanDTO();
        dto.setId(p.getId().toString());
        dto.setOrderId(p.getOrder().getId().toString());
        dto.setOrderTitle(p.getOrder().getTitle());
        dto.setPlanCode(p.getPlanCode());
        dto.setTotalDays(p.getTotalDays());
        dto.setTotalWorkingDays(p.getTotalWorkingDays());
        dto.setDailyTargetKg(p.getDailyTargetKg());
        dto.setTotalInputKg(p.getTotalInputKg());
        dto.setTotalRoastKg(p.getTotalRoastKg());
        dto.setTotalQcKg(p.getTotalQcKg());
        dto.setTotalPackagedKg(p.getTotalPackagedKg());
        dto.setTotalPackages(p.getTotalPackages());
        dto.setAiRecommendations(p.getAiRecommendations());
        dto.setRiskFactors(p.getRiskFactors());
        dto.setStatus(p.getStatus().name());
        dto.setCreatedAt(p.getCreatedAt());
        dto.setApprovedAt(p.getApprovedAt());
        if (p.getDailyTargets() != null) {
            dto.setDailyTargets(p.getDailyTargets().stream()
                    .map(this::toTargetDTO)
                    .collect(Collectors.toList()));
        }
        return dto;
    }

    private DailyTargetDTO toTargetDTO(DailyTarget t) {
        DailyTargetDTO dto = new DailyTargetDTO();
        dto.setId(t.getId().toString());
        dto.setPlanId(t.getPlan().getId().toString());
        dto.setOrderId(t.getOrder().getId().toString());
        dto.setOrderTitle(t.getOrder().getTitle());
        dto.setTargetDate(t.getTargetDate());
        dto.setTargetQuantityKg(t.getTargetQuantityKg());
        dto.setTargetRoastKg(t.getTargetRoastKg());
        dto.setTargetQcKg(t.getTargetQcKg());
        dto.setTargetPackagedKg(t.getTargetPackagedKg());
        dto.setTargetPackages(t.getTargetPackages());
        dto.setActualRoastKg(t.getActualRoastKg());
        dto.setActualQcKg(t.getActualQcKg());
        dto.setActualQcFailKg(t.getActualQcFailKg());
        dto.setActualPackagedKg(t.getActualPackagedKg());
        dto.setActualPackages(t.getActualPackages());
        dto.setTotalActualKg(t.getTotalActualKg());
        dto.setCompletionRate(t.getCompletionRate());
        dto.setIsHoliday(t.getIsHoliday());
        dto.setNotes(t.getNotes());
        dto.setIssues(t.getIssues());
        dto.setStatus(t.getStatus().name());
        dto.setTotalWorkerHours(t.getTotalWorkerHours());
        dto.setProductivityKgPerHour(t.getProductivityKgPerHour());
        return dto;
    }
}
