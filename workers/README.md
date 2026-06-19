# Subscription Reminder Worker

This Worker is a scheduler only. It calls the private portfolio endpoint:

`POST /api/cron/subscription-reminders`

Required configuration:

- `PORTFOLIO_CRON_URL`: full HTTPS URL to the portfolio cron endpoint.
- `CRON_SECRET`: secret token matching `CRON_SECRET` in the portfolio app `.env` or private `data/secrets.json`.

Deploy outline:

```bash
cd workers
copy subscription-reminder-wrangler.example.toml wrangler.toml
npx wrangler secret put CRON_SECRET
npx wrangler deploy
```

The example trigger runs every 15 minutes in UTC. Reminder timing is still controlled by the portfolio app's subscription settings.
