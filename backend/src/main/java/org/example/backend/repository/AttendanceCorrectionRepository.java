package org.example.backend.repository;

import org.example.backend.entity.AttendanceCorrection;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface AttendanceCorrectionRepository extends JpaRepository<AttendanceCorrection, UUID> {
    List<AttendanceCorrection> findByAttendanceIdOrderByCreatedAtDesc(UUID attendanceId);
}
