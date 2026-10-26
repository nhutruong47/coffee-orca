package org.example.backend.controller;

import jakarta.validation.Valid;
import org.example.backend.dto.AttendanceDTO;
import org.example.backend.dto.AttendanceEvidenceRequest;
import org.example.backend.dto.UpdateAttendanceRequest;
import org.example.backend.entity.Attendance;
import org.example.backend.entity.User;
import org.example.backend.service.AccessControlService;
import org.example.backend.service.AttendanceService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/attendance")
public class AttendanceController {
    private final AttendanceService attendanceService;
    private final AccessControlService accessControlService;

    public AttendanceController(AttendanceService attendanceService, AccessControlService accessControlService) {
        this.attendanceService = attendanceService;
        this.accessControlService = accessControlService;
    }

    @PostMapping("/check-in/{teamId}")
    public ResponseEntity<?> checkIn(@PathVariable UUID teamId, @AuthenticationPrincipal User currentUser,
                                    @Valid @RequestBody(required = false) AttendanceEvidenceRequest body) {
        accessControlService.requireTeamMember(currentUser, teamId);
        return ResponseEntity.ok(attendanceService.checkIn(currentUser.getId(), teamId, body));
    }

    @PostMapping("/check-out/{teamId}")
    public ResponseEntity<?> checkOut(@PathVariable UUID teamId, @AuthenticationPrincipal User currentUser,
                                     @Valid @RequestBody(required = false) AttendanceEvidenceRequest body) {
        accessControlService.requireTeamMember(currentUser, teamId);
        return ResponseEntity.ok(attendanceService.checkOut(currentUser.getId(), teamId, body));
    }

    @GetMapping("/today/{teamId}")
    public ResponseEntity<?> getTodayAttendance(@PathVariable UUID teamId, @AuthenticationPrincipal User currentUser) {
        accessControlService.requireTeamMember(currentUser, teamId);
        AttendanceDTO dto = attendanceService.getTodayAttendance(currentUser.getId(), teamId);
        return dto == null ? ResponseEntity.noContent().build() : ResponseEntity.ok(dto);
    }

    @GetMapping("/history/{teamId}")
    public ResponseEntity<?> getAttendanceHistory(@PathVariable UUID teamId, @AuthenticationPrincipal User currentUser) {
        accessControlService.requireTeamMember(currentUser, teamId);
        return ResponseEntity.ok(attendanceService.getAttendanceHistory(currentUser.getId(), teamId));
    }

    @GetMapping("/team-today/{teamId}")
    public ResponseEntity<?> getTeamAttendanceToday(@PathVariable UUID teamId, @AuthenticationPrincipal User currentUser) {
        accessControlService.requireTeamAdmin(currentUser, teamId);
        return ResponseEntity.ok(attendanceService.getTeamAttendanceToday(teamId));
    }

    @GetMapping({"/team/{teamId}", "/team-daily/{teamId}"})
    public ResponseEntity<?> getTeamAttendanceByDate(@PathVariable UUID teamId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @AuthenticationPrincipal User currentUser) {
        accessControlService.requireTeamAdmin(currentUser, teamId);
        return ResponseEntity.ok(attendanceService.getTeamAttendanceByDate(teamId, date));
    }

    @GetMapping("/settings/{teamId}")
    public ResponseEntity<?> getSettings(@PathVariable UUID teamId, @AuthenticationPrincipal User currentUser) {
        accessControlService.requireTeamMember(currentUser, teamId);
        return ResponseEntity.ok(attendanceService.getSettings(teamId));
    }

    @PutMapping("/settings/{teamId}")
    public ResponseEntity<?> updateSettings(@PathVariable UUID teamId, @RequestBody Map<String, Object> body,
                                           @AuthenticationPrincipal User currentUser) {
        accessControlService.requireTeamAdmin(currentUser, teamId);
        return ResponseEntity.ok(attendanceService.updateSettings(teamId, body));
    }

    @GetMapping({"/{attendanceId}/corrections", "/corrections/{attendanceId}"})
    public ResponseEntity<?> getCorrections(@PathVariable UUID attendanceId, @AuthenticationPrincipal User currentUser) {
        accessControlService.requireAttendanceAccess(currentUser, attendanceId);
        return ResponseEntity.ok(attendanceService.getCorrections(attendanceId));
    }

    @GetMapping("/team-history/{teamId}")
    public ResponseEntity<?> getTeamAttendanceHistory(@PathVariable UUID teamId, @AuthenticationPrincipal User currentUser) {
        accessControlService.requireTeamAdmin(currentUser, teamId);
        return ResponseEntity.ok(attendanceService.getTeamAttendanceHistory(teamId));
    }

    @PutMapping("/update/{attendanceId}")
    public ResponseEntity<?> updateAttendance(@PathVariable UUID attendanceId, @AuthenticationPrincipal User currentUser,
                                             @RequestBody UpdateAttendanceRequest req) {
        accessControlService.requireTeamAdmin(currentUser, attendanceService.attendanceTeamId(attendanceId));
        return ResponseEntity.ok(attendanceService.updateAttendance(attendanceId, req, currentUser));
    }

    @GetMapping("/{attendanceId}/photo")
    public ResponseEntity<byte[]> getPhoto(@PathVariable UUID attendanceId,
            @RequestParam(defaultValue = "check-in") String event, @AuthenticationPrincipal User currentUser) {
        accessControlService.requireAttendanceAccess(currentUser, attendanceId);
        if (!event.equals("check-in") && !event.equals("check-out")) throw new IllegalArgumentException("Loại ảnh không hợp lệ.");
        var photo = attendanceService.getPhoto(attendanceId, event.equals("check-out"));
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .contentType(MediaType.parseMediaType(photo.contentType())).body(photo.bytes());
    }

    @GetMapping("/stages")
    public ResponseEntity<?> getProductionStages() { return ResponseEntity.ok(Attendance.ProductionStage.values()); }

    @GetMapping("/shifts")
    public ResponseEntity<?> getShiftTypes() { return ResponseEntity.ok(Attendance.ShiftType.values()); }
}
