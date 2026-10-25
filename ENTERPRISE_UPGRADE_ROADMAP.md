# KẾ HOẠCH NÂNG CẤP KIẾN TRÚC DOANH NGHIỆP LỚN CHO NỀN TẢNG COFFEE-ORCA
*(Enterprise Software Upgrade & Production-Readiness Blueprint)*

---

## I. TỔNG QUAN HỆ THỐNG HIỆN TẠI
- **Mã nguồn**: Monorepo tại `nhutruong47/coffee-orca`.
- **Backend**: Java 21, Spring Boot 3.4.1, Spring Security, Hibernate 6.6, PayOS, VNPAY, PostgreSQL (Neon/Render).
- **Frontend**: React 19, TypeScript, Vite, Canvas 3D Space & Coffee Portal Experience.
- **AI Engine**: Python 3.11, FastAPI, Google Gemini 3.5 Flash (`ai-service`).
- **Tình trạng kiểm thử**: **137/137 tests PASS (100%)**, Frontend build 0 lỗi.

---

## II. 5 TRỤ CỘT NÂNG CẤP CHUẨN DOANH NGHIỆP LỚN (TIÊU CHUẨN ENTERPRISE)

### TRỤ CỘT 1: BẢO MẬT & QUẢN TRỊ DỮ LIỆU SẢN XUẤT (DATA & SECURITY GOVERNANCE)
1. **Kiểm soát DDL & Flyway Strict Migration**:
   - Vô hiệu hóa hoàn toàn cơ chế Hibernate `ddl-auto=update` trên môi trường thật. Mọi thay đổi bảng phải thông qua Flyway versioned migrations (`V1` -> `V7`).
   - Bật `spring.flyway.enabled=true` và `spring.flyway.baseline-on-migrate=true` trên production.
2. **Cách ly Seed/Mock Runners**:
   - Gắn `@Profile({"dev", "local", "qa"})` cho các tiến trình `DataFixerRunner` để ngăn chặn việc ghi đè tên người dùng thật khi triển khai production.
3. **Quản lý Secrets & Token Rotation**:
   - Triệt tiêu hoàn toàn secret fallback trong file cấu hình. Cưỡng chế các biến `JWT_SECRET`, `PAYOS_API_KEY`, `GEMINI_API_KEY` phải nạp từ Secret Manager của Render/AWS/Vault.
   - Bổ sung cơ chế Refresh Token Rotation (RTR) với thời hạn ngắn (Access Token: 15-30 phút, Refresh Token: 7 ngày) và danh sách thu hồi (Token Revocation/Blacklist) trên Redis.

### TRỤ CỘT 2: TỐI ƯU HÓA HIỆU NĂNG DATABASE & TRUY VẤN (QUERY OPTIMIZATION & INDEXING)
1. **Bộ Composite Covering Indexes (V7 Migration)**:
   - Đánh chỉ mục hiệu năng cao cho các bảng có tần suất truy vấn lớn:
     * `inter_group_orders`: `(buyer_team_id, status)`, `(seller_team_id, status)`, `(created_at DESC)` phục vụ phân trang sàn giao dịch gia công.
     * `inventory_items`: `(team_id, product_state)` phục vụ quản lý tồn kho cà phê nhân và thành phẩm.
     * `notifications` & `chat_messages`: `(user_id, is_read, created_at DESC)` tăng tốc đọc thông báo chưa xem dưới 1ms.
2. **Connection Pooling & Read-Replica**:
   - Tinh chỉnh HikariCP: cấu hình `minimum-idle=10`, `maximum-pool-size=30`, `connection-timeout=20000ms`, `prepareThreshold=0` (tương thích pgBouncer của Neon.tech).
   - Tách luồng Read/Write (Master-Replica) cho các tác vụ thống kê xưởng và xuất báo cáo Excel nặng.

### TRỤ CỘT 3: KHẢ NĂNG CHỊU TẢI & GIAO DỊCH BẤT ĐỒNG BỘ (ASYNC & OUTBOX ARCHITECTURE)
1. **Transactional Outbox Pattern cho Đơn hàng & Thông báo**:
   - Khi một xưởng nhận đơn gia công hoặc xác nhận giao hàng, sự kiện gửi tin nhắn/WebSocket/Email được ghi vào bảng `outbox_events` trong cùng một transaction ACID. Tiến trình nền (Worker) sẽ đảm bảo phân phối tin cậy 100% kể cả khi mạng bên ngoài gặp sự cố.
2. **Distributed Caching với Redis**:
   - Cache các thông tin ít biến động: danh mục sản phẩm sàn giao dịch (`Marketplace`), bảng giá gia công, hồ sơ xưởng (`Team Profile`), quyền hạn (`Roles & Permissions`).
   - Giảm tải tới 80% truy vấn trực tiếp vào PostgreSQL.

### TRỤ CỘT 4: GIÁM SÁT TOÀN DIỆN (OBSERVABILITY & SRE)
1. **Spring Boot Actuator & Prometheus/Grafana**:
   - Mở các metrics theo chuẩn OpenTelemetry: RPS (Request Per Second), độ trễ p95/p99, tỷ lệ lỗi HTTP 5xx, số lượng kết nối HikariCP đang dùng.
2. **Structured Logging & Correlation ID**:
   - Gắn `traceId` / `correlationId` xuyên suốt từ Frontend Request -> Spring Boot Backend -> FastAPI AI Service. Cho phép truy vết nguồn gốc lỗi của bất kỳ giao dịch nào chỉ qua 1 mã định danh duy nhất.
3. **Uptime & Health Checks**:
   - Cấu hình Cron ping endpoint `/actuator/health` định kỳ 5 phút một lần để giữ instance luôn nóng (chống sleep trên gói miễn phí của Render).

### TRỤ CỘT 5: TÍCH HỢP & PHÁT HÀNH LIÊN TỤC (CI/CD PIPELINE AUTOMATION)
1. **Tự động hóa Monorepo Build**:
   - Đồng bộ `render.yaml` tự động nhận diện thay đổi từng thư mục (`rootDir: frontend`, `rootDir: ai-service`, root `Dockerfile`).
2. **Vercel Edge CDN Deployment**:
   - Trỏ Vercel Root Directory về `frontend/`, kích hoạt gzip/brotli và HTTP/2 Edge caching cho toàn bộ asset hình ảnh/video của trải nghiệm không gian 3D.
