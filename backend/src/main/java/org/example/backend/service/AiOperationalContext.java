package org.example.backend.service;

import org.example.backend.entity.Attendance;
import org.example.backend.repository.AttendanceRepository;
import java.time.*;
import java.util.*;

/** Operational facts shared by AI previews and deterministic replanning. */
final class AiOperationalContext {
    private AiOperationalContext() {}

    static List<Attendance> available(AttendanceRepository repository, UUID teamId, LocalDateTime now) {
        return repository.findByTeamIdAndDateBetween(teamId, now.toLocalDate().minusDays(1), now.toLocalDate())
                .stream().filter(a -> isAvailable(a, now)).toList();
    }

    static boolean isAvailable(Attendance a, LocalDateTime now) {
        if (a.getCheckInTime() == null || a.getCheckInTime().isAfter(now)
                || a.getCheckOutTime() != null || a.getAttendanceStatus() == Attendance.AttendanceStatus.ABSENT
                || a.getAttendanceStatus() == Attendance.AttendanceStatus.MISSING_CHECKOUT || a.getDate() == null) return false;
        LocalTime start;
        LocalTime end;
        try {
            start = LocalTime.parse(a.getShiftStartTime());
            end = LocalTime.parse(a.getShiftEndTime());
        } catch (RuntimeException invalidShift) {
            // Without a known shift window, an unclosed historical row is not proof of availability.
            return false;
        }
        LocalDateTime starts = a.getDate().atTime(start);
        LocalDateTime ends = a.getDate().atTime(end);
        if (!end.isAfter(start)) ends = ends.plusDays(1);
        return !now.isBefore(starts) && now.isBefore(ends);
    }
}
