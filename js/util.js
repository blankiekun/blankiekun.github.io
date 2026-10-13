// Small DOM helpers shared by the shell and the apps.

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k);
  return el;
}

// An icon from the sprite in index.html.
export function icon(id, cls) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  if (cls) svg.setAttribute('class', cls);
  const use = document.createElementNS(ns, 'use');
  use.setAttribute('href', '#' + id);
  svg.append(use);
  return svg;
}

// "&File" -> F<u>i</u>le markup, plus the access key.
export function accel(label) {
  const i = label.indexOf('&');
  if (i < 0) return { html: esc(label), key: null };
  return {
    html: esc(label.slice(0, i)) + '<u>' + esc(label[i + 1]) + '</u>' + esc(label.slice(i + 2)),
    key: label[i + 1].toLowerCase(),
  };
}

export function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function download(name, blob) {
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const store = {
  get(k, fallback) {
    try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
  },
};

export const small = matchMedia('(max-width: 640px), (max-height: 420px)');
export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
export const wait = ms => new Promise(r => setTimeout(r, ms));
