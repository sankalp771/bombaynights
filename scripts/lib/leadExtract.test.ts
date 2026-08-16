import { describe, expect, it } from 'vitest';
import {
  cleanHeading,
  extractLeads,
  findTiming,
  isAllowedByRobots,
  splitNameAndLocality,
} from './leadExtract';

describe('cleanHeading', () => {
  it('strips list numbering and decoration', () => {
    expect(cleanHeading('1. Bademiya')).toBe('Bademiya');
    expect(cleanHeading('12) Ayub’s ')).toBe('Ayub’s');
    expect(cleanHeading('  •  Lucky Restaurant.')).toBe('Lucky Restaurant');
  });
});

describe('splitNameAndLocality', () => {
  it('splits a trailing locality', () => {
    expect(splitNameAndLocality('Bademiya, Colaba')).toEqual({
      name: 'Bademiya',
      locality: 'Colaba',
    });
    expect(splitNameAndLocality('Lucky Restaurant (Bandra)')).toEqual({
      name: 'Lucky Restaurant',
      locality: 'Bandra',
    });
  });

  it('leaves ambiguous headings alone rather than inventing a locality', () => {
    expect(splitNameAndLocality('Sardar Pav Bhaji')).toEqual({
      name: 'Sardar Pav Bhaji',
      locality: null,
    });
    expect(splitNameAndLocality('Cafe 24, open 7 days a week')).toEqual({
      name: 'Cafe 24, open 7 days a week',
      locality: null,
    });
  });
});

describe('findTiming', () => {
  it('finds range, till and 24-hour claims', () => {
    expect(findTiming('Open 7 pm to 3 am daily')).toBe('7 pm to 3 am');
    expect(findTiming('Serves till 4am on weekends')).toBe('till 4am');
    expect(findTiming('This one is open 24x7')).toBe('24x7');
    expect(findTiming('A lovely spot with great ambience')).toBeNull();
  });
});

describe('extractLeads', () => {
  const html = `
    <html><body>
      <h1>31 Places Open After Midnight In Mumbai</h1>
      <h2>1. Bademiya, Colaba</h2>
      <p>The legendary seekh roll counter. Open 7 pm to 4 am every day.</p>
      <h2>2. Lucky Restaurant (Bandra)</h2>
      <p>Biryani by the station, till 2 am.</p>
      <h2>3. Some Quiet Cafe</h2>
      <p>Lovely filter coffee and a nice courtyard.</p>
      <h2>Also Read</h2>
      <p>15 brunch spots in Bandra</p>
      <h3>This heading is an entire sentence about how much the writer enjoyed the evening</h3>
      <p>Prose.</p>
    </body></html>`;

  it('pulls out names, localities and claimed timings', () => {
    const { leads } = extractLeads(html);
    expect(leads).toEqual([
      { name: 'Bademiya', locality: 'Colaba', claimedTiming: '7 pm to 4 am' },
      { name: 'Lucky Restaurant', locality: 'Bandra', claimedTiming: 'till 2 am' },
      { name: 'Some Quiet Cafe', locality: null, claimedTiming: null },
    ]);
  });

  it('rejects page furniture and prose headings, and logs the misses', () => {
    const { leads, rejectedHeadings } = extractLeads(html);
    expect(leads.map((lead) => lead.name)).not.toContain('Also Read');
    expect(rejectedHeadings).toContain('Also Read');
    expect(rejectedHeadings.some((heading) => heading.startsWith('This heading is'))).toBe(true);
  });

  it('keeps no article prose — only name, locality and timing', () => {
    const { leads } = extractLeads(html);
    for (const lead of leads) {
      expect(Object.keys(lead).sort()).toEqual(['claimedTiming', 'locality', 'name']);
      expect(JSON.stringify(lead)).not.toContain('legendary');
    }
  });

  it('does not emit the same place twice', () => {
    const { leads } = extractLeads(`
      <h2>Bademiya</h2><p>till 4 am</p>
      <h2>bademiya</h2><p>again</p>`);
    expect(leads).toHaveLength(1);
  });
});

describe('isAllowedByRobots', () => {
  const ua = 'BombayNights-leads/1.0';

  it('honours a wildcard disallow', () => {
    expect(isAllowedByRobots('User-agent: *\nDisallow: /', '/blog/post', ua)).toBe(false);
    expect(isAllowedByRobots('User-agent: *\nDisallow: /admin', '/blog/post', ua)).toBe(true);
    expect(isAllowedByRobots('User-agent: *\nDisallow: /admin', '/admin/x', ua)).toBe(false);
  });

  it('prefers a rule naming our agent over the wildcard', () => {
    const robots = 'User-agent: *\nDisallow: /\n\nUser-agent: BombayNights-leads\nAllow: /';
    expect(isAllowedByRobots(robots, '/anything', ua)).toBe(true);
  });

  it('lets the longest matching rule win', () => {
    const robots = 'User-agent: *\nDisallow: /blog\nAllow: /blog/public';
    expect(isAllowedByRobots(robots, '/blog/private', ua)).toBe(false);
    expect(isAllowedByRobots(robots, '/blog/public/1', ua)).toBe(true);
  });

  it('treats an empty Disallow as allow-all', () => {
    expect(isAllowedByRobots('User-agent: *\nDisallow:', '/anything', ua)).toBe(true);
  });

  it('allows when robots.txt has nothing to say', () => {
    expect(isAllowedByRobots('', '/anything', ua)).toBe(true);
  });
});
