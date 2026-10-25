package org.example.backend.entity.enums;

import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

/**
 * Canonical marketplace order status.
 *
 * <p>Lifecycle (happy path):
 * RFQ_CREATED → QUOTED → CONFIRMED → IN_PRODUCTION → QC → COMPLETED → SHIPPING → DELIVERED → REVIEWED
 *
 * <p>Alternate paths:
 * <ul>
 *   <li>REJECTED at RFQ_CREATED or QUOTED (seller)</li>
 *   <li>CANCELED at RFQ_CREATED, QUOTED, CONFIRMED, IN_PRODUCTION, QC, COMPLETED (buyer/seller within 24h)</li>
 *   <li>DISPUTED at DELIVERED, COMPLETED, REVIEWED (buyer claims issue)</li>
 *   <li>RESOLVED at DISPUTED (admin/buyer accepts resolution)</li>
 *   <li>REFUNDED at RESOLVED (system marks money returned)</li>
 * </ul>
 *
 * <p>Legacy aliases (kept for backward compatibility with existing DB rows):
 * <ul>
 *   <li>PENDING == RFQ_CREATED</li>
 *   <li>ACCEPTED == CONFIRMED</li>
 * </ul>
 */
public enum OrderStatus {
    RFQ_CREATED,
    QUOTED,
    REQUOTED,
    REQUOTE_ACCEPTED,
    CONFIRMED,
    IN_PRODUCTION,
    QC,
    COMPLETED,
    SHIPPING,
    DELIVERED,
    REVIEWED,
    REJECTED,
    CANCELED,
    DISPUTED,
    RESOLVED,
    REFUNDED;

    private static final Map<OrderStatus, Set<OrderStatus>> ALLOWED = Map.ofEntries(
            Map.entry(RFQ_CREATED, EnumSet.of(QUOTED, CONFIRMED, REJECTED, CANCELED)),
            Map.entry(QUOTED,      EnumSet.of(CONFIRMED, REQUOTED, REJECTED, CANCELED)),
            Map.entry(REQUOTED,    EnumSet.of(REQUOTE_ACCEPTED, CANCELED, REJECTED)),
            Map.entry(REQUOTE_ACCEPTED, EnumSet.of(CONFIRMED, CANCELED)),
            Map.entry(CONFIRMED,   EnumSet.of(IN_PRODUCTION, COMPLETED, SHIPPING, DELIVERED, CANCELED)),
            Map.entry(IN_PRODUCTION, EnumSet.of(QC, COMPLETED, SHIPPING, DELIVERED, CANCELED)),
            Map.entry(QC,          EnumSet.of(COMPLETED, SHIPPING, DELIVERED, CANCELED)),
            Map.entry(COMPLETED,   EnumSet.of(SHIPPING, DELIVERED, CANCELED, DISPUTED)),
            Map.entry(SHIPPING,    EnumSet.of(DELIVERED, DISPUTED)),
            Map.entry(DELIVERED,   EnumSet.of(COMPLETED, REVIEWED, DISPUTED)),
            Map.entry(REVIEWED,    EnumSet.of(DISPUTED)),
            Map.entry(DISPUTED,    EnumSet.of(RESOLVED, REFUNDED)),
            Map.entry(RESOLVED,    EnumSet.of(REFUNDED, COMPLETED)),
            Map.entry(REJECTED,    EnumSet.of(REQUOTED)), // Can be revived by Re-quoting
            Map.entry(CANCELED,    EnumSet.noneOf(OrderStatus.class)),
            Map.entry(REFUNDED,    EnumSet.noneOf(OrderStatus.class))
    );

    /** True if {@code next} is a legal successor of this status. */
    public boolean canTransitionTo(OrderStatus next) {
        if (next == null) return false;
        return ALLOWED.getOrDefault(this, EnumSet.noneOf(OrderStatus.class)).contains(next);
    }

    /** True if this status is terminal (no further transitions). */
    public boolean isTerminal() {
        return ALLOWED.getOrDefault(this, EnumSet.noneOf(OrderStatus.class)).isEmpty();
    }

    /**
     * Map legacy status strings (still in DB) to the canonical enum.
     * Returns the input unchanged if it's already canonical.
     */
    public static OrderStatus fromLegacy(String raw) {
        if (raw == null || raw.isBlank()) return RFQ_CREATED;
        try {
            return OrderStatus.valueOf(raw);
        } catch (IllegalArgumentException ex) {
            // legacy alias mapping
            return switch (raw.toUpperCase()) {
                case "PENDING" -> RFQ_CREATED;
                case "ACCEPTED" -> CONFIRMED;
                default -> RFQ_CREATED;
            };
        }
    }

    /** Vietnamese label for UI. */
    public String getVietnameseLabel() {
        return switch (this) {
            case RFQ_CREATED -> "Yêu cầu báo giá";
            case QUOTED -> "Đã báo giá";
            case REQUOTED -> "Đã báo giá lại";
            case REQUOTE_ACCEPTED -> "Người mua đồng ý";
            case CONFIRMED -> "Đã xác nhận";
            case IN_PRODUCTION -> "Đang sản xuất";
            case QC -> "Kiểm định QC";
            case COMPLETED -> "Hoàn thành";
            case SHIPPING -> "Đang giao";
            case DELIVERED -> "Đã giao";
            case REVIEWED -> "Đã đánh giá";
            case REJECTED -> "Bị từ chối";
            case CANCELED -> "Đã hủy";
            case DISPUTED -> "Đang khiếu nại";
            case RESOLVED -> "Đã xử lý khiếu nại";
            case REFUNDED -> "Đã hoàn tiền";
        };
    }
}