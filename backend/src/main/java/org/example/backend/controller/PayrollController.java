package org.example.backend.controller;

import org.example.backend.entity.User;
import org.example.backend.service.AccessControlService;
import org.example.backend.service.PayrollMemberRateService;
import org.example.backend.service.PayrollService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.YearMonth;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/payroll")
public class PayrollController {
    private final AccessControlService accessControl;
    private final PayrollService payroll;
    private final PayrollMemberRateService rates;

    public PayrollController(AccessControlService accessControl, PayrollService payroll, PayrollMemberRateService rates) {
        this.accessControl = accessControl;
        this.payroll = payroll;
        this.rates = rates;
    }

    @PutMapping("/teams/{teamId}/members/{memberId}/rate")
    public ResponseEntity<?> updateMemberPayrollConfig(@PathVariable UUID teamId,
            @PathVariable UUID memberId,
            @RequestBody(required = false) Map<String, Object> body,
            @AuthenticationPrincipal User actor) {
        accessControl.requireTeamAdmin(actor, teamId);
        return ResponseEntity.ok(rates.updateMemberRate(teamId, memberId, body));
    }

    @GetMapping("/teams/{teamId}")
    public ResponseEntity<?> getPayrollReport(@PathVariable UUID teamId,
            @RequestParam(required = false) Integer year,
            @RequestParam(required = false) Integer month,
            @AuthenticationPrincipal User actor) {
        accessControl.requireTeamAdmin(actor, teamId);
        return ResponseEntity.ok(payroll.report(teamId, year, month));
    }

    @GetMapping({"/teams/{teamId}/export", "/teams/{teamId}/export-excel"})
    public ResponseEntity<byte[]> exportPayrollExcel(@PathVariable UUID teamId,
            @RequestParam(required = false) Integer year,
            @RequestParam(required = false) Integer month,
            @AuthenticationPrincipal User actor) {
        accessControl.requireTeamAdmin(actor, teamId);
        YearMonth period = payroll.resolvePeriod(year, month);
        String filename = String.format("bang-luong-%04d-%02d.xlsx", period.getYear(), period.getMonthValue());
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(payroll.exportExcel(teamId, period.getYear(), period.getMonthValue()));
    }
}
