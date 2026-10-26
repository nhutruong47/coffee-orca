package org.example.backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "attendance_corrections")
@Getter
@Setter
public class AttendanceCorrection {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "attendance_id", nullable = false)
    private Attendance attendance;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "actor_id", nullable = false)
    private User actor;
    private LocalDateTime oldCheckInTime;
    private LocalDateTime oldCheckOutTime;
    private LocalDateTime newCheckInTime;
    private LocalDateTime newCheckOutTime;
    @Column(nullable = false, length = 500)
    private String reason;
    @Column(nullable = false)
    private LocalDateTime createdAt;
}
