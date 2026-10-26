package org.example.backend.service;

import org.example.backend.entity.Attendance;
import org.junit.jupiter.api.Test;
import java.time.*;
import static org.junit.jupiter.api.Assertions.*;

class AiOperationalContextTest {
    private final LocalDateTime now = LocalDateTime.of(2026, 10, 26, 2, 0);
    private Attendance overnight() {
        Attendance a = new Attendance();
        a.setDate(now.toLocalDate().minusDays(1));
        a.setCheckInTime(now.minusHours(4));
        a.setShiftStartTime("22:00"); a.setShiftEndTime("06:00");
        return a;
    }
    @Test void openOvernightShiftIsAvailable() {
        assertTrue(AiOperationalContext.isAvailable(overnight(), now));
    }
    @Test void closedAbsentUnstartedAndStaleShiftsAreUnavailable() {
        Attendance a = overnight(); a.setCheckOutTime(now.minusMinutes(1));
        assertFalse(AiOperationalContext.isAvailable(a, now));
        a = overnight(); a.setAttendanceStatus(Attendance.AttendanceStatus.ABSENT);
        assertFalse(AiOperationalContext.isAvailable(a, now));
        a = overnight(); a.setCheckInTime(null);
        assertFalse(AiOperationalContext.isAvailable(a, now));
        assertFalse(AiOperationalContext.isAvailable(overnight(), now.plusHours(5)));
    }
}
