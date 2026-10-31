import { type ChatThreadSummary, RTDB } from '@velora/shared';
import { type Row, all, bool, count, first, limitOffset, num, optStr, paginate, str, toIso } from '../lib/db';
import { conflict, notFound } from '../lib/errors';
import { uuid } from '../lib/ids';
import type { UserRecord } from './identity';

/**
 * Live chat.
 *
 * Both UIs poll the REST API on a short interval, so D1 is the message store:
 * `chat_messages` holds the transcript and `chat_threads` the index the admin
 * needs (who is talking, last message, unread counter, open/closed). Keeping the
 * conversation in D1 removes the Firebase Realtime Database dependency, whose
 * rules rejected the Worker's service-account token.
 *
 * `chat_threads` has UNIQUE(user_id, status): one thread per customer, reused
 * when the conversation is reopened, so ids stay stable.
 */

export interface ChatMessage {
  id: string;
  sender: 'customer' | 'admin';
  senderId: string | null;
  senderName: string | null;
  body: string;
  createdAt: string;
  readByOther: boolean;
}

async function getOrCreateThread(db: D1Database, user: UserRecord): Promise<Row> {
  const existing = await first<Row>(
    db,
    `SELECT * FROM chat_threads WHERE user_id = ?1 ORDER BY updated_at DESC LIMIT 1`,
    [user.id],
  );
  if (existing) {
    if (str(existing.status) !== 'open') {
      await db
        .prepare(`UPDATE chat_threads SET status = 'open', updated_at = datetime('now') WHERE id = ?1`)
        .bind(str(existing.id))
        .run();
    }
    return (await first<Row>(db, `SELECT * FROM chat_threads WHERE id = ?1`, [str(existing.id)]))!;
  }
  const id = uuid();
  await db
    .prepare(
      `INSERT INTO chat_threads (id, user_id, rtdb_path, status, subject, unread_for_admin, created_at, updated_at)
       VALUES (?1,?2,?3,'open',?4,0,datetime('now'),datetime('now'))`,
    )
    .bind(id, user.id, RTDB.messages(id), `${user.displayName ?? user.email} — konsultasi`)
    .run();
  const row = await first<Row>(db, `SELECT * FROM chat_threads WHERE id = ?1`, [id]);
  if (!row) throw notFound('Sesi chat tidak dapat dibuat');
  return row;
}

/* ------------------------------- public API ------------------------------- */

export interface ThreadView {
  chatId: string;
  open: boolean;
  subject: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  rtdbPath: string;
  realtimeConfigured: boolean;
  messages: ChatMessage[];
}

export async function customerThread(db: D1Database, user: UserRecord): Promise<ThreadView> {
  const row = await getOrCreateThread(db, user);
  return {
    chatId: str(row.id),
    open: str(row.status) === 'open',
    subject: optStr(row.subject),
    lastMessage: optStr(row.last_message),
    lastMessageAt: toIso(row.last_message_at),
    rtdbPath: str(row.rtdb_path),
    // The transcript lives in D1, so the composer is available whenever a thread
    // exists and the customer is signed in.
    realtimeConfigured: true,
    messages: await readMessages(db, str(row.id)),
  };
}

/** Transcript ordered oldest first; `readByOther` flips with the reader's side. */
export async function readMessages(db: D1Database, chatId: string): Promise<ChatMessage[]> {
  const rows = await all<Row>(db, `SELECT * FROM chat_messages WHERE thread_id = ?1 ORDER BY created_at ASC, id ASC`, [
    chatId,
  ]);
  return rows.map((r) => {
    const sender = str(r.sender) === 'admin' ? 'admin' : 'customer';
    return {
      id: str(r.id),
      sender,
      senderId: optStr(r.sender_id),
      senderName: optStr(r.sender_name),
      body: str(r.body),
      createdAt: toIso(r.created_at) ?? '',
      readByOther: sender === 'customer' ? bool(r.read_by_admin) : bool(r.read_by_customer),
    };
  });
}

export async function postMessage(
  db: D1Database,
  args: {
    threadId: string;
    userId: string | null;
    sender: 'customer' | 'admin';
    senderName: string | null;
    body: string;
  },
): Promise<ChatMessage> {
  const thread = await first<Row>(db, `SELECT * FROM chat_threads WHERE id = ?1`, [args.threadId]);
  if (!thread) throw notFound('Sesi chat tidak ditemukan');
  if (args.sender === 'customer' && str(thread.user_id) !== args.userId) {
    throw conflict('Sesi chat bukan milik Anda');
  }
  if (str(thread.status) === 'closed' && args.sender === 'customer') {
    // Reopening is an explicit action, so a closed thread refuses new messages.
    throw conflict('Sesi chat sudah ditutup. Silakan buka sesi baru.');
  }
  const body = args.body.trim().slice(0, 2000);
  if (!body) throw conflict('Pesan tidak boleh kosong');

  const message: ChatMessage = {
    id: uuid(),
    sender: args.sender,
    senderId: args.userId,
    senderName: args.senderName,
    body,
    createdAt: new Date().toISOString(),
    readByOther: false,
  };
  // One batch keeps the transcript and the admin index in sync.
  await db.batch([
    db
      .prepare(
        `INSERT INTO chat_messages
           (id, thread_id, sender, sender_id, sender_name, body, read_by_customer, read_by_admin, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,datetime('now'))`,
      )
      .bind(
        message.id,
        args.threadId,
        message.sender,
        message.senderId,
        message.senderName,
        message.body,
        // The author has obviously read their own message.
        message.sender === 'customer' ? 1 : 0,
        message.sender === 'admin' ? 1 : 0,
      ),
    db
      .prepare(
        `UPDATE chat_threads
           SET last_message = ?1, last_message_at = datetime('now'), updated_at = datetime('now'),
               unread_for_admin = unread_for_admin + ?2
         WHERE id = ?3`,
      )
      .bind(body.slice(0, 300), args.sender === 'customer' ? 1 : 0, args.threadId),
  ]);
  return message;
}

export async function startCustomerChat(db: D1Database, user: UserRecord, body: string): Promise<ThreadView> {
  const thread = await getOrCreateThread(db, user);
  const chatId = str(thread.id);
  // This route is the composer, so *every* send has to append a message — not
  // only the first one in a fresh thread. Thread lookup/creation happens above,
  // so a brand-new customer still gets a thread before the message lands.
  const text = body.trim();
  if (text) {
    await postMessage(db, {
      threadId: chatId,
      userId: user.id,
      sender: 'customer',
      senderName: user.displayName ?? user.email,
      body: text,
    });
  }
  return customerThread(db, user);
}

/**
 * Reads are per side: the customer marks admin replies as read, the admin marks
 * customer messages as read and clears the unread counter.
 */
export async function markThreadRead(db: D1Database, chatId: string, viewer: 'customer' | 'admin'): Promise<void> {
  const statements =
    viewer === 'customer'
      ? [
          db
            .prepare(`UPDATE chat_messages SET read_by_customer = 1 WHERE thread_id = ?1 AND sender = 'admin'`)
            .bind(chatId),
        ]
      : [
          db
            .prepare(`UPDATE chat_messages SET read_by_admin = 1 WHERE thread_id = ?1 AND sender = 'customer'`)
            .bind(chatId),
          db
            .prepare(`UPDATE chat_threads SET unread_for_admin = 0, updated_at = datetime('now') WHERE id = ?1`)
            .bind(chatId),
        ];
  await db.batch(statements);
}

export async function setThreadStatus(db: D1Database, chatId: string, status: 'open' | 'closed'): Promise<void> {
  const row = await first<Row>(db, `SELECT id FROM chat_threads WHERE id = ?1`, [chatId]);
  if (!row) throw notFound('Sesi chat tidak ditemukan');
  await db
    .prepare(`UPDATE chat_threads SET status = ?1, updated_at = datetime('now') WHERE id = ?2`)
    .bind(status, chatId)
    .run();
}

/* -------------------------------- admin side ------------------------------- */

export async function adminThreads(
  db: D1Database,
  opts: { q?: string; status?: 'open' | 'closed'; page: number; pageSize: number },
): Promise<ReturnType<typeof paginate<ChatThreadSummary>>> {
  const clauses = ['1=1'];
  const params: unknown[] = [];
  if (opts.status) {
    clauses.push(`t.status = ?${params.length + 1}`);
    params.push(opts.status);
  }
  if (opts.q) {
    clauses.push(
      `(t.subject LIKE ?${params.length + 1} OR u.email LIKE ?${params.length + 2} OR u.display_name LIKE ?${params.length + 3})`,
    );
    const like = `%${opts.q.replace(/[^\w\s.@\-]/g, '')}%`;
    params.push(like, like, like);
  }
  const whereSql = `WHERE ${clauses.join(' AND ')}`;
  const total = await count(
    db,
    `SELECT COUNT(*) AS n FROM chat_threads t JOIN users u ON u.id = t.user_id ${whereSql}`,
    params,
  );
  const rows = await all<Row>(
    db,
    `SELECT t.*, u.email, u.display_name
     FROM chat_threads t JOIN users u ON u.id = t.user_id
     ${whereSql}
     ORDER BY t.unread_for_admin DESC, COALESCE(t.last_message_at, t.created_at) DESC
     ${limitOffset(opts.pageSize, (opts.page - 1) * opts.pageSize)}`,
    params,
  );
  return paginate(
    rows.map<ChatThreadSummary>((r) => ({
      chatId: str(r.id),
      userId: str(r.user_id),
      customerName: optStr(r.display_name),
      customerEmail: str(r.email),
      lastMessage: optStr(r.last_message),
      lastMessageAt: toIso(r.last_message_at),
      unreadForAdmin: num(r.unread_for_admin),
      open: str(r.status) === 'open',
    })),
    total,
    opts.page,
    opts.pageSize,
  );
}

export async function adminThreadDetail(
  db: D1Database,
  chatId: string,
): Promise<{ thread: ChatThreadSummary; messages: ChatMessage[] }> {
  // Opening the thread is what "read" means for the inbox.
  await markThreadRead(db, chatId, 'admin');
  const r = await first<Row>(
    db,
    `SELECT t.*, u.email, u.display_name FROM chat_threads t JOIN users u ON u.id = t.user_id WHERE t.id = ?1`,
    [chatId],
  );
  if (!r) throw notFound('Sesi chat tidak ditemukan');
  const thread: ChatThreadSummary = {
    chatId: str(r.id),
    userId: str(r.user_id),
    customerName: optStr(r.display_name),
    customerEmail: str(r.email),
    lastMessage: optStr(r.last_message),
    lastMessageAt: toIso(r.last_message_at),
    unreadForAdmin: num(r.unread_for_admin),
    open: str(r.status) === 'open',
  };
  return { thread, messages: await readMessages(db, chatId) };
}

export async function unreadChatCount(db: D1Database): Promise<number> {
  return count(db, `SELECT COUNT(*) AS n FROM chat_threads WHERE status = 'open' AND unread_for_admin > 0`);
}
