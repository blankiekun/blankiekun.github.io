// Receives drawings from Paint and notes from Notepad on blankiekun 95 and posts
// them to a private Discord channel. Turnstile keeps bots out; a rate limit per IP
// keeps people from flooding it.
//
// Secrets (wrangler secret put ...): TURNSTILE_SECRET, DISCORD_WEBHOOK_URL
// Vars (wrangler.toml): ALLOWED_ORIGINS, comma-separated

const MAX_BODY = 2_000_000;
const MAX_PNG = 1_500_000;
const MAX_NOTE = 2000;
const MAX_CAPTION = 200;
const MAX_NAME = 40;

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const cors = allowed.includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
    const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' } });
    }
    if (req.method !== 'POST' || new URL(req.url).pathname !== '/send') return json(404, { error: 'Not found.' });
    if (!cors['Access-Control-Allow-Origin']) return json(403, { error: 'This address only accepts messages from blankiekun 95.' });
    if (+(req.headers.get('Content-Length') || 0) > MAX_BODY) return json(413, { error: 'That is too big to send. Try a smaller picture.' });

    const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
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
    } else {
      return json(400, { error: 'Unknown kind of message.' });
    }

    payload.allowed_mentions = { parse: [] }; // nobody gets to @everyone your channel
    fd.append('payload_json', JSON.stringify(payload));
    const res = await fetch(env.DISCORD_WEBHOOK_URL + (env.DISCORD_WEBHOOK_URL.includes('?') ? '&' : '?') + 'wait=true', { method: 'POST', body: fd });
    if (!res.ok) return json(502, { error: 'The message could not be delivered. Try again later.' });
    return json(200, { ok: true });
  },
};

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
