async function triggerSubscriptionReminders(env) {
  if (!env.PORTFOLIO_CRON_URL || !env.CRON_SECRET) {
    return new Response('Missing PORTFOLIO_CRON_URL or CRON_SECRET', { status: 500 });
  }

  const response = await fetch(env.PORTFOLIO_CRON_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CRON_SECRET}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ source: 'cloudflare-worker' }),
  });

  const body = await response.text();
  return new Response(body, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'application/json',
    },
  });
}

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(triggerSubscriptionReminders(env));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/trigger') {
      return new Response('Not found', { status: 404 });
    }
    return triggerSubscriptionReminders(env);
  },
};
