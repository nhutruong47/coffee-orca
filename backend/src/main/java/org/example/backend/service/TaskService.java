package org.example.backend.service;

import org.example.backend.dto.TaskDTO;
import org.example.backend.dto.SalaryDTO;
import org.example.backend.entity.*;
import org.example.backend.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;

import java.io.ByteArrayOutputStream;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.*;
import java.util.stream.Collectors;

@Service
@Transactional
public class TaskService {

    private final TaskRepository taskRepo;
    private final GoalRepository goalRepo;
    private final UserRepository userRepo;
    private final TaskChecklistRepository checklistRepo;
    private final NotificationService notificationService;
    private final TeamMemberRepository teamMemberRepo;
    private final AttendanceRepository attendanceRepo;
    private final TaskTransferRepository transferRepo;
    private final TaskDependencyRepository dependencyRepo;
    private final InventoryRepository inventoryRepo;
    private final SalaryPayoutRepository salaryPayoutRepo;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private InterGroupOrderRepository interGroupOrderRepo;

    private static final double ROASTING_YIELD_RATIO = 0.85; // 15% natural moisture & chaff loss during roasting

    public TaskService(TaskRepository taskRepo, GoalRepository goalRepo,
            UserRepository userRepo, TaskChecklistRepository checklistRepo,
            NotificationService notificationService, TeamMemberRepository teamMemberRepo,
            AttendanceRepository attendanceRepo,
            TaskTransferRepository transferRepo, TaskDependencyRepository dependencyRepo,
            InventoryRepository inventoryRepo, SalaryPayoutRepository salaryPayoutRepo) {
        this.taskRepo = taskRepo;
        this.goalRepo = goalRepo;
        this.userRepo = userRepo;
        this.checklistRepo = checklistRepo;
        this.notificationService = notificationService;
        this.teamMemberRepo = teamMemberRepo;
        this.attendanceRepo = attendanceRepo;
        this.transferRepo = transferRepo;
        this.dependencyRepo = dependencyRepo;
        this.inventoryRepo = inventoryRepo;
        this.salaryPayoutRepo = salaryPayoutRepo;
    }

    public List<TaskDTO> getByGoal(UUID goalId) {
        return taskRepo.findByGoalId(goalId).stream().map(this::toDTO).collect(Collectors.toList());
    }

    public List<TaskDTO> getByMember(UUID memberId) {
        return taskRepo.findByMemberId(memberId).stream().map(this::toDTO).collect(Collectors.toList());
    }

    public List<TaskDTO> getAll() {
        return taskRepo.findAllByOrderByCreatedAtDesc().stream().map(this::toDTO).collect(Collectors.toList());
    }

    public List<TaskDTO> getAllVisibleTo(User user) {
        if (user == null || user.getId() == null) {
            return List.of();
        }
        if (user.getRole() == Role.ADMIN) {
            return getAll();
        }
        List<UUID> teamIds = teamMemberRepo.findByUserId(user.getId()).stream()
                .map(TeamMember::getTeam)
                .map(Team::getId)
                .collect(Collectors.toList());
        if (teamIds.isEmpty()) {
            return List.of();
        }
        return taskRepo.findByGoalTeamIdIn(teamIds).stream()
                .map(this::toDTO)
                .collect(Collectors.toList());
    }

    public TaskDTO getById(UUID id) {
        Task t = taskRepo.findById(id).orElseThrow(() -> new RuntimeException("Task not found"));
        return toDTO(t);
    }

    public TaskDTO create(TaskDTO dto) {
        Task t = new Task();
        t.setTitle(dto.getTitle());
        t.setDescription(dto.getDescription());
        t.setPriority(dto.getPriority() != null ? dto.getPriority() : 1);
        t.setDeadline(dto.getDeadline());
        t.setDueTime(dto.getDueTime());
        t.setStatus("PENDING");
        t.setWorkload(dto.getWorkload());
        t.setActualWorkload(dto.getActualWorkload());
        t.setOutputTarget(dto.getOutputTarget());
        t.setActualOutput(dto.getActualOutput());
        t.setProductionStage(dto.getProductionStage());
        t.setHourlyRate(dto.getHourlyRate());

        if (dto.getGoalId() != null && !dto.getGoalId().isBlank()) {
            goalRepo.findById(UUID.fromString(dto.getGoalId())).ifPresent(t::setGoal);
        }
        if (dto.getMemberId() != null && !dto.getMemberId().isBlank()) {
            userRepo.findById(UUID.fromString(dto.getMemberId())).ifPresent(t::setMember);
        } else if (t.getGoal() != null && t.getGoal().getTeam() != null) {
            User autoAssignee = autoPickBestMember(t.getGoal().getTeam(), t.getProductionStage(), t.getTitle());
            if (autoAssignee != null) {
                t.setMember(autoAssignee);
                t.setAcceptanceStatus("WAITING");
            }
        }
        Task saved = taskRepo.save(t);
        if (saved.getGoal() != null) {
            updateGoalProgress(saved.getGoal().getId());
        }
        if (saved.getMember() != null) {
            notificationService.createAndSend(
                    saved.getMember(),
                    "Nhiệm vụ mới (Tự động phân công)",
                    "Bạn được giao nhiệm vụ: " + saved.getTitle(),
                    "TASK_ASSIGNED",
                    saved.getId()
            );
        }
        return toDTO(saved);
    }

    private User autoPickBestMember(Team team, String productionStage, String title) {
        if (team == null || team.getId() == null) return null;
        List<TeamMember> members = teamMemberRepo.findByTeamId(team.getId());
        if (members == null || members.isEmpty()) {
            return team.getOwner();
        }
        String stageNorm = (productionStage != null ? productionStage : "").toLowerCase(Locale.ROOT);
        String titleNorm = (title != null ? title : "").toLowerCase(Locale.ROOT);

        User bestCandidate = null;
        int bestScore = Integer.MIN_VALUE;

        for (TeamMember tm : members) {
            User u = tm.getUser();
            if (u == null) continue;
            int score = 0;
            List<String> labels = tm.getJobLabels();
            if (labels != null) {
                for (String lbl : labels) {
                    String l = lbl.toLowerCase(Locale.ROOT);
                    if ((stageNorm.contains("rang") || titleNorm.contains("rang")) && (l.contains("rang") || l.contains("roast"))) {
                        score += 50;
                    } else if ((stageNorm.contains("qa") || stageNorm.contains("qc") || titleNorm.contains("qc") || titleNorm.contains("độ ẩm") || titleNorm.contains("cupping")) && (l.contains("qc") || l.contains("qa") || l.contains("kiểm"))) {
                        score += 50;
                    } else if ((stageNorm.contains("dong_goi") || titleNorm.contains("đóng gói")) && (l.contains("đóng gói") || l.contains("pack"))) {
                        score += 50;
                    } else if ((stageNorm.contains("xay") || titleNorm.contains("xay")) && (l.contains("xay") || l.contains("grind"))) {
                        score += 50;
                    }
                }
            }
            long activeTasks = taskRepo.findByMemberId(u.getId()).stream()
                    .filter(task -> !"COMPLETED".equals(task.getStatus()) && !"CANCELLED".equals(task.getStatus()))
                    .count();
            score -= (int) (activeTasks * 5);
            if (score > bestScore) {
                bestScore = score;
                bestCandidate = u;
            }
        }
        return bestCandidate != null ? bestCandidate : team.getOwner();
    }

    public TaskDTO updateStatus(UUID id, String status) {
        if (!Set.of("PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED").contains(status)) {
            throw new RuntimeException("Trạng thái không hợp lệ");
        }
        Task t = taskRepo.findById(id).orElseThrow(() -> new RuntimeException("Task not found"));
        String oldStatus = t.getStatus();
        t.setStatus(status);
        if ("COMPLETED".equals(status)) {
            t.setCompletionPercentage(100);
        }
        handleInventoryDeduction(t, oldStatus);
        Task saved = taskRepo.save(t);

        // Update goal progress
        if (saved.getGoal() != null) {
            updateGoalProgress(saved.getGoal().getId());
        }

        return toDTO(saved);
    }

    private void handleInventoryDeduction(Task t, String oldStatus) {
        if (t.getGoal() == null || t.getGoal().getTeam() == null) return;
        boolean completing = !"COMPLETED".equals(oldStatus) && "COMPLETED".equals(t.getStatus());
        boolean reopening = "COMPLETED".equals(oldStatus) && !"COMPLETED".equals(t.getStatus());
        if (!completing && !reopening) return;

        double qty = t.getActualOutput() != null && t.getActualOutput() > 0 ? t.getActualOutput()
                : (t.getOutputTarget() != null && t.getOutputTarget() > 0 ? t.getOutputTarget() : 0.0);
        if (qty <= 0) return;

        String stage = (t.getProductionStage() != null ? t.getProductionStage() : "").toUpperCase(Locale.ROOT);
        String titleLower = (t.getTitle() != null ? t.getTitle() : "").toLowerCase(Locale.ROOT);
        boolean isQa = stage.contains("QA") || stage.contains("QC")
                || titleLower.contains("qc") || titleLower.contains("qa")
                || titleLower.contains("cupping") || titleLower.contains("độ ẩm");
        if (isQa) return;
        boolean isRoasting = stage.contains("RANG") || stage.contains("ROAST") || titleLower.contains("rang");
        boolean isGrinding = stage.contains("XAY") || stage.contains("GRIND") || titleLower.contains("xay");
        boolean isPackaging = stage.contains("DONG_GOI") || stage.contains("PACK") || titleLower.contains("đóng gói");
        if (!isRoasting && !isGrinding && !isPackaging) return;

        Team team = t.getGoal().getTeam();
        List<InventoryItem> items = inventoryRepo.findByTeamIdOrderByProductTypeAscProductStateAsc(team.getId());
        if (items.isEmpty()) {
            throw new IllegalStateException("Insufficient stock for production task: " + t.getTitle());
        }

        InventoryItem matched = items.stream()
                .filter(i -> i.getProductType() != null &&
                        (titleLower.contains(i.getProductType().toLowerCase(Locale.ROOT)) ||
                         (t.getGoal().getTitle() != null && t.getGoal().getTitle().toLowerCase(Locale.ROOT).contains(i.getProductType().toLowerCase(Locale.ROOT)))))
                .findFirst()
                .orElse(items.get(0));
        String pType = matched.getProductType();
        double sourceDelta = isRoasting ? Math.round((qty / ROASTING_YIELD_RATIO) * 100.0) / 100.0 : qty;

        InventoryItem source;
        String targetState;
        if (isRoasting) {
            source = findProductState(items, pType, "GREEN")
                    .or(() -> items.stream().filter(i -> pType.equalsIgnoreCase(i.getProductType()) && "RAW_MATERIAL".equalsIgnoreCase(i.getProductType())).findFirst())
                    .orElseThrow(() -> new IllegalStateException("Insufficient stock: " + pType + " GREEN"));
            targetState = "ROASTED";
        } else if (isGrinding) {
            source = findProductState(items, pType, "ROASTED")
                    .orElseThrow(() -> new IllegalStateException("Insufficient stock: " + pType + " ROASTED"));
            targetState = "GROUND";
        } else {
            source = findProductState(items, pType, "GROUND")
                    .filter(i -> completing ? i.getQuantity() >= qty : i.getQuantity() >= 0)
                    .or(() -> findProductState(items, pType, "ROASTED"))
                    .orElseThrow(() -> new IllegalStateException("Insufficient stock: " + pType + " ROASTED/GROUND"));
            targetState = "PACKAGED";
        }

        if (completing) {
            if (source.getQuantity() < sourceDelta) {
                throw new IllegalStateException("Insufficient stock: " + pType + " " + source.getProductState());
            }
            source.setQuantity(source.getQuantity() - sourceDelta);
            inventoryRepo.save(source);
            checkLowStockAlert(team, source);

            InventoryItem target = findProductState(items, pType, targetState)
                    .or(() -> inventoryRepo.findByTeamIdAndProductTypeAndProductState(team.getId(), pType, targetState))
                    .orElseGet(() -> newInventoryItem(team, pType, targetState));
            target.setQuantity(target.getQuantity() + qty);
            inventoryRepo.save(target);
        } else {
            InventoryItem target = findProductState(items, pType, targetState)
                    .or(() -> inventoryRepo.findByTeamIdAndProductTypeAndProductState(team.getId(), pType, targetState))
                    .orElseThrow(() -> new IllegalStateException("Cannot revert task; missing output stock: " + pType + " " + targetState));
            if (target.getQuantity() < qty) {
                throw new IllegalStateException("Cannot revert task; output stock already consumed: " + pType + " " + targetState);
            }
            target.setQuantity(target.getQuantity() - qty);
            inventoryRepo.save(target);
            source.setQuantity(source.getQuantity() + sourceDelta);
            inventoryRepo.save(source);
        }
    }

    private Optional<InventoryItem> findProductState(List<InventoryItem> items, String productType, String state) {
        return items.stream()
                .filter(i -> productType != null && productType.equalsIgnoreCase(i.getProductType())
                        && state.equalsIgnoreCase(i.getProductState()))
                .findFirst();
    }

    private InventoryItem newInventoryItem(Team team, String productType, String productState) {
        InventoryItem item = new InventoryItem();
        item.setTeam(team);
        item.setProductType(productType);
        item.setProductState(productState);
        item.setQuantity(0.0);
        item.setUnit("kg");
        return item;
    }

    private void checkLowStockAlert(Team team, InventoryItem item) {
        double threshold = item.getLowStockThreshold() != null ? item.getLowStockThreshold() : 100.0;
        if (item.getQuantity() <= threshold && team.getOwner() != null) {
            notificationService.createAndSend(
                    team.getOwner(),
                    "Cảnh báo tồn kho thấp",
                    "Nguyên liệu '" + item.getDisplayName() + "' tại " + team.getName() + " còn " + item.getQuantity() + " " + item.getUnit() + " (dưới ngưỡng an toàn " + threshold + " " + item.getUnit() + ").",
                    "LOW_STOCK_ALERT",
                    item.getId()
            );
        }
    }

    public TaskDTO updateProgress(UUID id, int percentage) {
        Task t = taskRepo.findById(id).orElseThrow(() -> new RuntimeException("Task not found"));
        String oldStatus = t.getStatus();
        t.setCompletionPercentage(percentage);
        if (percentage == 100) {
            t.setStatus("COMPLETED");
        } else if (percentage > 0 && "PENDING".equals(t.getStatus())) {
            t.setStatus("IN_PROGRESS");
        }
        handleInventoryDeduction(t, oldStatus);
        Task saved = taskRepo.save(t);
        if (saved.getGoal() != null) {
            updateGoalProgress(saved.getGoal().getId());
        }
        return toDTO(saved);
    }

    public TaskDTO updateWorkload(UUID id, Double actualWorkload) {
        Task t = taskRepo.findById(id).orElseThrow(() -> new RuntimeException("Task not found"));
        t.setActualWorkload(actualWorkload);
        return toDTO(taskRepo.save(t));
    }

    public TaskDTO update(UUID id, Map<String, Object> updates, User requester) {
        Task t = taskRepo.findById(id).orElseThrow(() -> new RuntimeException("Task not found"));
        
        if (requester != null && requester.getRole() != Role.ADMIN) {
            UUID teamId = t.getGoal() != null && t.getGoal().getTeam() != null ? t.getGoal().getTeam().getId() : null;
            if (teamId != null) {
                TeamMember tm = teamMemberRepo.findByTeamIdAndUserId(teamId, requester.getId()).orElse(null);
                boolean isAdmin = tm != null && tm.getGroupRole() == GroupRole.ADMIN;
                if (!isAdmin) {
                    // Assignee can only update their own progress, not targets/deadlines
                    updates.keySet().retainAll(Set.of("status", "completionPercentage", "actualWorkload", "actualOutput"));
                }
            }
        }

        if (updates.containsKey("title")) t.setTitle((String) updates.get("title"));
        if (updates.containsKey("description")) t.setDescription((String) updates.get("description"));
        if (updates.containsKey("priority")) {
            Object p = updates.get("priority");
            t.setPriority(p instanceof Integer ? (Integer) p : (p instanceof Number ? ((Number) p).intValue() : t.getPriority()));
        }
        if (updates.containsKey("actualOutput")) {
            Object val = updates.get("actualOutput");
            t.setActualOutput(val != null ? Double.valueOf(val.toString()) : null);
        }
        if (updates.containsKey("outputTarget")) {
            Object val = updates.get("outputTarget");
            t.setOutputTarget(val != null ? Double.valueOf(val.toString()) : null);
        }
        if (updates.containsKey("productionStage")) {
            t.setProductionStage((String) updates.get("productionStage"));
        }
        if (updates.containsKey("dueTime")) {
            String due = (String) updates.get("dueTime");
            t.setDueTime(due != null ? java.time.LocalDateTime.parse(due) : null);
        }
        if (updates.containsKey("deadline")) {
            String dead = (String) updates.get("deadline");
            t.setDeadline(dead != null ? java.time.LocalDateTime.parse(dead) : null);
        }

        String oldStatus = t.getStatus();
        if (updates.containsKey("actualOutput") || updates.containsKey("outputTarget")) {
            Double target = t.getOutputTarget() != null ? t.getOutputTarget() : (t.getWorkload() != null ? t.getWorkload() : 0.0);
            Double actual = t.getActualOutput() != null ? t.getActualOutput() : 0.0;
            
            if (target > 0) {
                if (actual >= target) {
                    t.setStatus("COMPLETED");
                    t.setCompletionPercentage(100);
                } else {
                    t.setCompletionPercentage((int) Math.round((actual / target) * 100));
                    if (actual > 0) {
                        t.setStatus("IN_PROGRESS");
                    } else {
                        t.setStatus("PENDING");
                    }
                }
            } else {
                if (actual > 0) {
                    t.setStatus("IN_PROGRESS");
                    t.setCompletionPercentage(50); // fallback or keep current
                } else {
                    t.setStatus("PENDING");
                    t.setCompletionPercentage(0);
                }
            }
        }

        handleInventoryDeduction(t, oldStatus);
        Task saved = taskRepo.save(t);
        if (saved.getGoal() != null) {
            updateGoalProgress(saved.getGoal().getId());
        }
        return toDTO(saved);
    }

    public TaskDTO assign(UUID id, UUID memberId) {
        Task t = taskRepo.findById(id).orElseThrow(() -> new RuntimeException("Task not found"));
        
        if (memberId == null) {
            t.setMember(null);
            t.setAcceptanceStatus("WAITING");
            Task saved = taskRepo.save(t);
            return toDTO(saved);
        }

        User member = userRepo.findById(memberId).orElseThrow(() -> new RuntimeException("User not found"));
        
        // Validate if member is in the team
        if (t.getGoal() != null && t.getGoal().getTeam() != null) {
            UUID teamId = t.getGoal().getTeam().getId();
            // Team owner shouldn't be blocked from being assigned
            if (!t.getGoal().getTeam().getOwner().getId().equals(memberId)) {
                boolean isMember = teamMemberRepo.findByTeamId(teamId).stream()
                    .anyMatch(tm -> tm.getUser().getId().equals(memberId));
                if (!isMember) {
                    throw new RuntimeException("Người dùng không thuộc xưởng này. Không thể giao việc.");
                }
            }
        }

        t.setMember(member);
        t.setAcceptanceStatus("WAITING");
        Task saved = taskRepo.save(t);

        // Send notification to assigned member
        notificationService.createAndSend(
            member,
            "Nhiệm vụ mới",
            "Bạn được giao nhiệm vụ: " + t.getTitle(),
            "TASK_ASSIGNED",
            t.getId()
        );

        return toDTO(saved);
    }

    /** Employee accepts or rejects assigned task */
    public TaskDTO respondToTask(UUID taskId, UUID userId, boolean accepted) {
        Task t = taskRepo.findById(taskId).orElseThrow(() -> new RuntimeException("Task not found"));
        if (t.getMember() == null || !t.getMember().getId().equals(userId)) {
            throw new RuntimeException("Bạn không được giao nhiệm vụ này");
        }
        t.setAcceptanceStatus(accepted ? "ACCEPTED" : "REJECTED");
        if (accepted) {
            t.setStatus("IN_PROGRESS");
            Task saved = taskRepo.save(t);
            // Notify group owner
            notifyOwnerOfResponse(t, true);
            return toDTO(saved);
        } else {
            // If rejected and there is a backup member, promote backup to assigned and notify
            User backup = t.getBackupMember();
            if (backup != null) {
                t.setMember(backup);
                t.setBackupMember(null);
                t.setAcceptanceStatus("WAITING");
                Task saved = taskRepo.save(t);

                // Notify the new assignee
                notificationService.createAndSend(
                    backup,
                    "Bạn được chọn làm sao lưu",
                    "Bạn được chỉ định thay thế nhiệm vụ: " + t.getTitle(),
                    "TASK_ASSIGNED",
                    t.getId()
                );

                // Notify owner about replacement
                notifyOwnerOfResponse(t, false);

                return toDTO(saved);
            } else {
                t.setAcceptanceStatus("REJECTED");
                Task saved = taskRepo.save(t);
                notifyOwnerOfResponse(t, false);
                return toDTO(saved);
            }
        }
    }

    private void notifyOwnerOfResponse(Task t, boolean accepted) {
        Goal goal = t.getGoal();
        if (goal != null && goal.getTeam() != null) {
            UUID ownerId = goal.getTeam().getOwner().getId();
            User owner = userRepo.findById(ownerId).orElse(null);
            if (owner != null) {
                String status = accepted ? "CHẤP NHẬN" : "TỪ CHỐI";
                notificationService.createAndSend(
                    owner,
                    "Phản hồi nhiệm vụ",
                    t.getMember().getUsername() + " đã " + status + " nhiệm vụ: " + t.getTitle(),
                    accepted ? "TASK_ACCEPTED" : "TASK_REJECTED",
                    t.getId()
                );
            }
        }
    }

    /** Calculate salary report for all members in a team */
    public List<SalaryDTO> getSalaryReport(UUID teamId) {
        return getSalaryReport(teamId, null, null);
    }

    /** Calculate salary report for all members in a team for a selected month. */
    public List<SalaryDTO> getSalaryReport(UUID teamId, Integer year, Integer month) {
        YearMonth salaryMonth = resolveSalaryMonth(year, month);
        LocalDate periodStart = salaryMonth != null ? salaryMonth.atDay(1) : null;
        LocalDate periodEnd = salaryMonth != null ? salaryMonth.atEndOfMonth() : null;
        List<TeamMember> members = teamMemberRepo.findByTeamId(teamId);
        List<SalaryDTO> report = new ArrayList<>();

        for (TeamMember tm : members) {
            User member = tm.getUser();
            List<Task> tasks = taskRepo.findByMemberId(member.getId());
            // Filter tasks belonging to this team's goals
            List<Task> teamTasks = tasks.stream()
                .filter(t -> t.getGoal() != null && t.getGoal().getTeam() != null
                    && t.getGoal().getTeam().getId().equals(teamId))
                .filter(t -> isTaskInSalaryPeriod(t, periodStart, periodEnd))
                .collect(Collectors.toList());

            int totalTasks = teamTasks.size();
            int completed = (int) teamTasks.stream().filter(t -> "COMPLETED".equals(t.getStatus())).count();
            double totalWorkload = teamTasks.stream()
                .filter(t -> "COMPLETED".equals(t.getStatus()))
                .mapToDouble(t -> t.getActualWorkload() != null ? t.getActualWorkload() : (t.getWorkload() != null ? t.getWorkload() : 0))
                .sum();

            // Get closed attendance data for this member and team; open shifts and tasks never generate pay.
            List<Attendance> attendances = (salaryMonth == null
                    ? attendanceRepo.findByUserIdAndTeamId(member.getId(), teamId)
                    : attendanceRepo.findByUserIdAndTeamIdAndDateBetween(member.getId(), teamId, periodStart, periodEnd))
                    .stream()
                    .filter(a -> a.getCheckInTime() != null && a.getCheckOutTime() != null)
                    .collect(Collectors.toList());
            double totalRegularHours = 0;
            double totalOvertimeHours = 0;
            double estimatedSalary = 0;
            double avgRate = 50000;
            double defaultOvertimeRate = 75000;
            for (Attendance a : attendances) {
                double standard = a.getStandardHours() != null && a.getStandardHours() > 0 ? a.getStandardHours() : 8.0;
                double rate = a.getHourlyRateVnd() != null && a.getHourlyRateVnd() > 0 ? a.getHourlyRateVnd() : 50000.0;
                double multiplier = a.getOvertimeMultiplier() != null && a.getOvertimeMultiplier() >= 1.5
                        ? a.getOvertimeMultiplier() : 1.5;
                long elapsed = Math.max(0L, java.time.Duration.between(a.getCheckInTime(), a.getCheckOutTime()).toMinutes());
                long breakMins = Math.min(elapsed, Math.max(0, a.getBreakMinutes() == null ? 0 : a.getBreakMinutes()));
                double worked = Math.round(((elapsed - breakMins) / 60.0) * 10000.0) / 10000.0;
                double reg = Math.round(Math.min(worked, standard) * 10000.0) / 10000.0;
                double ot = Math.round(Math.max(0.0, worked - reg) * 10000.0) / 10000.0;
                totalRegularHours += reg;
                totalOvertimeHours += ot;
                estimatedSalary += Math.round(reg * rate) + Math.round(ot * rate * multiplier);
                avgRate = rate;
                defaultOvertimeRate = rate * multiplier;
            }
            totalRegularHours = Math.round(totalRegularHours * 10000.0) / 10000.0;
            totalOvertimeHours = Math.round(totalOvertimeHours * 10000.0) / 10000.0;

            SalaryDTO dto = new SalaryDTO();
            dto.setMemberId(member.getId().toString());
            dto.setMemberName(member.getFullName() != null ? member.getFullName() : member.getUsername());
            dto.setTotalTasks(totalTasks);
            dto.setCompletedTasks(completed);
            dto.setTotalWorkload(totalWorkload);
            dto.setTotalActualWorkload(totalWorkload);
            dto.setRegularHours(totalRegularHours);
            dto.setOvertimeHours(totalOvertimeHours);
            dto.setHourlyRate(avgRate);
            dto.setOvertimeRate(defaultOvertimeRate);
            dto.setEstimatedSalary(estimatedSalary);
            report.add(dto);
        }
        return report;
    }

    private YearMonth resolveSalaryMonth(Integer year, Integer month) {
        if (year == null || month == null) {
            return null;
        }
        if (month < 1 || month > 12) {
            throw new RuntimeException("Thang bang luong khong hop le.");
        }
        return YearMonth.of(year, month);
    }

    private boolean isTaskInSalaryPeriod(Task task, LocalDate periodStart, LocalDate periodEnd) {
        if (periodStart == null || periodEnd == null) {
            return true;
        }
        LocalDate taskDate = null;
        if (task.getDueTime() != null) {
            taskDate = task.getDueTime().toLocalDate();
        } else if (task.getDeadline() != null) {
            taskDate = task.getDeadline().toLocalDate();
        } else if (task.getCreatedAt() != null) {
            taskDate = task.getCreatedAt().toLocalDate();
        }
        return taskDate != null && !taskDate.isBefore(periodStart) && !taskDate.isAfter(periodEnd);
    }

    public void delete(UUID id) {
        Task t = taskRepo.findById(id).orElseThrow(() -> new RuntimeException("Task not found"));
        UUID goalId = t.getGoal() != null ? t.getGoal().getId() : null;
        checklistRepo.deleteAll(checklistRepo.findByTaskIdOrderBySortOrderAsc(id));
        taskRepo.deleteById(id);
        if (goalId != null) {
            updateGoalProgress(goalId);
        }
    }

    // === Checklist ===
    public List<Map<String, Object>> getChecklist(UUID taskId) {
        return checklistRepo.findByTaskIdOrderBySortOrderAsc(taskId).stream()
                .map(c -> {
                    Map<String, Object> m = new HashMap<>();
                    m.put("id", c.getId().toString());
                    m.put("content", c.getContent());
                    m.put("checked", c.getChecked());
                    m.put("sortOrder", c.getSortOrder());
                    return m;
                }).collect(Collectors.toList());
    }

    public Map<String, Object> addChecklistItem(UUID taskId, String content) {
        Task t = taskRepo.findById(taskId).orElseThrow(() -> new RuntimeException("Task not found"));
        TaskChecklist c = new TaskChecklist();
        c.setTask(t);
        c.setContent(content);
        c.setChecked(false);
        int count = checklistRepo.findByTaskIdOrderBySortOrderAsc(taskId).size();
        c.setSortOrder(count);
        checklistRepo.save(c);
        Map<String, Object> m = new HashMap<>();
        m.put("id", c.getId().toString());
        m.put("content", c.getContent());
        m.put("checked", c.getChecked());
        return m;
    }

    public void toggleChecklistItem(UUID checklistId) {
        TaskChecklist c = checklistRepo.findById(checklistId)
                .orElseThrow(() -> new RuntimeException("Checklist item not found"));
        c.setChecked(!c.getChecked());
        checklistRepo.save(c);

        // Update task completion percentage
        UUID taskId = c.getTask().getId();
        List<TaskChecklist> items = checklistRepo.findByTaskIdOrderBySortOrderAsc(taskId);
        long checked = items.stream().filter(TaskChecklist::getChecked).count();
        int pct = items.isEmpty() ? 0 : (int) (checked * 100 / items.size());

        Task t = taskRepo.findById(taskId).orElseThrow();
        String oldStatus = t.getStatus();
        t.setCompletionPercentage(pct);
        if (pct == 100)
            t.setStatus("COMPLETED");
        handleInventoryDeduction(t, oldStatus);
        taskRepo.save(t);

        if (t.getGoal() != null) {
            updateGoalProgress(t.getGoal().getId());
        }
    }

    // === KPI ===
    public Map<String, Object> getMemberKpi(UUID memberId) {
        List<Task> tasks = taskRepo.findByMemberId(memberId);
        long total = tasks.size();
        long completed = tasks.stream().filter(t -> "COMPLETED".equals(t.getStatus())).count();
        long overdue = tasks.stream()
                .filter(t -> t.getDeadline() != null && t.getDeadline().isBefore(java.time.LocalDateTime.now())
                        && !"COMPLETED".equals(t.getStatus()))
                .count();
        double avgCompletion = tasks.stream()
                .mapToInt(t -> t.getCompletionPercentage() != null ? t.getCompletionPercentage() : 0).average()
                .orElse(0);

        Map<String, Object> kpi = new HashMap<>();
        kpi.put("totalTasks", total);
        kpi.put("completedTasks", completed);
        kpi.put("overdueTasks", overdue);
        kpi.put("completionRate", total > 0 ? (completed * 100 / total) : 0);
        kpi.put("avgCompletionPercentage", Math.round(avgCompletion));
        return kpi;
    }

    private void updateGoalProgress(UUID goalId) {
        List<Task> tasks = taskRepo.findByGoalId(goalId);
        long completed = tasks.stream().filter(t -> "COMPLETED".equals(t.getStatus())).count();
        long inProgress = tasks.stream().filter(t -> "IN_PROGRESS".equals(t.getStatus())).count();

        goalRepo.findById(goalId).ifPresent(g -> {
            g.setTotalTasks(tasks.size());
            g.setCompletedTasks((int) completed);
            if (completed == tasks.size() && !tasks.isEmpty()) {
                g.setStatus("DONE");
            } else if (completed > 0 || inProgress > 0) {
                g.setStatus("IN_PROGRESS");
            } else {
                g.setStatus("PENDING");
            }
            goalRepo.save(g);

            if (interGroupOrderRepo != null) {
                List<InterGroupOrder> linkedOrders = interGroupOrderRepo.findByLinkedGoalId(goalId);
                for (InterGroupOrder order : linkedOrders) {
                    if ("DONE".equals(g.getStatus()) &&
                            Set.of("CONFIRMED", "IN_PRODUCTION", "QC").contains(order.getStatus())) {
                        order.setStatus("COMPLETED");
                        interGroupOrderRepo.save(order);
                        if (order.getSellerTeam() != null && order.getSellerTeam().getOwner() != null) {
                            notificationService.createAndSend(
                                    order.getSellerTeam().getOwner(),
                                    "Hoàn tất sản xuất đơn hàng",
                                    "Tất cả công đoạn của đơn '" + order.getTitle() + "' đã hoàn thành 100%, sẵn sàng xuất kho giao hàng.",
                                    "ORDER_COMPLETED",
                                    order.getId()
                            );
                        }
                    } else if ("IN_PROGRESS".equals(g.getStatus()) && "CONFIRMED".equals(order.getStatus())) {
                        order.setStatus("IN_PRODUCTION");
                        interGroupOrderRepo.save(order);
                    }
                }
            }
        });
    }

    private TaskDTO toDTO(Task t) {
        TaskDTO dto = new TaskDTO();
        dto.setId(t.getId() != null ? t.getId().toString() : null);
        dto.setTitle(t.getTitle());
        dto.setDescription(t.getDescription());
        dto.setPriority(t.getPriority());
        dto.setStatus(t.getStatus());
        dto.setAcceptanceStatus(t.getAcceptanceStatus());
        dto.setHourlyRate(t.getHourlyRate());
        dto.setWorkload(t.getWorkload());
        dto.setActualWorkload(t.getActualWorkload());
        dto.setCompletionPercentage(t.getCompletionPercentage());
        dto.setOutputTarget(t.getOutputTarget());
        dto.setActualOutput(t.getActualOutput());
        dto.setDeadline(t.getDeadline());
        dto.setDueTime(t.getDueTime());
        dto.setProductionStage(t.getProductionStage());
        dto.setGoalId(t.getGoal() != null ? t.getGoal().getId().toString() : null);
        dto.setGoalTitle(t.getGoal() != null ? t.getGoal().getTitle() : null);
        dto.setTeamId(t.getGoal() != null && t.getGoal().getTeam() != null ? t.getGoal().getTeam().getId().toString() : null);
        dto.setMemberId(t.getMember() != null ? t.getMember().getId().toString() : null);
        dto.setMemberName(t.getMember() != null ? t.getMember().getUsername() : null);
        dto.setBackupMemberId(t.getBackupMember() != null ? t.getBackupMember().getId().toString() : null);
        dto.setBackupMemberName(t.getBackupMember() != null ? t.getBackupMember().getUsername() : null);
        dto.setSupervisorId(t.getSupervisor() != null ? t.getSupervisor().getId().toString() : null);
        dto.setSupervisorName(t.getSupervisor() != null ? t.getSupervisor().getUsername() : null);
        dto.setCreatedAt(t.getCreatedAt());
        return dto;
    }

    public TaskDTO setBackup(UUID id, UUID memberId) {
        Task t = taskRepo.findById(id).orElseThrow(() -> new RuntimeException("Task not found"));
        if (memberId == null) {
            t.setBackupMember(null);
            Task saved = taskRepo.save(t);
            return toDTO(saved);
        }
        User member = userRepo.findById(memberId).orElseThrow(() -> new RuntimeException("User not found"));

        // Validate if member is in the team
        if (t.getGoal() != null && t.getGoal().getTeam() != null) {
            UUID teamId = t.getGoal().getTeam().getId();
            if (!t.getGoal().getTeam().getOwner().getId().equals(memberId)) {
                boolean isMember = teamMemberRepo.findByTeamId(teamId).stream()
                    .anyMatch(tm -> tm.getUser().getId().equals(memberId));
                if (!isMember) {
                    throw new RuntimeException("Người dùng không thuộc xưởng này. Không thể làm người sao lưu.");
                }
            }
        }

        t.setBackupMember(member);
        Task saved = taskRepo.save(t);

        // Notify backup member
        notificationService.createAndSend(
            member,
            "Bạn được chọn làm sao lưu",
            "Bạn được chỉ định làm sao lưu cho nhiệm vụ: " + t.getTitle(),
            "TASK_ASSIGNED",
            t.getId()
        );

        return toDTO(saved);
    }

    public TaskDTO setSupervisor(UUID id, UUID supervisorId) {
        Task t = taskRepo.findById(id).orElseThrow(() -> new RuntimeException("Task not found"));
        User supervisor = userRepo.findById(supervisorId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        if (t.getGoal() != null && t.getGoal().getTeam() != null) {
            UUID teamId = t.getGoal().getTeam().getId();
            boolean isMember = teamMemberRepo.findByTeamId(teamId).stream()
                    .anyMatch(tm -> tm.getUser().getId().equals(supervisorId));
            if (!isMember) {
                throw new RuntimeException("Người dùng không thuộc xưởng này. Không thể chỉ định giám sát.");
            }
        }

        t.setSupervisor(supervisor);
        return toDTO(taskRepo.save(t));
    }

    public TaskDTO transferTask(UUID id, UUID toMemberId, String reason, String actorType, User actor) {
        Task t = taskRepo.findById(id).orElseThrow(() -> new RuntimeException("Task not found"));
        User to = userRepo.findById(toMemberId).orElseThrow(() -> new RuntimeException("User not found"));

        if (t.getGoal() != null && t.getGoal().getTeam() != null) {
            UUID teamId = t.getGoal().getTeam().getId();
            boolean isMember = teamMemberRepo.findByTeamId(teamId).stream()
                    .anyMatch(tm -> tm.getUser().getId().equals(toMemberId));
            if (!isMember) {
                throw new RuntimeException("Người dùng không thuộc xưởng này. Không thể chuyển giao.");
            }
        }

        User from = t.getMember();

        TaskTransfer tx = new TaskTransfer();
        tx.setTask(t);
        tx.setFromUser(from);
        tx.setToUser(to);
        tx.setActorType(actorType != null ? actorType : (actor != null ? "MANAGER" : "MEMBER"));
        tx.setReason(reason);
        transferRepo.save(tx);

        t.setMember(to);
        t.setAcceptanceStatus("WAITING");
        Task saved = taskRepo.save(t);

        notificationService.createAndSend(
            to,
            "Bạn được chuyển giao nhiệm vụ",
            "Bạn được chuyển giao nhiệm vụ: " + t.getTitle(),
            "TASK_TRANSFERRED",
            t.getId()
        );

        return toDTO(saved);
    }

    public List<Map<String, Object>> getTransfers(UUID taskId) {
        return transferRepo.findByTaskIdOrderByCreatedAtDesc(taskId).stream()
                .map(tx -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", tx.getId().toString());
                    m.put("taskId", tx.getTask().getId().toString());
                    m.put("fromUserId", tx.getFromUser() != null ? tx.getFromUser().getId().toString() : null);
                    m.put("fromUserName", tx.getFromUser() != null ? tx.getFromUser().getUsername() : null);
                    m.put("toUserId", tx.getToUser().getId().toString());
                    m.put("toUserName", tx.getToUser().getUsername());
                    m.put("actorType", tx.getActorType());
                    m.put("reason", tx.getReason());
                    m.put("createdAt", tx.getCreatedAt() != null ? tx.getCreatedAt().toString() : null);
                    return m;
                }).collect(Collectors.toList());
    }

    public Map<String, Object> addDependency(UUID taskId, UUID dependsOnTaskId, String dependencyType) {
        Task t = taskRepo.findById(taskId).orElseThrow(() -> new RuntimeException("Task not found"));
        Task dep = taskRepo.findById(dependsOnTaskId).orElseThrow(() -> new RuntimeException("Dependency task not found"));
        if (t.getId().equals(dep.getId())) {
            throw new RuntimeException("Task không thể phụ thuộc vào chính nó");
        }
        TaskDependency d = new TaskDependency();
        d.setTask(t);
        d.setDependsOnTask(dep);
        d.setDependencyType(dependencyType != null ? dependencyType : "FINISH_TO_START");
        TaskDependency saved = dependencyRepo.save(d);

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", saved.getId().toString());
        m.put("taskId", t.getId().toString());
        m.put("dependsOnTaskId", dep.getId().toString());
        m.put("dependencyType", saved.getDependencyType());
        return m;
    }

    public List<Map<String, Object>> getDependencies(UUID taskId) {
        return dependencyRepo.findByTaskId(taskId).stream()
                .map(d -> {
                    Task dep = d.getDependsOnTask();
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", d.getId().toString());
                    m.put("taskId", taskId.toString());
                    m.put("dependsOnTaskId", dep.getId().toString());
                    m.put("dependsOnTaskTitle", dep.getTitle());
                    m.put("dependencyType", d.getDependencyType());
                    return m;
                }).collect(Collectors.toList());
    }

    public byte[] exportSalaryExcel(UUID teamId) throws Exception {
        return exportSalaryExcel(teamId, null, null);
    }

    public byte[] exportSalaryExcel(UUID teamId, Integer year, Integer month) throws Exception {
        List<SalaryDTO> report = getSalaryReport(teamId, year, month);
        try (Workbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = wb.createSheet("Bang luong");
            String[] headers = {"STT", "Nhan vien", "Tong task", "Hoan thanh", "Gio thuong", "Gio tang ca",
                    "Don gia/gio (VND)", "Luong thuc nhan (VND)"};
            Row hRow = sheet.createRow(0);
            for (int i = 0; i < headers.length; i++) {
                hRow.createCell(i).setCellValue(headers[i]);
            }
            double totalSalary = 0;
            for (int i = 0; i < report.size(); i++) {
                SalaryDTO s = report.get(i);
                Row row = sheet.createRow(i + 1);
                row.createCell(0).setCellValue(i + 1);
                row.createCell(1).setCellValue(s.getMemberName());
                row.createCell(2).setCellValue(s.getTotalTasks());
                row.createCell(3).setCellValue(s.getCompletedTasks());
                row.createCell(4).setCellValue(s.getRegularHours());
                row.createCell(5).setCellValue(s.getOvertimeHours());
                row.createCell(6).setCellValue(s.getHourlyRate());
                double salary = s.getEstimatedSalary();
                totalSalary += salary;
                row.createCell(7).setCellValue(salary);
            }
            Row totalRow = sheet.createRow(report.size() + 1);
            totalRow.createCell(0).setCellValue("");
            totalRow.createCell(1).setCellValue("TONG");
            totalRow.createCell(7).setCellValue(totalSalary);
            for (int i = 0; i < headers.length; i++) {
                sheet.autoSizeColumn(i);
            }
            wb.write(out);
            return out.toByteArray();
        }
    }

    public Map<String, Object> payoutSalary(UUID teamId, UUID actorId) {
        return payoutSalary(teamId, actorId, null, null);
    }

    public Map<String, Object> payoutSalary(UUID teamId, UUID actorId, Integer year, Integer month) {
        throw new RuntimeException("Bảng lương chỉ ở trạng thái nháp (DRAFT) và không hỗ trợ giải ngân tự động.");
    }

    public void saveSalaryPayout(UUID teamId, UUID actorId, double totalAmount, Long payosOrderId, String checkoutUrl) {
        SalaryPayout sp = new SalaryPayout();
        Team team = goalRepo.findByTeamId(teamId).stream().findFirst().map(Goal::getTeam).orElse(null);
        if (team == null) {
            // Find team via member since goal might not exist
            team = teamMemberRepo.findByTeamId(teamId).stream().findFirst().map(TeamMember::getTeam).orElse(null);
        }
        User actor = userRepo.findById(actorId).orElse(null);
        if (team != null && actor != null) {
            sp.setTeam(team);
            sp.setUser(actor);
            sp.setTotalAmount(totalAmount);
            sp.setPayosOrderId(payosOrderId);
            sp.setPayosCheckoutUrl(checkoutUrl);
            sp.setStatus("PENDING");
            salaryPayoutRepo.save(sp);
        }
    }
}
