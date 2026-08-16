import { describe, expect, it } from 'vitest';
import { SlugAllocator } from './slugAllocator';

describe('SlugAllocator', () => {
  it('hands out the bare slug when nothing has claimed it', () => {
    const slugs = new SlugAllocator();
    expect(slugs.allocate('bademiya-fort-colaba', 'node/1')).toBe('bademiya-fort-colaba');
  });

  it('suffixes a second place with the same name in the same area', () => {
    const slugs = new SlugAllocator();
    expect(slugs.allocate('starbucks-bandra', 'node/1')).toBe('starbucks-bandra');
    expect(slugs.allocate('starbucks-bandra', 'node/2')).toBe('starbucks-bandra-2');
    expect(slugs.allocate('starbucks-bandra', 'node/3')).toBe('starbucks-bandra-3');
  });

  it('avoids slugs already stored in the database', () => {
    const slugs = new SlugAllocator([{ slug: 'cafe-madras-bandra', key: 'node/9' }]);
    expect(slugs.allocate('cafe-madras-bandra', 'node/10')).toBe('cafe-madras-bandra-2');
  });

  it('gives a place its own stored slug back rather than a suffix', () => {
    const slugs = new SlugAllocator([{ slug: 'cafe-madras-bandra', key: 'node/9' }]);
    expect(slugs.allocate('cafe-madras-bandra', 'node/9')).toBe('cafe-madras-bandra');
  });

  it('keeps an existing row on its stored slug even if the name changed', () => {
    const slugs = new SlugAllocator([{ slug: 'old-name-bandra', key: 'node/9' }]);
    expect(slugs.allocate('new-name-bandra', 'node/9', 'old-name-bandra')).toBe('old-name-bandra');
  });

  it('is idempotent: a second identical run allocates identical slugs', () => {
    const input = [
      { desired: 'starbucks-bandra', key: 'node/1' },
      { desired: 'starbucks-bandra', key: 'node/2' },
      { desired: 'bademiya-fort-colaba', key: 'node/3' },
    ];

    const first = new SlugAllocator();
    const firstRun = input.map((row) => first.allocate(row.desired, row.key));

    // Second run: the rows are now stored, so each keeps what it was given.
    const stored = input.map((row, index) => ({ slug: firstRun[index] as string, key: row.key }));
    const second = new SlugAllocator(stored);
    const secondRun = input.map((row, index) =>
      second.allocate(row.desired, row.key, stored[index]?.slug),
    );

    expect(secondRun).toEqual(firstRun);
  });

  it('never returns an empty slug', () => {
    const slugs = new SlugAllocator();
    expect(slugs.allocate('', 'node/1')).toBe('place');
    expect(slugs.allocate('', 'node/2')).toBe('place-2');
  });

  it('does not let a manual row lose its slug to an OSM row', () => {
    // Manual rows are stored with no osm_id — key null. An OSM node wanting the
    // same slug must yield, not overwrite.
    const slugs = new SlugAllocator([{ slug: 'ayubs-fort', key: null }]);
    expect(slugs.allocate('ayubs-fort', 'node/5')).toBe('ayubs-fort-2');
  });
});
