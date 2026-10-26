package org.example.backend.service;

import org.example.backend.dto.InterGroupOrderDTO;
import org.example.backend.entity.Goal;
import org.example.backend.entity.InterGroupOrder;
import org.example.backend.dto.OrderEventLogDTO;
import org.example.backend.dto.DeliverOrderRequest;
import org.example.backend.dto.DeliveryProofImageDTO;
import org.example.backend.entity.OrderProofImage;
import org.example.backend.entity.Team;
import org.example.backend.entity.User;
import org.example.backend.entity.enums.OrderStatus;
import org.example.backend.repository.GoalRepository;
import org.example.backend.repository.InterGroupOrderRepository;
import org.example.backend.repository.TeamRepository;
import org.example.backend.repository.ReviewRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.transaction.annotation.Transactional;

@Service
public class InterGroupOrderService {

    private final InterGroupOrderRepository orderRepo;
    private final TeamRepository teamRepo;
    private final GoalRepository goalRepo;
    private final NotificationService notificationService;
    private final ReviewRepository reviewRepo;
    private final InventoryService inventoryService;
    private final org.example.backend.repository.UserRepository userRepository;
    private final OrderStateMachine stateMachine;
    private final TrustScoreService trustScoreService;
    private final org.example.backend.repository.OrderProofImageRepository orderProofImageRepo;
    private final org.example.backend.repository.OrderEventLogRepository orderEventLogRepo;
    private final OutboxEventService outboxEventService;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private TaskService taskService;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private ProductionOrderService productionOrderService;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private ProductionPlanService productionPlanService;

    public InterGroupOrderService(InterGroupOrderRepository orderRepo, TeamRepository teamRepo,
            GoalRepository goalRepo, NotificationService notificationService,
            ReviewRepository reviewRepo, InventoryService inventoryService,
            org.example.backend.repository.UserRepository userRepository,
            OrderStateMachine stateMachine,
            TrustScoreService trustScoreService,
            org.example.backend.repository.OrderProofImageRepository orderProofImageRepo,
            org.example.backend.repository.OrderEventLogRepository orderEventLogRepo,
            OutboxEventService outboxEventService) {
        this.orderRepo = orderRepo;
        this.teamRepo = teamRepo;
        this.goalRepo = goalRepo;
        this.notificationService = notificationService;
        this.reviewRepo = reviewRepo;
        this.inventoryService = inventoryService;
        this.userRepository = userRepository;
        this.stateMachine = stateMachine;
        this.trustScoreService = trustScoreService;
        this.orderProofImageRepo = orderProofImageRepo;
        this.orderEventLogRepo = orderEventLogRepo;
        this.outboxEventService = outboxEventService;
    }


    /**
     * Apply a status transition through {@link OrderStateMachine} so every
     * mutation is validated against the canonical state machine.
     *
     * <p><b>Quick Win F1.2:</b> Replaces raw {@code order.setStatus("...")}
     * calls scattered across the service. The previous implementation allowed
     * any caller to write any status, which corrupted {@code OrderEventLog}
     * history and trust-score calculations.
     *
     * @param order     the order being mutated
     * @param newStatus the desired next status
     * @param source    short debug tag identifying the calling method (logged
     *                  with violations to speed up investigations)
     * @throws IllegalStateException if the transition is not allowed
     */
    private void transitionTo(InterGroupOrder order, OrderStatus newStatus, User currentUser, String source) {
        OrderStatus current = OrderStatus.fromLegacy(order.getStatus());
        if (current == newStatus) {
            return; // idempotent: no-op
        }
        stateMachine.requireTransition(current, newStatus);
        
        String oldStatusStr = order.getStatus();
        order.setStatus(newStatus.name());

        String actorRole = "SYSTEM";
        if (currentUser != null) {
            if (order.getBuyerTeam() != null && order.getBuyerTeam().getOwner().getId().equals(currentUser.getId())) {
                actorRole = "BUYER";
            } else if (order.getBuyerUser() != null && order.getBuyerUser().getId().equals(currentUser.getId())) {
                actorRole = "BUYER";
            } else if (order.getSellerTeam() != null && order.getSellerTeam().getOwner().getId().equals(currentUser.getId())) {
                actorRole = "SELLER";
            }
        }

        org.example.backend.entity.OrderEventLog log = org.example.backend.entity.OrderEventLog.builder()
                .order(order)
                .actorUser(currentUser)
                .actorRole(actorRole)
                .eventType(source)
                .oldStatus(oldStatusStr)
                .newStatus(newStatus.name())
                .createdAt(LocalDateTime.now())
                .build();
        orderEventLogRepo.save(log);
    }

    public List<InterGroupOrderDTO> getOutboundOrders(UUID buyerTeamId) {
        return orderRepo.findByBuyerTeamIdOrderByCreatedAtDesc(buyerTeamId)
                .stream().map(this::toDTO).collect(Collectors.toList());
    }

    public List<InterGroupOrderDTO> getMyOutboundOrders(User currentUser) {
        return orderRepo.findByBuyerUserIdOrderByCreatedAtDesc(currentUser.getId())
                .stream().map(this::toDTO).collect(Collectors.toList());
    }

    public List<InterGroupOrderDTO> getInboundOrders(UUID sellerTeamId) {
        return orderRepo.findBySellerTeamIdOrderByCreatedAtDesc(sellerTeamId)
                .stream().map(this::toDTO).collect(Collectors.toList());
    }

    public InterGroupOrderDTO getById(UUID orderId) {
        InterGroupOrder order = orderRepo.findById(orderId)
                .orElseThrow(() -> new RuntimeException("Order not found"));
        return toDTO(order);
    }

    @Transactional
    public InterGroupOrderDTO createOrder(InterGroupOrderDTO dto, User currentUser) {
        if (dto.getBuyerTeamId() == null || dto.getBuyerTeamId().isBlank()) {
            Team sellerTeam = teamRepo.findById(UUID.fromString(dto.getSellerTeamId()))
                    .orElseThrow(() -> new RuntimeException("Seller team not found"));

            // Trust check for personal user
            if (currentUser.getTotalOrders() >= 3) {
                int trustScore = trustScoreService.calculate(currentUser);
                if (trustScore < 40 && dto.getQuantity() != null && dto.getQuantity() > 50) {
                    throw new RuntimeException("Uy tín quá thấp (" + trustScore + "%). Bạn chỉ được phép đặt hàng với số lượng nhỏ (tối đa 50).");
                }
            }

            InterGroupOrder order = new InterGroupOrder();
            order.setBuyerUser(currentUser);
            order.setSellerTeam(sellerTeam);
            order.setTitle(dto.getTitle());
            order.setDescription(dto.getDescription());
            order.setQuantity(dto.getQuantity());
            order.setDeadline(dto.getDeadline());
            transitionTo(order, OrderStatus.RFQ_CREATED, currentUser, "createOrder-team");
            order.setMaterialSource(dto.getMaterialSource());
            order.setServices(dto.getServices());
            order.setProductType(dto.getProductType());
            order.setUnit(dto.getUnit());
            mapDeliveryFields(order, dto);

            InterGroupOrder saved = orderRepo.save(order);

            currentUser.setTotalOrders(currentUser.getTotalOrders() + 1);
            userRepository.save(currentUser);

            // Notify seller team owner about new order
            String buyerName = currentUser.getFullName() != null && !currentUser.getFullName().isBlank()
                    ? currentUser.getFullName() : currentUser.getUsername();
            notifyUser(sellerTeam.getOwner(),
                    "Đơn hàng mới",
                    "Bạn có đơn hàng mới từ " + buyerName + ": " + order.getTitle(),
                    "ORDER_CREATED", null);

            // Notify buyer (confirmation)
            notifyUser(currentUser,
                    "Đã gửi đơn hàng",
                    "Đơn hàng \"" + order.getTitle() + "\" đã được gửi đến " + sellerTeam.getName() + ". Chờ phản hồi.",
                    "ORDER_CREATED", null);

            return toDTO(saved);
        }

        Team buyerTeam = teamRepo.findById(UUID.fromString(dto.getBuyerTeamId()))
                .orElseThrow(() -> new RuntimeException("Buyer team not found"));

        Team sellerTeam = teamRepo.findById(UUID.fromString(dto.getSellerTeamId()))
                .orElseThrow(() -> new RuntimeException("Seller team not found"));

        if (!buyerTeam.getOwner().getId().equals(currentUser.getId())) {
            throw new RuntimeException("Only the team owner can place inter-group orders.");
        }

        // Trust check for team: block if trust score < 40% and quantity > 50
        if (buyerTeam.getTotalOrders() >= 3) {
            int trustScore = trustScoreService.calculate(buyerTeam);
            if (trustScore < 40 && dto.getQuantity() != null && dto.getQuantity() > 50) {
                throw new RuntimeException("Uy tín quá thấp (" + trustScore + "%). Bạn chỉ được phép đặt hàng với số lượng nhỏ (tối đa 50).");
            }
        }

        InterGroupOrder order = new InterGroupOrder();
        order.setBuyerTeam(buyerTeam);
        order.setSellerTeam(sellerTeam);
        order.setTitle(dto.getTitle());
        order.setDescription(dto.getDescription());
        order.setQuantity(dto.getQuantity());
        order.setDeadline(dto.getDeadline());
        transitionTo(order, OrderStatus.RFQ_CREATED, currentUser, "createOrder-user");
        order.setMaterialSource(dto.getMaterialSource());
        order.setServices(dto.getServices());
        order.setProductType(dto.getProductType());
        order.setUnit(dto.getUnit());
        mapDeliveryFields(order, dto);

        // Increment buyer total orders
        buyerTeam.setTotalOrders(buyerTeam.getTotalOrders() + 1);
        teamRepo.save(buyerTeam);

        InterGroupOrder saved = orderRepo.save(order);
        outboxEventService.publish("InterGroupOrder", saved.getId().toString(), "ORDER_CREATED", java.util.Map.of("id", saved.getId(), "status", String.valueOf(saved.getStatus())));

        // Notify seller team owner about new order
        notifyUser(sellerTeam.getOwner(),
                "Đơn hàng mới",
                "Bạn có đơn hàng mới từ " + buyerTeam.getName() + ": " + order.getTitle(),
                "ORDER_CREATED", null);

        // Notify buyer (confirmation)
        notifyUser(currentUser,
                "Đã gửi đơn hàng",
                "Đơn hàng \"" + order.getTitle() + "\" đã được gửi đến " + sellerTeam.getName() + ". Chờ phản hồi.",
                "ORDER_CREATED", null);

        return toDTO(saved);
    }

    @Transactional
    public InterGroupOrderDTO acceptOrder(UUID orderId, User currentUser) {
        InterGroupOrder order = orderRepo.findById(orderId)
                .orElseThrow(() -> new RuntimeException("Order not found"));

        Team sellerTeam = order.getSellerTeam();
        if (!sellerTeam.getOwner().getId().equals(currentUser.getId())) {
            throw new RuntimeException("Only the receiving team owner can accept orders.");
        }

        if (!"RFQ_CREATED".equals(order.getStatus()) && !"QUOTED".equals(order.getStatus()) && !"PENDING".equals(order.getStatus())) {
            throw new RuntimeException("Đơn hàng không ở trạng thái có thể xác nhận.");
        }

        // 1. Change Order Status
        transitionTo(order, OrderStatus.CONFIRMED, currentUser, "acceptOrder");
        order.setBuyerViewed(false);

        // 2. Automatically generate a Goal in the seller's Team
        Goal autoGoal = new Goal();
        autoGoal.setTeam(sellerTeam);
        autoGoal.setOwner(currentUser);
        autoGoal.setTitle("[Đơn Hàng] " + order.getTitle());
        autoGoal.setOutputTarget("SL: " + order.getQuantity() + " | " + order.getDescription());
        autoGoal.setPriority(2); // Normal priority
        autoGoal.setDeadline(order.getDeadline());
        autoGoal.setStatus("PUBLISHED");
        autoGoal.setTotalTasks(0);
        autoGoal.setCompletedTasks(0);

        Goal savedGoal = goalRepo.save(autoGoal);

        // 3. Link the goal to the order
        order.setLinkedGoalId(savedGoal.getId());

        InterGroupOrder saved = orderRepo.save(order);
        autoBootstrapProductionPipeline(saved, savedGoal, sellerTeam);

        // Notify buyer that order was accepted
        User buyerToNotify = resolveBuyerUser(order);
        if (buyerToNotify != null) {
            notifyUser(buyerToNotify,
                    "Đơn hàng được chấp nhận",
                    "Đơn hàng \"" + order.getTitle() + "\" đã được " + sellerTeam.getName() + " chấp nhận và bắt đầu gia công.",
                    "ORDER_ACCEPTED", null);
        }

        return toDTO(saved);
    }

    @Transactional
    public InterGroupOrderDTO confirmQuote(UUID orderId, User currentUser) {
        InterGroupOrder order = orderRepo.findById(orderId)
                .orElseThrow(() -> new RuntimeException("Order not found"));

        if (!"QUOTED".equals(order.getStatus())) {
            throw new RuntimeException("Đơn hàng không ở trạng thái Đã Báo Giá.");
        }

        Team buyerTeam = order.getBuyerTeam();
        User buyerUser = order.getBuyerUser();

        boolean isBuyerOwner = buyerTeam != null && buyerTeam.getOwner().getId().equals(currentUser.getId());
        boolean isBuyerDirect = buyerUser != null && buyerUser.getId().equals(currentUser.getId());

        if (!isBuyerOwner && !isBuyerDirect) {
            throw new RuntimeException("Chỉ người mua mới có thể chốt đơn báo giá.");
        }

        // 1. Change Order Status
        transitionTo(order, OrderStatus.CONFIRMED, currentUser, "confirmQuote");
        order.setSellerViewed(false);

        // 2. Automatically generate a Goal in the seller's Team
        Team sellerTeam = order.getSellerTeam();
        Goal autoGoal = new Goal();
        autoGoal.setTeam(sellerTeam);
        autoGoal.setOwner(sellerTeam.getOwner()); // Owner is the seller
        autoGoal.setTitle("[Đơn Hàng] " + order.getTitle());
        autoGoal.setOutputTarget("SL: " + order.getQuantity() + " | " + order.getDescription());
        autoGoal.setPriority(2); // Normal priority
        autoGoal.setDeadline(order.getDeadline());
        autoGoal.setStatus("PUBLISHED");
        autoGoal.setTotalTasks(0);
        autoGoal.setCompletedTasks(0);

        Goal savedGoal = goalRepo.save(autoGoal);

        // 3. Link the goal to the order
        order.setLinkedGoalId(savedGoal.getId());

        InterGroupOrder saved = orderRepo.save(order);
        autoBootstrapProductionPipeline(saved, savedGoal, sellerTeam);

        // Notify seller that order was confirmed
        notifyUser(sellerTeam.getOwner(),
                "Khách hàng đã chốt báo giá",
                "Khách hàng đã đồng ý với báo giá cho đơn hàng: " + order.getTitle(),
                "ORDER_ACCEPTED", order.getId());

        return toDTO(saved);
    }

    /**
     * Automatically bootstraps standard Specialty Coffee production tasks,
     * internal ProductionOrder, and AI ProductionPlan when a B2B order is confirmed.
     */
    private void autoBootstrapProductionPipeline(InterGroupOrder order, Goal savedGoal, Team sellerTeam) {
        if (savedGoal == null || savedGoal.getId() == null) return;
        double qty = order.getQuantity() != null && order.getQuantity() > 0 ? order.getQuantity() : 100.0;
        double greenRequired = Math.ceil((qty / 0.85) * 100.0) / 100.0;

        if (taskService != null) {
            String goalIdStr = savedGoal.getId().toString();
            createAutoTask(goalIdStr, "[QC Đầu Vào] Phân loại & đo độ ẩm nhân xanh (11.5% - 12.5%)",
                    "Kiểm tra độ ẩm, tỷ lệ hạt lỗi và sàng phân cỡ cho lô " + order.getTitle(),
                    "QA", greenRequired, 2.0, order.getDeadline());
            createAutoTask(goalIdStr, "[Rang Mẻ] Gia công rang chuẩn profile & tách đá (Destoner)",
                    "Rang theo hồ sơ nhiệt tiêu chuẩn, hao hụt dự kiến 15% cho đơn " + order.getTitle(),
                    "RANG", qty, 4.0, order.getDeadline());
            createAutoTask(goalIdStr, "[Cupping & QC] Đo màu Agtron, thử nếm SCA & degassing",
                    "Kiểm định chất lượng mẻ rang và độ đồng nhất màu hạt",
                    "QA", qty, 1.5, order.getDeadline());
            createAutoTask(goalIdStr, "[Đóng Gói] Đóng túi van 1 chiều, hàn nhiệt & dán tem truy xuất lô",
                    "Đóng gói thành phẩm, ghi mã lô truy xuất nguồn gốc cho đơn " + order.getTitle(),
                    "DONG_GOI", qty, 2.5, order.getDeadline());
        }

        if (productionOrderService != null && sellerTeam != null && sellerTeam.getId() != null) {
                org.example.backend.entity.ProductionOrder po = new org.example.backend.entity.ProductionOrder();
                po.setTitle(order.getTitle());
                po.setDescription(order.getDescription());
                String buyerName = order.getBuyerTeam() != null ? order.getBuyerTeam().getName() :
                        (order.getBuyerUser() != null ? order.getBuyerUser().getUsername() : "Đối tác B2B");
                po.setCustomerName(buyerName);
                po.setProductType(order.getProductType() != null ? order.getProductType() : "Robusta");
                po.setProcessType("Rang gia công B2B");
                po.setRoastLevel("Medium");
                po.setPackageSize("1kg");
                po.setOutputTarget(qty);
                po.setExpectedYield(0.85);
                po.setUnit(order.getUnit() != null ? order.getUnit() : "kg");
                java.time.LocalDate today = java.time.LocalDate.now();
                po.setOrderDate(today);
                po.setProductionStartDate(today);
                java.time.LocalDate deliveryDate = order.getDeadline() != null && order.getDeadline().toLocalDate().isAfter(today)
                        ? order.getDeadline().toLocalDate()
                        : today.plusDays(7);
                po.setCustomerDeliveryDate(deliveryDate);
                po.setSafetyBufferDays(2);

                org.example.backend.entity.ProductionOrder createdPo = productionOrderService.createOrder(sellerTeam.getId(), po);
                if (productionPlanService != null && createdPo != null && createdPo.getId() != null) {
                    productionPlanService.generatePlan(createdPo.getId());
                }
        }
    }

    private void createAutoTask(String goalId, String title, String desc, String stage, double outputTarget, double workload, LocalDateTime deadline) {
        org.example.backend.dto.TaskDTO dto = new org.example.backend.dto.TaskDTO();
        dto.setGoalId(goalId);
        dto.setTitle(title);
        dto.setDescription(desc);
        dto.setProductionStage(stage);
        dto.setOutputTarget(outputTarget);
        dto.setWorkload(workload);
        dto.setPriority(2);
        dto.setDeadline(deadline);
        taskService.create(dto);
    }

    @Transactional
    public InterGroupOrderDTO rejectOrder(UUID orderId, User currentUser) {
        InterGroupOrder order = orderRepo.findById(orderId)
                .orElseThrow(() -> new RuntimeException("Order not found"));

        Team sellerTeam = order.getSellerTeam();
        if (!sellerTeam.getOwner().getId().equals(currentUser.getId())) {
            throw new RuntimeException("Only the receiving team owner can reject orders.");
        }

        if (!"RFQ_CREATED".equals(order.getStatus()) && !"QUOTED".equals(order.getStatus()) && !"PENDING".equals(order.getStatus())) {
            throw new RuntimeException("Order is not in PENDING state.");
        }

        transitionTo(order, OrderStatus.REJECTED, currentUser, "rejectOrder");
        order.setBuyerViewed(false);
        InterGroupOrder saved = orderRepo.save(order);

        // Notify buyer that order was rejected
        User buyerToNotify = resolveBuyerUser(order);
        if (buyerToNotify != null) {
            notifyUser(buyerToNotify,
                    "Đơn hàng bị từ chối",
                    "Đơn hàng \"" + order.getTitle() + "\" đã bị " + sellerTeam.getName() + " từ chối.",
                    "ORDER_REJECTED", null);
        }

        return toDTO(saved);
    }

    private InterGroupOrderDTO toDTO(InterGroupOrder order) {
        InterGroupOrderDTO dto = new InterGroupOrderDTO();
        dto.setId(order.getId().toString());
        dto.setBuyerTeamId(order.getBuyerTeam() != null ? order.getBuyerTeam().getId().toString() : null);
        dto.setBuyerTeamName(order.getBuyerTeam() != null ? order.getBuyerTeam().getName() : null);
        dto.setBuyerUserId(order.getBuyerUser() != null ? order.getBuyerUser().getId().toString() : null);
        dto.setBuyerUserName(order.getBuyerUser() != null
                ? (order.getBuyerUser().getFullName() != null && !order.getBuyerUser().getFullName().isBlank()
                        ? order.getBuyerUser().getFullName()
                        : order.getBuyerUser().getUsername())
                : null);
        dto.setSellerTeamId(order.getSellerTeam().getId().toString());
        dto.setSellerTeamName(order.getSellerTeam().getName());
        dto.setTitle(order.getTitle());
        dto.setDescription(order.getDescription());
        dto.setQuantity(order.getQuantity());
        dto.setDeadline(order.getDeadline());
        dto.setStatus(order.getStatus());
        dto.setLinkedGoalId(order.getLinkedGoalId() != null ? order.getLinkedGoalId().toString() : null);
        dto.setCreatedAt(order.getCreatedAt());
        dto.setCancelledBy(order.getCancelledBy());
        dto.setCancelRequested(order.getCancelRequested());
        dto.setBuyerViewed(order.getBuyerViewed());
        dto.setSellerViewed(order.getSellerViewed());

        // Delivery profile
        dto.setContactPhone(order.getContactPhone());
        dto.setContactPhoneAlt(order.getContactPhoneAlt());
        dto.setDeliveryAddress(order.getDeliveryAddress());
        dto.setPreferredDeliveryFrom(order.getPreferredDeliveryFrom());
        dto.setPreferredDeliveryTo(order.getPreferredDeliveryTo());
        dto.setDeliveryFailureAction(order.getDeliveryFailureAction());
        dto.setDeliveryNote(order.getDeliveryNote());

        // Delivery confirmation
        dto.setDeliveryConfirmed(order.getDeliveryConfirmed());
        dto.setDeliveryStatus(order.getDeliveryStatus());
        dto.setDeliveryConfirmedAt(order.getDeliveryConfirmedAt());

        // Marketplace RFQ fields
        dto.setMaterialSource(order.getMaterialSource());
        dto.setServices(order.getServices());
        dto.setProductType(order.getProductType());
        dto.setQuotedPrice(order.getQuotedPrice());
        dto.setQuotedNote(order.getQuotedNote());
        dto.setQuotedAt(order.getQuotedAt());
        dto.setUnit(order.getUnit());

        // Buyer trust score — unified via TrustScoreService
        int trustScore;
        if (order.getBuyerTeam() != null) {
            trustScore = trustScoreService.calculate(order.getBuyerTeam());
        } else if (order.getBuyerUser() != null) {
            trustScore = trustScoreService.calculate(order.getBuyerUser());
        } else {
            trustScore = -1;
        }
        dto.setBuyerTrustScore(trustScore);

        return dto;
    }

    /**
     * Khách hàng hoặc xưởng hủy đơn. Nếu người mua hủy đơn sau 24h, đơn sẽ chuyển sang trạng thái "Đang xin hủy".
     */
    @Transactional
    public InterGroupOrderDTO cancelOrder(UUID orderId, User currentUser) {
        InterGroupOrder order = orderRepo.findById(orderId)
                .orElseThrow(() -> new RuntimeException("Order not found"));

        if (!"RFQ_CREATED".equals(order.getStatus()) && !"QUOTED".equals(order.getStatus()) && !"CONFIRMED".equals(order.getStatus()) && !"PENDING".equals(order.getStatus()) && !"ACCEPTED".equals(order.getStatus())) {
            throw new RuntimeException("Chỉ đơn chưa sản xuất mới được hủy.");
        }

        boolean isBuyerOwner = (order.getBuyerTeam() != null && order.getBuyerTeam().getOwner().getId().equals(currentUser.getId()))
                || (order.getBuyerUser() != null && order.getBuyerUser().getId().equals(currentUser.getId()));
        boolean isSellerOwner = order.getSellerTeam().getOwner().getId().equals(currentUser.getId());

        if (!isBuyerOwner && !isSellerOwner) {
            throw new RuntimeException("Chỉ chủ xưởng mua hoặc bán mới được hủy đơn.");
        }

        // Logic 24h: Nếu người mua hủy và đơn đã quá 24h -> Chuyển thành Yêu cầu hủy
        if (isBuyerOwner && !isSellerOwner) {
            long hoursSinceCreation = java.time.temporal.ChronoUnit.HOURS.between(order.getCreatedAt(), LocalDateTime.now());
            if (hoursSinceCreation > 24) {
                order.setCancelRequested(true);
                order.setSellerViewed(false);
                InterGroupOrder saved = orderRepo.save(order);
                notifyUser(order.getSellerTeam().getOwner(),
                        "Yêu cầu hủy đơn hàng",
                        "Khách hàng đã yêu cầu hủy đơn \"" + order.getTitle() + "\". Hãy xem xét.",
                        "ORDER_CANCEL_REQUESTED", null);
                return toDTO(saved);
            }
        }

        // Lưu lại status cũ để xét xem có phạt uy tín không
        String oldStatus = order.getStatus();

        // Thực hiện hủy ngay
        transitionTo(order, OrderStatus.CANCELED, currentUser, "cancelOrder");
        order.setCancelledBy(isBuyerOwner ? "BUYER" : "SELLER");
        order.setCancelRequested(false);
        if (isBuyerOwner) {
            order.setSellerViewed(false);
        } else {
            order.setBuyerViewed(false);
        }

        // Penalty: Chỉ phạt uy tín nếu đơn hàng ĐÃ ĐƯỢC XÁC NHẬN (CONFIRMED hoặc ACCEPTED)
        if ("CONFIRMED".equals(oldStatus) || "ACCEPTED".equals(oldStatus)) {
            if (isBuyerOwner && order.getBuyerTeam() != null) {
                trustScoreService.onOrderCancelled(order.getBuyerTeam(), null);
            } else if (isBuyerOwner && order.getBuyerUser() != null) {
                trustScoreService.onOrderCancelled(null, order.getBuyerUser());
            } else if (isSellerOwner) {
                trustScoreService.onOrderCancelled(order.getSellerTeam(), null);
            }
        }

        InterGroupOrder saved = orderRepo.save(order);

        // Thông báo cho bên còn lại
        String cancellerName = isBuyerOwner ? "Bên mua" : "Bên bán";
        if (isBuyerOwner) {
            notifyUser(order.getSellerTeam().getOwner(),
                    "Đơn hàng đã bị hủy",
                    "Đơn hàng \"" + order.getTitle() + "\" đã bị hủy bởi " + cancellerName + " (chưa quá 24h).",
                    "ORDER_CANCELED", null);
        } else {
            User buyerToNotify = resolveBuyerUser(order);
            if (buyerToNotify != null) {
                notifyUser(buyerToNotify,
                        "Đơn hàng đã bị hủy",
                        "Đơn hàng \"" + order.getTitle() + "\" đã bị hủy bởi " + cancellerName + ".",
                        "ORDER_CANCELED", null);
            }
        }

        return toDTO(saved);
    }

    /**
     * Seller đồng ý yêu cầu hủy của Buyer
     */
    @Transactional
    public InterGroupOrderDTO approveCancelOrder(UUID orderId, User currentUser) {
        InterGroupOrder order = orderRepo.findById(orderId)
                .orElseThrow(() -> new RuntimeException("Order not found"));

        if (!order.getSellerTeam().getOwner().getId().equals(currentUser.getId())) {
            throw new RuntimeException("Chỉ chủ xưởng bán mới có quyền duyệt hủy đơn.");
        }
        if (order.getCancelRequested() == null || !order.getCancelRequested()) {
            throw new RuntimeException("Đơn hàng không có yêu cầu hủy.");
        }

        String oldStatus = order.getStatus();

        transitionTo(order, OrderStatus.CANCELED, currentUser, "approveCancel");
        order.setCancelledBy("BUYER");
        order.setCancelRequested(false);
        order.setBuyerViewed(false);

        // Penalty cho buyer: Chỉ phạt uy tín nếu đơn hàng ĐÃ ĐƯỢC XÁC NHẬN
        if ("CONFIRMED".equals(oldStatus) || "ACCEPTED".equals(oldStatus)) {
            trustScoreService.onOrderCancelled(order.getBuyerTeam(), order.getBuyerUser());
        }

        InterGroupOrder saved = orderRepo.save(order);

        User buyerToNotify = resolveBuyerUser(order);
        if (buyerToNotify != null) {
            notifyUser(buyerToNotify,
                    "Yêu cầu hủy được chấp nhận",
                    "Xưởng " + order.getSellerTeam().getName() + " đã đồng ý hủy đơn \"" + order.getTitle() + "\".",
                    "ORDER_CANCELED", null);
        }

        return toDTO(saved);
    }

    /**
     * Seller từ chối yêu cầu hủy của Buyer (Chỉ hợp lệ nếu > 24h, mà code ở trên đã chặn việc tạo request nếu < 24h rồi)
     */
    @Transactional
    public InterGroupOrderDTO rejectCancelOrder(UUID orderId, User currentUser) {
        InterGroupOrder order = orderRepo.findById(orderId)
                .orElseThrow(() -> new RuntimeException("Order not found"));

        if (!order.getSellerTeam().getOwner().getId().equals(currentUser.getId())) {
            throw new RuntimeException("Chỉ chủ xưởng bán mới có quyền từ chối hủy đơn.");
        }
        if (order.getCancelRequested() == null || !order.getCancelRequested()) {
            throw new RuntimeException("Đơn hàng không có yêu cầu hủy.");
        }

        // Tắt cờ yêu cầu hủy, đơn hàng trở lại bình thường
        order.setCancelRequested(false);
        order.setBuyerViewed(false);
        InterGroupOrder saved = orderRepo.save(order);

        User buyerToNotify = resolveBuyerUser(order);
        if (buyerToNotify != null) {
            notifyUser(buyerToNotify,
                    "Yêu cầu hủy bị từ chối",
                    "Xưởng " + order.getSellerTeam().getName() + " đã từ chối yêu cầu hủy đơn \"" + order.getTitle() + "\". Đơn hàng vẫn tiếp tục.",
                    "ORDER_CANCEL_REJECTED", null);
        }

        return toDTO(saved);
    }

    /**
     * Xưởng đánh dấu đã giao hàng — chuyển sang DELIVERED, chờ người mua xác nhận
     */
    @Transactional
    public InterGroupOrderDTO shipOrder(UUID orderId, User currentUser) {
        InterGroupOrder order = orderRepo.findById(orderId)
                .orElseThrow(() -> new RuntimeException("Order not found"));

        if (!"COMPLETED".equals(order.getStatus()) && !"ACCEPTED".equals(order.getStatus()) && !"IN_PRODUCTION".equals(order.getStatus()) && !"QC".equals(order.getStatus())) {
            throw new RuntimeException("Đơn hàng chưa ở trạng thái có thể giao.");
        }

        Team sellerTeam = order.getSellerTeam();
        if (!sellerTeam.getOwner().getId().equals(currentUser.getId())) {
            throw new RuntimeException("Chỉ chủ xưởng bán mới được đánh dấu đã giao.");
        }

        transitionTo(order, OrderStatus.SHIPPING, currentUser, "shipOrder");
        order.setBuyerViewed(false);

        InterGroupOrder saved = orderRepo.save(order);

        // Notify buyer that order has been delivered
        User buyerToNotify = resolveBuyerUser(order);
        if (buyerToNotify != null) {
            notifyUser(buyerToNotify,
                    "Đơn hàng đã giao — Chờ xác nhận",
                    "Đơn hàng \"" + order.getTitle() + "\" đã được " + sellerTeam.getName() + " giao. Vui lòng xác nhận đã nhận hàng đúng hẹn hay không.",
                    "ORDER_DELIVERED", null);
        }

        return toDTO(saved);
    }

    /**
     * Lifecycle step: Seller marks the order as DELIVERED.
     * Allowed transitions:
     *   CONFIRMED -> SHIPPING -> DELIVERED (idempotent skip if already SHIPPING/DELIVERED)
     * Only the seller (receiving team owner) can call this.
     */
    @Transactional
    public InterGroupOrderDTO deliverOrder(UUID orderId, String deliveryNote, User currentUser, DeliverOrderRequest payload) {
        InterGroupOrder order = orderRepo.findById(orderId)
                .orElseThrow(() -> new RuntimeException("Order not found"));

        String currentStatus = order.getStatus();
        boolean allowed = "CONFIRMED".equals(currentStatus)
                || "IN_PRODUCTION".equals(currentStatus)
                || "QC".equals(currentStatus)
                || "COMPLETED".equals(currentStatus)
                || "SHIPPING".equals(currentStatus);
        if (!allowed) {
            throw new RuntimeException("Đơn hàng không thể chuyển sang DELIVERED từ trạng thái: " + currentStatus);
        }

        Team sellerTeam = order.getSellerTeam();
        if (!sellerTeam.getOwner().getId().equals(currentUser.getId())) {
            throw new RuntimeException("Chỉ chủ xưởng bán mới được đánh dấu đã giao.");
        }

        transitionTo(order, OrderStatus.DELIVERED, currentUser, "deliverOrder");
        deductOrderPackagedStockIfNeeded(order);
        order.setDeliveryConfirmed(false);
        order.setBuyerViewed(false);
        if (deliveryNote != null && !deliveryNote.isBlank()) {
            order.setDeliveryNote(deliveryNote);
        }

        InterGroupOrder saved = orderRepo.save(order);

        // Persist proof images with GPS metadata (if provided)
        if (payload != null && payload.getProofImages() != null && !payload.getProofImages().isEmpty()) {
            for (DeliveryProofImageDTO dto : payload.getProofImages()) {
                OrderProofImage proof = new OrderProofImage();
                proof.setOrder(saved);
                proof.setImageUrl(dto.getImageUrl());
                proof.setLatitude(dto.getLatitude());
                proof.setLongitude(dto.getLongitude());
                proof.setCapturedAt(dto.getCapturedAt() != null ? dto.getCapturedAt() : LocalDateTime.now());
                proof.setUploadedByUser(currentUser);
                proof.setImageType(dto.getImageType() != null ? dto.getImageType() : "DELIVERY");
                orderProofImageRepo.save(proof);
            }
        }

        User buyerToNotify = resolveBuyerUser(order);
        if (buyerToNotify != null) {
            notifyUser(buyerToNotify,
                    "Đơn hàng đã được giao",
                    "Đơn hàng \"" + order.getTitle() + "\" đã được " + sellerTeam.getName() + " giao. Vui lòng xác nhận đã nhận hàng.",
                    "ORDER_DELIVERED", null);
        }

        return toDTO(saved);
    }

    /**
     * Lifecycle step: Buyer confirms receipt.
     * Allowed transitions: DELIVERED -> COMPLETED.
     * Only the buyer (team owner or personal buyer) can call this.
     */
    @Transactional
    public InterGroupOrderDTO confirmDelivery(UUID orderId, String deliveryStatus, Integer rating, String comment, User currentUser) {
        String safeStatus = deliveryStatus != null ? deliveryStatus : "ON_TIME";
        Integer safeRating = (rating != null && rating >= 1 && rating <= 5) ? rating : null;
        if (safeRating == null) {
            throw new IllegalArgumentException("Rating is required and must be between 1 and 5");
        }
        return buyerConfirmDelivery(orderId, safeStatus, safeRating, comment, null, currentUser);
    }

    /**
     * Người mua xác nhận đã nhận hàng + đánh giá sao.
     * Trạng thái đơn: ON_TIME / LATE / NOT_DELIVERED
     * Trust score của xưởng được cập nhật theo đánh giá.
     *
     * <p><b>Bug fix (Quick Win 2):</b> Method now runs in a single transaction
     * so that trust score updates, review persistence, and order status change
     * are atomic. Previously the absence of {@code @Transactional} could leave
     * the system in an inconsistent state if the call failed halfway.
     */
    @Transactional
    public InterGroupOrderDTO buyerConfirmDelivery(UUID orderId, String deliveryStatus,
            int rating, String comment, java.util.List<String> proofImageUrls, User currentUser) {
        InterGroupOrder order = orderRepo.findById(orderId)
                .orElseThrow(() -> new RuntimeException("Order not found"));

        if (!"DELIVERED".equals(order.getStatus()) && !"SHIPPING".equals(order.getStatus())) {
            throw new RuntimeException("Chỉ đơn DELIVERED hoặc SHIPPING mới xác nhận được.");
        }

        // Verify buyer
        boolean isBuyer = (order.getBuyerTeam() != null && order.getBuyerTeam().getOwner().getId().equals(currentUser.getId()))
                || (order.getBuyerUser() != null && order.getBuyerUser().getId().equals(currentUser.getId()));
        if (!isBuyer) {
            throw new RuntimeException("Chỉ bên mua mới xác nhận được.");
        }

        if (order.getDeliveryConfirmed() != null && order.getDeliveryConfirmed()) {
            throw new RuntimeException("Đơn này đã được xác nhận trước đó.");
        }

        if (!"ON_TIME".equals(deliveryStatus) && !"LATE".equals(deliveryStatus) && !"NOT_DELIVERED".equals(deliveryStatus)) {
            throw new RuntimeException("Trạng thái giao hàng không hợp lệ.");
        }

        if ("NOT_DELIVERED".equals(deliveryStatus)) {
            throw new RuntimeException("Vui lòng mở Khiếu nại (Dispute) do không nhận được hàng.");
        }

        if (rating < 1 || rating > 5) {
            throw new RuntimeException("Đánh giá phải từ 1 đến 5 sao.");
        }

        if (proofImageUrls != null && !proofImageUrls.isEmpty()) {
            for (String url : proofImageUrls) {
                org.example.backend.entity.OrderProofImage img = org.example.backend.entity.OrderProofImage.builder()
                        .order(order)
                        .imageUrl(url)
                        .imageType("DELIVERY")
                        .capturedAt(LocalDateTime.now())
                        .uploadedByUser(currentUser)
                        .build();
                orderProofImageRepo.save(img);
            }
        }

        // Update order delivery info
        order.setDeliveryConfirmed(true);
        order.setDeliveryConfirmedAt(LocalDateTime.now());
        order.setDeliveryStatus(deliveryStatus);
        if ("SHIPPING".equals(order.getStatus())) {
            transitionTo(order, OrderStatus.DELIVERED, currentUser, "buyerConfirmDelivery:autoDeliver");
            deductOrderPackagedStockIfNeeded(order);
        }
        transitionTo(order, OrderStatus.COMPLETED, currentUser, "buyerConfirmDelivery");

        // Update seller trust stats + buyer completedOrders via TrustScoreService
        Team sellerTeam = order.getSellerTeam();
        trustScoreService.onRatingSubmitted(sellerTeam, rating, deliveryStatus);
        trustScoreService.onOrderCompleted(sellerTeam, order.getBuyerTeam(), order.getBuyerUser());

        // Save review
        org.example.backend.entity.Review review = new org.example.backend.entity.Review();
        review.setOrder(order);
        review.setBuyerTeam(order.getBuyerTeam());
        review.setBuyerUser(order.getBuyerUser());
        review.setSellerTeam(sellerTeam);
        review.setRating(rating);
        review.setComment(comment);
        review.setDeliveryResult(deliveryStatus);
        reviewRepo.save(review);

        InterGroupOrder saved = orderRepo.save(order);

        // Notify seller
        notifyUser(sellerTeam.getOwner(),
                "Người mua xác nhận giao hàng",
                "Đơn \"" + order.getTitle() + "\" đã được xác nhận: " + deliveryStatus + " | " + rating + " sao.",
                "ORDER_COMPLETED", null);

        return toDTO(saved);
    }

    @Transactional
    public void markOrdersAsViewed(List<UUID> orderIds, String role) {
        if (orderIds == null || orderIds.isEmpty()) return;
        List<InterGroupOrder> orders = orderRepo.findAllById(orderIds);
        for (InterGroupOrder order : orders) {
            if ("BUYER".equalsIgnoreCase(role)) {
                order.setBuyerViewed(true);
            } else if ("SELLER".equalsIgnoreCase(role)) {
                order.setSellerViewed(true);
            }
        }
        orderRepo.saveAll(orders);
    }

    // === Helper methods ===

    private void deductOrderPackagedStockIfNeeded(InterGroupOrder order) {
        String matSource = order.getMaterialSource();
        if (!"FACTORY_PROVIDED".equals(matSource) && !"COMBINED".equals(matSource)) {
            return;
        }
        if (order.getQuantity() == null || order.getQuantity() <= 0 || order.getSellerTeam() == null) {
            return;
        }
        String productType = order.getProductType() != null && !order.getProductType().isBlank()
                ? order.getProductType() : "Robusta";
        inventoryService.deductPackagedStock(order.getSellerTeam().getId(), productType, (double) order.getQuantity());
    }

    /** Map delivery fields from DTO to entity */
    private void mapDeliveryFields(InterGroupOrder order, InterGroupOrderDTO dto) {
        order.setContactPhone(dto.getContactPhone());
        order.setContactPhoneAlt(dto.getContactPhoneAlt());
        order.setDeliveryAddress(dto.getDeliveryAddress());
        order.setPreferredDeliveryFrom(dto.getPreferredDeliveryFrom());
        order.setPreferredDeliveryTo(dto.getPreferredDeliveryTo());
        order.setDeliveryFailureAction(dto.getDeliveryFailureAction());
        order.setDeliveryNote(dto.getDeliveryNote());
    }

    /**
     * Xưởng gửi báo giá cho RFQ.
     */
    @Transactional
    public InterGroupOrderDTO quoteOrder(UUID orderId, Double price, String note, User currentUser) {
        InterGroupOrder order = orderRepo.findById(orderId)
                .orElseThrow(() -> new RuntimeException("Order not found"));
        if (!order.getSellerTeam().getOwner().getId().equals(currentUser.getId())) {
            throw new RuntimeException("Chỉ chủ xưởng mới được báo giá.");
        }
        if (!"RFQ_CREATED".equals(order.getStatus()) && !"PENDING".equals(order.getStatus())) {
            throw new RuntimeException("Đơn hàng không ở trạng thái chờ báo giá.");
        }
        order.setQuotedPrice(price);
        order.setQuotedNote(note);
        order.setQuotedAt(LocalDateTime.now());
        transitionTo(order, OrderStatus.QUOTED, currentUser, "quoteOrder");
        order.setBuyerViewed(false);
        InterGroupOrder saved = orderRepo.save(order);

        return toDTO(saved);
    }

    @Transactional
    public InterGroupOrderDTO requoteOrder(UUID orderId, Double price, String note, User currentUser) {
        InterGroupOrder order = orderRepo.findById(orderId)
                .orElseThrow(() -> new RuntimeException("Order not found"));
        if (!order.getSellerTeam().getOwner().getId().equals(currentUser.getId())) {
            throw new RuntimeException("Chỉ chủ xưởng mới được báo giá lại.");
        }
        if (!"QUOTED".equals(order.getStatus()) && !"REJECTED".equals(order.getStatus()) && !"REQUOTED".equals(order.getStatus())) {
            throw new RuntimeException("Đơn hàng không ở trạng thái có thể báo giá lại.");
        }
        order.setQuotedPrice(price);
        order.setQuotedNote(note);
        order.setQuotedAt(LocalDateTime.now());
        transitionTo(order, OrderStatus.REQUOTED, currentUser, "requoteOrder");
        order.setBuyerViewed(false);
        InterGroupOrder saved = orderRepo.save(order);

        User buyerToNotify = resolveBuyerUser(order);
        if (buyerToNotify != null) {
            notifyUser(buyerToNotify, "Báo giá lại",
                    "Xưởng " + order.getSellerTeam().getName() + " đã cập nhật báo giá cho đơn \"" + order.getTitle() + "\".",
                    "ORDER_REQUOTED", null);
        }
        return toDTO(saved);
    }

    @Transactional
    public InterGroupOrderDTO buyerAcceptRequote(UUID orderId, User currentUser) {
        InterGroupOrder order = orderRepo.findById(orderId)
                .orElseThrow(() -> new RuntimeException("Order not found"));

        Team buyerTeam = order.getBuyerTeam();
        User buyerUser = order.getBuyerUser();

        boolean isBuyerOwner = buyerTeam != null && buyerTeam.getOwner().getId().equals(currentUser.getId());
        boolean isBuyerDirect = buyerUser != null && buyerUser.getId().equals(currentUser.getId());

        if (!isBuyerOwner && !isBuyerDirect) {
            throw new RuntimeException("Chỉ người mua mới có thể chấp nhận báo giá lại.");
        }

        if (!"REQUOTED".equals(order.getStatus())) {
            throw new RuntimeException("Đơn hàng không ở trạng thái chờ chấp nhận báo giá lại.");
        }

        transitionTo(order, OrderStatus.REQUOTE_ACCEPTED, currentUser, "buyerAcceptRequote");
        order.setSellerViewed(false);
        InterGroupOrder saved = orderRepo.save(order);

        notifyUser(order.getSellerTeam().getOwner(), "Khách hàng đã chấp nhận",
                "Khách hàng đã chấp nhận mức báo giá mới cho đơn \"" + order.getTitle() + "\". Vui lòng xác nhận chốt đơn.",
                "ORDER_REQUOTE_ACCEPTED", null);

        return toDTO(saved);
    }

    @Transactional
    public InterGroupOrderDTO buyerRejectRequote(UUID orderId, User currentUser) {
        InterGroupOrder order = orderRepo.findById(orderId)
                .orElseThrow(() -> new RuntimeException("Order not found"));

        Team buyerTeam = order.getBuyerTeam();
        User buyerUser = order.getBuyerUser();

        boolean isBuyerOwner = buyerTeam != null && buyerTeam.getOwner().getId().equals(currentUser.getId());
        boolean isBuyerDirect = buyerUser != null && buyerUser.getId().equals(currentUser.getId());

        if (!isBuyerOwner && !isBuyerDirect) {
            throw new RuntimeException("Chỉ người mua mới có thể từ chối báo giá lại.");
        }

        if (!"REQUOTED".equals(order.getStatus())) {
            throw new RuntimeException("Đơn hàng không ở trạng thái chờ từ chối báo giá lại.");
        }

        transitionTo(order, OrderStatus.CANCELED, currentUser, "buyerRejectRequote");
        order.setCancelledBy("BUYER");
        order.setSellerViewed(false);
        InterGroupOrder saved = orderRepo.save(order);

        notifyUser(order.getSellerTeam().getOwner(), "Khách hàng từ chối",
                "Khách hàng đã từ chối báo giá lại. Đơn hàng \"" + order.getTitle() + "\" đã bị hủy.",
                "ORDER_CANCELED", null);

        return toDTO(saved);
    }

    @Transactional
    public InterGroupOrderDTO sellerConfirmRequote(UUID orderId, User currentUser) {
        InterGroupOrder order = orderRepo.findById(orderId)
                .orElseThrow(() -> new RuntimeException("Order not found"));

        if (!order.getSellerTeam().getOwner().getId().equals(currentUser.getId())) {
            throw new RuntimeException("Chỉ chủ xưởng mới có thể xác nhận chốt đơn.");
        }

        if (!"REQUOTE_ACCEPTED".equals(order.getStatus())) {
            throw new RuntimeException("Đơn hàng chưa được người mua chấp nhận báo giá lại.");
        }

        transitionTo(order, OrderStatus.CONFIRMED, currentUser, "sellerConfirmRequote");
        order.setBuyerViewed(false);

        Goal autoGoal = new Goal();
        autoGoal.setTeam(order.getSellerTeam());
        autoGoal.setOwner(currentUser);
        autoGoal.setTitle("[Đơn Hàng] " + order.getTitle());
        autoGoal.setOutputTarget("SL: " + order.getQuantity() + " | " + order.getDescription());
        autoGoal.setPriority(2);
        autoGoal.setDeadline(order.getDeadline());
        autoGoal.setStatus("IN_PROGRESS");
        goalRepo.save(autoGoal);
        order.setLinkedGoalId(autoGoal.getId());

        InterGroupOrder saved = orderRepo.save(order);

        User buyerToNotify = resolveBuyerUser(order);
        if (buyerToNotify != null) {
            notifyUser(buyerToNotify, "Xưởng đã xác nhận",
                    "Xưởng " + order.getSellerTeam().getName() + " đã xác nhận chốt đơn \"" + order.getTitle() + "\".",
                    "ORDER_CONFIRMED", null);
        }

        return toDTO(saved);
    }

    /**
     * Update order status along the new marketplace flow.
     * Valid transitions are enforced by {@link OrderStateMachine}; this
     * method becomes the single mutation point for ad-hoc status flips.
     * <p>Quick Win F1.2: the previous implementation accepted any string,
     * allowing callers to skip intermediate states (e.g. CONFIRMED → DELIVERED).
     */
    @Transactional
    public InterGroupOrderDTO updateOrderStatus(UUID orderId, String newStatus, User currentUser) {
        InterGroupOrder order = orderRepo.findById(orderId)
                .orElseThrow(() -> new RuntimeException("Order not found"));

        if (!order.getSellerTeam().getOwner().getId().equals(currentUser.getId())) {
            throw new RuntimeException("Chỉ chủ xưởng mới được cập nhật trạng thái.");
        }

        OrderStatus current = OrderStatus.fromLegacy(order.getStatus());
        OrderStatus target = OrderStatus.fromLegacy(newStatus);
        transitionTo(order, target, currentUser, "updateOrderStatus");
        order.setBuyerViewed(false);

        // Auto deduct inventory when entering DELIVERED for the first time with factory-provided materials
        if (target == OrderStatus.DELIVERED && current != OrderStatus.DELIVERED) {
            order.setDeliveryConfirmed(false);
            deductOrderPackagedStockIfNeeded(order);
        }

        InterGroupOrder saved = orderRepo.save(order);

        User buyerToNotify = resolveBuyerUser(order);
        if (buyerToNotify != null) {
            String statusVi = switch (newStatus) {
                case "IN_PRODUCTION" -> "Đang sản xuất";
                case "QC" -> "Đang kiểm tra chất lượng";
                case "COMPLETED" -> "Đã hoàn thành";
                case "SHIPPING" -> "Đang giao hàng";
                case "DELIVERED" -> "Đã giao hàng";
                default -> newStatus;
            };
            notifyUser(buyerToNotify, "Cập nhật đơn hàng",
                    "Đơn \"" + order.getTitle() + "\" đã chuyển sang: " + statusVi,
                    "ORDER_STATUS_UPDATED", null);
        }
        return toDTO(saved);
    }

    /** Resolve the buyer user: either buyerUser (personal) or buyerTeam owner */
    private User resolveBuyerUser(InterGroupOrder order) {
        if (order.getBuyerUser() != null) {
            return order.getBuyerUser();
        }
        if (order.getBuyerTeam() != null) {
            return order.getBuyerTeam().getOwner();
        }
        return null;
    }

    /** Send notification, silently ignore failures */
    private void notifyUser(User user, String title, String message, String type, UUID taskId) {
        try {
            notificationService.createAndSend(user, title, message, type, taskId);
        } catch (Exception e) {
            // Don't let notification failures break order operations
            System.err.println("Failed to send notification: " + e.getMessage());
        }
    }

    public List<OrderEventLogDTO> getEventLogs(UUID orderId) {
        List<org.example.backend.entity.OrderEventLog> logs = orderEventLogRepo.findByOrderIdOrderByCreatedAtDesc(orderId);
        return logs.stream().map(log -> {
            OrderEventLogDTO dto = new OrderEventLogDTO();
            dto.setId(log.getId());
            dto.setOrderId(log.getOrder().getId());
            dto.setActorName(log.getActorUser() != null ? log.getActorUser().getFullName() : "Hệ thống");
            dto.setActorRole(log.getActorRole());
            dto.setEventType(log.getEventType());
            dto.setOldStatus(log.getOldStatus());
            dto.setNewStatus(log.getNewStatus());
            dto.setNote(log.getNote());
            dto.setMetadata(log.getMetadata());
            dto.setCreatedAt(log.getCreatedAt());
            return dto;
        }).collect(Collectors.toList());
    }
}
