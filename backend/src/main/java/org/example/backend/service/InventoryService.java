package org.example.backend.service;

import org.example.backend.dto.InventoryItemDTO;
import org.example.backend.entity.InventoryItem;
import org.example.backend.entity.Team;
import org.example.backend.repository.InventoryRepository;
import org.example.backend.repository.TeamRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.text.Normalizer;
import java.util.stream.Collectors;

@Service
public class InventoryService {

    private static final Logger log = LoggerFactory.getLogger(InventoryService.class);

    /**
     * Maximum retries for optimistic-lock conflicts on inventory mutations.
     * Each retry re-reads the row so the conflict is resolved at the cost of
     * one extra round-trip. Set deliberately low to avoid masking real
     * contention issues; an exception after this many retries means a real
     * serialization problem the caller should be told about.
     */
    private static final int MAX_OPTIMISTIC_RETRIES = 15;

    private final InventoryRepository inventoryRepo;
    private final TeamRepository teamRepo;
    private final ApplicationEventPublisher eventPublisher;

    public InventoryService(InventoryRepository inventoryRepo,
                            TeamRepository teamRepo,
                            ApplicationEventPublisher eventPublisher) {
        this.inventoryRepo = inventoryRepo;
        this.teamRepo = teamRepo;
        this.eventPublisher = eventPublisher;
    }

    @org.springframework.beans.factory.annotation.Autowired
    @org.springframework.context.annotation.Lazy
    private InventoryService self;

    /**
     * Run a database-mutating unit of work with retry on optimistic-lock
     * failure (<b>Quick Win F1.3</b>).
     *
     * <p>Two concurrent deductions on the same inventory row used to race:
     * both read qty=10, both computed qty=8, both wrote back qty=8 — losing
     * one deduction. With the {@code @Version} column on the entity, the
     * second writer gets {@link OptimisticLockingFailureException} and we
     * transparently retry by re-reading the row.
     *
     * <p>Each retry runs in a NEW transaction so the previous (failed) one
     * is fully rolled back before the next attempt.
     */
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public void runWithOptimisticRetry(Runnable action) {
        OptimisticLockingFailureException last = null;
        for (int attempt = 1; attempt <= MAX_OPTIMISTIC_RETRIES; attempt++) {
            try {
                self.runInNewTransaction(action);
                return;
            } catch (OptimisticLockingFailureException ex) {
                last = ex;
                log.warn("Optimistic lock conflict on inventory (attempt {}/{}). Retrying.",
                        attempt, MAX_OPTIMISTIC_RETRIES);
            }
        }
        log.error("Optimistic lock retries exhausted after {} attempts", MAX_OPTIMISTIC_RETRIES);
        throw last;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void runInNewTransaction(Runnable action) {
        action.run();
    }

    // ========== READ ==========

    public List<InventoryItemDTO> getByTeam(UUID teamId) {
        return inventoryRepo.findByTeamIdOrderByProductTypeAscProductStateAsc(teamId)
                .stream().map(this::toDTO).collect(Collectors.toList());
    }

    public List<InventoryItemDTO> getFeaturedProducts() {
        return inventoryRepo.findByIsFeaturedTrue()
                .stream().map(this::toDTO).collect(Collectors.toList());
    }

    /** Get inventory grouped by product type for dashboard display */
    public Map<String, Map<String, Double>> getInventoryMatrix(UUID teamId) {
        List<InventoryItem> items = inventoryRepo.findByTeamIdOrderByProductTypeAscProductStateAsc(teamId);
        Map<String, Map<String, Double>> matrix = new LinkedHashMap<>();
        for (InventoryItem item : items) {
            matrix.computeIfAbsent(item.getProductType(), k -> new LinkedHashMap<>())
                    .put(item.getProductState(), item.getQuantity());
        }
        return matrix;
    }

    // ========== CREATE ==========

    public InventoryItemDTO create(InventoryItemDTO dto) {
        Team t = teamRepo.findById(UUID.fromString(dto.getTeamId()))
                .orElseThrow(() -> new RuntimeException("Team not found"));

        String pType = dto.getProductType() != null ? dto.getProductType() : dto.getName();
        String pState = dto.getProductState() != null ? dto.getProductState() : "GREEN";

        // Check if already exists
        Optional<InventoryItem> existing = inventoryRepo.findByTeamIdAndProductTypeAndProductState(
                t.getId(), pType, pState);
        if (existing.isPresent()) {
            throw new RuntimeException("Mục kho '" + pType + " - " + pState + "' đã tồn tại.");
        }

        InventoryItem item = new InventoryItem();
        item.setTeam(t);
        item.setProductType(pType);
        item.setProductState(pState);
        item.setQuantity(dto.getQuantity() != null ? dto.getQuantity() : 0.0);
        item.setUnit(dto.getUnit() != null ? dto.getUnit() : "kg");
        item.setLowStockThreshold(dto.getLowStockThreshold() != null ? dto.getLowStockThreshold() : 100.0);

        InventoryItem saved = inventoryRepo.save(item);
        eventPublisher.publishEvent(
                new AsyncIndexerService.InventoryChanged(t.getId(), saved.getId()));
        return toDTO(saved);
    }

    // ========== UPDATE ==========

    public InventoryItemDTO updateQuantity(UUID id, Double newQuantity) {
        InventoryItem item = inventoryRepo.findById(id)
                .orElseThrow(() -> new RuntimeException("Item not found"));
        ensureVersion(item);
        item.setQuantity(newQuantity);
        InventoryItem saved = inventoryRepo.save(item);
        if (saved.getTeam() != null) {
            eventPublisher.publishEvent(
                    new AsyncIndexerService.InventoryChanged(saved.getTeam().getId(), saved.getId()));
        }
        return toDTO(saved);
    }

    public InventoryItemDTO update(UUID id, InventoryItemDTO dto) {
        InventoryItem item = inventoryRepo.findById(id)
                .orElseThrow(() -> new RuntimeException("Item not found"));
        ensureVersion(item);

        String nextProductType = firstNonBlank(dto.getProductType(), dto.getDisplayName(), dto.getName());
        if (nextProductType != null) {
            ParsedInventoryName parsed = parseInventoryName(nextProductType);
            item.setProductType(parsed.productType());
            if (dto.getProductState() != null && !dto.getProductState().isBlank()) {
                item.setProductState(dto.getProductState());
            } else if (parsed.productState() != null) {
                item.setProductState(parsed.productState());
            }
        } else if (dto.getProductState() != null && !dto.getProductState().isBlank()) {
            item.setProductState(dto.getProductState());
        }
        if (dto.getQuantity() != null) {
            item.setQuantity(dto.getQuantity());
        }
        if (dto.getUnit() != null) {
            item.setUnit(dto.getUnit());
        }
        if (dto.getLowStockThreshold() != null) {
            item.setLowStockThreshold(dto.getLowStockThreshold());
        }

        InventoryItem saved = inventoryRepo.save(item);
        if (saved.getTeam() != null) {
            eventPublisher.publishEvent(
                    new AsyncIndexerService.InventoryChanged(saved.getTeam().getId(), saved.getId()));
        }
        return toDTO(saved);
    }

    private record ParsedInventoryName(String productType, String productState) {}

    private ParsedInventoryName parseInventoryName(String value) {
        String trimmed = value != null ? value.trim() : "";
        if (trimmed.isEmpty()) {
            return new ParsedInventoryName(trimmed, null);
        }

        String[] parts = trimmed.split("\\s+-\\s+", 2);
        if (parts.length < 2) {
            return new ParsedInventoryName(trimmed, null);
        }

        String state = stateFromLabel(parts[1]);
        if (state == null) {
            return new ParsedInventoryName(trimmed, null);
        }
        return new ParsedInventoryName(parts[0].trim(), state);
    }

    private String stateFromLabel(String label) {
        String normalized = Normalizer.normalize(label == null ? "" : label, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .replace('đ', 'd')
                .replace('Đ', 'D')
                .toLowerCase(Locale.ROOT)
                .trim();
        return switch (normalized) {
            case "hat xanh", "green" -> "GREEN";
            case "da rang", "rang", "roasted" -> "ROASTED";
            case "xay", "da xay", "ground" -> "GROUND";
            case "dong goi", "da dong goi", "packaged" -> "PACKAGED";
            default -> {
                if (normalized.contains("xanh") || normalized.contains("green")) yield "GREEN";
                if (normalized.contains("rang") || normalized.contains("roasted")) yield "ROASTED";
                if (normalized.contains("xay") || normalized.contains("ground")) yield "GROUND";
                if (normalized.contains("dong goi") || normalized.contains("packaged")) yield "PACKAGED";
                yield null;
            }
        };
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }

    private void ensureVersion(InventoryItem item) {
        if (item.getVersion() == null) {
            item.setVersion(0L);
        }
    }

    // ========== DELETE ==========

    public void delete(UUID id) {
        InventoryItem item = inventoryRepo.findById(id).orElse(null);
        inventoryRepo.deleteById(id);
        if (item != null && item.getTeam() != null) {
            eventPublisher.publishEvent(
                    new AsyncIndexerService.InventoryChanged(item.getTeam().getId(), id));
        }
    }

    // ========== AUTO INVENTORY UPDATE (Production Workflow) ==========

    /**
     * Automatically adjust inventory when a production stage completes.
     * @param teamId       the team/factory
     * @param productType  e.g. "Arabica", "Robusta"
     * @param fromState    source state (e.g. "GREEN")
     * @param toState      target state (e.g. "ROASTED")
     * @param quantity     amount to transfer
     */
    public void transferStock(UUID teamId, String productType, String fromState, String toState, double quantity) {
        if (quantity <= 0) return;
        self.runWithOptimisticRetry(() -> self.doTransferStock(teamId, productType, fromState, toState, quantity));
    }

    /** Inner transaction body — runs in {@code REQUIRES_NEW} per retry. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void doTransferStock(UUID teamId, String productType, String fromState, String toState, double quantity) {
        Team team = teamRepo.findById(teamId)
                .orElseThrow(() -> new RuntimeException("Team not found"));

        // Apply 15% natural moisture/chaff weight loss when roasting GREEN -> ROASTED
        double sourceDeduction = ("GREEN".equalsIgnoreCase(fromState) && "ROASTED".equalsIgnoreCase(toState))
                ? Math.round((quantity / 0.85) * 100.0) / 100.0
                : quantity;

        // Deduct from source
        InventoryItem source = getOrCreate(team, productType, fromState);
        double newSourceQty = Math.max(0, source.getQuantity() - sourceDeduction);
        source.setQuantity(newSourceQty);
        inventoryRepo.save(source);

        // Add to target
        InventoryItem target = getOrCreate(team, productType, toState);
        target.setQuantity(target.getQuantity() + quantity);
        inventoryRepo.save(target);
    }

    /**
     * Deduct from packaged stock when order is delivered.
     * Wrapped with optimistic-lock retry so concurrent deliveries cannot
     * silently overwrite each other.
     */
    public void deductPackagedStock(UUID teamId, String productType, double quantity) {
        if (quantity <= 0) return;
        self.runWithOptimisticRetry(() -> self.doDeductPackagedStock(teamId, productType, quantity));
    }

    /** Inner transaction body — runs in {@code REQUIRES_NEW} per retry. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void doDeductPackagedStock(UUID teamId, String productType, double quantity) {
        InventoryItem item = inventoryRepo.findByTeamIdAndProductTypeAndProductState(teamId, productType, "PACKAGED")
                .orElse(null);
        if (item != null) {
            item.setQuantity(Math.max(0, item.getQuantity() - quantity));
            inventoryRepo.save(item);
        }
    }

    /**
     * Initialize default inventory items for a team (4 types x 4 states).
     *
     * <p><b>DISABLED.</b> New teams must start with an empty inventory.
     * This method is preserved as a no-op so existing callers (if any) do not
     * break, but it deliberately creates no rows. Owners add products and
     * materials through the import / create flow.
     */
    @Transactional
    public void initializeDefaultInventory(UUID teamId) {
        // Intentionally empty — teams start with no inventory.
    }

    // ========== HELPERS ==========

    private InventoryItem getOrCreate(Team team, String productType, String productState) {
        return inventoryRepo.findByTeamIdAndProductTypeAndProductState(team.getId(), productType, productState)
                .orElseGet(() -> {
                    InventoryItem newItem = new InventoryItem();
                    newItem.setTeam(team);
                    newItem.setProductType(productType);
                    newItem.setProductState(productState);
                    newItem.setQuantity(0.0);
                    newItem.setUnit("kg");
                    return inventoryRepo.save(newItem);
                });
    }

    public InventoryItemDTO toDTO(InventoryItem i) {
        InventoryItemDTO dto = new InventoryItemDTO();
        dto.setId(i.getId().toString());
        dto.setTeamId(i.getTeam().getId().toString());
        dto.setProductType(i.getProductType());
        dto.setProductState(i.getProductState());
        dto.setDisplayName(i.getDisplayName());
        dto.setName(i.getDisplayName());
        dto.setQuantity(i.getQuantity());
        dto.setUnit(i.getUnit());
        dto.setLowStockThreshold(i.getLowStockThreshold());
        dto.setStatus(i.getStockStatus());
        dto.setLastUpdated(i.getLastUpdated());

        // Featured fields
        dto.setPrice(i.getPrice());
        dto.setDescription(i.getDescription());
        dto.setImageUrl(i.getImageUrl());
        dto.setOrigin(i.getOrigin());
        dto.setRoastLevel(i.getRoastLevel());
        dto.setProcessing(i.getProcessing());
        dto.setTasteNotes(i.getTasteNotes());
        dto.setIsFeatured(i.getIsFeatured());

        return dto;
    }
}
