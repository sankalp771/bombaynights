-- BombayNights — Row Level Security (docs/02 § Security model)
--
-- RLS is the wall; app code is convenience. The anon key ships to every
-- browser, so assume it is public and make the database refuse anything the
-- public should not be able to do.
--
-- Rules encoded here:
--   places       — anon/authenticated may SELECT only status = 'approved'.
--                  No public insert/update/delete, ever.
--   areas        — fully public read (needed for the area chips), no writes.
--   submissions  — no public access at all. Public writes go through server-side
--                  API routes using the service-role key, after Zod validation
--                  and rate limiting.
--   reports      — same as submissions.
--
-- The service-role key bypasses RLS by design; it must never reach the client
-- bundle (verified in Phase 4).

alter table areas       enable row level security;
alter table places      enable row level security;
alter table submissions enable row level security;
alter table reports     enable row level security;

-- Even a future policy mistake should not be able to let the public role write.
-- Start from zero privilege, then grant back exactly what is needed.
revoke all on table areas       from anon, authenticated;
revoke all on table places      from anon, authenticated;
revoke all on table submissions from anon, authenticated;
revoke all on table reports     from anon, authenticated;

revoke all on sequence areas_id_seq from anon, authenticated;

grant select on table areas  to anon, authenticated;
grant select on table places to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Policies. A table with RLS enabled and no matching policy denies by default,
-- so the absence of insert/update/delete policies below is the protection.
-- ---------------------------------------------------------------------------

drop policy if exists "areas are public" on areas;
create policy "areas are public"
  on areas for select
  to anon, authenticated
  using (true);

drop policy if exists "approved places are public" on places;
create policy "approved places are public"
  on places for select
  to anon, authenticated
  using (status = 'approved');

-- submissions and reports intentionally have NO policies: RLS-enabled with zero
-- policies means every anon/authenticated statement is rejected. Server-side
-- routes use the service-role key, which bypasses RLS.
