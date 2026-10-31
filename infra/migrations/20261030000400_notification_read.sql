-- VELORA · D1 — in-app notification read state.
-- The in-app inbox reuses notification_logs (channel = 'in_app'); delivery status
-- (queued/sent/failed/skipped) is a different concern, so "read" gets its own column.
ALTER TABLE notification_logs ADD COLUMN read_at TEXT;
CREATE INDEX IF NOT EXISTS idx_notif_unread ON notification_logs(user_id, channel, read_at);
