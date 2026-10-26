package org.example.backend.repository;

import org.example.backend.entity.PayrollMemberRate;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PayrollMemberRateRepository extends JpaRepository<PayrollMemberRate, UUID> {
    Optional<PayrollMemberRate> findByTeamIdAndUserId(UUID teamId, UUID userId);
    List<PayrollMemberRate> findByTeamId(UUID teamId);
}
