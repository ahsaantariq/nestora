# Move Nestora from Supabase to your own Postgres

Supabase is used only as a Postgres host. Auth stays on this app (email and password). Photos stay on Cloudinary. No Supabase client, storage, or row-level security is required.

You need two environment variables:

| Variable | What it is |
| --- | --- |
| `DATABASE_URL` | What the running app uses. A pooler is allowed. |
| `DIRECT_URL` | What creates tables. Direct session, port **5432**. |

On a VPS, set both to the same URL.

## 1. Dump Supabase

Use the **direct** connection (port 5432), not the pooler.

```bash
pg_dump \
  --format=custom \
  --no-owner \
  --no-acl \
  --file=nestora.dump \
  "postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres"
```

`--no-owner` and `--no-acl` avoid Supabase roles that do not exist on the VPS.

## 2. Create the database on the VPS

```bash
sudo -u postgres createuser --pwprompt nestora
sudo -u postgres createdb --owner=nestora nestora
```

Allow the app server to connect in `pg_hba.conf` (password, or local peer if the app runs on the same machine), then reload Postgres.

## 3. Restore

```bash
pg_restore \
  --no-owner \
  --no-acl \
  --dbname="postgresql://nestora:PASSWORD@127.0.0.1:5432/nestora" \
  nestora.dump
```

If a few extensions fail to restore, that is expected. Nestora uses core Postgres only. Restore the tables, then start the app: `npm run db:setup` applies any newer migration files without dropping what you restored.

## 4. Change the environment

```bash
DATABASE_URL=postgresql://nestora:PASSWORD@127.0.0.1:5432/nestora
DIRECT_URL=postgresql://nestora:PASSWORD@127.0.0.1:5432/nestora
ADMIN_EMAIL=you@example.com
```

Restart the app. Open `/api/health`. You want `databaseConnected: true` and a table count above zero. If it fails, the `fix` field says whether the URL is still a pooler.

## 5. Confirm

```bash
psql "$DIRECT_URL" -c "\dt"
```

You should see `profiles`, `properties`, `bookings`, `platform_settings`, and `_migrations`.

Sign in as `ADMIN_EMAIL`. That account is the operator. Any other account is a guest until you approve them as a host.

## Daily backup

```cron
15 3 * * * pg_dump --format=custom --no-owner --no-acl --file=/var/backups/nestora-$(date +\%F).dump "postgresql://nestora:PASSWORD@127.0.0.1:5432/nestora" && find /var/backups -name 'nestora-*.dump' -mtime +14 -delete
```

Put the real URL in a root-only file and source it from the cron line if you do not want the password in the crontab. Restore a drill with `pg_restore` onto a second database before you need it.
