-- Live-chat transcript store.
--
-- `apps/api/src/services/chat.ts` persists every customer/admin message in
-- `chat_messages`, but no migration ever created that table: the commerce schema
-- only shipped `chat_threads` (the admin index). Every call to
-- /api/account/chat therefore died with "no such table: chat_messages" → HTTP
-- 500 on the storefront help page and on the admin inbox.
--
-- The table is the transcript; `chat_threads` keeps the index (last message,
-- unread counter, open/closed) that both inboxes poll.

CREATE TABLE IF NOT EXISTS chat_messages (
  id               TEXT PRIMARY KEY,
  thread_id        TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  sender           TEXT NOT NULL CHECK (sender IN ('customer','admin')),
  sender_id        TEXT,
  sender_name      TEXT,
  body             TEXT NOT NULL,
  -- Read state is per side: the customer flags admin replies and vice versa.
  read_by_customer INTEGER NOT NULL DEFAULT 0,
  read_by_admin    INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Transcript reads are always "one thread, oldest first".
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages(thread_id, created_at);
-- Unread lookups and mark-as-read statements filter on the reader's side.
CREATE INDEX IF NOT EXISTS idx_chat_messages_unread ON chat_messages(thread_id, read_by_admin, read_by_customer);

-- Threads that already carry a `last_message` (e.g. the seeded demo conversation)
-- predate this table, so the inbox would open an empty transcript. Backfill that
-- one message for any thread that has none; the guard keeps the statement
-- idempotent and never touches a thread that already has history.
INSERT INTO chat_messages (id, thread_id, sender, sender_id, sender_name, body, read_by_customer, read_by_admin, created_at)
SELECT
  t.id || '-backfill-1',
  t.id,
  'customer',
  t.user_id,
  COALESCE(u.display_name, u.email),
  t.last_message,
  1,
  0,
  COALESCE(t.last_message_at, t.created_at)
FROM chat_threads t
JOIN users u ON u.id = t.user_id
WHERE t.last_message IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM chat_messages m WHERE m.thread_id = t.id);
