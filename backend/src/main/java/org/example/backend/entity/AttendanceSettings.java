package org.example.backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import java.util.UUID;

@Entity
@Table(name = "attendance_settings", uniqueConstraints = @UniqueConstraint(columnNames = "team_id"))
@Getter
@Setter
public class AttendanceSettings {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "team_id", nullable = false)
    private Team team;
    private String workStartTime = "08:00";
    private String workEndTime = "17:00";
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
}
