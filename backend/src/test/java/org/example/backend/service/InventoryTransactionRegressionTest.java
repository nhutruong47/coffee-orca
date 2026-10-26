package org.example.backend.service;

import org.example.backend.entity.*;
import org.example.backend.repository.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

@DataJpaTest(properties = {"spring.datasource.url=jdbc:h2:mem:inventory-regression;DB_CLOSE_DELAY=-1", "spring.jpa.hibernate.ddl-auto=create-drop", "spring.flyway.enabled=false"})
@Import(InventoryService.class)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class InventoryTransactionRegressionTest {
    @Autowired InventoryService service;
    @Autowired InventoryRepository inventory;
    @Autowired TeamRepository teams;
    @Autowired UserRepository users;
    @Autowired PlatformTransactionManager transactionManager;
    UUID teamId;

    @BeforeEach void seed() {
        User user = new User();
        user.setUsername("inventory-" + UUID.randomUUID());
        user.setPassword("test-only");
        users.saveAndFlush(user);
        Team team = new Team();
        team.setName("Inventory test");
        team.setOwner(user);
        teams.saveAndFlush(team);
        teamId = team.getId();
        stock("PACKAGED", 10);
    }

    private void stock(String state, double amount) {
        InventoryItem item = new InventoryItem();
        item.setTeam(teams.findById(teamId).orElseThrow());
        item.setProductType("Robusta");
        item.setProductState(state);
        item.setQuantity(amount);
        inventory.saveAndFlush(item);
    }

    private double quantity(String state) {
        return inventory.findByTeamIdAndProductTypeAndProductState(teamId, "Robusta", state).orElseThrow().getQuantity();
    }

    @Test void insufficientSourceDoesNotCreateOutput() {
        stock("GREEN", 1);
        assertThrows(IllegalStateException.class, () -> service.transferStock(teamId, "Robusta", "GREEN", "ROASTED", 85));
        assertEquals(1, quantity("GREEN"));
        assertTrue(inventory.findByTeamIdAndProductTypeAndProductState(teamId, "Robusta", "ROASTED").isEmpty());
    }

    @Test void missingPackagedStockIsNotSuccessfulDelivery() {
        assertThrows(IllegalStateException.class, () -> service.deductPackagedStock(teamId, "Arabica", 3));
    }

    @Test void outerRollbackAlsoRollsBackInventoryDeduction() {
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        assertThrows(IllegalStateException.class, () -> tx.executeWithoutResult(status -> {
            service.deductPackagedStock(teamId, "Robusta", 3);
            throw new IllegalStateException("order persistence failed");
        }));
        assertEquals(10, quantity("PACKAGED"));
    }
}
