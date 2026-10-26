package org.example.backend.controller;

import org.example.backend.dto.AiParseResult;
import org.example.backend.entity.TeamMember;
import org.example.backend.repository.TeamMemberRepository;
import org.example.backend.service.AiServiceClient;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/ai")
public class AiController {

    private final AiServiceClient aiServiceClient;
    private final TeamMemberRepository teamMemberRepo;
    private final org.example.backend.service.AccessControlService accessControlService;

    public AiController(AiServiceClient aiServiceClient, TeamMemberRepository teamMemberRepo,
                        org.example.backend.service.AccessControlService accessControlService) {
        this.aiServiceClient = aiServiceClient;
        this.teamMemberRepo = teamMemberRepo;
        this.accessControlService = accessControlService;
    }

    /**
     * Frontend gọi trực tiếp để xem kết quả AI parse trước khi tạo Goal.
     * Giờ sẽ gửi kèm danh sách thành viên + nhãn dán để AI giao việc ngay.
     */
    @PostMapping("/parse")
    public ResponseEntity<AiParseResult> parseText(@RequestBody Map<String, String> payload) {

        String text = payload.getOrDefault("text", "");
        String teamIdStr = payload.get("teamId");
        if (text.isBlank()) {
            return ResponseEntity.badRequest().build();
        }

        UUID teamId;
        try { teamId = UUID.fromString(teamIdStr); }
        catch (RuntimeException invalid) { return ResponseEntity.badRequest().build(); }
        var authentication = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        var user = authentication != null && authentication.getPrincipal() instanceof org.example.backend.entity.User u ? u : null;
        accessControlService.requireTeamMember(user, teamId);

        // Build member context from team members' job labels
        String memberContext = "";
        if (teamId != null) {
            List<TeamMember> members = teamMemberRepo.findByTeamId(teamId);
            StringBuilder sb = new StringBuilder();
            for (TeamMember tm : members) {
                String name = tm.getUser().getUsername();
                List<String> labels = tm.getJobLabels();
                sb.append("- ").append(name);
                if (labels != null && !labels.isEmpty()) {
                    sb.append(" (Nhãn: ").append(String.join(", ", labels)).append(")");
                } else {
                    sb.append(" (Chưa gán nhãn)");
                }
                sb.append("\n");
            }
            memberContext = sb.toString();
        }
        String history = payload.get("history");
        AiParseResult result = aiServiceClient.parseTask(text, teamId, memberContext, history);
        return ResponseEntity.ok(result);
    }
}

