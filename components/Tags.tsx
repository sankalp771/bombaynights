import { CATEGORY_LABELS, type Category, type FoodType } from '@/lib/types';

/**
 * The standard Indian veg/non-veg mark: a green or red square with a dot. It is
 * the first thing a lot of people look for, so it always comes first and never
 * gets abbreviated into a word.
 */
export function FoodTypeMark({ foodType }: { foodType: FoodType }) {
  if (foodType === 'unknown') return null;

  const config = {
    veg: { color: '#3E9E4E', label: 'Pure veg' },
    nonveg: { color: '#C0392B', label: 'Non-veg' },
    both: { color: '#C0392B', label: 'Veg & non-veg' },
  }[foodType];

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-[3px] border-2"
      style={{ borderColor: config.color, width: 14, height: 14 }}
      title={config.label}
      aria-label={config.label}
      role="img"
    >
      <span
        className="block rounded-full"
        style={{ backgroundColor: config.color, width: 6, height: 6 }}
      />
    </span>
  );
}

export function TagChip({ category }: { category: string }) {
  const label = CATEGORY_LABELS[category as Category] ?? category;
  return (
    <span className="border-night-edge text-cream-muted rounded-full border px-2 py-0.5 text-xs whitespace-nowrap">
      {label}
    </span>
  );
}

/** Max five tags on a card — beyond that it stops being scannable. */
export function TagList({
  categories,
  limit = 5,
}: {
  categories: readonly string[];
  limit?: number;
}) {
  const shown = categories.slice(0, limit);
  const extra = categories.length - shown.length;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {shown.map((category) => (
        <TagChip key={category} category={category} />
      ))}
      {extra > 0 ? <span className="text-cream-muted text-xs">+{extra}</span> : null}
    </div>
  );
}

export function VerifiedBadge({ verifiedAt }: { verifiedAt: string | null }) {
  const when = verifiedAt
    ? new Date(verifiedAt).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

  return (
    <span
      className="text-open inline-flex shrink-0 items-center gap-1 text-xs font-semibold"
      title={when ? `Timings confirmed ${when}` : 'Timings confirmed by hand'}
    >
      <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="currentColor">
        <path d="M6.2 11.4 2.8 8l1.1-1.1 2.3 2.3 5.9-5.9L13.2 4z" />
      </svg>
      Verified
    </span>
  );
}

export function PriceBand({ band }: { band: number | null }) {
  if (!band) return null;
  return (
    <span className="text-cream-muted text-xs" title={`Price band ${band} of 4`}>
      <span className="text-cream">{'₹'.repeat(band)}</span>
      <span className="opacity-40">{'₹'.repeat(4 - band)}</span>
    </span>
  );
}
