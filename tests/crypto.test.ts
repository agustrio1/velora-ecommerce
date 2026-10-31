import { describe, expect, it } from 'bun:test';
import { createHmac } from 'node:crypto';
import { callbackSignature, requestSignature, transactionStatusSignature } from '../apps/api/src/integrations/duitku';
import { hmacSha256, idempotencyKey, orderCode, timingSafeEqual, toHex } from '../apps/api/src/lib/ids';

describe('hmacSha256', () => {
  it('matches the Node crypto reference implementation', async () => {
    const message = 'The quick brown fox jumps over the lazy dog';
    const key = 'velora-secret';
    const expected = createHmac('sha256', key).update(message).digest('hex');
    expect(await hmacSha256(message, key)).toBe(expected);
  });

  it('produces lowercase 64-char hex and is deterministic', async () => {
    const a = await hmacSha256('same', 'key');
    const b = await hmacSha256('same', 'key');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when the key changes', async () => {
    expect(await hmacSha256('msg', 'key1')).not.toBe(await hmacSha256('msg', 'key2'));
  });
});

describe('duitku signature contract', () => {
  const merchant = 'MRC123';
  const order = 'VLRA-2610-AB123456';
  const apiKey = 'agent-key';

  it('signs the request exactly as merchantCode + merchantOrderId + amount', async () => {
    const expected = await hmacSha256(`${merchant}${order}150000`, apiKey);
    expect(await requestSignature(merchant, order, 150000, apiKey)).toBe(expected);
  });

  it('signs the callback as merchantCode + amount + merchantOrderId (different order)', async () => {
    const expected = await hmacSha256(`${merchant}150000${order}`, apiKey);
    const callback = await callbackSignature(merchant, 150000, order, apiKey);
    expect(callback).toBe(expected);
    // The inbound callback layout differs from the outbound request layout.
    expect(callback).not.toBe(await requestSignature(merchant, order, 150000, apiKey));
  });

  it('accepts the callback amount as a string without changing the digest', async () => {
    expect(await callbackSignature(merchant, '150000', order, apiKey)).toBe(
      await callbackSignature(merchant, 150000, order, apiKey),
    );
  });

  it('signs transaction-status lookups with merchantCode + merchantOrderId', async () => {
    const expected = await hmacSha256(`${merchant}${order}`, apiKey);
    expect(await transactionStatusSignature(merchant, order, apiKey)).toBe(expected);
  });
});

describe('timingSafeEqual', () => {
  it('compares case-insensitively and rejects length mismatches', () => {
    expect(timingSafeEqual('ABC123', 'abc123')).toBe(true);
    expect(timingSafeEqual('abc123', 'abc124')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
    expect(timingSafeEqual('a', 1 as unknown as string)).toBe(false);
  });
});

describe('id + idempotency helpers', () => {
  it('joins idempotency parts and normalises nulls', () => {
    expect(idempotencyKey('a', 1, null, undefined)).toBe('a|1|-|-');
  });

  it('caps the idempotency key at 240 characters', () => {
    expect(idempotencyKey('x'.repeat(300)).length).toBe(240);
  });

  it('mints order codes in the VLRA-YYMM-NNNNNN shape', () => {
    // Build the date from local components so year/month are timezone-stable.
    expect(orderCode(new Date(2026, 9, 30))).toMatch(/^VLRA-2610-[A-HJ-NP-Z2-9]{2}\d{6}$/);
  });

  it('renders bytes as zero-padded hex', () => {
    expect(toHex(new Uint8Array([0, 15, 255]))).toBe('000fff');
  });
});
