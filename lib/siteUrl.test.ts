import { describe, expect, it } from 'vitest';
import { resolveSiteUrl } from './siteUrl';

describe('resolveSiteUrl', () => {
  it('prefers an explicit NEXT_PUBLIC_SITE_URL', () => {
    expect(
      resolveSiteUrl({
        NEXT_PUBLIC_SITE_URL: 'https://bombaynights.vercel.app',
        VERCEL_PROJECT_PRODUCTION_URL: 'ignored.vercel.app',
      }),
    ).toBe('https://bombaynights.vercel.app');
  });

  it('strips a trailing slash and any path', () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: 'https://bombaynights.vercel.app/' })).toBe(
      'https://bombaynights.vercel.app',
    );
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: 'https://bombaynights.vercel.app/places' })).toBe(
      'https://bombaynights.vercel.app',
    );
  });

  it('assumes https for a bare host, which is the shape Vercel supplies', () => {
    expect(resolveSiteUrl({ VERCEL_PROJECT_PRODUCTION_URL: 'bombaynights.vercel.app' })).toBe(
      'https://bombaynights.vercel.app',
    );
  });

  /*
   * The regression this module exists for. Production shipped with the literal
   * template value and published a sitemap full of dead URLs.
   */
  it('ignores the CHANGE-ME placeholder and falls through to Vercel', () => {
    expect(
      resolveSiteUrl({
        NEXT_PUBLIC_SITE_URL: 'https://CHANGE-ME.vercel.app',
        VERCEL_PROJECT_PRODUCTION_URL: 'bombaynights.vercel.app',
      }),
    ).toBe('https://bombaynights.vercel.app');
  });

  it.each([
    'https://CHANGE-ME.vercel.app',
    'https://changeme.example.app',
    'https://your-domain.com',
    'https://example.com',
    'https://TODO.vercel.app',
  ])('treats %s as unset', (value) => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: value })).toBe('http://localhost:3000');
  });

  it('does not reject a real host merely because a path looks like a placeholder', () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: 'https://bombaynights.app/change-me' })).toBe(
      'https://bombaynights.app',
    );
  });

  it('falls back through the Vercel variables in order', () => {
    expect(
      resolveSiteUrl({
        VERCEL_PROJECT_PRODUCTION_URL: 'prod.vercel.app',
        VERCEL_URL: 'deployment-abc123.vercel.app',
      }),
    ).toBe('https://prod.vercel.app');

    // Preview deployments only get VERCEL_URL.
    expect(resolveSiteUrl({ VERCEL_URL: 'deployment-abc123.vercel.app' })).toBe(
      'https://deployment-abc123.vercel.app',
    );
  });

  it('falls back to localhost when nothing is set', () => {
    expect(resolveSiteUrl({})).toBe('http://localhost:3000');
  });

  it('ignores blank and whitespace-only values', () => {
    expect(
      resolveSiteUrl({
        NEXT_PUBLIC_SITE_URL: '   ',
        VERCEL_PROJECT_PRODUCTION_URL: '',
        VERCEL_URL: 'fallback.vercel.app',
      }),
    ).toBe('https://fallback.vercel.app');
  });

  it('ignores an unparseable value rather than throwing', () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: 'http://' })).toBe('http://localhost:3000');
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: '://nonsense' })).toBe('http://localhost:3000');
  });

  it('keeps an explicit http localhost for local dev', () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' })).toBe(
      'http://localhost:3000',
    );
  });
});
