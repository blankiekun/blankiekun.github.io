// Receives drawings from Paint, notes from Notepad and CONscripter's bug reports on
// blankiekun 95 and posts them to a private Discord channel. Turnstile keeps bots out; a rate limit per IP
// keeps people from flooding it.
//
// Each message gets Ban/Unban link buttons. The links carry a random id that maps
// to the sender's IP in KV, so the IP itself never shows up in Discord.
//
// Secrets (wrangler secret put ...): TURNSTILE_SECRET, DISCORD_WEBHOOK_URL
// Vars (wrangler.toml): ALLOWED_ORIGINS, comma-separated
// KV (wrangler.toml): BANS

const MAX_BODY = 9_500_000; // a bug report's trace; Discord takes 10 MB a message
const MAX_PNG = 1_500_000;
const MAX_NOTE = 2000;
const MAX_CAPTION = 200;
const MAX_NAME = 40;
const BUG_FILES = ['report.json', 'log.txt', 'trace.jsonl.gz'];
const BUG_KINDS = { engine: 'Engine', port: 'Port', site: 'Website', text: 'Text', unsure: 'Unsorted' };
const BAN_TTL = 30 * 86400; // bans and ban links both last 30 days

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const cors = allowed.includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
    const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' } });
    }
    const url = new URL(req.url);
    if (url.pathname === '/ban' || url.pathname === '/unban') return banPage(req, url, env);
    if (req.method !== 'POST' || url.pathname !== '/send') return json(404, { error: 'Not found.' });
    if (!cors['Access-Control-Allow-Origin']) return json(403, { error: 'This address only accepts messages from blankiekun 95.' });
    if (+(req.headers.get('Content-Length') || 0) > MAX_BODY) return json(413, { error: 'That is too big to send. Try a smaller picture.' });

    const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
    if (env.BANS && await env.BANS.get('ban:' + ip)) return json(403, { error: 'You can no longer send messages here.' });
    if (env.LIMITER) {
      const { success } = await env.LIMITER.limit({ key: ip });
      if (!success) return json(429, { error: 'Too many messages from you right now. Try again in a minute.' });
    }

    let form;
    try { form = await req.formData(); } catch { return json(400, { error: 'The message was garbled on the way. Try again.' }); }

    const token = String(form.get('token') || '');
    if (!token || !(await turnstileOk(token, ip, env.TURNSTILE_SECRET))) {
      return json(403, { error: 'The "are you human" check failed or expired. Try again.' });
    }

    const kind = form.get('kind');
    const name = clean(form.get('name'), MAX_NAME) || 'Anonymous';
    const fd = new FormData();
    let payload;

    if (kind === 'note') {
      const text = String(form.get('message') || '').replace(/\r\n/g, '\n').slice(0, MAX_NOTE);
      if (!text.trim()) return json(400, { error: 'The note is empty.' });
      payload = { embeds: [{ title: `Note from ${name}`, description: text, color: 0x000080, footer: { text: 'blankiekun 95 · Notepad' }, timestamp: new Date().toISOString() }] };
    } else if (kind === 'drawing') {
      const file = form.get('file');
      if (!(file instanceof File) || file.size > MAX_PNG) return json(400, { error: 'The drawing is missing or too big.' });
      const bytes = new Uint8Array(await file.arrayBuffer());
      const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
      if (!PNG.every((b, i) => bytes[i] === b)) return json(400, { error: 'Only PNG drawings can be sent.' });
      const caption = clean(form.get('message'), MAX_CAPTION);
      payload = {
        embeds: [{ title: `Drawing from ${name}`, description: caption || undefined, color: 0x008080, image: { url: 'attachment://drawing.png' }, footer: { text: 'blankiekun 95 · Paint' }, timestamp: new Date().toISOString() }],
        attachments: [{ id: 0, filename: 'drawing.png' }],
      };
      fd.append('files[0]', new Blob([bytes], { type: 'image/png' }), 'drawing.png');
    } else if (kind === 'bug') {
      const text = String(form.get('message') || '').replace(/\r\n/g, '\n').slice(0, MAX_NOTE);
      const game = clean(form.get('game'), 100);
      const files = form.getAll('files').filter(f => f instanceof File && BUG_FILES.includes(f.name));
      payload = {
        embeds: [{ title: `${BUG_KINDS[form.get('category')] || 'Unsorted'} bug from ${name}`, description: text || undefined,
          fields: game ? [{ name: 'Game', value: game }] : undefined, color: 0x800000, footer: { text: 'blankiekun 95 · CONscripter' }, timestamp: new Date().toISOString() }],
        attachments: files.map((f, i) => ({ id: i, filename: f.name })),
      };
      files.forEach((f, i) => fd.append(`files[${i}]`, f, f.name));
    } else {
      return json(400, { error: 'Unknown kind of message.' });
    }

    payload.allowed_mentions = { parse: [] }; // nobody gets to @everyone your channel
    if (env.BANS) {
      const id = crypto.randomUUID();
      await env.BANS.put('sender:' + id, ip, { expirationTtl: BAN_TTL });
      payload.components = [{ type: 1, components: [
        { type: 2, style: 5, label: 'Ban sender', url: `${url.origin}/ban?id=${id}` },
        { type: 2, style: 5, label: 'Unban', url: `${url.origin}/unban?id=${id}` },
      ] }];
    }
    fd.append('payload_json', JSON.stringify(payload));
    // with_components lets a plain webhook show link buttons
    const res = await fetch(env.DISCORD_WEBHOOK_URL + (env.DISCORD_WEBHOOK_URL.includes('?') ? '&' : '?') + 'wait=true&with_components=true', { method: 'POST', body: fd });
    if (!res.ok) return json(502, { error: 'The message could not be delivered. Try again later.' });
    return json(200, { ok: true });
  },
};

async function banPage(req, url, env) {
  const page = body => new Response(`<!doctype html><meta name="viewport" content="width=device-width"><title>blankiekun 95</title><body style="font:16px sans-serif;margin:2em">${body}`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  const id = url.searchParams.get('id') || '';
  const ip = env.BANS && /^[0-9a-f-]{36}$/.test(id) ? await env.BANS.get('sender:' + id) : null;
  if (!ip) return page('That link is invalid or has expired.');
  const ban = url.pathname === '/ban';
  // Opening the link only shows a button, so link scanners and previews can't ban anyone.
  if (req.method !== 'POST') return page(`<form method="post"><button style="font-size:1.2em;padding:.4em 1em">${ban ? 'Ban this sender for 30 days' : 'Unban this sender'}</button></form>`);
  if (ban) await env.BANS.put('ban:' + ip, '1', { expirationTtl: BAN_TTL });
  else await env.BANS.delete('ban:' + ip);
  return page(ban ? 'Banned. They can\'t send you anything for 30 days.' : 'Unbanned.');
}

async function turnstileOk(token, ip, secret) {
  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  body.append('remoteip', ip);
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  if (!r.ok) return false;
  const data = await r.json();
  return data.success === true;
}

function clean(v, max) {
  return String(v || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
