package org.example.backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.UUID;

@Entity
@Table(name = "attendance_settings", uniqueConstraints = @UniqueConstraint(columnNames = "team_id"))
@Getter
@Setter
public class AttendanceSettings {
    private static final DateTimeFormatter HH_MM = DateTimeFormatter.ofPattern("HH:mm");

    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "team_id", nullable = false)
    private Team team;
    @Column(name = "work_start_time")
    private LocalTime workStartTime = LocalTime.of(8, 0);
    @Column(name = "work_end_time")
    private LocalTime workEndTime = LocalTime.of(17, 0);
    private Double standardHours = 8.0;
    private Integer breakMinutes = 60;
    private Double hourlyRateVnd = 50_000.0;
    private Double overtimeMultiplier = 1.5;
    @Column(length = 500)
    private String workshopAddress;
    private Double workshopLat;
    private Double workshopLng;
    private Integer allowedRadiusMeters = 200;
    private Boolean requireLocation = false;
    private Boolean requirePhoto = false;

    public String getWorkStartTime() {
        return workStartTime != null ? workStartTime.format(HH_MM) : "08:00";
    }

    public void setWorkStartTime(String value) {
        this.workStartTime = value != null && !value.isBlank() ? LocalTime.parse(value.trim()) : LocalTime.of(8, 0);
    }

    public String getWorkEndTime() {
        return workEndTime != null ? workEndTime.format(HH_MM) : "17:00";
    }

    public void setWorkEndTime(String value) {
        this.workEndTime = value != null && !value.isBlank() ? LocalTime.parse(value.trim()) : LocalTime.of(17, 0);
    }
}
