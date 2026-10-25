package org.example.backend.service;

import org.example.backend.entity.InterGroupOrder;
import org.example.backend.entity.enums.OrderStatus;
import org.example.backend.repository.InterGroupOrderRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Enterprise Scheduled Service for Automated Order Lifecycle Governance.
 * Automatically checks for expired RFQ and Quoted orders that passed deadline
 * and gracefully transitions or cancels them to free workshop inventory capacity.
 */
@Service
public class OrderLifecycleGovernanceService {

    private static final Logger log = LoggerFactory.getLogger(OrderLifecycleGovernanceService.class);

    private final InterGroupOrderRepository orderRepo;
    private final NotificationService notificationService;

    public OrderLifecycleGovernanceService(
            InterGroupOrderRepository orderRepo,
            NotificationService notificationService
    ) {
        this.orderRepo = orderRepo;
        this.notificationService = notificationService;
    }

    /**
     * Runs every 30 minutes to clean up stale unconfirmed RFQs past their deadline.
     */
    @Scheduled(cron = "${app.orders.expiry-cron:0 */30 * * * *}")
    @Transactional
    public void sweepExpiredRFQs() {
        LocalDateTime now = LocalDateTime.now();
        List<InterGroupOrder> expiredRfqs = orderRepo.findByStatusAndDeadlineBefore(OrderStatus.RFQ_CREATED.name(), now);

        if (!expiredRfqs.isEmpty()) {
            log.info("Found {} expired RFQ orders past deadline, transitioning to CANCELED", expiredRfqs.size());
            for (InterGroupOrder order : expiredRfqs) {
                order.setStatus(OrderStatus.CANCELED.name());
                order.setDeliveryNote(
                        (order.getDeliveryNote() != null ? order.getDeliveryNote() + " | " : "") +
                        "Tự động hủy do quá thời hạn yêu cầu báo giá."
                );
                orderRepo.save(order);

                UUID buyerId = order.getBuyerUser() != null ? order.getBuyerUser().getId() : null;
                if (buyerId != null) {
                    notificationService.createAndSend(
                            buyerId,
                            "Yêu cầu báo giá hết hạn",
                            "Đơn hàng #" + order.getId().toString().substring(0, 8) + " đã tự động hủy do quá hạn.",
                            "ORDER_EXPIRED",
                            null
                    );
                }
            }
        }
    }
}
