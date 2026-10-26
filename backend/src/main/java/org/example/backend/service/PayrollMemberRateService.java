package org.example.backend.service;

import org.example.backend.entity.PayrollMemberRate;
import org.example.backend.entity.TeamMember;
import org.example.backend.repository.PayrollMemberRateRepository;
import org.example.backend.repository.TeamMemberRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class PayrollMemberRateService {
    private static final double MIN_RATE_VND = 1000.0;
    private static final double MAX_RATE_VND = 10_000_000.0;

    private final PayrollMemberRateRepository rates;
    private final TeamMemberRepository members;

    public PayrollMemberRateService(PayrollMemberRateRepository rates, TeamMemberRepository members) {
        this.rates = rates;
        this.members = members;
    }

    @Transactional(readOnly = true)
    public double getHourlyRate(UUID teamId, UUID userId, double fallback) {
        if (teamId == null || userId == null) {
            return fallback;
        }
        return rates.findByTeamIdAndUserId(teamId, userId)
                .map(PayrollMemberRate::getHourlyRateVnd)
                .filter(rate -> rate != null && rate >= MIN_RATE_VND)
                .orElse(fallback);
    }

    @Transactional(readOnly = true)
    public Map<UUID, Double> ratesForTeam(UUID teamId) {
        return rates.findByTeamId(teamId).stream()
                .filter(r -> r.getUser() != null && r.getHourlyRateVnd() != null)
                .collect(Collectors.toMap(r -> r.getUser().getId(), PayrollMemberRate::getHourlyRateVnd, (a, b) -> b));
    }

    @Transactional
    public Map<String, Object> updateMemberRate(UUID teamId, UUID memberId, Map<String, Object> body) {
        TeamMember member = members.findByTeamIdAndUserId(teamId, memberId)
                .orElseThrow(() -> new RuntimeException("Thành viên không thuộc xưởng này."));
        double rate = parseRate(body == null ? null : body.get("hourlyRateVnd"));
        PayrollMemberRate row = rates.findByTeamIdAndUserId(teamId, memberId).orElseGet(() -> {
            PayrollMemberRate created = new PayrollMemberRate();
            created.setTeam(member.getTeam());
            created.setUser(member.getUser());
            return created;
        });
        row.setHourlyRateVnd(rate);
        PayrollMemberRate saved = rates.save(row);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("teamId", teamId.toString());
        result.put("memberId", memberId.toString());
        result.put("hourlyRateVnd", saved.getHourlyRateVnd());
        result.put("updatedAt", saved.getUpdatedAt() == null ? null : saved.getUpdatedAt().toString());
        return result;
    }

    private static double parseRate(Object raw) {
        if (raw == null) {
            throw new RuntimeException("Đơn giá giờ công là bắt buộc.");
        }
        double value;
        try {
            value = raw instanceof Number n ? n.doubleValue() : Double.parseDouble(raw.toString().trim());
        } catch (NumberFormatException ex) {
            throw new RuntimeException("Đơn giá giờ công không hợp lệ.");
        }
        if (!Double.isFinite(value) || value < MIN_RATE_VND || value > MAX_RATE_VND) {
            throw new RuntimeException("Đơn giá giờ công phải nằm trong khoảng 1.000 đến 10.000.000 VNĐ.");
        }
        return (double) Math.round(value);
    }
}
