package org.example.backend.service;

import org.example.backend.dto.TaskDTO;
import org.example.backend.entity.*;
import org.example.backend.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@Transactional
public class TaskServiceIntegrationTest {

    @Autowired private TaskService taskService;
    @Autowired private TaskRepository taskRepo;
    @Autowired private GoalRepository goalRepo;
    @Autowired private TeamRepository teamRepo;
    @Autowired private UserRepository userRepo;
    @Autowired private TeamMemberRepository teamMemberRepo;
    @Autowired private InventoryRepository inventoryRepo;
    @Autowired private InterGroupOrderRepository interGroupOrderRepo;

    private User owner;
    private User stranger;
    private Team team;
    private Goal goal;
    private Task task;

    @BeforeEach
    void setUp() {
        owner = new User();
        owner.setUsername("owner_" + UUID.randomUUID());
        owner.setPassword("pass");
        owner = userRepo.save(owner);

        stranger = new User();
        stranger.setUsername("stranger_" + UUID.randomUUID());
        stranger.setPassword("pass");
        stranger = userRepo.save(stranger);

        team = new Team();
        team.setName("Test Team");
        team.setOwner(owner);
        team = teamRepo.save(team);

        // Add owner to team members
        TeamMember tm = new TeamMember();
        tm.setTeam(team);
        tm.setUser(owner);
        teamMemberRepo.save(tm);

        goal = new Goal();
        goal.setTitle("Test Goal");
        goal.setTeam(team);
        goal.setOwner(owner);
        goal = goalRepo.save(goal);

        task = new Task();
        task.setTitle("Test Task");
        task.setGoal(goal);
        task = taskRepo.save(task);
    }

    @Test
    void assignTaskToNonMember_ShouldThrowException() {
        Exception exception = assertThrows(RuntimeException.class, () -> {
            taskService.assign(task.getId(), stranger.getId());
        });
        
        assertTrue(exception.getMessage().contains("Người dùng không thuộc xưởng này"));
    }

    @Test
    void assignTaskToMember_ShouldSucceed() {
        TaskDTO dto = taskService.assign(task.getId(), owner.getId());
        assertNotNull(dto);
        assertEquals(owner.getId().toString(), dto.getMemberId());
    }

    @Test
    void createTaskWithoutAssignee_ShouldAutoAssignAndSyncInventoryAndOrderOnCompletion() {
        InventoryItem green = new InventoryItem();
        green.setTeam(team);
        green.setProductType("Robusta");
        green.setProductState("GREEN");
        green.setQuantity(1000.0);
        green.setUnit("kg");
        green.setLowStockThreshold(100.0);
        inventoryRepo.save(green);

        InventoryItem roasted = new InventoryItem();
        roasted.setTeam(team);
        roasted.setProductType("Robusta");
        roasted.setProductState("ROASTED");
        roasted.setQuantity(0.0);
        roasted.setUnit("kg");
        inventoryRepo.save(roasted);

        Goal autoGoal = new Goal();
        autoGoal.setTitle("[Đơn Hàng] Gia công Robusta");
        autoGoal.setTeam(team);
        autoGoal.setOwner(owner);
        autoGoal = goalRepo.save(autoGoal);

        InterGroupOrder linkedOrder = new InterGroupOrder();
        linkedOrder.setTitle("Gia công Robusta");
        linkedOrder.setQuantity(85);
        linkedOrder.setSellerTeam(team);
        linkedOrder.setBuyerTeam(team);
        linkedOrder.setStatus("CONFIRMED");
        linkedOrder.setLinkedGoalId(autoGoal.getId());
        linkedOrder = interGroupOrderRepo.save(linkedOrder);

        TaskDTO createDto = new TaskDTO();
        createDto.setGoalId(autoGoal.getId().toString());
        createDto.setTitle("[Rang Mẻ] Rang Robusta chuẩn Medium");
        createDto.setProductionStage("RANG");
        createDto.setOutputTarget(85.0);
        createDto.setWorkload(4.0);

        TaskDTO created = taskService.create(createDto);
        assertNotNull(created.getId());
        assertEquals(owner.getId().toString(), created.getMemberId(), "Should auto-assign to team member");

        taskService.updateProgress(UUID.fromString(created.getId()), 100);

        InventoryItem greenAfter = inventoryRepo.findByTeamIdAndProductTypeAndProductState(team.getId(), "Robusta", "GREEN").orElseThrow();
        InventoryItem roastedAfter = inventoryRepo.findByTeamIdAndProductTypeAndProductState(team.getId(), "Robusta", "ROASTED").orElseThrow();
        assertEquals(900.0, greenAfter.getQuantity(), 0.01, "85kg roasted output at 0.85 yield should deduct 100kg green beans");
        assertEquals(85.0, roastedAfter.getQuantity(), 0.01, "Roasted stock should increase by 85kg");

        InterGroupOrder orderAfter = interGroupOrderRepo.findById(linkedOrder.getId()).orElseThrow();
        assertEquals("COMPLETED", orderAfter.getStatus(), "Linked B2B order should auto-complete when all goal tasks finish");
    }
}
