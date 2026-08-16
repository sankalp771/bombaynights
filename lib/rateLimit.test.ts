import { describe, expect, it } from 'vitest';
import { clientIp, hashIp } from './rateLimit';

describe('clientIp', () => {
  it('takes the first entry of x-forwarded-for — the real client behind a proxy', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18, 150.172.238.178' });
    expect(clientIp(headers)).toBe('203.0.113.7');
  });

  it('falls back to x-real-ip, then to a constant bucket', () => {
    expect(clientIp(new Headers({ 'x-real-ip': '198.51.100.9' }))).toBe('198.51.100.9');
    // Rate-limits conservatively rather than not at all.
    expect(clientIp(new Headers())).toBe('unknown');
  });
});

describe('hashIp', () => {
  it('never returns the address itself', () => {
    const hash = hashIp('203.0.113.7');
    expect(hash).not.toContain('203.0.113');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is stable within one IST day, so counting works', () => {
    const morning = new Date('2026-08-16T04:00:00+05:30');
    const night = new Date('2026-08-16T23:30:00+05:30');
    expect(hashIp('203.0.113.7', morning)).toBe(hashIp('203.0.113.7', night));
  });

  it('changes at IST midnight, so nobody can be followed across days', () => {
    const tonight = new Date('2026-08-16T23:59:00+05:30');
    const tomorrow = new Date('2026-08-17T00:01:00+05:30');
    expect(hashIp('203.0.113.7', tonight)).not.toBe(hashIp('203.0.113.7', tomorrow));
  });

  it('rotates on the IST day, not the UTC day', () => {
    // 19:00 UTC is already the next day in Mumbai.
    const beforeIstMidnight = new Date('2026-08-16T18:00:00Z'); // 23:30 IST 16th
    const afterIstMidnight = new Date('2026-08-16T19:00:00Z'); // 00:30 IST 17th
    expect(hashIp('203.0.113.7', beforeIstMidnight)).not.toBe(
      hashIp('203.0.113.7', afterIstMidnight),
    );
  });

  it('separates different addresses', () => {
    expect(hashIp('203.0.113.7')).not.toBe(hashIp('203.0.113.8'));
  });
});
