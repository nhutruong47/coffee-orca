package org.example.backend.service;

import org.example.backend.entity.*;
import org.example.backend.repository.*;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.time.LocalDate;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ProductionPlanRegressionTest {
    ProductionPlanRepository plans = mock(ProductionPlanRepository.class);
    ProductionOrderRepository orders = mock(ProductionOrderRepository.class);
    DailyTargetRepository targets = mock(DailyTargetRepository.class);
    AttendanceRepository attendance = mock(AttendanceRepository.class);
    InventoryService inventory = mock(InventoryService.class);
    ProductionPlanService service = new ProductionPlanService(plans, orders, targets, attendance);
    Team team = new Team();
    ProductionOrder order = new ProductionOrder();
    DailyTarget target = new DailyTarget();

    ProductionPlanRegressionTest() {
        ReflectionTestUtils.setField(service, "inventoryService", inventory);
        team.setId(UUID.randomUUID());
        order.setId(UUID.randomUUID()); order.setTeam(team); order.setProductType("Robusta"); order.setOutputTarget(85.0);
        ProductionPlan plan = new ProductionPlan(); plan.setId(UUID.randomUUID()); target.setPlan(plan);
        target.setId(UUID.randomUUID()); target.setOrder(order); target.setTargetDate(LocalDate.now()); target.setTargetQuantityKg(85.0);
        when(targets.findById(target.getId())).thenReturn(Optional.of(target));
        when(targets.save(any())).thenAnswer(i -> i.getArgument(0));
        when(targets.findByOrderIdOrderByTargetDateAsc(order.getId())).thenReturn(List.of(target));
        when(orders.findById(order.getId())).thenReturn(Optional.of(order));
    }

    @Test void roastingIsNotFinishedProduct() {
        service.updateDailyActual(target.getId(),85.0,null,null,null,null,null,null);
        assertEquals(0.0, order.getCompletedQuantity());
        assertNotEquals("COMPLETED", order.getStatus());
    }

    @Test void decreasingRecordedProductionIsRejectedBeforeStockChanges() {
        target.setActualRoastKg(85.0);
        assertThrows(IllegalArgumentException.class, () -> service.updateDailyActual(target.getId(),80.0,null,null,null,null,null,null));
        verifyNoInteractions(inventory);
    }

    @Test void stockFailureAbortsActualUpdate() {
        doThrow(new IllegalStateException("insufficient stock")).when(inventory).transferStock(team.getId(), "Robusta", "GREEN", "ROASTED", 85);
        assertThrows(IllegalStateException.class, () -> service.updateDailyActual(target.getId(),85.0,null,null,null,null,null,null));
        verify(targets, never()).save(any());
        verify(orders, never()).save(any());
    }
}
