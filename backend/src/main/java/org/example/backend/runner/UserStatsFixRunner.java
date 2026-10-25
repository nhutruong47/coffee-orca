package org.example.backend.runner;

import org.example.backend.entity.User;
import org.example.backend.entity.InterGroupOrder;
import org.example.backend.repository.UserRepository;
import org.example.backend.repository.InterGroupOrderRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import java.util.List;
import org.springframework.context.annotation.Profile;

@Component
@Profile({"dev", "local", "qa"})
public class UserStatsFixRunner implements CommandLineRunner {

    private final UserRepository userRepository;
    private final InterGroupOrderRepository orderRepository;

    public UserStatsFixRunner(UserRepository userRepository, InterGroupOrderRepository orderRepository) {
        this.userRepository = userRepository;
        this.orderRepository = orderRepository;
    }

    @Override
    public void run(String... args) throws Exception {
        System.out.println("UserStatsFixRunner: Đang đồng bộ số liệu thống kê đơn hàng cho người mua cá nhân...");
        
        List<User> users = userRepository.findAll();
        for (User user : users) {
            List<InterGroupOrder> personalOrders = orderRepository.findByBuyerUserIdOrderByCreatedAtDesc(user.getId());
            if (personalOrders == null || personalOrders.isEmpty()) {
                continue;
            }

            int total = personalOrders.size();
            int completed = 0;
            int cancelled = 0;

            for (InterGroupOrder o : personalOrders) {
                // If it's a personal order (buyerTeam is null)
                if (o.getBuyerTeam() == null) {
                    if ("COMPLETED".equals(o.getStatus())) {
                        completed++;
                    } else if ("CANCELED".equals(o.getStatus())) {
                        cancelled++;
                    }
                }
            }

            if (user.getTotalOrders() != total || user.getCompletedOrders() != completed || user.getCancelledOrders() != cancelled) {
                user.setTotalOrders(total);
                user.setCompletedOrders(completed);
                user.setCancelledOrders(cancelled);
                userRepository.save(user);
                System.out.println("UserStatsFixRunner: Cập nhật user " + user.getUsername() + " -> Total: " + total + ", Canceled: " + cancelled);
            }
        }
        
        System.out.println("UserStatsFixRunner: Đồng bộ hoàn tất.");
    }
}
