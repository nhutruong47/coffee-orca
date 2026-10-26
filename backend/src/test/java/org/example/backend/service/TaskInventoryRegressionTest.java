package org.example.backend.service;

import org.example.backend.entity.*;
import org.example.backend.repository.*;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class TaskInventoryRegressionTest {
    InventoryRepository inventory = mock(InventoryRepository.class);
    TaskService service = new TaskService(mock(TaskRepository.class),mock(GoalRepository.class),mock(UserRepository.class),mock(TaskChecklistRepository.class),mock(NotificationService.class),mock(TeamMemberRepository.class),mock(AttendanceRepository.class),mock(TaskTransferRepository.class),mock(TaskDependencyRepository.class),inventory,mock(SalaryPayoutRepository.class));
    Task task = new Task();
    Team team = new Team();
    InventoryItem roasted = new InventoryItem();
    TaskInventoryRegressionTest() {
        team.setId(UUID.randomUUID()); Goal goal = new Goal(); goal.setTeam(team); goal.setTitle("Robusta"); task.setGoal(goal);
        task.setTitle("Xay Robusta"); task.setProductionStage("XAY"); task.setOutputTarget(5.0); task.setStatus("COMPLETED");
        roasted.setProductType("Robusta"); roasted.setProductState("ROASTED"); roasted.setQuantity(10.0);
        when(inventory.findByTeamIdOrderByProductTypeAscProductStateAsc(team.getId())).thenReturn(List.of(roasted));
    }
    @Test void grindingCreatesGroundStock() {
        ReflectionTestUtils.invokeMethod(service,"handleInventoryDeduction",task,"PENDING");
        verify(inventory).save(argThat(i -> "GROUND".equals(i.getProductState()) && i.getQuantity() == 5.0));
        assertEquals(5.0,roasted.getQuantity());
    }
    @Test void packagingUsesGroundStockWhenPresentAndReopenRevertsBothSides() {
        InventoryItem ground = new InventoryItem(); ground.setProductType("Robusta"); ground.setProductState("GROUND"); ground.setQuantity(5.0);
        InventoryItem packaged = new InventoryItem(); packaged.setProductType("Robusta"); packaged.setProductState("PACKAGED"); packaged.setQuantity(1.0);
        when(inventory.findByTeamIdOrderByProductTypeAscProductStateAsc(team.getId())).thenReturn(List.of(ground, packaged));
        task.setTitle("Đóng gói Robusta"); task.setProductionStage("DONG_GOI");
        ReflectionTestUtils.invokeMethod(service,"handleInventoryDeduction",task,"PENDING");
        assertEquals(0.0,ground.getQuantity()); assertEquals(6.0,packaged.getQuantity());
        task.setStatus("IN_PROGRESS");
        ReflectionTestUtils.invokeMethod(service,"handleInventoryDeduction",task,"COMPLETED");
        assertEquals(5.0,ground.getQuantity()); assertEquals(1.0,packaged.getQuantity());
    }
    @Test void insufficientSourceThrowsInsteadOfClampingToZero() {
        roasted.setQuantity(2.0);
        assertThrows(IllegalStateException.class, () -> ReflectionTestUtils.invokeMethod(service,"handleInventoryDeduction",task,"PENDING"));
    }
    @Test void nonProductionTaskDoesNotConsumeCoffee() {
        task.setTitle("Clean room"); task.setProductionStage(null);
        ReflectionTestUtils.invokeMethod(service,"handleInventoryDeduction",task,"PENDING");
        verify(inventory,never()).save(any());
    }
}
