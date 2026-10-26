package org.example.backend.service;

import org.example.backend.entity.*;
import org.example.backend.repository.*;
import org.junit.jupiter.api.Test;
import java.time.*;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;

class AiReplanOperationalTest {
    ProductionPlanRepository plans = mock(ProductionPlanRepository.class);
    ProductionOrderRepository orders = mock(ProductionOrderRepository.class);
    DailyTargetRepository targets = mock(DailyTargetRepository.class);
    AiReplanService service = new AiReplanService(plans, orders, targets);
    ProductionOrder order = new ProductionOrder();
    ProductionPlan plan = new ProductionPlan();
    void setup() {
        order.setId(UUID.randomUUID()); order.setOutputTarget(100.0); order.setProductType("ARABICA");
        Team team = new Team(); team.setId(UUID.randomUUID()); order.setTeam(team);
        plan.setId(UUID.randomUUID()); plan.setOrder(order); plan.setDailyTargetKg(10.0);
        when(orders.findById(order.getId())).thenReturn(Optional.of(order));
        when(plans.findTopByOrderIdOrderByCreatedAtDesc(order.getId())).thenReturn(Optional.of(plan));
    }
    DailyTarget target(ProductionOrder owner) {
        DailyTarget t = new DailyTarget(); t.setId(UUID.randomUUID()); t.setOrder(owner); t.setPlan(plan);
        t.setTargetDate(LocalDate.now().plusDays(1)); return t;
    }
    @Test void analysisRoundTripsDateBasedRevisionsIntoCurrentTargets() throws Exception {
        setup(); DailyTarget t = target(order);
        when(targets.findByOrderIdOrderByTargetDateAsc(order.getId())).thenReturn(List.of(t));
        when(targets.findById(t.getId())).thenReturn(Optional.of(t));
        var dto = service.analyzeReplan(order.getId());
        var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        List<Map<String,Object>> revised = mapper.convertValue(dto.getRevisedDays(), new com.fasterxml.jackson.core.type.TypeReference<>() {});
        service.applyReplan(order.getId(), revised);
        assertEquals(dto.getRevisedDays().getFirst().getRevisedTargetKg(), t.getTargetQuantityKg());
        verify(targets).save(t);
    }
    @Test void recommendationsUseOrderYieldMatchingKgStockAndOpenShifts() {
        setup(); order.setExpectedYield(0.8);
        var inventory = mock(InventoryRepository.class);
        var attendance = mock(AttendanceRepository.class);
        org.springframework.test.util.ReflectionTestUtils.setField(service, "inventoryRepo", inventory);
        org.springframework.test.util.ReflectionTestUtils.setField(service, "attendanceRepo", attendance);
        InventoryItem wrong = new InventoryItem(); wrong.setProductType("ROBUSTA"); wrong.setQuantity(1000.0);
        when(inventory.findByTeamIdOrderByProductTypeAscProductStateAsc(order.getTeam().getId())).thenReturn(List.of(wrong));
        when(attendance.findByTeamIdAndDateBetween(any(), any(), any())).thenReturn(List.of());
        var dto = service.analyzeReplan(order.getId());
        String recommendations = String.join(" ", dto.getRecommendations());
        assertTrue(recommendations.contains("125.0 kg"));
        assertFalse(recommendations.contains("đủ đáp ứng"));
        verify(attendance).findByTeamIdAndDateBetween(any(), any(), any());
    }
    @Test void applyRejectsInvalidQuantitiesAndHistoricalTargetsWithoutWrites() {
        setup(); DailyTarget t = target(order);
        when(targets.findById(t.getId())).thenReturn(Optional.of(t));
        for (double invalid : new double[]{-1, Double.NaN, Double.POSITIVE_INFINITY}) {
            assertThrows(IllegalArgumentException.class, () -> service.applyReplan(order.getId(),
                    List.of(Map.of("targetId", t.getId().toString(), "targetQuantityKg", invalid))));
        }
        t.setTargetDate(LocalDate.now().minusDays(1));
        assertThrows(IllegalArgumentException.class, () -> service.applyReplan(order.getId(),
                List.of(Map.of("targetId", t.getId().toString(), "targetQuantityKg", 10.0))));
        verify(targets, never()).save(any());
    }
    @Test void missedPastTargetsFlagUnderperformanceAndAllowReplanningUnstartedToday() {
        setup(); DailyTarget missed = target(order); missed.setTargetDate(LocalDate.now().minusDays(1));
        DailyTarget today = target(order); today.setTargetDate(LocalDate.now());
        when(targets.findByOrderIdOrderByTargetDateAsc(order.getId())).thenReturn(List.of(missed, today));
        when(targets.findById(today.getId())).thenReturn(Optional.of(today));
        var dto = service.analyzeReplan(order.getId());
        assertTrue(dto.isNeedsReplan());
        service.applyReplan(order.getId(), List.of(Map.of("date", today.getTargetDate().toString(), "revisedTargetKg", 12.0)));
        assertEquals(12.0, today.getTargetQuantityKg());
    }
    @Test void applyRejectsForeignOrderTargetBeforeAnyWrite() {
        setup(); DailyTarget foreign = target(new ProductionOrder());
        when(targets.findById(foreign.getId())).thenReturn(Optional.of(foreign));
        assertThrows(IllegalArgumentException.class, () -> service.applyReplan(order.getId(),
                List.of(Map.of("targetId", foreign.getId().toString(), "targetQuantityKg", 10.0))));
        verify(targets, never()).save(any()); verify(orders, never()).save(any());
    }
}
