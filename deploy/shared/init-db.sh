#!/usr/bin/env bash
set -euo pipefail

if [[ ! ${APP_DATABASE_PASSWORD:-} =~ ^[0-9a-fA-F]{64}$ ]]; then
  printf 'APP_DATABASE_PASSWORD must contain 64 generated hexadecimal characters.\n' >&2
  exit 1
fi

psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
\getenv app_password APP_DATABASE_PASSWORD
CREATE ROLE amamihe LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'app_password';
ALTER DATABASE amamihe OWNER TO amamihe;
SQL

temporary_hba="$PGDATA/pg_hba.conf.tmp"
{
  printf 'hostnossl all all all reject\n'
  cat "$PGDATA/pg_hba.conf"
} > "$temporary_hba"
chmod 0600 "$temporary_hba"
mv "$temporary_hba" "$PGDATA/pg_hba.conf"
