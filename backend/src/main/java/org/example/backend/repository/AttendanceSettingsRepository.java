package org.example.backend.repository;

import org.example.backend.entity.AttendanceSettings;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;

public interface AttendanceSettingsRepository extends JpaRepository<AttendanceSettings, UUID> {
    Optional<AttendanceSettings> findByTeamId(UUID teamId);
}
