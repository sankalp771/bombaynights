import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Exercises the submit endpoint end to end against an in-memory stand-in for
 * Supabase. This covers the acceptance criteria that matter and cannot be
 * checked by reading the code: a valid submission lands in `submissions`, and
 * the sixth one from the same hashed IP on the same day is refused.
 */

interface StoredSubmission {
  payload: Record<string, unknown>;
  kind: string;
  place_id: string | null;
  ip_hash: string;
}

const store: { submissions: StoredSubmission[] } = { submissions: [] };

function fakeClient() {
  return {
    from(table: string) {
      return {
        select(_columns: string, options?: { count?: string; head?: boolean }) {
          const builder = {
            _filters: {} as Record<string, unknown>,
            eq(column: string, value: unknown) {
              this._filters[column] = value;
              return this;
            },
            maybeSingle: async () => ({ data: null, error: null }),
            then(resolve: (result: { count: number; error: null }) => void) {
              const rows =
                table === 'submissions'
                  ? store.submissions.filter((row) => row.ip_hash === this._filters.ip_hash)
                  : [];
              resolve({ count: options?.count ? rows.length : 0, error: null });
            },
          };
          return builder;
        },
        async insert(row: StoredSubmission) {
          if (table === 'submissions') store.submissions.push(row);
          return { error: null };
        },
      };
    },
  };
}

vi.mock('@/lib/supabase', () => ({
  createServiceClient: () => fakeClient(),
  createPublicClient: () => fakeClient(),
}));

const { POST } = await import('./route');

const VALID = {
  name: 'Test Late Night Kitchen',
  area_slug: 'bandra',
  address: 'Hill Road, near the church',
  categories: ['restaurant', 'late_night'],
  food_type: 'both',
  serves_alcohol: null,
  has_shisha: null,
  service_modes: ['dine_in'],
  hours: { fri: [{ open: '19:00', close: '02:30' }] },
  phone: '',
  notes: 'Opens late, closes later.',
};

function request(body: unknown, ip = '203.0.113.7'): Request {
  return new Request('http://localhost/api/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  store.submissions = [];
});

describe('POST /api/submit', () => {
  it('accepts a valid submission and stores it as pending', async () => {
    const response = await POST(request(VALID));
    expect(response.status).toBe(201);
    expect(store.submissions).toHaveLength(1);
    expect(store.submissions[0]?.kind).toBe('new_place');
    expect(store.submissions[0]?.payload.name).toBe('Test Late Night Kitchen');
    // The raw IP is never stored.
    expect(store.submissions[0]?.ip_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(store.submissions[0])).not.toContain('203.0.113.7');
  });

  it('rejects the 6th submission from the same source on the same day', async () => {
    for (let i = 0; i < 5; i += 1) {
      const response = await POST(request({ ...VALID, name: `Place Number ${i}` }));
      expect(response.status).toBe(201);
    }
    expect(store.submissions).toHaveLength(5);

    const sixth = await POST(request({ ...VALID, name: 'One Too Many' }));
    expect(sixth.status).toBe(429);
    expect(store.submissions).toHaveLength(5);
  });

  it('counts per source, so one heavy contributor does not block everyone', async () => {
    for (let i = 0; i < 5; i += 1) {
      await POST(request({ ...VALID, name: `Place ${i}` }, '203.0.113.7'));
    }
    const other = await POST(request({ ...VALID, name: 'From Elsewhere' }, '198.51.100.4'));
    expect(other.status).toBe(201);
    expect(store.submissions).toHaveLength(6);
  });

  it('swallows honeypot hits silently — the bot learns nothing', async () => {
    const response = await POST(request({ ...VALID, website: 'http://spam.example' }));
    expect(response.status).toBe(201);
    expect(store.submissions).toHaveLength(0);
  });

  it('rejects a submission with no categories', async () => {
    const response = await POST(request({ ...VALID, categories: [] }));
    expect(response.status).toBe(422);
    const body = (await response.json()) as { fields: Record<string, string> };
    expect(body.fields.categories).toBeDefined();
    expect(store.submissions).toHaveLength(0);
  });

  it('rejects a submission with no opening times at all', async () => {
    const response = await POST(request({ ...VALID, hours: { fri: [] } }));
    expect(response.status).toBe(422);
    expect(store.submissions).toHaveLength(0);
  });

  it('rejects a submission with neither a pin nor an address', async () => {
    const response = await POST(request({ ...VALID, address: '' }));
    expect(response.status).toBe(422);
  });

  it('rejects tags outside the fixed vocabulary', async () => {
    const response = await POST(request({ ...VALID, categories: ['restaurant', 'speakeasy'] }));
    expect(response.status).toBe(422);
  });

  it('rejects malformed hours rather than storing a guess', async () => {
    const response = await POST(
      request({ ...VALID, hours: { fri: [{ open: '25:00', close: '02:30' }] } }),
    );
    expect(response.status).toBe(422);
  });

  it('rejects a non-JSON body', async () => {
    const response = await POST(
      new Request('http://localhost/api/submit', { method: 'POST', body: 'not json' }),
    );
    expect(response.status).toBe(400);
  });
});
