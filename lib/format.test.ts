import { describe, expect, it } from 'vitest';
import { formatDuration, formatTime, parseHhMm, slugify, toHhMm } from './format';

describe('parseHhMm', () => {
  it('parses valid times', () => {
    expect(parseHhMm('00:00')).toBe(0);
    expect(parseHhMm('02:30')).toBe(150);
    expect(parseHhMm('23:59')).toBe(1439);
    expect(parseHhMm('24:00')).toBe(1440);
  });

  it('rejects malformed or out-of-range values', () => {
    expect(parseHhMm('2:30')).toBeNull();
    expect(parseHhMm('24:01')).toBeNull();
    expect(parseHhMm('25:00')).toBeNull();
    expect(parseHhMm('12:60')).toBeNull();
    expect(parseHhMm('')).toBeNull();
    expect(parseHhMm('abcde')).toBeNull();
  });
});

describe('toHhMm', () => {
  it('round-trips and wraps past midnight', () => {
    expect(toHhMm(0)).toBe('00:00');
    expect(toHhMm(150)).toBe('02:30');
    expect(toHhMm(1439)).toBe('23:59');
    expect(toHhMm(1440)).toBe('00:00');
    expect(toHhMm(1590)).toBe('02:30');
    expect(toHhMm(-30)).toBe('23:30');
  });
});

describe('formatTime', () => {
  it('formats late-night times the way people say them', () => {
    expect(formatTime('00:00')).toBe('12 AM');
    expect(formatTime('00:30')).toBe('12:30 AM');
    expect(formatTime('02:30')).toBe('2:30 AM');
    expect(formatTime('03:00')).toBe('3 AM');
    expect(formatTime('12:00')).toBe('12 PM');
    expect(formatTime('19:00')).toBe('7 PM');
    expect(formatTime('23:45')).toBe('11:45 PM');
    expect(formatTime('24:00')).toBe('12 AM');
  });

  it('passes malformed input through untouched rather than inventing a time', () => {
    expect(formatTime('nonsense')).toBe('nonsense');
  });
});

describe('formatDuration', () => {
  it('reads naturally', () => {
    expect(formatDuration(0)).toBe('under a minute');
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(60)).toBe('1 hr');
    expect(formatDuration(80)).toBe('1 hr 20 min');
    expect(formatDuration(120)).toBe('2 hrs');
    expect(formatDuration(-5)).toBe('under a minute');
  });
});

describe('slugify', () => {
  it('builds stable place slugs', () => {
    expect(slugify('Bademiya', 'Fort–Colaba')).toBe('bademiya-fort-colaba');
    expect(slugify('Café Mondegar')).toBe('cafe-mondegar');
    expect(slugify('Sardar Pav Bhaji', null, 'Tardeo')).toBe('sardar-pav-bhaji-tardeo');
    expect(slugify('  Ayub’s  ', 'Fort')).toBe('ayub-s-fort');
  });

  it('never leaves a trailing dash after truncation', () => {
    expect(slugify('a'.repeat(79) + ' bandra')).not.toMatch(/-$/);
  });
});
