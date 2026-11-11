(() => {
  const preview = new URLSearchParams(location.search).get('preview') === '1' && window.parent !== window;
  const payload = preview ? new Promise(resolve => {
    const timeout = setTimeout(() => resolve(null), 5000);
    function receive(event) {
      if (event.origin !== location.origin || event.source !== window.parent || event.data?.type !== 'portfolio-preview-data') return;
      clearTimeout(timeout); window.removeEventListener('message', receive); resolve(event.data.payload);
    }
    window.addEventListener('message', receive);
    window.parent.postMessage({ type: 'portfolio-preview-ready' }, location.origin);
  }) : Promise.resolve(null);

  function safeUrl(value, protocols = ['http:', 'https:']) {
    if (typeof value !== 'string' || !value.trim()) return '';
    try {
      const url = new URL(value, location.origin);
      return protocols.includes(url.protocol) && !url.username && !url.password ? url.href : '';
    } catch { return ''; }
  }

  async function fetchJson(url) {
    const draft = await payload;
    const section = url.match(/^\/api\/portfolio\/(\w+)$/)?.[1] || { '/api/site': 'site', '/api/settings/public': 'settings' }[url];
    if (draft && section && Object.hasOwn(draft, section)) return draft[section];
    const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`Unable to load content (${response.status}).`);
    return response.json();
  }
  window.PortfolioData = { preview, safeUrl, fetchJson };
})();
