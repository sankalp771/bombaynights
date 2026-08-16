import pg from 'pg';

/**
 * One narrow interface, two transports for running SQL against a database.
 *
 * - `postgres`   — a direct `pg` connection on port 5432. What you want locally.
 * - `management` — Supabase's Management API over HTTPS
 *                  (`POST /v1/projects/{ref}/database/query`), which runs SQL as
 *                  the `postgres` superuser.
 *
 * The second transport exists because Supabase's Postgres is raw TCP, and the
 * sandboxes this project is built in only allow outbound HTTPS — the direct host
 * is IPv6-only on top of that. Without an HTTPS path, migrations could never be
 * applied from a session at all.
 */
export interface SqlRunner {
  /** Human-readable target, safe to print (never contains a secret). */
  readonly label: string;
  /**
   * Runs `sql` and returns the rows of the last statement. A multi-statement
   * string executes as a single implicit transaction on both transports, which
   * is what makes "migration + its version row" atomic.
   */
  query<T = Record<string, unknown>>(sql: string): Promise<T[]>;
  close(): Promise<void>;
}

export function createPostgresRunner(url: string): SqlRunner {
  const client = new pg.Client({
    connectionString: url,
    // Supabase terminates TLS with its own chain; verifying it adds nothing
    // here and breaks on some CI images.
    ssl: isLocal(url) ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 20_000,
  });
  let connected = false;

  return {
    label: redact(url),
    async query<T>(sql: string): Promise<T[]> {
      if (!connected) {
        await client.connect();
        connected = true;
      }
      const result = await client.query(sql);
      // node-postgres returns an array of results for a multi-statement query.
      const last = Array.isArray(result) ? result[result.length - 1] : result;
      return (last?.rows ?? []) as T[];
    },
    async close(): Promise<void> {
      if (connected) await client.end();
    },
  };
}

export function createManagementRunner(ref: string, token: string): SqlRunner {
  const endpoint = `https://api.supabase.com/v1/projects/${ref}/database/query`;

  return {
    label: `supabase project ${ref} (management api)`,
    async query<T>(sql: string): Promise<T[]> {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: sql }),
        signal: AbortSignal.timeout(120_000),
      });

      const text = await response.text();
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText} — ${errorMessage(text)}`);
      }

      // A successful DDL statement returns `[]`; a select returns its rows.
      const parsed: unknown = text.trim() ? JSON.parse(text) : [];
      return (Array.isArray(parsed) ? parsed : []) as T[];
    },
    async close(): Promise<void> {
      // Stateless — nothing to release.
    },
  };
}

/**
 * The project ref is the first label of the Supabase URL:
 * `https://dronsbinrjjhbkiqrmfv.supabase.co` → `dronsbinrjjhbkiqrmfv`.
 */
export function refFromSupabaseUrl(url: string): string {
  const match = /^https:\/\/([a-z0-9]+)\.supabase\./i.exec(url.trim());
  if (!match?.[1]) {
    throw new Error(
      `Could not read a project ref from NEXT_PUBLIC_SUPABASE_URL ("${url}"). ` +
        `Expected something like https://<ref>.supabase.co, or pass --ref=<ref>.`,
    );
  }
  return match[1];
}

function errorMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as { message?: string; error?: string };
    return parsed.message ?? parsed.error ?? body.slice(0, 400);
  } catch {
    return body.slice(0, 400);
  }
}

function isLocal(url: string): boolean {
  return url.includes('localhost') || url.includes('127.0.0.1');
}

export function redact(url: string): string {
  return url.replace(/\/\/([^:]+):[^@]+@/, '//$1:***@');
}
