import { describe, expect, it } from 'vitest';
import { findDuplicate, normalizeName } from './dedupe';

describe('normalizeName', () => {
  it('collapses chain noise and punctuation', () => {
    expect(normalizeName('Bademiya Restaurant')).toBe(normalizeName('bademiya'));
    expect(normalizeName("Ayub's")).toBe(normalizeName('Ayubs'));
    expect(normalizeName('Café Mondegar')).toBe('mondegar');
  });

  it('keeps genuinely different outlets apart', () => {
    expect(normalizeName('Bademiya Seekh Kebab')).not.toBe(normalizeName('Bademiya'));
  });

  it('does not reduce a name to nothing', () => {
    expect(normalizeName('The Bar')).not.toBe('');
  });
});

describe('findDuplicate', () => {
  const existing = [
    { name: 'Bademiya', lat: 18.9226, lng: 72.8322, id: 'a' },
    { name: 'Sardar Pav Bhaji', lat: 18.9712, lng: 72.8175, id: 'b' },
  ];

  it('matches the same name within 150 m', () => {
    const found = findDuplicate(
      { name: 'Bademiya Restaurant', lat: 18.9227, lng: 72.8323 },
      existing,
    );
    expect(found?.id).toBe('a');
  });

  it('does not match the same name further than 150 m away', () => {
    // ~330 m north.
    const found = findDuplicate({ name: 'Bademiya', lat: 18.9256, lng: 72.8322 }, existing);
    expect(found).toBeUndefined();
  });

  it('does not match different names at the same spot', () => {
    const found = findDuplicate(
      { name: 'Olympia Coffee House', lat: 18.9226, lng: 72.8322 },
      existing,
    );
    expect(found).toBeUndefined();
  });

  it('picks the closest of several same-named outlets', () => {
    const outlets = [
      { name: 'Kailash Parbat', lat: 18.92, lng: 72.83, id: 'far' },
      { name: 'Kailash Parbat', lat: 18.9205, lng: 72.83, id: 'near' },
    ];
    const found = findDuplicate({ name: 'Kailash Parbat', lat: 18.9206, lng: 72.83 }, outlets);
    expect(found?.id).toBe('near');
  });
});
