import { ORDER_STATUS, type ReportRow } from '@velora/shared';
import { type Row, all, first, num, str } from '../lib/db';
import { badRequest } from '../lib/errors';

/**
 * Reporting + CSV export.
 *
 * Every report is one parameterised SQL query; revenue always counts the same
 * status set the dashboard uses, so two screens can never disagree.
 */

const REVENUE_STATUSES = [
  ORDER_STATUS.PAID,
  ORDER_STATUS.PROCESSING,
  ORDER_STATUS.SHIPPED,
  ORDER_STATUS.DELIVERED,
  ORDER_STATUS.COMPLETED,
];

export type ReportKind =
  | 'sales_by_day'
  | 'sales_by_product'
  | 'sales_by_category'
  | 'sales_by_payment'
  | 'orders'
  | 'customers'
  | 'inventory';

export const REPORT_KINDS: ReportKind[] = [
  'sales_by_day',
  'sales_by_product',
  'sales_by_category',
  'sales_by_payment',
  'orders',
  'customers',
  'inventory',
];

export interface ReportRange {
  from: string;
  to: string;
}

/** Both bounds are `YYYY-MM-DD`; the upper bound is inclusive of the whole day. */
function dateCondition(
  column: string,
  range: ReportRange | null,
  params: unknown[],
  startIndex = params.length + 1,
): string {
  if (!range) return '';
  const parts: string[] = [];
  if (range.from) {
    parts.push(`${column} >= ?${params.length + startIndex}`);
    params.push(`${range.from} 00:00:00`);
  }
  if (range.to) {
    parts.push(`${column} <= ?${params.length + startIndex}`);
    params.push(`${range.to} 23:59:59`);
  }
  return parts.length ? `AND ${parts.join(' AND ')}` : '';
}

export async function reportRows(db: D1Database, kind: ReportKind, range: ReportRange | null): Promise<ReportRow[]> {
  const params: unknown[] = [...REVENUE_STATUSES];
  const between = dateCondition('o.created_at', range, params);

  switch (kind) {
    case 'sales_by_day':
      return mapRows(
        await all<Row>(
          db,
          `SELECT substr(o.created_at,1,10) AS tanggal,
                  COUNT(*) AS jumlah_pesanan,
                  SUM(o.subtotal) AS subtotal,
                  SUM(o.discount_total) AS diskon,
                  SUM(o.shipping_fee) AS ongkir,
                  SUM(o.tax_amount) AS pajak,
                  SUM(o.grand_total) AS pendapatan
           FROM orders o
           WHERE o.status IN (${REVENUE_STATUSES.map(() => '?').join(',')}) ${between}
           GROUP BY tanggal ORDER BY tanggal DESC`,
          params,
        ),
      );
    case 'sales_by_product':
      return mapRows(
        await all<Row>(
          db,
          `SELECT p.name AS produk, p.sku, p.slug,
                  SUM(oi.quantity) AS terjual,
                  SUM(oi.quantity * oi.unit_price) AS pendapatan,
                  COUNT(DISTINCT o.id) AS jumlah_pesanan
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           JOIN products p ON p.id = oi.product_id
           WHERE o.status IN (${REVENUE_STATUSES.map(() => '?').join(',')}) ${between}
           GROUP BY p.id ORDER BY pendapatan DESC LIMIT 300`,
          params,
        ),
      );
    case 'sales_by_category':
      return mapRows(
        await all<Row>(
          db,
          `SELECT COALESCE(c.name,'Tanpa kategori') AS kategori,
                  SUM(oi.quantity) AS terjual,
                  SUM(oi.quantity * oi.unit_price) AS pendapatan
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           LEFT JOIN products p ON p.id = oi.product_id
           LEFT JOIN categories c ON c.id = p.primary_category_id
           WHERE o.status IN (${REVENUE_STATUSES.map(() => '?').join(',')}) ${between}
           GROUP BY c.name ORDER BY pendapatan DESC`,
          params,
        ),
      );
    case 'sales_by_payment':
      return mapRows(
        await all<Row>(
          db,
          `SELECT COALESCE(pay.channel_code,'Belum diketahui') AS metode, COALESCE(pay.method,'-') AS nama_metode,
                  COUNT(*) AS jumlah, SUM(o.grand_total) AS pendapatan
           FROM payments pay JOIN orders o ON o.id = pay.order_id
           WHERE pay.status = 'paid' AND o.status IN (${REVENUE_STATUSES.map(() => '?').join(',')}) ${between}
           GROUP BY pay.channel_code, pay.method ORDER BY pendapatan DESC`,
          params,
        ),
      );
    case 'orders': {
      // Order export covers every status, so only the date bounds are bound.
      const orderParams: unknown[] = [];
      const rangeSql = dateCondition('o.created_at', range, orderParams, 1);
      return mapRows(
        await all<Row>(
          db,
          `SELECT o.code AS kode_pesanan, o.status, u.email AS pelanggan, o.ship_recipient_name AS penerima,
                  o.ship_city AS kota, o.subtotal, o.discount_total AS diskon, o.shipping_fee AS ongkir,
                  o.payment_fee AS biaya_admin, o.tax_amount AS pajak, o.grand_total AS total,
                  COALESCE(o.coupon_code,'') AS kupon, COALESCE(o.payment_method,'') AS metode,
                  o.created_at AS dibuat_pada, COALESCE(o.paid_at,'') AS dibayar_pada,
                  COALESCE(o.shipped_at,'') AS dikirim_pada, COALESCE(o.delivered_at,'') AS diterima_pada
           FROM orders o JOIN users u ON u.id = o.user_id
           WHERE 1=1 ${rangeSql}
           ORDER BY o.created_at DESC LIMIT 5000`,
          orderParams,
        ),
      );
    }
    case 'customers':
      return mapRows(
        await all<Row>(
          db,
          `SELECT u.email, COALESCE(pr.display_name,'') AS nama, COALESCE(u.phone,'') AS telepon, u.status,
                  (SELECT COUNT(*) FROM orders o2 WHERE o2.user_id = u.id) AS jumlah_pesanan,
                  (SELECT COALESCE(SUM(o3.grand_total),0) FROM orders o3 WHERE o3.user_id = u.id AND o3.status IN (${REVENUE_STATUSES.map(() => '?').join(',')})) AS total_belanja,
                  u.created_at AS daftar_pada
           FROM users u LEFT JOIN user_profiles pr ON pr.user_id = u.id
           ORDER BY total_belanja DESC LIMIT 5000`,
          REVENUE_STATUSES,
        ),
      );
    case 'inventory':
      return mapRows(
        await all<Row>(
          db,
          `SELECT p.name AS produk, p.slug, v.sku AS kode_varian, c.name AS warna, s.code AS ukuran,
                  i.quantity AS stok, i.reserved_quantity AS dipesan,
                  i.quantity - i.reserved_quantity AS tersedia, i.low_stock_threshold AS ambang_stok_kritis
           FROM inventory i
           JOIN product_variants v ON v.id = i.variant_id
           JOIN products p ON p.id = i.product_id
           JOIN colors c ON c.id = v.color_id
           JOIN sizes s ON s.id = v.size_id
           ORDER BY tersedia ASC, p.name ASC LIMIT 5000`,
        ),
      );
    default:
      throw badRequest('Jenis laporan tidak dikenal');
  }
}

function mapRows(rows: Row[]): ReportRow[] {
  return rows.map((r) => {
    const out: ReportRow = {};
    for (const [key, val] of Object.entries(r)) {
      out[key] = val === null || val === undefined ? null : typeof val === 'number' ? val : String(val);
    }
    return out;
  });
}

/**
 * CSV with a UTF-8 BOM (Excel in Indonesia opens comma files with semicolons,
 * but the BOM is what keeps Rupiah text readable). Values are escaped, never
 * interpolated, so a product name cannot inject a formula.
 */
export function toCsv(rows: ReportRow[], columns?: string[]): string {
  if (!rows.length) return '';
  const headers = columns ?? Object.keys(rows[0]);
  const csvCell = (v: string | number | null): string => {
    if (v === null) return '';
    const s = String(v);
    // Neutralise spreadsheet formula injection.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(headers.map((h) => csvCell(row[h] ?? null)).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/** Filename hint for the Content-Disposition header. */
export function reportFilename(kind: ReportKind, range: ReportRange | null): string {
  const stamp = range?.from ? `-${range.from}${range.to ? `_sd_${range.to}` : ''}` : '';
  return `velora-${kind.replace(/_/g, '-')}${stamp}.csv`;
}

export async function salesSummary(db: D1Database, range: ReportRange | null) {
  const params: unknown[] = [...REVENUE_STATUSES];
  const between = dateCondition('o.created_at', range, params);
  const row = await all<Row>(
    db,
    `SELECT COUNT(*) AS orders, COALESCE(SUM(o.grand_total),0) AS revenue,
            COALESCE(AVG(o.grand_total),0) AS avg_order_value,
            COALESCE(SUM(o.discount_total),0) AS discounts,
            COALESCE(SUM(o.shipping_fee),0) AS shipping,
            COALESCE(SUM(o.tax_amount),0) AS tax
     FROM orders o WHERE o.status IN (${REVENUE_STATUSES.map(() => '?').join(',')}) ${between}`,
    params,
  );
  const r = row[0] ?? {};
  return {
    orders: num(r.orders),
    revenue: num(r.revenue),
    avgOrderValue: Math.round(num(r.avg_order_value)),
    discounts: num(r.discounts),
    shipping: num(r.shipping),
    tax: num(r.tax),
    from: range?.from ?? null,
    to: range?.to ?? null,
    generatedAt: new Date().toISOString(),
    excludedCancelled: true,
    cancelledCount: await countCancelled(db, range),
  };
}

async function countCancelled(db: D1Database, range: ReportRange | null): Promise<number> {
  const params: unknown[] = [ORDER_STATUS.CANCELLED, ORDER_STATUS.REFUNDED];
  // Revenue statuses occupy ?1..?5, so the date bounds continue from ?6.
  const rangeSql = dateCondition('o.created_at', range, params, 1);
  const row = await first<Row>(
    db,
    `SELECT COUNT(*) AS n FROM orders o WHERE o.status = ?1 OR o.status = ?2 ${rangeSql}`,
    params,
  );
  return num(row?.n);
}

export function assertRange(from?: string | null, to?: string | null): ReportRange | null {
  if (!from && !to) return null;
  const valid = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
  if ((from && !valid(from)) || (to && !valid(to))) throw badRequest('Format tanggal laporan harus YYYY-MM-DD');
  if (from && to && from > to) throw badRequest('Tanggal awal tidak boleh lewat tanggal akhir');
  return { from: from ?? '', to: to ?? '' };
}
