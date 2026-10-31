import { describe, expect, it } from 'bun:test';
import { schemas } from '@velora/shared';

describe('rupiahs scalar', () => {
  it('coerces integers within the guard', () => {
    expect(schemas.rupiahs.parse('259000')).toBe(259000);
    expect(schemas.rupiahs.parse(0)).toBe(0);
    expect(schemas.rupiahs.parse(1_000_000_000)).toBe(1_000_000_000);
  });
  it('rejects fractional, negative and over-limit amounts', () => {
    expect(() => schemas.rupiahs.parse(1000.5)).toThrow();
    expect(() => schemas.rupiahs.parse(-1)).toThrow();
    expect(() => schemas.rupiahs.parse(1_000_000_001)).toThrow();
  });
});

describe('deviceTokenSchema', () => {
  it('requires a sufficiently long token and defaults the platform to web', () => {
    const token = 'd'.repeat(140);
    const parsed = schemas.deviceTokenSchema.parse({ token });
    expect(parsed.token).toBe(token);
    expect(parsed.platform).toBe('web');
  });
  it('rejects too-short tokens and unknown platforms', () => {
    expect(() => schemas.deviceTokenSchema.parse({ token: 'short' })).toThrow();
    expect(() => schemas.deviceTokenSchema.parse({ token: 'd'.repeat(30), platform: 'windows' })).toThrow();
  });
});

describe('couponUpsertSchema', () => {
  const base = {
    code: 'WELCOME10',
    name: 'Diskon Sambutan',
    type: 'percent' as const,
    value: 10,
  };
  it('accepts a well-formed percent coupon and applies defaults', () => {
    const parsed = schemas.couponUpsertSchema.parse(base);
    expect(parsed.isActive).toBe(true);
    expect(parsed.code).toBe('WELCOME10');
  });
  it('enforces the uppercase alphanumeric code shape', () => {
    expect(() => schemas.couponUpsertSchema.parse({ ...base, code: 'welcome10' })).toThrow();
    expect(() => schemas.couponUpsertSchema.parse({ ...base, code: 'AB' })).toThrow();
  });
  it('rejects an unknown coupon type', () => {
    expect(() => schemas.couponUpsertSchema.parse({ ...base, type: 'buy1get1' })).toThrow();
  });
});

describe('checkoutSchema', () => {
  const valid = {
    addressId: 'addr_1',
    shippingOptionId: 'jne_reg',
    paymentChannelCode: 'VA_BCA',
  };
  it('accepts a minimal checkout payload', () => {
    expect(schemas.checkoutSchema.parse(valid).paymentChannelCode).toBe('VA_BCA');
  });
  it('requires address, shipping option and payment channel', () => {
    expect(() => schemas.checkoutSchema.parse({ shippingOptionId: 'x', paymentChannelCode: 'y' })).toThrow();
    expect(() => schemas.checkoutSchema.parse({ ...valid, paymentChannelCode: '' })).toThrow();
  });
});

describe('notificationPrefsSchema', () => {
  it('defaults order/payment/shipping/email on and promotions off', () => {
    const parsed = schemas.notificationPrefsSchema.parse({});
    expect(parsed.orderUpdates).toBe(true);
    expect(parsed.promotions).toBe(false);
    expect(parsed.email).toBe(true);
  });
});
