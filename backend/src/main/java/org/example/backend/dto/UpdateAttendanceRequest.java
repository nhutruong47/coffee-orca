package org.example.backend.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonSetter;
import org.example.backend.service.AttendanceService;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;

/** Time corrections never modify the original GPS or photo evidence. */
public class UpdateAttendanceRequest {
    private LocalDateTime checkInTime;
    private LocalDateTime checkOutTime;
    private String reason;

    public LocalDateTime getCheckInTime() { return checkInTime; }
    public LocalDateTime getCheckOutTime() { return checkOutTime; }
    public String getReason() { return reason; }
    @JsonIgnore
    public void setCheckInTime(LocalDateTime value) { checkInTime = value; }
    @JsonIgnore
    public void setCheckOutTime(LocalDateTime value) { checkOutTime = value; }
    public void setReason(String value) { reason = value; }

    @JsonSetter("checkInTime")
    public void readCheckInTime(String value) { checkInTime = parse(value); }
    @JsonSetter("checkOutTime")
    public void readCheckOutTime(String value) { checkOutTime = parse(value); }

    private LocalDateTime parse(String value) {
        if (value == null || value.isBlank()) return null;
        try { return OffsetDateTime.parse(value).atZoneSameInstant(AttendanceService.WORKSHOP_ZONE).toLocalDateTime(); }
        catch (DateTimeParseException ignored) { return LocalDateTime.parse(value); }
    }
}
