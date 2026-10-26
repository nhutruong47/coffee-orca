package org.example.backend.service;

import org.example.backend.entity.Attendance;
import org.example.backend.entity.Team;
import org.example.backend.entity.User;
import org.example.backend.repository.*;
import org.junit.jupiter.api.Test;
import java.util.List;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class ProductionBoardServiceTest {
    @Test
    void openShiftsDoNotProduceInventedWorkerHours() {
        AttendanceRepository repo = mock(AttendanceRepository.class);
        ProductionBoardService board = new ProductionBoardService(mock(DailyTargetRepository.class),
                mock(ProductionOrderRepository.class), repo, mock(ProductionPlanRepository.class));
        UUID teamId = UUID.randomUUID();
        User employee = new User(); employee.setId(UUID.randomUUID()); employee.setUsername("worker");
        Team team = new Team(); team.setId(teamId);
        Attendance row = new Attendance(); row.setId(UUID.randomUUID()); row.setUser(employee); row.setTeam(team);
        row.setStage(Attendance.ProductionStage.RANG);
        when(repo.findByTeamIdAndDate(eq(teamId), any())).thenReturn(List.of(row));
        var result = board.getWorkforceToday(teamId);
        assertThat(((Number) result.get("totalWorkHours")).doubleValue()).isZero();
        assertThat((java.util.Map<String, Double>) result.get("stageHours")).containsEntry("RANG", 0.0);
    }
}
