# Admin Operations

Open `/admin.html` and sign in with the configured administrator account. The Overview page shows content issues, upcoming renewals, saved email configuration, reminder activity, recovery points, and recent administrative activity.

## Editing And Publishing

- Profile, Skills, Interests, Resume, Projects, and Contact use explicit **Publish changes** actions. Project modal edits and reordered items are staged in the current draft.
- Subscription changes are staged until **Save changes**. Sending reminders uses the saved subscription configuration, not an unsaved draft.
- Save buttons stay disabled until the section changes. The status bar shows the last saved time, pending changes, and saving state.
- Public-content drafts and public site labels are stored in `sessionStorage` for the current browser tab. Reloading offers **Resume draft** or discard. Signing out clears these drafts. Closing the tab clears them according to the browser's session-storage lifecycle.
- SMTP credentials and private subscription details are never persisted in browser draft storage. Their unsaved edits stay in memory; the browser warns before leaving.
- Switching admin sections preserves unsaved edits. **Discard** restores the last loaded version; **Reload latest saved version** fetches the current server version.
- Concurrent editing is detected using content versions. A stale save returns `409` without replacing the server file. Reload the latest version before continuing. Resuming an older stored draft requires an explicit choice to replace the working copy.
- **Preview** opens the actual public portfolio with current public drafts. The desktop and mobile controls change its frame size. Drafts are passed only to a same-origin child frame; SMTP credentials and subscription data are excluded. Analytics and contact submission are disabled in this preview.

## Settings

Settings is grouped into Site, Images, Email, Security, Public labels, and Automation.

- Site controls navigation, public section visibility, and the testimonials source.
- Images controls the background, About photo, and analytics. Upload an image, paste a web URL, or browse existing uploads.
- Email controls SMTP. Leave the password blank to preserve its current value. **Verify saved connection** checks SMTP connection/authentication without sending mail. It does not prove mailbox delivery. Changing saved settings invalidates that verification status.
- Security changes the admin password and lists recent activity. A password change rotates the current session and invalidates other logged-in sessions. Passwords must be at least 12 characters and at most 72 UTF-8 bytes, matching bcrypt's input limit.
- Automation shows the last reminder run. A configured token does not mean cron is installed or running; confirm the last-run timestamp after setting up your scheduler.

## Media

Uploads accept JPEG, PNG, WebP, and GIF, up to 8 MB and 40 million decoded pixels. Sharp decodes the file, applies orientation, strips metadata, resizes it without enlarging, and writes WebP. Backgrounds fit within 2560 pixels; other images fit within 1600 pixels. Existing files are unchanged.

The library shows size, grouping, and saved references. Only unreferenced uploads can be deleted. An image retained by revision history is protected so restoring an older revision does not create a missing image. Browser drafts are not server references; save a draft before deleting media it needs.

**Check saved links** checks up to 24 unique saved profile, contact, project, and publication URLs. It uses bounded HEAD requests. `404` and `410` responses appear as content issues; access restrictions and timeouts are reported as unavailable/unverified. Some valid sites block automated HEAD requests. Testimonials and link checks reject private network addresses, including redirect targets, and verify DNS results when opening the connection.

## Recovery And Export

Every successful content/configuration save retains a copy of the previous file. There are at most 30 revisions per section. **Create snapshot** records all nine content/configuration files. Review a revision before restoring it; restoration first backs up the current file. Subscription restoration preserves current delivery history to avoid re-sending already delivered reminders. Restoring Settings does not reset credentials.

**Export backup** downloads a versioned JSON bundle containing all nine files and uploaded image bytes (up to 100 MB of media). The export includes private subscription details. Store it securely. It excludes `.env`, `secrets.json`, active sessions, and historical revisions. Recovery snapshots are on the same disk as the application; they do not protect against server/disk loss.

To restore an export into a new directory:

```bash
npm run restore:backup -- portfolio-backup-2026-09-11.json ./restored-portfolio
```

The destination must not exist. The entire bundle is validated before a new directory is created. Existing content is never overwritten. The command creates `restored-portfolio/data/` and `restored-portfolio/uploads/`. Review the restored content, stop the application, and set `DATA_DIR` and `UPLOADS_DIR` in `.env` to those absolute directories. Restore `.env` and `secrets.json` separately from a secure server backup, or reconfigure the admin and SMTP credentials. `npm run setup` can create missing defaults in the configured data directory, then `npm start` starts the restored application.

For disaster recovery, regularly back up `.env`, the complete `data/` directory, and `public/assets/uploads/` (or your configured directories) to a separate disk/service. Restrict filesystem access to the app's Linux user. Do not place private storage under `public/`.

## Runtime Files

In addition to the ten initial JSON files, these private files/directories are created automatically as needed:

| Path | Contents |
| --- | --- |
| `data/revisions/` | Previous content versions, 30 per editable section |
| `data/sessions/` | Persistent sessions, 24-hour expiry |
| `data/activity.json` | Latest 200 administrative events; no passwords or request bodies |
| `data/automation.json` | Last reminder run time, outcome, and count |
| `data/smtp-check.json` | Last SMTP verification and configuration version |
| `data/link-check.json` | Last saved-link check results |

New private files are created with owner-only permissions where supported. Existing deployments should verify their directory permissions. Keep these paths gitignored and outside the public document root.

## Deployment And Testing

Use Node.js 20.9 or newer; choose Node.js 22 or 24 for production according to the [Node.js release schedule](https://nodejs.org/en/about/previous-releases). Image processing requires Sharp's platform package, so install dependencies on the deployment platform with optional dependencies enabled (`npm ci`). Do not copy Windows `node_modules` to Linux.

Run one Node process per data directory. The JSON store and reminder lock are designed for this topology. Do not use PM2 cluster mode or share the directory between app instances. Multiple schedulers can call the same process; overlapping scans are rejected with `409`. Delivery history prevents repeats on later scans, and non-digest delivery records each successful email before moving to the next. SMTP delivery and filesystem writes cannot form one transaction: a crash after SMTP accepts a message but before history is saved can still cause a retry. Reminder offsets apply on the scheduled local calendar day; missed days are not automatically replayed.

Set `NODE_ENV=production`, serve HTTPS through one trusted reverse proxy, and configure a random `SESSION_SECRET` of at least 32 characters. Restrict direct access to the Node port. Admin cookies are HttpOnly, SameSite=Lax, and Secure in production.

All admin mutations, including login/logout, require an `X-CSRF-Token` obtained from `GET /api/admin/check` in the same cookie session. Protected content reads return `X-Data-Version` and `X-Saved-At`. Send that version in `If-Match` for PUT saves and revision restoration; missing versions return `428` and stale versions return `409`. Validation returns `400` with a `fields` array. The cron route continues to use its bearer token and does not need an admin cookie or CSRF token.

`npm test` runs syntax checks and Node integration tests against temporary data/upload directories. Tests exercise authentication, CSRF, validation, conflicting writes, image processing/deletion, backup export/restore, reminder concurrency/history, and password/session changes. SMTP is mocked; tests do not send real email or edit production data. Run `npm audit --omit=dev` when updating dependencies.
