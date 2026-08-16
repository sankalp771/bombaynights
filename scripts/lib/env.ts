import { config } from 'dotenv';
import { resolve } from 'node:path';

/**
 * Scripts load `.env.local` (app credentials) and `.env.db.local` (the direct
 * Postgres URL, kept separate so Next.js can never read it at runtime). Both
 * are gitignored. Real environment variables always win, which is what CI and
 * GitHub Actions rely on.
 */
let loaded = false;

export function loadEnv(): void {
  if (loaded) return;
  config({ path: resolve(process.cwd(), '.env.local') });
  config({ path: resolve(process.cwd(), '.env.db.local') });
  loaded = true;
}

export function requireEnv(name: string): string {
  loadEnv();
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(
      `Missing ${name}. Add it to .env.local (see .env.example) or export it before running this script.`,
    );
  }
  return value.trim();
}

export function optionalEnv(name: string): string | undefined {
  loadEnv();
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

/** True when `--flag` is present on the command line. */
export function hasFlag(flag: string): boolean {
  return process.argv.slice(2).includes(`--${flag}`);
}

/** Value of `--key=value`, or undefined. */
export function flagValue(flag: string): string | undefined {
  const prefix = `--${flag}=`;
  const found = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return found?.slice(prefix.length);
}
