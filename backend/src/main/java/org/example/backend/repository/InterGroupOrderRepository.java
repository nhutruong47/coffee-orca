package org.example.backend.repository;

import org.example.backend.entity.InterGroupOrder;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface InterGroupOrderRepository extends JpaRepository<InterGroupOrder, UUID> {

    // Đơn mình đi đặt (Xưởng của mình là Buyer)
    @EntityGraph(attributePaths = {"buyerTeam", "buyerUser", "sellerTeam"})
    List<InterGroupOrder> findByBuyerTeamIdOrderByCreatedAtDesc(UUID buyerTeamId);

    @EntityGraph(attributePaths = {"buyerTeam", "buyerUser", "sellerTeam"})
    List<InterGroupOrder> findByBuyerUserIdOrderByCreatedAtDesc(UUID buyerUserId);

    // Đơn xưởng khác đặt mình (Xưởng của mình là Seller)
    @EntityGraph(attributePaths = {"buyerTeam", "buyerUser", "sellerTeam"})
    List<InterGroupOrder> findBySellerTeamIdOrderByCreatedAtDesc(UUID sellerTeamId);

    List<InterGroupOrder> findByStatusAndDeadlineBefore(String status, java.time.LocalDateTime cutoff);
}
