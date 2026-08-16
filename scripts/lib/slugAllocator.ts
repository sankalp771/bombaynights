/**
 * `places.slug` is unique, but `slugify(name, area)` is not: Mumbai has three
 * "Cafe Madras" and a Starbucks on every other corner of Andheri, and OSM has a
 * node for each. Left alone, the first collision kills a whole seed run.
 *
 * Rules:
 *  · A row that already exists keeps the slug it was stored with, so re-running
 *    a seed stays idempotent.
 *  · A genuinely new place takes the lowest free suffix, so a re-run that sees
 *    the same input allocates the same slug again.
 *  · Ownership is tracked by key (an `osm_id`, or any stable id the caller
 *    uses), so a place re-requesting its own slug is never treated as a clash.
 */
export class SlugAllocator {
  /** slug → the key that owns it, or null for a row with no stable key. */
  private readonly taken = new Map<string, string | null>();

  constructor(existing: ReadonlyArray<{ slug: string; key?: string | null }> = []) {
    for (const row of existing) this.taken.set(row.slug, row.key ?? null);
  }

  /** True when `slug` is spoken for by something other than `key`. */
  isTaken(slug: string, key?: string | null): boolean {
    const owner = this.taken.get(slug);
    return owner !== undefined && owner !== (key ?? null);
  }

  /**
   * Reserves a slug for `key`. Pass `existingSlug` when the row is already
   * stored — it keeps that slug no matter what, which is what makes re-runs
   * idempotent.
   */
  allocate(desired: string, key?: string | null, existingSlug?: string | null): string {
    const owner = key ?? null;

    if (existingSlug) {
      this.taken.set(existingSlug, owner);
      return existingSlug;
    }

    const root = desired || 'place';
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const candidate = attempt === 0 ? root : `${root}-${attempt + 1}`;
      if (!this.isTaken(candidate, owner)) {
        this.taken.set(candidate, owner);
        return candidate;
      }
    }

    // 200 places sharing one name is not a real dataset, but a seed run must
    // never die here either.
    const fallback = `${root}-${(owner ?? 'x').replace(/[^a-z0-9]/gi, '')}`;
    this.taken.set(fallback, owner);
    return fallback;
  }
}
