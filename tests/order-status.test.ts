import { describe, expect, it } from 'bun:test';
import { ORDER_STATUS, ORDER_STATUSES, ORDER_TRANSITIONS, ROLE_CODE } from '@velora/shared';
import type { OrderStatus } from '@velora/shared';

/** Mirror of the state-machine guard the API enforces on every status change. */
function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

describe('order status catalogue', () => {
  it('lists every enum member exactly once', () => {
    expect(ORDER_STATUSES.length).toBe(Object.keys(ORDER_STATUS).length);
    expect(new Set(ORDER_STATUSES).size).toBe(ORDER_STATUSES.length);
  });

  it('defines transitions for every status', () => {
    for (const status of ORDER_STATUSES) {
      expect(Array.isArray(ORDER_TRANSITIONS[status])).toBe(true);
    }
  });
});

describe('order state machine', () => {
  it('allows the happy path forward', () => {
    expect(canTransition(ORDER_STATUS.PENDING_PAYMENT, ORDER_STATUS.PAID)).toBe(true);
    expect(canTransition(ORDER_STATUS.PAID, ORDER_STATUS.PROCESSING)).toBe(true);
    expect(canTransition(ORDER_STATUS.PROCESSING, ORDER_STATUS.SHIPPED)).toBe(true);
    expect(canTransition(ORDER_STATUS.SHIPPED, ORDER_STATUS.DELIVERED)).toBe(true);
    expect(canTransition(ORDER_STATUS.DELIVERED, ORDER_STATUS.COMPLETED)).toBe(true);
  });

  it('blocks skipped and backward transitions', () => {
    expect(canTransition(ORDER_STATUS.PENDING_PAYMENT, ORDER_STATUS.SHIPPED)).toBe(false);
    expect(canTransition(ORDER_STATUS.SHIPPED, ORDER_STATUS.PAID)).toBe(false);
    expect(canTransition(ORDER_STATUS.COMPLETED, ORDER_STATUS.PROCESSING)).toBe(false);
  });

  it('treats terminal states as immutable', () => {
    expect(ORDER_TRANSITIONS[ORDER_STATUS.CANCELLED]).toEqual([]);
    expect(ORDER_TRANSITIONS[ORDER_STATUS.REFUNDED]).toEqual([]);
  });

  it('never permits a self transition', () => {
    for (const status of ORDER_STATUSES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });
});

describe('role codes', () => {
  it('keeps customer, admin and super_admin distinct', () => {
    const codes = Object.values(ROLE_CODE);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toContain(ROLE_CODE.SUPER_ADMIN);
  });
});
