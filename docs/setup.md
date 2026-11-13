# Initial Setup Guide

This app stores runtime content in `data/`, and `data/` is intentionally gitignored. A fresh clone needs local data files before the public site and admin panel can load portfolio content.

## 1. Prepare Accounts And Secrets

Before deploying, decide or create:

- Admin username and password for `/admin.html`.
- SMTP mailbox or app password for contact-form and subscription reminder emails.
- `SESSION_SECRET`, a long random string for Express sessions.
- `CRON_SECRET`, a long random string for Linux cron or Cloudflare Worker calls.
- Optional Google Analytics Measurement ID.
- Optional public domain and HTTPS reverse proxy.

## 2. Install Dependencies

Install Node.js 20.9 or newer, then install on the target operating system (Sharp uses a platform-specific image processor).

```bash
npm ci
```

## 3. Generate Local Data And Env Files

Run:

```bash
npm run setup
```

This creates missing files only. It does not overwrite existing `.env` or `data/*.json` files.

To generate `ADMIN_PASSWORD_HASH` from a password during first setup:

Linux/macOS:

```bash
ADMIN_PASSWORD='replace-with-your-password' npm run setup
```

Windows PowerShell:

```powershell
$env:ADMIN_PASSWORD='replace-with-your-password'
npm run setup
Remove-Item Env:ADMIN_PASSWORD
```

If `.env` already exists and you need to rotate the admin password, use the admin Settings page or replace `ADMIN_PASSWORD_HASH` manually.

## 4. Files Created By Setup

`npm run setup` ensures these private runtime files exist:

```text
data/profile.json
data/skills.json
data/interests.json
data/resume.json
data/contact.json
data/projects.json
data/settings.json
data/site.json
data/subscriptions.json
data/secrets.json
```

These are local/private because `data/` is gitignored. The subscription data shape is documented in `docs/subscriptions.example.json`.

The app also creates private session storage, recovery revisions, activity, and diagnostic files as needed. Their contents and backup requirements are documented in [Admin Operations](admin.md#runtime-files). New files use owner-only permissions where the operating system supports them.

## 5. Configure `.env`

At minimum, configure:

```env
PORT=3003
NODE_ENV=production
SESSION_SECRET=long_random_value
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=bcrypt_hash
EMAIL_USERNAME=you@example.com
EMAIL_PASSWORD=email_or_app_password
EMAIL_HOST=derrickml.com
EMAIL_PORT=465
EMAIL_TO=you@example.com
CRON_SECRET=long_random_value
```

Use `NODE_ENV=development` when opening the app over plain localhost HTTP. Production requires HTTPS for the secure admin session cookie. Configure a random session secret of at least 32 characters. Optional `DATA_DIR` and `UPLOADS_DIR` overrides support mounted storage; private data must remain outside `public/`.

Generate a bcrypt hash manually:

```bash
node -e "require('bcryptjs').hash('YOUR_PASSWORD', 12).then(console.log)"
```

## 6. Verify And Run

```bash
npm test
npm start
```

Open:

```text
http://localhost:3003/admin.html
```

Then configure:

- Profile, resume, skills, interests, contact, projects.
- Settings: SMTP, images, public labels, analytics.
- Subscriptions: renewal entries, reminder recipient, timezone, reminder schedule.

Use Preview to check public drafts, then Publish changes. Verify the saved SMTP connection in Settings > Email; send a test message separately when ready. Create a recovery snapshot and export a backup after initial configuration. See [Admin Operations](admin.md) for publishing and recovery.

## 7. Configure Reminder Cron

The app owns the reminder logic. A scheduler only calls:

```http
POST /api/cron/subscription-reminders
Authorization: Bearer <CRON_SECRET>
```

Linux crontab example:

```bash
*/15 * * * * curl -fsS -X POST http://127.0.0.1:3003/api/cron/subscription-reminders -H "Authorization: Bearer YOUR_CRON_SECRET" -H "Content-Type: application/json" --data '{"source":"linux-cron"}' >/dev/null 2>&1
```

Cloudflare Worker setup is documented in `workers/README.md`.

Run one app process per data directory. Confirm that Overview's last reminder check advances after your scheduler calls the app. Merely configuring `CRON_SECRET` does not install a scheduler.

## 8. Rebuild Local Data From Defaults

For a clean local reset only:

```bash
node scripts/setup-data.js --force
```

This rewrites `data/*.json`, so do not use it on production data unless you have a backup.

For recovery from an exported backup, use `npm run restore:backup -- backup.json new-directory` instead. It validates the bundle and restores into a new directory without overwriting current data. Credentials require a separate secure backup.

## 9. Deploy Or Update On cPanel

For Passenger-based **Setup Node.js App** or **Application Manager** hosting:

1. Back up the existing `.env`, `data/`, and uploads. Git intentionally does not contain your live data or secrets. Do not delete these directories or run setup with `--force` during an update.
2. Deploy the complete repository into the configured application root, not just `public/`. The root must contain `server.js`, `package.json`, `package-lock.json`, and `lib/`. Set the startup file to `server.js`.
3. Select Node.js 20.9 or newer. Use the app's **Run NPM Install** action to install the updated dependencies in the hosting environment. Sharp needs its Linux platform package; do not upload Windows `node_modules`. If using Terminal, activate the Node environment shown by cPanel before installing packages.
4. Preserve the production environment settings, including a random `SESSION_SECRET` of at least 32 characters. The application user must be able to write the private data directory and uploads. Keep private data outside the public document root. Run `npm run setup` only when missing defaults need to be created; existing files are preserved.
5. Restart the Node application after deploying code and installing dependencies. Updating files alone can serve new frontend JavaScript while the old backend is still in memory. For Passenger Application Manager, updating `tmp/restart.txt` in the application root triggers a restart on the next request, as described in [cPanel's restart guide](https://support.cpanel.net/hc/en-us/articles/1500002443862-How-to-restart-an-application-that-s-using-cPanel-s-Application-Manager).
6. Reload the admin page and sign in again. Clear any cached admin JavaScript, and exclude `/api/admin/*` from proxy/CDN caching.

Passenger loads the startup file with `require()`. The server therefore starts when Passenger is detected as well as when invoked directly with `node server.js`; ordinary test imports do not start a listener. See [Passenger's application loader](https://github.com/phusion/passenger/blob/stable-6.0/src/helper-scripts/node-loader.js).

### Diagnose Admin Loading Errors

The admin now reads editable content from `/api/admin/portfolio/:section`, not the public `/api/portfolio/:section` route, so it can receive version headers for safe saves. This does not require rewriting existing content JSON files.

- `GET /api/admin/check` should return JSON with `authenticated` and a session-bound `csrfToken`. Do not share the token or your session cookie.
- Without signing in, `GET /api/admin/portfolio/profile` should return `401` JSON. After signing in, it should return `200` JSON with `X-Data-Version` and `X-Saved-At` headers.
- An HTML `404` saying `Cannot GET /api/admin/portfolio/profile`, especially when the auth check lacks `csrfToken`, indicates an older backend or a request reaching the wrong application. Check the application root, deployed `server.js`, and restart status before editing data files.
- HTML `502` or `503` responses usually require checking Passenger/application logs for startup errors, missing dependencies, an unsupported Node version, or filesystem permissions.
- A JSON error reading a section points to its file or permissions in `DATA_DIR`. Preserve existing files and inspect the application log; do not reset the entire data directory.
