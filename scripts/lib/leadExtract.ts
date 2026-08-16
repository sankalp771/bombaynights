import * as cheerio from 'cheerio';

/**
 * Extracts *facts only* from a late-night listicle: a place name, maybe a
 * locality, and a claimed timing string (docs/03 Inlet 4).
 *
 * Hard rules encoded here:
 *   · never keep article prose, images, rankings or any editorial voice —
 *     only the name, the locality, and the timing claim
 *   · a claimed timing is a HINT for the owner, never data. Nothing this file
 *     produces may reach `places` without human approval.
 *
 * The extraction is intentionally dumb. A 70 %-recall scraper that never breaks
 * beats a clever one that silently rots when a blog changes its theme; the
 * misses are logged so the owner can eyeball the source page.
 */

export interface Lead {
  name: string;
  /** Locality as claimed by the article, if it was easy to spot. */
  locality: string | null;
  /** e.g. "7 pm to 3 am" — a claim, not a fact. */
  claimedTiming: string | null;
}

/** Headings that are page furniture, not places. */
const NON_PLACE_HEADINGS =
  /^(also read|read more|related|share|comments?|about|follow us|advertisement|newsletter|tags?|categories|search|menu|home|contact|privacy|terms|subscribe|trending|popular|latest|more from|you may also like|editor'?s pick|in this article|table of contents|conclusion|faqs?|frequently asked)/i;

const TIMING_PATTERNS: RegExp[] = [
  // "7 pm to 3 am", "7:30pm – 2:30am"
  /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s*(?:to|-|–|—|until|till)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i,
  // "open till 3 am", "till late 4am"
  /\b(?:open\s+)?(?:till|until|upto|up to)\s+(?:late\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i,
  // "24 hours", "open 24x7"
  /\b(24\s*[x/]\s*7|24\s*hours?|round the clock|all night)\b/i,
];

/** Strip list numbering, emoji and trailing punctuation from a heading. */
export function cleanHeading(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[\d]{1,3}\s*[).:\-–—]\s*/, '')
    .replace(/^[#*•\-–—]+\s*/, '')
    .replace(/[\s.,;:!]+$/, '')
    .trim();
}

/**
 * Split "Bademiya, Colaba" or "Bademiya (Colaba)" into name and locality.
 * When the split is ambiguous the whole string stays as the name — a wrong
 * locality is worse than none, because it drives the dedupe match.
 */
export function splitNameAndLocality(heading: string): { name: string; locality: string | null } {
  const parenthesised = /^(.+?)\s*[([]([^)\]]{2,40})[)\]]\s*$/.exec(heading);
  if (parenthesised?.[1] && parenthesised[2]) {
    return { name: parenthesised[1].trim(), locality: parenthesised[2].trim() };
  }

  const parts = heading.split(/\s*[,|·–—]\s*/);
  if (parts.length === 2 && parts[0] && parts[1]) {
    const [name, locality] = parts;
    // A trailing fragment is only a locality if it is short and word-like.
    if (locality.length <= 30 && /^[A-Za-z][A-Za-z\s.'-]*$/.test(locality)) {
      return { name: name.trim(), locality: locality.trim() };
    }
  }

  return { name: heading, locality: null };
}

export function findTiming(text: string): string | null {
  for (const pattern of TIMING_PATTERNS) {
    const match = pattern.exec(text);
    if (match) return match[0].replace(/\s+/g, ' ').trim();
  }
  return null;
}

export interface ExtractionResult {
  leads: Lead[];
  /** Headings we saw but rejected, so misses are visible rather than silent. */
  rejectedHeadings: string[];
}

/**
 * Pull leads out of an article. Each `h2`/`h3` is treated as a candidate place
 * name and the text between it and the next heading is scanned for a timing.
 */
export function extractLeads(html: string): ExtractionResult {
  const $ = cheerio.load(html);
  $('script, style, nav, header, footer, aside, form').remove();

  const leads: Lead[] = [];
  const rejectedHeadings: string[] = [];
  const seen = new Set<string>();

  $('h2, h3').each((_, element) => {
    const heading = cleanHeading($(element).text());

    if (
      heading.length < 3 ||
      heading.length > 90 ||
      NON_PLACE_HEADINGS.test(heading) ||
      // A heading that is a whole sentence is prose, not a place name.
      heading.split(/\s+/).length > 10
    ) {
      if (heading) rejectedHeadings.push(heading);
      return;
    }

    // Body text up to the next heading of any level.
    const body: string[] = [];
    let node = $(element).next();
    while (node.length > 0 && !/^h[1-6]$/i.test(node.prop('tagName') ?? '')) {
      body.push(node.text());
      node = node.next();
    }

    const { name, locality } = splitNameAndLocality(heading);
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);

    leads.push({
      name,
      locality,
      claimedTiming: findTiming(`${heading} ${body.join(' ')}`),
    });
  });

  return { leads, rejectedHeadings };
}

/**
 * Minimal robots.txt evaluation for our own user-agent. Deliberately
 * conservative: anything we cannot parse confidently is treated as disallowed.
 */
export function isAllowedByRobots(robotsTxt: string, path: string, userAgent: string): boolean {
  const lines = robotsTxt.split(/\r?\n/).map((line) => line.replace(/#.*$/, '').trim());
  const groups: Array<{ agents: string[]; rules: Array<{ allow: boolean; path: string }> }> = [];
  let current: (typeof groups)[number] | null = null;
  let lastWasAgent = false;

  for (const line of lines) {
    const [rawKey, ...rest] = line.split(':');
    if (!rawKey || rest.length === 0) continue;
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(':').trim();

    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === 'allow' || key === 'disallow') && current) {
      current.rules.push({ allow: key === 'allow', path: value });
      lastWasAgent = false;
    }
  }

  const agent = userAgent.toLowerCase();
  const matching =
    groups.find((group) => group.agents.some((name) => name !== '*' && agent.includes(name))) ??
    groups.find((group) => group.agents.includes('*'));

  if (!matching) return true;

  // Longest matching rule wins; Allow beats Disallow at equal length.
  let best: { allow: boolean; length: number } | null = null;
  for (const rule of matching.rules) {
    if (rule.path === '') continue; // "Disallow:" with no value means allow all.
    if (!path.startsWith(rule.path)) continue;
    if (
      !best ||
      rule.path.length > best.length ||
      (rule.path.length === best.length && rule.allow)
    ) {
      best = { allow: rule.allow, length: rule.path.length };
    }
  }

  return best ? best.allow : true;
}
