#!/usr/bin/env bash
# Throwaway local Postgres for development and for proving the migrations + RLS
# without touching the hosted Supabase project.
#
#   scripts/local-db.sh start     start a cluster on 127.0.0.1:54329
#   scripts/local-db.sh stop
#   scripts/local-db.sh reset     wipe and rebuild from supabase/migrations
#   scripts/local-db.sh psql
#
# Then point the scripts at it:
#   npm run db:push  -- --url=$(scripts/local-db.sh url) --local --fresh
#   npm run rls:test -- --url=$(scripts/local-db.sh url)
set -euo pipefail

PGPORT=54329
PGDATA=${BN_PGDATA:-/var/lib/postgresql/bn}
PGBIN=${BN_PGBIN:-/usr/lib/postgresql/16/bin}
URL="postgresql://postgres@127.0.0.1:${PGPORT}/postgres"
LOG=/var/lib/postgresql/pg.log

as_postgres() {
  if [ "$(id -u)" = "0" ]; then su postgres -c "$1"; else bash -c "$1"; fi
}

case "${1:-}" in
  start)
    if [ ! -d "$PGDATA/base" ]; then
      mkdir -p "$PGDATA" /var/run/postgresql
      chown -R postgres:postgres "$PGDATA" /var/run/postgresql 2>/dev/null || true
      as_postgres "$PGBIN/initdb -D $PGDATA -U postgres --auth=trust -E UTF8" >/dev/null
    fi
    as_postgres "$PGBIN/pg_ctl -D $PGDATA -o '-p $PGPORT -c listen_addresses=127.0.0.1' -l $LOG start -w"
    echo "$URL"
    ;;
  stop)
    as_postgres "$PGBIN/pg_ctl -D $PGDATA stop -w" || true
    ;;
  reset)
    npm run db:push -- --url="$URL" --local --fresh
    npm run seed:areas -- --url="$URL"
    ;;
  psql)
    psql "$URL"
    ;;
  url)
    echo "$URL"
    ;;
  *)
    sed -n '2,12p' "$0"
    exit 1
    ;;
esac
