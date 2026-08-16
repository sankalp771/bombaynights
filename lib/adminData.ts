import 'server-only';
import { createServiceClient } from './supabase';
import { requireAdmin } from './adminAuth';
import {
  areaSchema,
  placeSchema,
  reportRowSchema,
  submissionRowSchema,
  type Area,
  type Place,
  type ReportRow,
  type SubmissionRow,
} from './types';

/**
 * The admin read path.
 *
 * Everything here goes through the service-role client, because RLS hides
 * pending places, submissions and reports from `anon` *and* from
 * `authenticated` — there is no admin role in the database, by design. That
 * makes `requireAdmin()` the only thing standing between a stranger and the
 * whole dataset, so every function in this file calls it first. Not "the page
 * calls it once": every function, so a future route that forgets cannot leak.
 *
 * Nothing here is cached. The moderation queue must never show a stale row —
 * approving something twice is confusing, and the five-minute public cache is
 * what this exists to bypass.
 */

/** `ip_hash` is never selected. It exists to rate-limit, not to identify. */
const SUBMISSION_COLUMNS = 'id,payload,kind,place_id,status,admin_note,created_at';
const REPORT_COLUMNS = 'id,place_id,reason,detail,resolved_at,created_at';

export interface QueueCounts {
  pendingSubmissions: number;
  pendingPlaces: number;
  openReports: number;
}

export async function fetchQueueCounts(): Promise<QueueCounts> {
  await requireAdmin();
  const client = createServiceClient();

  const [submissions, places, reports] = await Promise.all([
    client.from('submissions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    client.from('places').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    client.from('reports').select('id', { count: 'exact', head: true }).is('resolved_at', null),
  ]);

  return {
    pendingSubmissions: submissions.count ?? 0,
    pendingPlaces: places.count ?? 0,
    openReports: reports.count ?? 0,
  };
}

export async function fetchSubmissions(status: 'pending' | 'all'): Promise<SubmissionRow[]> {
  await requireAdmin();
  let query = createServiceClient()
    .from('submissions')
    .select(SUBMISSION_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(200);

  if (status === 'pending') query = query.eq('status', 'pending');

  const { data, error } = await query;
  if (error) throw new Error(`Could not load submissions: ${error.message}`);
  return (data ?? []).map((row) => submissionRowSchema.parse(row));
}

export interface PlaceFilters {
  status?: Place['status'];
  areaId?: number;
  search?: string;
}

export async function fetchPlaces(filters: PlaceFilters = {}): Promise<Place[]> {
  await requireAdmin();
  let query = createServiceClient()
    .from('places')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

  if (filters.status) query = query.eq('status', filters.status);
  if (typeof filters.areaId === 'number') query = query.eq('area_id', filters.areaId);
  if (filters.search?.trim()) {
    // Escape PostgREST's pattern metacharacters so a name containing `%` or a
    // comma cannot rewrite the filter.
    const term = filters.search.trim().replace(/[%_,()]/g, ' ');
    query = query.ilike('name', `%${term}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Could not load places: ${error.message}`);
  return (data ?? []).map((row) => placeSchema.parse(row));
}

export async function fetchPlaceById(id: string): Promise<Place | null> {
  await requireAdmin();
  const { data, error } = await createServiceClient()
    .from('places')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(`Could not load place: ${error.message}`);
  return data ? placeSchema.parse(data) : null;
}

export async function fetchAdminAreas(): Promise<Area[]> {
  await requireAdmin();
  const { data, error } = await createServiceClient().from('areas').select('*').order('sort_order');

  if (error) throw new Error(`Could not load areas: ${error.message}`);
  return (data ?? []).map((row) => areaSchema.parse(row));
}

export interface ReportGroup {
  place: Pick<Place, 'id' | 'slug' | 'name' | 'status' | 'hours' | 'hours_verified'>;
  reports: ReportRow[];
  openCount: number;
}

/**
 * Reports grouped by place, because that is the unit of action: five people
 * reporting the same shutter tells you one thing, and you fix it once.
 */
export async function fetchReportGroups(includeResolved: boolean): Promise<ReportGroup[]> {
  await requireAdmin();
  const client = createServiceClient();

  let query = client
    .from('reports')
    .select(REPORT_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(500);

  if (!includeResolved) query = query.is('resolved_at', null);

  const { data, error } = await query;
  if (error) throw new Error(`Could not load reports: ${error.message}`);

  const reports = (data ?? []).map((row) => reportRowSchema.parse(row));
  if (reports.length === 0) return [];

  const placeIds = [...new Set(reports.map((report) => report.place_id))];
  const { data: placeRows, error: placeError } = await client
    .from('places')
    .select('id,slug,name,status,hours,hours_verified')
    .in('id', placeIds);

  if (placeError) throw new Error(`Could not load reported places: ${placeError.message}`);

  const places = new Map(
    (placeRows ?? []).map((row) => {
      const place = placeSchema
        .pick({ id: true, slug: true, name: true, status: true, hours: true, hours_verified: true })
        .parse(row);
      return [place.id, place];
    }),
  );

  const groups = new Map<string, ReportGroup>();
  for (const report of reports) {
    const place = places.get(report.place_id);
    if (!place) continue; // Place was hard-deleted; the report is noise now.

    const group = groups.get(report.place_id) ?? { place, reports: [], openCount: 0 };
    group.reports.push(report);
    if (!report.resolved_at) group.openCount += 1;
    groups.set(report.place_id, group);
  }

  // Most-complained-about first — that is the thing most likely to be wrong.
  return [...groups.values()].sort(
    (a, b) => b.openCount - a.openCount || b.reports.length - a.reports.length,
  );
}
