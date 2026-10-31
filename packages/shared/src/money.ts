import { BRAND, MONEY } from './constants';

/** All money crossing the API boundary is an integer number of Rupiah. */
export function toRupiah(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

export function assertRupiah(value: unknown, field = 'amount'): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n)) throw new TypeError(`${field} must be an integer Rupiah amount`);
  if (n < MONEY.minAmount || n > MONEY.maxAmount) {
    throw new RangeError(`${field} out of allowed range`);
  }
  return n;
}

const idr = new Intl.NumberFormat(BRAND.locale, {
  style: 'currency',
  currency: BRAND.currency,
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

/** Rp 259.000 */
export function formatRupiah(value: number | null | undefined): string {
  return idr.format(toRupiah(value ?? 0));
}

/** 259000 -> "259.000" (no symbol, for form inputs) */
export function formatNumber(value: number | null | undefined): string {
  return new Intl.NumberFormat(BRAND.locale).format(toRupiah(value ?? 0));
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '0%';
  return `${value.toFixed(digits)}%`;
}

export function discountPercent(price: number, salePrice: number | null | undefined): number {
  if (!salePrice || salePrice <= 0 || salePrice >= price) return 0;
  return Math.round(((price - salePrice) / price) * 100);
}

export function effectivePrice(
  price: number,
  salePrice: number | null | undefined,
  variantPrice?: number | null,
  variantSalePrice?: number | null,
): number {
  const base = variantPrice && variantPrice > 0 ? variantPrice : price;
  const sale = variantSalePrice && variantSalePrice > 0 ? variantSalePrice : salePrice;
  if (sale && sale > 0 && sale < base) return sale;
  return base;
}

/** Grams -> "1 kg 250 g" style label used by shipping UI. */
export function formatWeight(grams: number | null | undefined): string {
  const g = toRupiah(grams ?? 0);
  if (g < 1000) return `${g} g`;
  const kg = Math.floor(g / 1000);
  const rest = g % 1000;
  return rest === 0 ? `${kg} kg` : `${kg} kg ${rest} g`;
}

export function formatDate(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString(BRAND.locale, { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString(BRAND.locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function relativeTime(value: string | number | Date | null | undefined): string {
  if (!value) return '-';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '-';
  const diff = Math.round((Date.now() - then) / 1000);
  if (diff < 60) return 'baru saja';
  if (diff < 3600) return `${Math.floor(diff / 60)} menit lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)} hari lalu`;
  return formatDate(value);
}

export function slugify(input: string): string {
  return (
    (input || '')
      .normalize('NFKD')
      // biome-ignore lint/suspicious/noMisleadingCharacterClass: strip combining diacritical marks after NFKD
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 90)
  );
}
