# Production checklist (Hostinger)

Operations to run by hand on the production environment. Never paste a secret value into a ticket, a commit,
a chat or a shell command line (it lands in the shell history): use `read -rs` as shown below.

## Environment variables (hPanel → Node.js app → Environment variables)

| Name | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | `mysql://<user>:<password>@<host>:3306/<database>`. Special characters in the password must be URL-encoded. |
| `AUTH_HMAC_SECRET` | yes | ≥ 32 characters, otherwise login is disabled (logged). |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | yes | base64 of a 16/24/32-byte AES key. Read by `next build` and embedded in the build: must be set **before** the build, same value for every process. |
| `APP_ORIGIN` | yes | `https://trattoriacostantina.fr`. Photo uploads are refused (500, logged) without it. |
| `MEDIA_ROOT` | yes | Absolute path outside the application, e.g. `/home/<user>/domains/<domain>/trattoria-media`. Refused if relative, `/`, inside the app directory (so `public/`, `.next/`) or under `hbuilds/` (replaced at every deployment). Unset or invalid: uploads fail and `/media/*` answers 404, both logged. |
| `AUTH_TRUSTED_IP_HEADER` | no | Leave empty until the proxy header is verified. |
| `HOSTINGER_PROBE_TOKEN` | **no — delete** | Only used by the throwaway `chore/hostinger-probe` branch; nothing in the production code reads it. |

Never upload a `.env*` file: `next start` would load `.env.local` / `.env.production` from the app directory.

## Running the CLI scripts over SSH

hPanel variables are injected into the app process: do not assume they exist in an SSH shell. From the deployed application
directory (the one holding `package.json` and `db/migrations/`):

```sh
read -rs DATABASE_URL && export DATABASE_URL   # paste the URL, nothing is echoed
npm run db:migrate                             # applies pending migrations, prints their names
npm run admin:user -- list                     # account emails
npm run admin:user -- set --email <email>      # create an account or rotate its password (hidden prompt)
unset DATABASE_URL
```

## Retired "boissons" category

Migration 0005 removes `boissons` from the allowed categories (production checked empty on 2026-10-15). It
refuses to apply, without changing any row, while an item is still in that category. Before `npm run db:migrate`
on a database still at 0004, check (read-only):

```sh
npm run menu:recategorize -- list   # must print "No item left in a retired category"
```

or in phpMyAdmin:

```sql
SELECT COUNT(*) AS boissons_items FROM menu_items WHERE category_key = 'boissons';  -- must be 0
```

If items remain (the admin no longer lists them), move them first with
`npm run menu:recategorize -- check mapping.json` then `-- apply mapping.json`, then migrate again.

## Secret rotation

Generate values locally, paste them straight into hPanel, then restart (or redeploy) the app.

### Database password

1. Generate: `openssl rand -hex 24` (hex: nothing to URL-encode). For an existing password with special
   characters: `read -rs P && P="$P" node -e 'console.log(encodeURIComponent(process.env.P))'; unset P`.
2. hPanel → Databases → MySQL → change the user's password.
3. Immediately update `DATABASE_URL` in hPanel and restart the app (the site shows the "menu unavailable"
   message in between).
4. Check: `/carte` lists the menu, admin login works, no `[menu]`/`[auth]` errors in the logs.

Admin sessions are stored in the database: they survive.

### `AUTH_HMAC_SECRET`

Used only to pseudonymise the email and IP of `login_attempts` (`lib/auth/login.ts`). It does not sign
sessions, and photo upload limits (`media_upload_attempts`) are keyed by account id.

1. Generate: `openssl rand -base64 48`.
2. Replace it in hPanel and restart.
3. Effects: admin sessions stay valid; current lockout counters are reset (old rows no longer match and are
   purged after 24 h). To also log every admin out: `DELETE FROM admin_sessions;` (or rotate the passwords with
   `npm run admin:user -- set`, which revokes that account's sessions).
4. Check: admin login works; with the variable missing or too short, the logs say `login disabled`.

### `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`

1. Generate: `openssl rand -base64 32`.
2. Replace it in hPanel, then **rebuild and redeploy** (the key is embedded at build time). Every process must
   run the same build.
3. Effects: admin forms opened before the deployment fail once and work after a reload; nothing stored is lost.
4. Check: save a menu item from the admin, with no "Failed to find Server Action" in the logs.

### `HOSTINGER_PROBE_TOKEN`

Delete the variable in hPanel (and any test application deployed from `chore/hostinger-probe`). Check:
`/api/hostinger-probe` answers 404 on production.
