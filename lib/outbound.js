const dns = require('dns');
const http = require('http');
const https = require('https');
const net = require('net');
const ipaddr = require('ipaddr.js');
const fetch = require('node-fetch');

function isPublicAddress(address) {
    try { return ipaddr.process(address).range() === 'unicast'; } catch { return false; }
}

function lookup(hostname, options, callback) {
    dns.lookup(hostname, { all: true }, (error, addresses) => {
        if (error) return callback(error);
        if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) return callback(new Error('Private network destinations are not allowed.'));
        if (options?.all) return callback(null, addresses);
        callback(null, addresses[0].address, addresses[0].family);
    });
}

async function publicFetch(input, options = {}) {
    let url = new URL(input);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
        for (let redirects = 0; redirects <= 4; redirects += 1) {
            const hostname = url.hostname.replace(/^\[|\]$/g, '');
            if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (net.isIP(hostname) && !isPublicAddress(hostname))) throw new Error('Only public web URLs are allowed.');
            const Agent = url.protocol === 'https:' ? https.Agent : http.Agent;
            const response = await fetch(url.href, { ...options, agent: new Agent({ lookup }), signal: controller.signal, redirect: 'manual', size: 1024 * 1024 });
            if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.get('location')) {
                response.body.destroy();
                url = new URL(response.headers.get('location'), url);
                continue;
            }
            if (options.method === 'HEAD') { response.body.destroy(); return { status: response.status, ok: response.ok }; }
            const data = await response.json();
            return { status: response.status, ok: response.ok, data };
        }
        throw new Error('Too many redirects.');
    } finally { clearTimeout(timer); }
}

module.exports = { publicFetch, isPublicAddress };
