-- V7: Production Performance Composite Indexes
-- Accelerates Inter-Group Marketplace Queries, Order Tracking, Inventory, and User Lookups

-- 1. Inter-Group Orders lookup by buyer/seller and status
CREATE INDEX IF NOT EXISTS idx_orders_buyer_status ON inter_group_orders(buyer_team_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_seller_status ON inter_group_orders(seller_team_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON inter_group_orders(created_at DESC);

-- 2. Inventory lookup by team and product state
CREATE INDEX IF NOT EXISTS idx_inventory_team_state ON inventory_items(team_id, product_state);

-- 3. Production Orders and Batches tracking
CREATE INDEX IF NOT EXISTS idx_production_orders_team ON production_orders(team_id, status);
CREATE INDEX IF NOT EXISTS idx_production_batches_order ON production_batches(order_id);

-- 4. Notifications lookup by user and read state
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read, created_at DESC);

-- 5. Chat messages by team / conversation
CREATE INDEX IF NOT EXISTS idx_chat_messages_team ON chat_messages(team_id, created_at DESC);
