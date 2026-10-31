import { type OrderStatus, type PaymentStatus, formatRupiah } from '@velora/shared';

export const rupiah = (value: number | null | undefined): string => formatRupiah(value ?? 0);

export function dateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

export function dateOnly(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('id-ID', { dateStyle: 'medium' });
}

/** Countdown target for a pending payment window (UTC D1 timestamp). */
export function parseDate(value: string | null | undefined): number {
  if (!value) return 0;
  const d = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: 'Menunggu pembayaran',
  paid: 'Dibayar',
  processing: 'Diproses',
  shipped: 'Dikirim',
  delivered: 'Tiba di tujuan',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
  refunded: 'Dana dikembalikan',
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: 'Menunggu',
  paid: 'Lunas',
  failed: 'Gagal',
  expired: 'Kadaluarsa',
  refunded: 'Refund',
};

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

const ORDER_STATUS_TONE: Record<OrderStatus, Tone> = {
  pending_payment: 'warning',
  paid: 'accent',
  processing: 'accent',
  shipped: 'accent',
  delivered: 'success',
  completed: 'success',
  cancelled: 'neutral',
  refunded: 'neutral',
};

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-soft text-muted border-line',
  accent: 'bg-accent-ink text-accent border-accent/30',
  success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  danger: 'bg-red-50 text-red-800 border-red-200',
};

export function statusChip(status: OrderStatus): { label: string; className: string } {
  return {
    label: ORDER_STATUS_LABEL[status] ?? status,
    className: TONE_CLASS[ORDER_STATUS_TONE[status] ?? 'neutral'],
  };
}
