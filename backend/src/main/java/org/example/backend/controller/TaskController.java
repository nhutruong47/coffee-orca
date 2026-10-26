package org.example.backend.controller;

import org.example.backend.dto.TaskDTO;
import org.example.backend.entity.User;
import org.example.backend.service.AccessControlService;
import org.example.backend.service.TaskService;
import org.example.backend.service.PayosPaymentService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import jakarta.validation.Valid;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/tasks")
public class TaskController {

    private final TaskService taskService;
    private final AccessControlService accessControlService;
    private final PayosPaymentService payosPaymentService;

    public TaskController(TaskService taskService, AccessControlService accessControlService, PayosPaymentService payosPaymentService) {
        this.taskService = taskService;
        this.accessControlService = accessControlService;
        this.payosPaymentService = payosPaymentService;
    }

    /**
     * Returns tasks visible to the current user.
     * - ADMIN: all tasks in the system.
     * - Regular user: tasks belonging to the teams they are a member of.
     */
    @GetMapping
    public ResponseEntity<List<TaskDTO>> getAll(@AuthenticationPrincipal User user) {
        if (user == null || user.getId() == null) {
            return ResponseEntity.status(401).build();
        }
        return ResponseEntity.ok(taskService.getAllVisibleTo(user));
    }

    @GetMapping("/by-goal/{goalId}")
    public ResponseEntity<?> getByGoal(@PathVariable UUID goalId, @AuthenticationPrincipal User user) {
        accessControlService.requireGoalAccess(user, goalId);
        return ResponseEntity.ok(taskService.getByGoal(goalId));
    }

    @GetMapping("/my-tasks")
    public ResponseEntity<List<TaskDTO>> getMyTasks(@AuthenticationPrincipal User user) {
        return ResponseEntity.ok(taskService.getByMember(user.getId()));
    }

    @GetMapping("/my-kpi")
    public ResponseEntity<?> getMyKpi(@AuthenticationPrincipal User user) {
        return ResponseEntity.ok(taskService.getMemberKpi(user.getId()));
    }

    @GetMapping("/member/{memberId}")
    public ResponseEntity<?> getByMember(@PathVariable UUID memberId, @AuthenticationPrincipal User user) {
        return ResponseEntity.ok(taskService.getByMember(memberId));
    }

    @GetMapping("/member/{memberId}/kpi")
    public ResponseEntity<?> getMemberKpi(@PathVariable UUID memberId, @AuthenticationPrincipal User user) {
        return ResponseEntity.ok(taskService.getMemberKpi(memberId));
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getTaskDetail(@PathVariable UUID id, @AuthenticationPrincipal User user) {
        accessControlService.requireTaskAccess(user, id);
        return ResponseEntity.ok(taskService.getById(id));
    }

    @PostMapping
    public ResponseEntity<?> create(@Valid @RequestBody TaskDTO dto, @AuthenticationPrincipal User user) {
        if (dto != null && dto.getGoalId() != null) {
            accessControlService.requireGoalAccess(user, UUID.fromString(dto.getGoalId()));
        }
        return ResponseEntity.ok(taskService.create(dto));
    }

    @PatchMapping("/{id}")
    public ResponseEntity<?> updateTask(@PathVariable UUID id, @RequestBody Map<String, Object> body, @AuthenticationPrincipal User user) {
        accessControlService.requireTaskModifierAccess(user, id);
        return ResponseEntity.ok(taskService.update(id, body, user));
    }

    @PatchMapping("/{id}/status")
    public ResponseEntity<?> updateStatus(@PathVariable UUID id, @RequestBody Map<String, String> body, @AuthenticationPrincipal User user) {
        accessControlService.requireTaskModifierAccess(user, id);
        return ResponseEntity.ok(taskService.updateStatus(id, body.get("status")));
    }

    @PatchMapping("/{id}/progress")
    public ResponseEntity<?> updateProgress(@PathVariable UUID id, @RequestBody Map<String, Integer> body, @AuthenticationPrincipal User user) {
        accessControlService.requireTaskModifierAccess(user, id);
        return ResponseEntity.ok(taskService.updateProgress(id, body.get("percentage")));
    }

    @PatchMapping("/{id}/workload")
    public ResponseEntity<?> updateWorkload(@PathVariable UUID id, @RequestBody Map<String, Double> body, @AuthenticationPrincipal User user) {
        accessControlService.requireTaskModifierAccess(user, id);
        return ResponseEntity.ok(taskService.updateWorkload(id, body.get("actualWorkload")));
    }

    @PatchMapping("/{id}/assign")
    public ResponseEntity<?> assign(@PathVariable UUID id, @RequestBody Map<String, String> body, @AuthenticationPrincipal User user) {
        accessControlService.requireTaskModifierAccess(user, id);
        String memberIdStr = body.get("memberId");
        UUID memberId = (memberIdStr == null || memberIdStr.isEmpty()) ? null : UUID.fromString(memberIdStr);
        return ResponseEntity.ok(taskService.assign(id, memberId));
    }

    @PatchMapping("/{id}/backup")
    public ResponseEntity<?> setBackup(@PathVariable UUID id, @RequestBody Map<String, String> body, @AuthenticationPrincipal User user) {
        accessControlService.requireTaskModifierAccess(user, id);
        String memberIdStr = body.get("memberId");
        UUID memberId = (memberIdStr == null || memberIdStr.isEmpty()) ? null : UUID.fromString(memberIdStr);
        return ResponseEntity.ok(taskService.setBackup(id, memberId));
    }

    @PatchMapping("/{id}/supervisor")
    public ResponseEntity<?> setSupervisor(@PathVariable UUID id, @RequestBody Map<String, String> body, @AuthenticationPrincipal User user) {
        accessControlService.requireTaskModifierAccess(user, id);
        return ResponseEntity.ok(taskService.setSupervisor(id, UUID.fromString(body.get("memberId"))));
    }

    @PatchMapping("/{id}/transfer")
    public ResponseEntity<?> transfer(@PathVariable UUID id, @RequestBody Map<String, Object> body, @AuthenticationPrincipal User user) {
        accessControlService.requireTaskModifierAccess(user, id);
        String toMemberId = body.get("toMemberId") != null ? body.get("toMemberId").toString() : null;
        String reason = body.get("reason") != null ? body.get("reason").toString() : null;
        String actorType = body.get("actorType") != null ? body.get("actorType").toString() : null;
        return ResponseEntity.ok(taskService.transferTask(id, UUID.fromString(toMemberId), reason, actorType, user));
    }

    @GetMapping("/{id}/transfers")
    public ResponseEntity<?> getTransfers(@PathVariable UUID id, @AuthenticationPrincipal User user) {
        accessControlService.requireTaskAccess(user, id);
        return ResponseEntity.ok(taskService.getTransfers(id));
    }

    @PostMapping("/{id}/dependencies")
    public ResponseEntity<?> addDependency(@PathVariable UUID id, @RequestBody Map<String, Object> body, @AuthenticationPrincipal User user) {
        accessControlService.requireTaskModifierAccess(user, id);
        String dependsOnTaskId = body.get("dependsOnTaskId") != null ? body.get("dependsOnTaskId").toString() : null;
        String type = body.get("dependencyType") != null ? body.get("dependencyType").toString() : "FINISH_TO_START";
        return ResponseEntity.ok(taskService.addDependency(id, UUID.fromString(dependsOnTaskId), type));
    }

    @GetMapping("/{id}/dependencies")
    public ResponseEntity<?> getDependencies(@PathVariable UUID id, @AuthenticationPrincipal User user) {
        accessControlService.requireTaskAccess(user, id);
        return ResponseEntity.ok(taskService.getDependencies(id));
    }

    @GetMapping({"/{id}/checklists", "/{id}/checklist"})
    public ResponseEntity<?> getChecklist(@PathVariable UUID id, @AuthenticationPrincipal User user) {
        accessControlService.requireTaskAccess(user, id);
        return ResponseEntity.ok(taskService.getChecklist(id));
    }

    @PostMapping({"/{id}/checklists", "/{id}/checklist"})
    public ResponseEntity<?> addChecklistItem(@PathVariable UUID id, @RequestBody Map<String, String> body, @AuthenticationPrincipal User user) {
        accessControlService.requireTaskModifierAccess(user, id);
        return ResponseEntity.ok(taskService.addChecklistItem(id, body.get("content")));
    }

    @PatchMapping({"/checklists/{checklistId}/toggle", "/checklist/{checklistId}/toggle"})
    public ResponseEntity<?> toggleChecklist(@PathVariable UUID checklistId, @AuthenticationPrincipal User user) {
        accessControlService.requireChecklistAccess(user, checklistId);
        taskService.toggleChecklistItem(checklistId);
        return ResponseEntity.ok(Map.of("message", "Toggled"));
    }



    @PatchMapping("/{id}/respond")
    public ResponseEntity<?> respondToTask(@PathVariable UUID id,
            @AuthenticationPrincipal User user,
            @RequestBody Map<String, Boolean> body) {
        boolean accepted = Boolean.TRUE.equals(body.get("accepted"));
        return ResponseEntity.ok(taskService.respondToTask(id, user.getId(), accepted));
    }

    @GetMapping("/salary/{teamId}")
    public ResponseEntity<?> getSalaryReport(@PathVariable UUID teamId,
                                             @RequestParam(required = false) Integer year,
                                             @RequestParam(required = false) Integer month,
                                             @AuthenticationPrincipal User user) {
        accessControlService.requireTeamAdmin(user, teamId);
        return ResponseEntity.ok(taskService.getSalaryReport(teamId, year, month));
    }

    @GetMapping("/salary/{teamId}/export-excel")
    public ResponseEntity<byte[]> exportSalaryExcel(@PathVariable UUID teamId,
                                                    @RequestParam(required = false) Integer year,
                                                    @RequestParam(required = false) Integer month,
                                                    @AuthenticationPrincipal User user) throws Exception {
        accessControlService.requireTeamAdmin(user, teamId);
        byte[] excelBytes = taskService.exportSalaryExcel(teamId, year, month);
        String period = year != null && month != null ? "-" + year + "-" + String.format("%02d", month) : "";
        String filename = "bang-luong-" + teamId + period + ".xlsx";
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
            .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
            .body(excelBytes);
    }

    @PostMapping("/salary/{teamId}/payout")
    public ResponseEntity<?> payoutSalary(@PathVariable UUID teamId,
            @RequestParam(required = false) Integer year,
            @RequestParam(required = false) Integer month,
            @AuthenticationPrincipal User user) {
        accessControlService.requireTeamAdmin(user, teamId);
        return ResponseEntity.ok(taskService.payoutSalary(teamId, user.getId(), year, month));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable UUID id, @AuthenticationPrincipal User user) {
        accessControlService.requireTaskModifierAccess(user, id);
        taskService.delete(id);
        return ResponseEntity.ok(Map.of("message", "Đã xóa task"));
    }
}
