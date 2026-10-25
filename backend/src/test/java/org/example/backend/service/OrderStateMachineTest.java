package org.example.backend.service;

import org.example.backend.entity.enums.OrderStatus;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Unit tests for the order status state machine.
 *
 * <p>Goals:
 * <ul>
 *   <li>Validate every legal transition in the happy-path flow.</li>
 *   <li>Reject every illegal shortcut (e.g. RFQ → DELIVERED, COMPLETED → CONFIRMED).</li>
 *   <li>Legacy aliases (PENDING, ACCEPTED) map to canonical statuses.</li>
 * </ul>
 */
class OrderStateMachineTest {

    private final OrderStateMachine machine = new OrderStateMachine();

    @Test
    void happyPathTransitionsAreAllowed() {
        OrderStatus[] flow = {
                OrderStatus.RFQ_CREATED,
                OrderStatus.QUOTED,
                OrderStatus.CONFIRMED,
                OrderStatus.IN_PRODUCTION,
                OrderStatus.QC,
                OrderStatus.COMPLETED,
                OrderStatus.SHIPPING,
                OrderStatus.DELIVERED,
                OrderStatus.REVIEWED
        };
        for (int i = 0; i < flow.length - 1; i++) {
            OrderStatus from = flow[i];
            OrderStatus to = flow[i + 1];
            assertTrue(machine.isAllowed(from, to),
                    "Expected transition allowed: " + from + " -> " + to);
        }
    }

    @Test
    void illegalShortcutIsRejected() {
        // Cannot skip from RFQ straight to DELIVERED
        assertFalse(machine.isAllowed(OrderStatus.RFQ_CREATED, OrderStatus.DELIVERED));
        // Cannot go backwards
        assertFalse(machine.isAllowed(OrderStatus.COMPLETED, OrderStatus.CONFIRMED));
        assertFalse(machine.isAllowed(OrderStatus.DELIVERED, OrderStatus.SHIPPING));
        // Terminal statuses have no successors
        assertFalse(machine.isAllowed(OrderStatus.CANCELED, OrderStatus.CONFIRMED));
        assertFalse(machine.isAllowed(OrderStatus.REJECTED, OrderStatus.CONFIRMED));
        assertFalse(machine.isAllowed(OrderStatus.REFUNDED, OrderStatus.CONFIRMED));
    }

    @Test
    void cancelAllowedOnlyBeforeShipping() {
        // CANCELED is legal up to COMPLETED (before SHIPPING)
        assertTrue(machine.isAllowed(OrderStatus.RFQ_CREATED, OrderStatus.CANCELED));
        assertTrue(machine.isAllowed(OrderStatus.CONFIRMED, OrderStatus.CANCELED));
        assertTrue(machine.isAllowed(OrderStatus.COMPLETED, OrderStatus.CANCELED));
        // Once SHIPPING started, must open DISPUTED instead
        assertFalse(machine.isAllowed(OrderStatus.SHIPPING, OrderStatus.CANCELED));
        assertFalse(machine.isAllowed(OrderStatus.DELIVERED, OrderStatus.CANCELED));
    }

    @Test
    void disputeFlowAfterDelivery() {
        // After DELIVERED/COMPLETED/REVIEWED, buyer can open DISPUTED
        assertTrue(machine.isAllowed(OrderStatus.DELIVERED, OrderStatus.DISPUTED));
        assertTrue(machine.isAllowed(OrderStatus.COMPLETED, OrderStatus.DISPUTED));
        assertTrue(machine.isAllowed(OrderStatus.REVIEWED, OrderStatus.DISPUTED));
        // DISPUTED -> RESOLVED or REFUNDED
        assertTrue(machine.isAllowed(OrderStatus.DISPUTED, OrderStatus.RESOLVED));
        assertTrue(machine.isAllowed(OrderStatus.DISPUTED, OrderStatus.REFUNDED));
    }

    @Test
    void requireTransitionThrowsOnIllegal() {
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> machine.requireTransition(OrderStatus.DELIVERED, OrderStatus.RFQ_CREATED));
        assertTrue(ex.getMessage().contains("DELIVERED"));
        assertTrue(ex.getMessage().contains("RFQ_CREATED"));
    }

    @Test
    void requireTransitionAcceptsLegal() {
        assertDoesNotThrow(() ->
                machine.requireTransition(OrderStatus.CONFIRMED, OrderStatus.IN_PRODUCTION));
    }

    @Test
    void requireTransitionRejectsNulls() {
        assertThrows(IllegalStateException.class,
                () -> machine.requireTransition(null, OrderStatus.CONFIRMED));
        assertThrows(IllegalStateException.class,
                () -> machine.requireTransition(OrderStatus.CONFIRMED, null));
    }

    @Test
    void terminalStatusesAreTerminal() {
        assertTrue(OrderStatus.CANCELED.isTerminal());
        assertFalse(OrderStatus.REJECTED.isTerminal()); // Can be revived by Re-quoting
        assertTrue(OrderStatus.REFUNDED.isTerminal());
        assertFalse(OrderStatus.CONFIRMED.isTerminal());
        assertFalse(OrderStatus.DISPUTED.isTerminal());
    }

    @Test
    void legacyAliasesMapToCanonical() {
        assertEquals(OrderStatus.RFQ_CREATED, OrderStatus.fromLegacy("PENDING"));
        assertEquals(OrderStatus.CONFIRMED, OrderStatus.fromLegacy("ACCEPTED"));
        assertEquals(OrderStatus.CONFIRMED, OrderStatus.valueOf("CONFIRMED"));
        // Unknown strings fall back to RFQ_CREATED (safe default for new orders)
        assertEquals(OrderStatus.RFQ_CREATED, OrderStatus.fromLegacy(""));
        assertEquals(OrderStatus.RFQ_CREATED, OrderStatus.fromLegacy(null));
    }

    @Test
    void vietnameseLabelPresentForAllStatuses() {
        for (OrderStatus s : OrderStatus.values()) {
            assertNotNull(s.getVietnameseLabel());
            assertFalse(s.getVietnameseLabel().isBlank(),
                    "Missing VI label for " + s);
        }
    }
}