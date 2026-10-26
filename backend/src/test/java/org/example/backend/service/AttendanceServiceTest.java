package org.example.backend.service;

import org.example.backend.dto.AttendanceDTO;
import org.example.backend.entity.Attendance;
import org.example.backend.entity.Team;
import org.example.backend.entity.User;
import org.example.backend.repository.AttendanceRepository;
import org.example.backend.repository.ProductionOrderRepository;
import org.example.backend.repository.TeamRepository;
import org.example.backend.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AttendanceServiceTest {
    @Mock AttendanceRepository attendanceRepo;
    @Mock UserRepository userRepo;
    @Mock TeamRepository teamRepo;
    @Mock ProductionOrderRepository orderRepo;
    @Mock org.example.backend.repository.AttendanceSettingsRepository settingsRepo;
    @Mock org.example.backend.repository.TeamMemberRepository memberRepo;
    @Mock org.example.backend.repository.AttendanceCorrectionRepository correctionRepo;
    @org.mockito.Spy AttendanceEvidenceService evidenceService = new AttendanceEvidenceService();
    @InjectMocks AttendanceService service;

    private UUID userId;
    private UUID teamId;

    @BeforeEach
    void setUp() {
        userId = UUID.randomUUID();
        teamId = UUID.randomUUID();
    }

    @Test
    void aQuickCheckoutMustNotCreateAnInventedHour() {
        Attendance row = new Attendance();
        row.setId(UUID.randomUUID());
        User user = new User(); user.setId(userId);
        Team team = new Team(); team.setId(teamId);
        row.setUser(user); row.setTeam(team);
        row.setDate(java.time.LocalDate.now(AttendanceService.WORKSHOP_ZONE));
        row.setCheckInTime(java.time.LocalDateTime.now(AttendanceService.WORKSHOP_ZONE).minusSeconds(10));
        when(memberRepo.lockByTeamAndUser(teamId, userId)).thenReturn(Optional.of(new org.example.backend.entity.TeamMember()));
        row.setBreakMinutes(30);
        when(attendanceRepo.findFirstByUserIdAndTeamIdAndCheckOutTimeIsNullOrderByCheckInTimeDesc(userId, teamId))
                .thenReturn(Optional.of(row));
        when(attendanceRepo.save(any(Attendance.class))).thenAnswer(invocation -> invocation.getArgument(0));
        AttendanceDTO result = service.checkOut(userId, teamId);
        assertThat(result.getRegularHours()).isZero();
        assertThat(result.getActualWorkHours()).isZero();
    }

    @Test
    void defaultSettingsMustNotInventAWorkshopLocation() {
        assertThat(service.getSettings(teamId).get("workshopLat")).isNull();
        assertThat(service.getSettings(teamId).get("workshopLng")).isNull();
        assertThat(service.getSettings(teamId).get("workshopAddress")).isNull();
    }

    @Test
    void missingGpsMustRemainUnverifiedAndMustNotInventCoordinatesOrAddress() {
        User user = new User();
        user.setId(userId);
        user.setUsername("worker");
        Team team = new Team();
        team.setId(teamId);
        team.setName("Xưởng chưa cấu hình địa điểm");
        when(memberRepo.lockByTeamAndUser(teamId, userId)).thenReturn(Optional.of(new org.example.backend.entity.TeamMember()));
        when(userRepo.findById(userId)).thenReturn(Optional.of(user));
        when(teamRepo.findById(teamId)).thenReturn(Optional.of(team));
        when(attendanceRepo.save(any(Attendance.class))).thenAnswer(invocation -> {
            Attendance row = invocation.getArgument(0);
            row.setId(UUID.randomUUID());
            return row;
        });

        AttendanceDTO result = service.checkIn(userId, teamId, Attendance.ShiftType.NGAY,
                Attendance.ProductionStage.RANG, null, null);

        assertThat(result.getLatitude()).isNull();
        assertThat(result.getLongitude()).isNull();
        assertThat(result.getCheckInAddress()).isNull();
        assertThat(result.getDistanceMeters()).isNull();
        assertThat(result.getLocationVerified()).isNull();
    }
}
