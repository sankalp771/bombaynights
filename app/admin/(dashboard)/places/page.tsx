import { fetchAdminAreas, fetchPlaces } from '@/lib/adminData';
import { PlacesManager } from '@/components/admin/PlacesManager';
import { placeStatusSchema } from '@/lib/types';

export default async function PlacesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; area?: string; q?: string }>;
}) {
  const params = await searchParams;

  // Default to `pending`: this tab exists to clear the seed batch, and landing
  // on 900 approved rows buries the 100 that need a decision.
  const parsedStatus = placeStatusSchema.safeParse(params.status ?? 'pending');
  const status = params.status === 'all' ? undefined : (parsedStatus.data ?? 'pending');
  const areaId = params.area ? Number(params.area) : undefined;

  const [places, areas] = await Promise.all([
    fetchPlaces({
      status,
      areaId: Number.isFinite(areaId) ? areaId : undefined,
      search: params.q,
    }),
    fetchAdminAreas(),
  ]);

  return (
    <PlacesManager
      places={places}
      areas={areas}
      status={params.status ?? 'pending'}
      areaId={params.area ?? ''}
      search={params.q ?? ''}
    />
  );
}
