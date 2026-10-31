import { describe, expect, it } from 'bun:test';
import {
  assertRupiah,
  discountPercent,
  effectivePrice,
  formatNumber,
  formatPercent,
  formatRupiah,
  formatWeight,
  slugify,
  toRupiah,
} from '@velora/shared';

describe('toRupiah', () => {
  it('rounds fractional values to whole Rupiah', () => {
    expect(toRupiah(259000.4)).toBe(259000);
    expect(toRupiah(259999.6)).toBe(260000);
  });
  it('coerces numeric strings and rejects non-finite input to 0', () => {
    expect(toRupiah('150000')).toBe(150000);
    expect(toRupiah(Number.NaN)).toBe(0);
    expect(toRupiah(undefined)).toBe(0);
  });
});

describe('assertRupiah', () => {
  it('accepts integers inside the allowed range', () => {
    expect(assertRupiah(0)).toBe(0);
    expect(assertRupiah(1_000_000_000)).toBe(1_000_000_000);
  });
  it('rejects non-integer amounts', () => {
    expect(() => assertRupiah(1000.5)).toThrow(TypeError);
  });
  it('rejects out-of-range amounts', () => {
    expect(() => assertRupiah(-1)).toThrow(RangeError);
    expect(() => assertRupiah(1_000_000_001)).toThrow(RangeError);
  });
});

describe('formatRupiah / formatNumber', () => {
  it('renders grouped digits with the id-ID separator', () => {
    expect(formatNumber(259000)).toBe('259.000');
    expect(formatRupiah(259000)).toStartWith('Rp');
    expect(formatRupiah(259000)).toInclude('259.000');
  });
  it('treats null/undefined as zero', () => {
    expect(formatNumber(null)).toBe('0');
    expect(formatRupiah(undefined)).toInclude('0');
  });
});

describe('formatPercent', () => {
  it('formats with the requested precision', () => {
    expect(formatPercent(12.5)).toBe('12.5%');
    expect(formatPercent(12.5, 0)).toBe('13%');
  });
  it('falls back to 0% for non-finite input', () => {
    expect(formatPercent(Number.NaN)).toBe('0%');
    expect(formatPercent(null)).toBe('0%');
  });
});

describe('discountPercent', () => {
  it('computes a rounded discount when the sale price is lower', () => {
    expect(discountPercent(200000, 150000)).toBe(25);
  });
  it('returns 0 when there is no real discount', () => {
    expect(discountPercent(200000, 200000)).toBe(0);
    expect(discountPercent(200000, 210000)).toBe(0);
    expect(discountPercent(200000, null)).toBe(0);
  });
});

describe('effectivePrice', () => {
  it('prefers the variant price, then the sale price when it is lower', () => {
    expect(effectivePrice(200000, 180000)).toBe(180000);
    expect(effectivePrice(200000, 180000, 220000, 190000)).toBe(190000);
    expect(effectivePrice(200000, null, 220000, null)).toBe(220000);
  });
  it('ignores a sale price that is not actually cheaper', () => {
    expect(effectivePrice(200000, 250000)).toBe(200000);
  });
});

describe('formatWeight', () => {
  it('renders grams, kilograms and mixed units', () => {
    expect(formatWeight(500)).toBe('500 g');
    expect(formatWeight(1000)).toBe('1 kg');
    expect(formatWeight(1250)).toBe('1 kg 250 g');
  });
});

describe('slugify', () => {
  it('normalises accents and collapses separators', () => {
    expect(slugify('Kemeja  Flanel Biru')).toBe('kemeja-flanel-biru');
    expect(slugify('Ürün — Baru!')).toBe('urun-baru');
    expect(slugify('  trimmed  ')).toBe('trimmed');
  });
});
