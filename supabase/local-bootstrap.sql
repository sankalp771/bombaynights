-- Local-only: recreate the roles Supabase provisions for you in the cloud, so
-- migrations and the RLS test suite can run against a plain Postgres instance.
-- This file is NEVER applied to the hosted project (`db:push` only runs it with
-- --local), because those roles already exist there.

do $$ begin
  create role anon nologin noinherit;
exception when duplicate_object then null; end $$;

do $$ begin
  create role authenticated nologin noinherit;
exception when duplicate_object then null; end $$;

do $$ begin
  create role service_role nologin noinherit bypassrls;
exception when duplicate_object then null; end $$;

-- Supabase's PostgREST connects as `authenticator` and switches roles.
do $$ begin
  create role authenticator login noinherit password 'postgres';
exception when duplicate_object then null; end $$;

grant anon, authenticated, service_role to authenticator;
grant usage on schema public to anon, authenticated, service_role;

-- Mirror Supabase's default: new tables are readable by the API roles unless a
-- migration revokes it. Our 0002_rls.sql revokes deliberately, and the RLS test
-- proves the revoke actually took effect.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
