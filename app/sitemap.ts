import type { MetadataRoute } from 'next';
import { getApprovedPlaces, getAreas } from '@/lib/data';
import { getSiteUrl } from '@/lib/siteUrl';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();
  const [areas, places] = await Promise.all([getAreas(), getApprovedPlaces()]);

  return [
    { url: `${base}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/places`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/submit`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${base}/about`, changeFrequency: 'monthly', priority: 0.3 },
    ...areas.map((area) => ({
      url: `${base}/area/${area.slug}`,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    ...places.map((place) => ({
      url: `${base}/place/${place.slug}`,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
  ];
}
