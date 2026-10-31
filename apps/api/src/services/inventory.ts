import { CHECKOUT, INVENTORY_MOVEMENT_TYPE, type InventoryMovementRow } from '@velora/shared';
import { ERROR_CODES } from '@velora/shared';
import { type Row, all, first, iso, limitOffset, num, optStr, str, toIso, value } from '../lib/db';
import { AppError, badRequest, notFound } from '../lib/errors';
import { minutesFromNow, uuid } from '../lib/ids';

/**
 * Inventory consistency.
 *
 * Overselling is prevented with CONDITIONAL updates: the stock decrement is a
 * single statement whose WHERE clause re-checks availability at write time.
 * D1 reports `changes` per statement, so a lost race is detected (0 rows
 * touched) instead of silently producing negative stock. A compensating batch
 * releases anything already reserved in the same call.
 */

export interface ReserveLine {
  variantId: string;
  quantity: number;
}

export interface ReservationResult {
  reservationIds: string[];
  movements: string[];
}

export async function reserveVariants(
  db: D1Database,
  orderId: string,
  lines: ReserveLine[],
  expiryMinutes: number = CHECKOUT.reservationExpiryMinutes,
): Promise<ReservationResult> {
  const expiresAt = minutesFromNow(expiryMinutes);
  const statements: string[] = [];
  const params: unknown[][] = [];
  const reservationIds: string[] = [];

  for (const line of lines) {
    const reservationId = uuid();
    reservationIds.push(reservationId);
    statements.push(
      `UPDATE inventory
         SET reserved_quantity = reserved_quantity + ?1, updated_at = datetime('now')
       WHERE variant_id = ?2
         AND quantity - reserved_quantity >= ?1`,
    );
    params.push([line.quantity, line.variantId]);
  }

  const prepared = statements.map((sql, i) => db.prepare(sql).bind(...params[i]));
  const results = await db.batch(prepared);

  const failed = results.map((r, i) => ({ r, i })).filter(({ r }) => num(r.meta?.changes ?? r.changes ?? 0) === 0);

  if (failed.length) {
    // Compensate: release the reservations that did succeed.
    const release = statements
      .map((sql, i) => ({ sql, i }))
      .filter(({ i }) => !failed.some((f) => f.i === i))
      .map(({ sql, i }) =>
        sql
          .replace('reserved_quantity + ', 'reserved_quantity - ')
          .replace('SET reserved_quantity - ', 'SET reserved_quantity - '),
      );
    const rollbackStatements = lines
      .map((line, i) => ({
        line,
        sql: `UPDATE inventory SET reserved_quantity = CASE WHEN reserved_quantity >= ?1 THEN reserved_quantity - ?1 ELSE 0 END, updated_at = datetime('now') WHERE variant_id = ?2`,
        params: [line.quantity, line.variantId],
      }))
      .filter((_, i) => !failed.some((f) => f.i === i));
    if (rollbackStatements.length) {
      await db.batch(rollbackStatements.map((s) => db.prepare(s.sql).bind(...s.params)));
    }
    void release;
    const firstFailed = failed[0].i;
    const detail = await first<Row>(
      db,
      `SELECT COALESCE(i.quantity,0) AS q, COALESCE(i.reserved_quantity,0) AS r, p.name, v.id
       FROM inventory i JOIN product_variants v ON v.id = i.variant_id JOIN products p ON p.id = v.product_id
       WHERE i.variant_id = ?1`,
      [lines[firstFailed].variantId],
    );
    throw new AppError(
      ERROR_CODES.OUT_OF_STOCK,
      `Stok ${optStr(detail?.name) ?? 'produk'} tidak mencukupi (tersisa ${Math.max(0, num(detail?.q) - num(detail?.r))})`,
      409,
      { variantId: lines[firstFailed].variantId, requested: lines[firstFailed].quantity },
    );
  }

  // Persist reservations + movement ledger atomically.
  const inserts: ReturnType<D1Database['prepare']>[] = [];
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const balance = await availableAndStock(db, line.variantId);
    inserts.push(
      db
        .prepare(
          `INSERT INTO stock_reservations (id, order_id, variant_id, quantity, status, expires_at, created_at, updated_at)
           VALUES (?1,?2,?3,?4,'active',?5,datetime('now'),datetime('now'))`,
        )
        .bind(reservationIds[idx], orderId, line.variantId, line.quantity, expiresAt),
      db
        .prepare(
          `INSERT INTO inventory_movements (id, variant_id, product_id, type, quantity, balance_after, reference_type, reference_id, note, created_at)
           VALUES (?1,?2,(SELECT product_id FROM product_variants WHERE id = ?2),'reserve',?3,?4,'order',?5,'Reservasi stok saat checkout',datetime('now'))`,
        )
        .bind(uuid(), line.variantId, -line.quantity, balance.available, orderId),
    );
  }
  await db.batch(inserts);
  return { reservationIds, movements: [] };
}

async function availableAndStock(db: D1Database, variantId: string) {
  const row = await first<Row>(
    db,
    `SELECT COALESCE(quantity,0) AS q, COALESCE(reserved_quantity,0) AS r FROM inventory WHERE variant_id = ?1`,
    [variantId],
  );
  const q = num(row?.q);
  const r = num(row?.r);
  return { stock: q, reserved: r, available: q - r };
}

/** Payment confirmed -> reservations become real sales. Idempotent per order. */
export async function consumeReservations(db: D1Database, orderId: string): Promise<boolean> {
  const pending = await all<Row>(
    db,
    `SELECT id, variant_id, quantity FROM stock_reservations WHERE order_id = ?1 AND status = 'active'`,
    [orderId],
  );
  if (!pending.length) {
    const already = num(
      await value<number>(
        db,
        `SELECT COUNT(*) AS c FROM stock_reservations WHERE order_id = ?1 AND status = 'consumed'`,
        [orderId],
      ),
    );
    return already > 0;
  }

  const statements = pending.flatMap((row) => [
    db
      .prepare(
        `UPDATE inventory
           SET quantity = quantity - ?1, reserved_quantity = reserved_quantity - ?1, updated_at = datetime('now')
         WHERE variant_id = ?2 AND quantity >= ?1 AND reserved_quantity >= ?1`,
      )
      .bind(num(row.quantity), str(row.variant_id)),
    db
      .prepare(`UPDATE stock_reservations SET status = 'consumed', updated_at = datetime('now') WHERE id = ?1`)
      .bind(str(row.id)),
    db
      .prepare(
        `INSERT INTO inventory_movements (id, variant_id, product_id, type, quantity, balance_after, reference_type, reference_id, note, created_at)
         VALUES (?1,?2,(SELECT product_id FROM product_variants WHERE id = ?2),'sale',?3,
                 (SELECT quantity - reserved_quantity FROM inventory WHERE variant_id = ?2),'order',?4,'Stok berkurang karena pembayaran terkonfirmasi',datetime('now'))`,
      )
      .bind(uuid(), str(row.variant_id), -num(row.quantity), orderId),
    db
      .prepare(
        `UPDATE products SET sold_count = sold_count + ?1 WHERE id = (SELECT product_id FROM product_variants WHERE id = ?2)`,
      )
      .bind(num(row.quantity), str(row.variant_id)),
  ]);
  const results = await db.batch(statements);
  const decrements = results.filter((_, i) => i % 4 === 0);
  const missed = decrements.filter((r) => num(r.meta?.changes ?? r.changes ?? 0) === 0);
  if (missed.length) {
    throw new AppError(ERROR_CODES.OUT_OF_STOCK, 'Gagal mengurangi stok saat konfirmasi pembayaran', 500, {
      order: orderId,
    });
  }
  return true;
}

/** Cancel / expire -> stock returns to the pool. Safe to call repeatedly. */
export async function releaseReservations(
  db: D1Database,
  orderId: string,
  note = 'Reservasi dilepas (pesanan dibatalkan)',
): Promise<number> {
  const active = await all<Row>(
    db,
    `SELECT id, variant_id, quantity FROM stock_reservations WHERE order_id = ?1 AND status = 'active'`,
    [orderId],
  );
  if (!active.length) return 0;
  const statements = active.flatMap((row) => [
    db
      .prepare(
        `UPDATE inventory SET reserved_quantity = CASE WHEN reserved_quantity >= ?1 THEN reserved_quantity - ?1 ELSE 0 END,
         updated_at = datetime('now') WHERE variant_id = ?2`,
      )
      .bind(num(row.quantity), str(row.variant_id)),
    db
      .prepare(
        `UPDATE stock_reservations SET status = CASE WHEN status='active' THEN 'released' ELSE status END, updated_at = datetime('now') WHERE id = ?1`,
      )
      .bind(str(row.id)),
    db
      .prepare(
        `INSERT INTO inventory_movements (id, variant_id, product_id, type, quantity, balance_after, reference_type, reference_id, note, created_at)
         VALUES (?1,?2,(SELECT product_id FROM product_variants WHERE id = ?2),'release',?3,
                 (SELECT quantity - reserved_quantity FROM inventory WHERE variant_id = ?2),'order',?4,?5,datetime('now'))`,
      )
      .bind(uuid(), str(row.variant_id), num(row.quantity), orderId, note),
  ]);
  await db.batch(statements);
  return active.length;
}

/** Refund/return of an already paid order puts units back on the shelf. */
export async function restockOrder(db: D1Database, orderId: string, note = 'Retur: stok dikembalikan'): Promise<void> {
  const items = await all<Row>(
    db,
    `SELECT variant_id, quantity FROM order_items WHERE order_id = ?1 AND variant_id IS NOT NULL`,
    [orderId],
  );
  if (!items.length) return;
  const statements = items.flatMap((row) => [
    db
      .prepare(`UPDATE inventory SET quantity = quantity + ?1, updated_at = datetime('now') WHERE variant_id = ?2`)
      .bind(num(row.quantity), str(row.variant_id)),
    db
      .prepare(
        `INSERT INTO inventory_movements (id, variant_id, product_id, type, quantity, balance_after, reference_type, reference_id, note, created_at)
         VALUES (?1,?2,(SELECT product_id FROM product_variants WHERE id = ?2),'return',?3,
                 (SELECT quantity - reserved_quantity FROM inventory WHERE variant_id = ?2),'order',?4,?5,datetime('now'))`,
      )
      .bind(uuid(), str(row.variant_id), num(row.quantity), orderId, note),
    db
      .prepare(
        `UPDATE products SET sold_count = MAX(0, sold_count - ?1) WHERE id = (SELECT product_id FROM product_variants WHERE id = ?2)`,
      )
      .bind(num(row.quantity), str(row.variant_id)),
  ]);
  await db.batch(statements);
}

/** Scheduled/manual sweep: expire stale reservations and cancel their orders. */
export async function expireStaleReservations(db: D1Database): Promise<{ orders: string[] }> {
  const stale = await all<Row>(
    db,
    `SELECT DISTINCT order_id FROM stock_reservations
     WHERE status = 'active' AND expires_at <= datetime('now') LIMIT 200`,
  );
  const orderIds = stale.map((s) => str(s.order_id));
  for (const orderId of orderIds) {
    await releaseReservations(db, orderId, 'Reservasi kedaluwarsa sebelum pembayaran');
    await db
      .prepare(
        `UPDATE orders SET status = 'cancelled', cancelled_at = datetime('now'), updated_at = datetime('now'), cancel_reason = COALESCE(cancel_reason,'Waktu pembayaran habis') WHERE id = ?1 AND status = 'pending_payment'`,
      )
      .bind(orderId)
      .run();
    await db
      .prepare(
        `UPDATE payments SET status = 'expired', updated_at = datetime('now') WHERE order_id = ?1 AND status = 'pending'`,
      )
      .bind(orderId)
      .run();
    await db
      .prepare(
        `INSERT INTO order_status_history (id, order_id, from_status, to_status, note, actor_type, created_at)
         VALUES (?1,?2,'pending_payment','cancelled','Reservasi stok kedaluwarsa','system',datetime('now'))`,
      )
      .bind(uuid(), orderId)
      .run();
  }
  return { orders: orderIds };
}

/* ---------------------------- admin operations ---------------------------- */

export async function ensureInventoryRow(db: D1Database, variantId: string, productId: string, quantity = 0) {
  await db
    .prepare(
      `INSERT INTO inventory (id, variant_id, product_id, quantity, reserved_quantity, low_stock_threshold, updated_at)
       VALUES (?1,?2,?3,?4,0,3,datetime('now')) ON CONFLICT(variant_id) DO NOTHING`,
    )
    .bind(uuid(), variantId, productId, quantity)
    .run();
}

export async function adjustStock(
  db: D1Database,
  input: {
    variantId: string;
    type: 'stock_in' | 'stock_out' | 'adjust';
    quantity: number;
    actorId: string | null;
    note?: string | null;
    lowStockThreshold?: number | null;
  },
) {
  const variant = await first<Row>(
    db,
    `SELECT v.id, v.product_id, i.quantity, i.reserved_quantity, i.id AS inv_id
     FROM product_variants v JOIN inventory i ON i.variant_id = v.id WHERE v.id = ?1`,
    [input.variantId],
  );
  if (!variant) throw notFound('Varian belum memiliki catatan inventori');

  const current = num(variant.quantity);
  const reserved = num(variant.reserved_quantity);
  let next = current;
  let delta = 0;
  if (input.type === 'stock_in') {
    delta = input.quantity;
    next = current + input.quantity;
  } else if (input.type === 'stock_out') {
    if (input.quantity > current - reserved) {
      throw badRequest(
        `Tidak bisa mengeluarkan ${input.quantity} pcs; hanya ${current - reserved} tersedia (sisanya dipesan)`,
      );
    }
    delta = -input.quantity;
    next = current - input.quantity;
  } else {
    delta = input.quantity - current;
    next = input.quantity;
  }

  const statements = [
    db
      .prepare(
        `UPDATE inventory SET quantity = ?1, low_stock_threshold = COALESCE(?2, low_stock_threshold), updated_at = datetime('now')
         WHERE id = ?3 AND quantity = ?4`,
      )
      .bind(next, input.lowStockThreshold ?? null, str(variant.inv_id), current),
    db
      .prepare(
        `INSERT INTO inventory_movements (id, variant_id, product_id, actor_id, type, quantity, balance_after, reference_type, reference_id, note, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,'admin',?4,?8,datetime('now'))`,
      )
      .bind(
        uuid(),
        input.variantId,
        str(variant.product_id),
        input.actorId,
        input.type,
        delta,
        next,
        input.note ?? null,
      ),
  ];
  const res = await db.batch(statements);
  if (num(res[0].meta?.changes ?? res[0].changes ?? 0) === 0) {
    throw new AppError(ERROR_CODES.CONFLICT, 'Stok berubah oleh proses lain, silakan coba lagi', 409);
  }
  // Keep the derived product status honest.
  await db
    .prepare(
      `UPDATE products SET status = CASE WHEN status = 'active' AND ?1 <= 0 THEN 'out_of_stock'
                WHEN status = 'out_of_stock' AND ?1 > 0 THEN 'active' ELSE status END,
              updated_at = datetime('now') WHERE id = ?2`,
    )
    .bind(next, str(variant.product_id))
    .run();

  return { before: current, after: next, delta };
}

export async function bulkSetStock(
  db: D1Database,
  items: { variantId: string; quantity: number }[],
  actorId: string | null,
  note: string | null,
) {
  let updated = 0;
  for (const item of items) {
    try {
      await adjustStock(db, {
        variantId: item.variantId,
        type: 'adjust',
        quantity: item.quantity,
        actorId,
        note,
      });
      updated++;
    } catch (e) {
      if (e instanceof AppError && e.code === ERROR_CODES.NOT_FOUND) continue;
      throw e;
    }
  }
  return { updated, total: items.length };
}

export async function listInventory(
  db: D1Database,
  opts: { q?: string; low?: boolean; page: number; pageSize: number },
): Promise<{ items: InventoryMovementRow[] | InventoryRowLite[]; total: number }> {
  const clauses: string[] = ['1=1'];
  const params: unknown[] = [];
  if (opts.q) {
    clauses.push('(p.name LIKE ?1 OR v.sku LIKE ?1)');
    params.push(`%${opts.q}%`);
  }
  const lowFilter = opts.low ? 'AND i.quantity - i.reserved_quantity <= i.low_stock_threshold' : '';
  const whereSql = clauses.join(' AND ');

  const total = num(
    await value<number>(
      db,
      `SELECT COUNT(*) AS c FROM inventory i
       JOIN product_variants v ON v.id = i.variant_id
       JOIN products p ON p.id = i.product_id
       JOIN colors co ON co.id = v.color_id
       JOIN sizes si ON si.id = v.size_id
       WHERE ${whereSql} ${lowFilter}`,
      params,
    ),
  );
  const rowsFound = await all<Row>(
    db,
    `SELECT i.*, v.sku, v.status, p.name AS product_name, p.slug AS product_slug,
            co.name AS color_name, si.code AS size_code
     FROM inventory i
     JOIN product_variants v ON v.id = i.variant_id
     JOIN products p ON p.id = i.product_id
     JOIN colors co ON co.id = v.color_id
     JOIN sizes si ON si.id = v.size_id
     WHERE ${whereSql} ${lowFilter}
     ORDER BY (i.quantity - i.reserved_quantity) ASC, p.name ASC
     ${limitOffset(opts.pageSize, (opts.page - 1) * opts.pageSize)}`,
    params,
  );
  return {
    items: rowsFound.map((r) => ({
      variantId: str(r.variant_id),
      productId: str(r.product_id),
      productName: str(r.product_name),
      productSlug: str(r.product_slug),
      sku: str(r.sku),
      color: str(r.color_name),
      size: str(r.size_code),
      quantity: num(r.quantity),
      reserved: num(r.reserved_quantity),
      available: num(r.quantity) - num(r.reserved_quantity),
      lowStockThreshold: num(r.low_stock_threshold),
      status: r.status === 'inactive' ? ('inactive' as const) : ('active' as const),
    })),
    total,
  };
}

export interface InventoryRowLite {
  variantId: string;
  productId: string;
  productName: string;
  productSlug: string;
  sku: string;
  color: string;
  size: string;
  quantity: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
  status: 'active' | 'inactive';
}

export async function inventoryMovements(
  db: D1Database,
  opts: { variantId?: string; productId?: string; type?: string; page: number; pageSize: number },
) {
  const clauses: string[] = ['1=1'];
  const params: unknown[] = [];
  if (opts.variantId) {
    clauses.push(`m.variant_id = ?${params.length + 1}`);
    params.push(opts.variantId);
  }
  if (opts.productId) {
    clauses.push(`m.product_id = ?${params.length + 1}`);
    params.push(opts.productId);
  }
  if (opts.type && (Object.values(INVENTORY_MOVEMENT_TYPE) as string[]).includes(opts.type)) {
    clauses.push(`m.type = ?${params.length + 1}`);
    params.push(opts.type);
  }
  const whereSql = clauses.join(' AND ');
  const total = num(
    await value<number>(db, `SELECT COUNT(*) AS c FROM inventory_movements m WHERE ${whereSql}`, params),
  );
  const items = await all<Row>(
    db,
    `SELECT m.*, p.name AS product_name, v.sku, u.display_name AS actor_name
     FROM inventory_movements m
     JOIN products p ON p.id = m.product_id
     JOIN product_variants v ON v.id = m.variant_id
     LEFT JOIN users u ON u.id = m.actor_id
     WHERE ${whereSql} ORDER BY m.created_at DESC ${limitOffset(opts.pageSize, (opts.page - 1) * opts.pageSize)}`,
    params,
  );
  return {
    items: items.map<InventoryMovementRow>((r) => ({
      id: str(r.id),
      variantId: str(r.variant_id),
      productName: str(r.product_name),
      sku: str(r.sku),
      type: str(r.type) as InventoryMovementRow['type'],
      quantity: num(r.quantity),
      balanceAfter: num(r.balance_after),
      referenceType: optStr(r.reference_type),
      referenceId: optStr(r.reference_id),
      note: optStr(r.note),
      actorName: optStr(r.actor_name),
      createdAt: toIso(r.created_at) ?? '',
    })),
    total,
  };
}

export async function lowStockCount(db: D1Database): Promise<number> {
  return num(
    await value<number>(
      db,
      `SELECT COUNT(*) AS c FROM inventory i JOIN product_variants v ON v.id = i.variant_id
       WHERE v.status = 'active' AND i.quantity - i.reserved_quantity <= i.low_stock_threshold`,
    ),
  );
}

export async function reservationSnapshot(db: D1Database, orderId: string) {
  const rowsFound = await all<Row>(
    db,
    `SELECT sr.*, v.sku FROM stock_reservations sr JOIN product_variants v ON v.id = sr.variant_id WHERE sr.order_id = ?1`,
    [orderId],
  );
  return rowsFound.map((r) => ({
    id: str(r.id),
    variantId: str(r.variant_id),
    sku: str(r.sku),
    quantity: num(r.quantity),
    status: str(r.status),
    expiresAt: toIso(r.expires_at),
    updatedAt: toIso(r.updated_at) ?? iso(new Date()),
  }));
}
