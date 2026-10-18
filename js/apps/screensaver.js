// Screen savers: the savers themselves, the idle timer that starts them, the
// full-screen runner with its password box, and the Screen Saver tab of
// Display Properties. Choices are remembered in this browser only.

import { h, icon, clamp, store, reducedMotion } from '../util.js';
import { createWindow, all } from '../wm.js';
import { msgbox } from '../dialogs.js';
import { OS, V } from '../version.js';

const KEY = 'w95.screensaver';

// 3D Maze came with the 95-era Plus! pack and stayed through XP.
const MAZE = ['95', '98', 'me', '2000', 'xp'].includes(V.id);

export const SAVERS = {
  none: '(None)',
  ...(MAZE ? { maze: '3D Maze' } : {}),
  blank: 'Blank Screen',
  flying: 'Flying Windows',
  mystify: 'Mystify Your Mind',
  pipes: 'Pipes',
  marquee: 'Scrolling Marquee',
  stars: V.id === '95' ? 'Flying Through Space' : 'Starfield Simulation',
};

const DEFAULTS = {
  saver: 'flying', wait: 10, password: false, hash: null,
  stars: { speed: 5, density: 200 },
  flying: { speed: 5, count: 20 },
  mystify: { polys: 2, lines: 6, colors: 'multi' },
  marquee: { text: OS, speed: 5, bg: '#000000', fg: '#ff00ff' },
  pipes: { speed: 5 },
};

export function loadScreenSaver() {
  const s = store.get(KEY, null) || {};
  const out = { ...DEFAULTS, ...s };
  for (const k of ['stars', 'flying', 'mystify', 'marquee', 'pipes']) out[k] = { ...DEFAULTS[k], ...(s[k] || {}) };
  if (!SAVERS[out.saver]) out.saver = DEFAULTS.saver;
  return out;
}

export function setScreenSaver(saver) { store.set(KEY, { ...loadScreenSaver(), saver }); }

const copy = o => JSON.parse(JSON.stringify(o));

// Not security: the password only keeps a passer-by from dismissing a screen
// saver in this one browser, just for fun. It is stored as a small hash.
function hashPw(s) {
  let a = 5381;
  for (const c of String(s)) a = (Math.imul(a, 33) ^ c.codePointAt(0)) >>> 0;
  return 'h' + a.toString(36);
}

/* ---------- the savers ---------- */

// Each factory gets a 2D context, the canvas size and its own settings, and
// returns a frame function called with the seconds since the last frame.
// k slows everything down when the visitor prefers reduced motion.

const rnd = (a, b) => a + Math.random() * (b - a);

function blank(ctx, w, hgt) {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, hgt);
  return () => {};
}

function stars(ctx, w, hgt, o, k) {
  const n = Math.round(clamp(o.density, 10, 500) * clamp((w * hgt) / (800 * 600), 0.2, 2));
  const f = Math.max(w, hgt) / 2, cx = w / 2, cy = hgt / 2, px = Math.max(1, Math.round(Math.min(w, hgt) / 300));
  const spawn = (s, far) => Object.assign(s, { x: rnd(-1, 1), y: rnd(-1, 1), z: far ? 1 : rnd(0.05, 1) });
  const list = Array.from({ length: n }, () => spawn({}, false));
  return dt => {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, hgt);
    const v = dt * (0.08 + clamp(o.speed, 1, 10) * 0.09) * k;
    for (const s of list) {
      s.z -= v;
      const x = Math.round(cx + s.x * f / s.z), y = Math.round(cy + s.y * f / s.z);
      if (s.z <= 0.02 || x < -4 || y < -4 || x > w + 4 || y > hgt + 4) { spawn(s, true); continue; }
      // Stars brighten and grow as they come closer.
      const near = 1 - s.z, g = Math.round(110 + near * 145);
      ctx.fillStyle = `rgb(${g},${g},${g})`;
      const sz = px * (near > 0.85 ? 3 : near > 0.6 ? 2 : 1);
      ctx.fillRect(x, y, sz, sz);
    }
  };
}

// The four-pane flag from the Start button, waving as it flies.
function drawFlag(ctx, cx, cy, W, phase) {
  const H = W * 0.82;
  if (W < 4) { ctx.fillStyle = ['#ff0000', '#00a000', '#0000ff', '#ffff00'][Math.floor(phase) & 3]; ctx.fillRect(Math.round(cx), Math.round(cy), 1, 1); return; }
  const N = clamp(Math.round(W / 3), 4, 28), gap = 0.07, amp = H * 0.08;
  const left = cx - W / 2, top = cy - H / 2, ph = H * (0.5 - gap / 2);
  for (let i = 0; i < N; i++) {
    const u = (i + 0.5) / N;
    if (Math.abs(u - 0.5) < gap / 2) continue;
    // The pole side stays put and the wave grows toward the free edge.
    const off = Math.sin(phase + u * 4.2) * amp * (0.25 + u) - u * H * 0.12;
    const x = Math.round(left + i * W / N), x2 = Math.round(left + (i + 1) * W / N);
    const y1 = Math.round(top + off), y2 = Math.round(top + H * (0.5 + gap / 2) + off), hp = Math.max(1, Math.round(ph));
    ctx.fillStyle = u < 0.5 ? '#ff0000' : '#00a000'; ctx.fillRect(x, y1, x2 - x, hp);
    ctx.fillStyle = u < 0.5 ? '#0000ff' : '#ffff00'; ctx.fillRect(x, y2, x2 - x, hp);
  }
}

function flying(ctx, w, hgt, o, k) {
  const n = clamp(o.count, 1, 50), cx = w / 2, cy = hgt / 2, f = Math.max(w, hgt) / 2, base = Math.max(4, Math.min(w, hgt) * 0.035);
  const spawn = (s, far) => Object.assign(s, { x: rnd(-0.9, 0.9), y: rnd(-0.9, 0.9), z: far ? 1 : rnd(0.15, 1), ph: rnd(0, 6.28) });
  const list = Array.from({ length: n }, () => spawn({}, false));
  return dt => {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, hgt);
    const v = dt * (0.04 + clamp(o.speed, 1, 10) * 0.035) * k;
    list.sort((a, b) => b.z - a.z);
    for (const s of list) {
      s.z -= v; s.ph += dt * 5 * k;
      const W = base / s.z, x = cx + s.x * f / s.z, y = cy + s.y * f / s.z;
      if (s.z <= 0.05 || x + W < 0 || x - W > w || y + W < 0 || y - W > hgt) { spawn(s, true); continue; }
      drawFlag(ctx, x, y, W, s.ph);
    }
  };
}

function mystify(ctx, w, hgt, o, k) {
  const sp = Math.min(w, hgt) * 0.45;
  const fixed = ['#ff00ff', '#00ffff', '#ffff00', '#00ff00'], hue0 = rnd(0, 360);
  const polys = Array.from({ length: clamp(o.polys, 1, 4) }, (_, i) => ({
    pts: Array.from({ length: 4 }, () => ({ x: rnd(0, w), y: rnd(0, hgt), vx: rnd(0.4, 1) * sp * (Math.random() < 0.5 ? -1 : 1), vy: rnd(0.4, 1) * sp * (Math.random() < 0.5 ? -1 : 1) })),
    hue: (hue0 + i * 137) % 360, trail: [], color: fixed[i],
  }));
  const lines = clamp(o.lines, 1, 15);
  let acc = 0;
  return dt => {
    dt *= k;
    for (const p of polys) {
      for (const q of p.pts) {
        q.x += q.vx * dt; q.y += q.vy * dt;
        if (q.x < 0) { q.x = 0; q.vx = Math.abs(q.vx); } else if (q.x > w - 1) { q.x = w - 1; q.vx = -Math.abs(q.vx); }
        if (q.y < 0) { q.y = 0; q.vy = Math.abs(q.vy); } else if (q.y > hgt - 1) { q.y = hgt - 1; q.vy = -Math.abs(q.vy); }
      }
      p.hue = (p.hue + dt * 45) % 360;
    }
    // A new copy of each polygon joins its trail every few hundredths of a second.
    acc += dt;
    if (acc >= 0.05 || !polys[0].trail.length) {
      acc = 0;
      for (const p of polys) {
        p.trail.push({ pts: p.pts.map(q => [Math.round(q.x) + 0.5, Math.round(q.y) + 0.5]), c: o.colors === 'two' ? p.color : `hsl(${Math.round(p.hue)},100%,55%)` });
        while (p.trail.length > lines) p.trail.shift();
      }
    }
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, hgt);
    ctx.lineWidth = 1;
    for (const p of polys) for (const t of p.trail) {
      ctx.strokeStyle = t.c;
      ctx.beginPath();
      t.pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
      ctx.closePath(); ctx.stroke();
    }
  };
}

function marquee(ctx, w, hgt, o, k) {
  const size = Math.max(10, Math.round(Math.min(w, hgt) * 0.12));
  const text = String(o.text || ' ').slice(0, 200);
  ctx.font = `${size}px "Times New Roman", Times, serif`;
  const tw = ctx.measureText(text).width;
  const v = (0.08 + clamp(o.speed, 1, 10) * 0.05) * w;
  let x = w, y = 0;
  const place = () => { x = w; y = Math.round(rnd(size, Math.max(size + 1, hgt - size * 0.4))); };
  place();
  return dt => {
    x -= v * dt * k;
    if (x < -tw) place();
    ctx.fillStyle = o.bg; ctx.fillRect(0, 0, w, hgt);
    ctx.font = `${size}px "Times New Roman", Times, serif`;
    ctx.fillStyle = o.fg; ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, Math.round(x), y);
  };
}

// Pipes in a flat isometric drawing: the grid is 3D, the picture is not.
function pipes(ctx, w, hgt, o, k) {
  const c = Math.max(6, Math.round(Math.min(w, hgt) / 16));
  const C30 = 0.866;
  let n = Math.max(3, Math.floor(Math.min(w / (2 * C30 * c), hgt / c - 3)));
  const nk = Math.max(3, Math.floor(hgt / c - n) - 1);
  const x0 = w / 2, y0 = (hgt - (n + nk) * c) / 2 + nk * c;
  const proj = ([i, j, l]) => [x0 + (i - j) * c * C30, y0 + (i + j) * c * 0.5 - l * c];
  const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const COLORS = [[255, 0, 0], [0, 200, 0], [0, 80, 255], [255, 255, 0], [0, 255, 255], [255, 0, 255], [220, 220, 220]];
  const rgb = (a, t) => `rgb(${a.map(v => Math.round(t < 1 ? v * t : v + (255 - v) * (t - 1))).join(',')})`;
  const inside = ([i, j, l]) => i >= 0 && j >= 0 && l >= 0 && i < n && j < n && l < nk;
  let used, pipe, segs, pipesDone, acc = 0;
  const id = p => p.join(',');
  function reset() {
    used = new Set(); segs = 0; pipesDone = 0; pipe = null;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, hgt);
  }
  function newPipe() {
    for (let tries = 0; tries < 40; tries++) {
      const p = [Math.floor(rnd(0, n)), Math.floor(rnd(0, n)), Math.floor(rnd(0, nk))];
      if (used.has(id(p))) continue;
      used.add(id(p));
      pipe = { p, d: null, col: COLORS[Math.floor(rnd(0, COLORS.length))] };
      ball(p);
      return;
    }
    reset();
  }
  function ball(p) {
    const [x, y] = proj(p);
    ctx.fillStyle = rgb(pipe.col, 0.45); ctx.beginPath(); ctx.arc(x, y, c * 0.34, 0, 7); ctx.fill();
    ctx.fillStyle = rgb(pipe.col, 1); ctx.beginPath(); ctx.arc(x - c * 0.05, y - c * 0.05, c * 0.25, 0, 7); ctx.fill();
    ctx.fillStyle = rgb(pipe.col, 1.6); ctx.fillRect(Math.round(x - c * 0.14), Math.round(y - c * 0.16), Math.max(1, Math.round(c * 0.08)), Math.max(1, Math.round(c * 0.08)));
  }
  function seg(a, b) {
    const [ax, ay] = proj(a), [bx, by] = proj(b);
    ctx.lineCap = 'butt';
    for (const [t, wd, dx] of [[0.45, 0.5, 0], [1, 0.36, 0], [1.55, 0.1, -0.08]]) {
      ctx.strokeStyle = rgb(pipe.col, t); ctx.lineWidth = Math.max(1, c * wd);
      ctx.beginPath(); ctx.moveTo(ax + dx * c, ay + dx * c); ctx.lineTo(bx + dx * c, by + dx * c); ctx.stroke();
    }
  }
  function step() {
    if (!pipe) return newPipe();
    const free = DIRS.filter(d => { const q = pipe.p.map((v, i) => v + d[i]); return inside(q) && !used.has(id(q)); });
    if (!free.length || segs > n * n * nk * 0.3) {
      pipe = null;
      if (++pipesDone > 9 || segs > n * n * nk * 0.3) reset();
      return;
    }
    const keep = pipe.d && free.some(d => d === pipe.d) && Math.random() > 0.25;
    const d = keep ? pipe.d : free[Math.floor(rnd(0, free.length))];
    const q = pipe.p.map((v, i) => v + d[i]);
    if (pipe.d && d !== pipe.d) ball(pipe.p);
    seg(pipe.p, q);
    used.add(id(q)); segs++;
    pipe.p = q; pipe.d = d;
  }
  reset();
  return dt => {
    acc += dt * (4 + clamp(o.speed, 1, 10) * 5) * k;
    for (let i = 0; i < 20 && acc >= 1; i++, acc--) step();
    if (acc > 1) acc = 0;
  };
}

// 3D Maze: a first-person walk through a fresh maze, raycast at a low
// resolution and scaled up. Every texture is painted here in code.
const TS = 32;
function tex(draw) {
  const c = document.createElement('canvas'); c.width = c.height = TS;
  const g = c.getContext('2d'); draw(g);
  return new Uint32Array(g.getImageData(0, 0, TS, TS).data.buffer);
}
function speckle(g, base, dots) {
  g.fillStyle = base; g.fillRect(0, 0, TS, TS);
  for (let i = 0; i < 160; i++) { g.fillStyle = dots[i % dots.length]; g.fillRect(rnd(0, TS) | 0, rnd(0, TS) | 0, 1, 1); }
}
let mazeTex = null;
const getMazeTex = () => mazeTex ||= {
  wall: tex(g => {
    g.fillStyle = '#b8ac98'; g.fillRect(0, 0, TS, TS);
    for (let r = 0; r < 4; r++) for (let i = -1; i < 2; i++) {
      g.fillStyle = ['#8c2a1c', '#9c3422', '#7a2416', '#a43c26'][(r * 3 + i + 4) & 3];
      g.fillRect(i * 16 + (r & 1) * 8 + 1, r * 8 + 1, 15, 7);
    }
    for (let i = 0; i < 120; i++) { g.fillStyle = i & 1 ? 'rgba(0,0,0,.25)' : 'rgba(255,200,160,.2)'; g.fillRect(rnd(0, TS) | 0, rnd(0, TS) | 0, 1, 1); }
  }),
  floor: tex(g => speckle(g, '#808080', ['#909090', '#707070', '#787878'])),
  ceil: tex(g => speckle(g, '#202838', ['#283040', '#181c28'])),
  smiley: tex(g => {
    g.fillStyle = '#ffff00'; g.strokeStyle = '#000'; g.lineWidth = 2;
    g.beginPath(); g.arc(16, 16, 13, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#000'; g.fillRect(10, 10, 3, 5); g.fillRect(19, 10, 3, 5);
    g.beginPath(); g.arc(16, 16, 8, 0.5, 2.64); g.stroke();
  }),
  rock: tex(g => {
    g.fillStyle = '#6c6c6c'; g.beginPath(); g.ellipse(16, 20, 14, 11, 0, 0, 7); g.fill();
    g.fillStyle = '#9a9a9a'; g.beginPath(); g.ellipse(12, 16, 6, 4, 0, 0, 7); g.fill();
  }),
};
const dark = t => t.map(v => ((v >>> 1) & 0x7f7f7f) | 0xff000000);

// Recursive backtracker on an n x n grid; tiles between cells are the walls.
function makeMaze(n) {
  const S = 2 * n + 1, m = new Uint8Array(S * S).fill(1), stack = [[0, 0]];
  m[S + 1] = 0;
  while (stack.length) {
    const [cx, cy] = stack.at(-1);
    const next = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [cx + dx, cy + dy, dx, dy])
      .filter(([x, y]) => x >= 0 && y >= 0 && x < n && y < n && m[(2 * y + 1) * S + 2 * x + 1]);
    if (!next.length) { stack.pop(); continue; }
    const [x, y, dx, dy] = next[Math.random() * next.length | 0];
    m[(2 * cy + 1 + dy) * S + 2 * cx + 1 + dx] = m[(2 * y + 1) * S + 2 * x + 1] = 0;
    stack.push([x, y]);
  }
  // Self-check: a flood fill from the start reaches every open tile, the exit included.
  const seen = new Set([S + 1]), q = [S + 1];
  for (const t of q) for (const d of [1, -1, S, -S]) if (!m[t + d] && !seen.has(t + d)) { seen.add(t + d); q.push(t + d); }
  console.assert(seen.size === m.filter(v => !v).length && seen.has((S - 2) * S + S - 2), '3D Maze: unreachable cells');
  return { m, S };
}

function maze(ctx, w, hgt, o, k) {
  const T = getMazeTex(), wallD = dark(T.wall);
  const H = clamp(Math.round(hgt / 2), 40, 100), W = Math.max(40, Math.round(H * w / hgt));
  const off = document.createElement('canvas'); off.width = W; off.height = H;
  const octx = off.getContext('2d'), img = octx.createImageData(W, H), buf = new Uint32Array(img.data.buffer), zbuf = new Float32Array(W);
  const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
  let m, S, x, y, a, tx, ty, ta, d, go, sprites, rot = 0, flip = 0;
  function reset() {
    ({ m, S } = makeMaze(10));
    x = tx = y = ty = 1; a = ta = 0; d = 0; go = false;
    const open = [];
    for (let i = 0; i < S * S; i++) if (!m[i] && i !== S + 1 && i !== (S - 2) * S + S - 2) open.push(i);
    sprites = [{ x: S - 2, y: S - 2, t: T.smiley, s: 0.7 }];
    for (let r = 0; r < 3; r++) { const i = open.splice(Math.random() * open.length | 0, 1)[0]; sprites.push({ x: i % S, y: i / S | 0, t: T.rock, s: 0.4, rock: true }); }
  }
  // Left-hand rule: turn left when the wall allows, else go ahead, else turn right.
  function plan() {
    const free = e => !m[(ty + DY[e]) * S + tx + DX[e]];
    if (go) { tx += DX[d]; ty += DY[d]; go = false; return; }
    const L = (d + 3) & 3;
    if (free(L)) { d = L; ta -= Math.PI / 2; go = true; }
    else if (free(d)) { tx += DX[d]; ty += DY[d]; }
    else { d = (d + 1) & 3; ta += Math.PI / 2; }
  }
  const toward = (v, t, s) => Math.abs(t - v) <= s ? t : v + Math.sign(t - v) * s;
  function render() {
    const px = x + 0.5, py = y + 0.5, dx = Math.cos(a), dy = Math.sin(a), qx = -dy * 0.66, qy = dx * 0.66;
    for (let c = 0; c < W; c++) {
      const cam = 2 * c / W - 1, rx = dx + qx * cam, ry = dy + qy * cam;
      let mx = px | 0, my = py | 0, side = 0;
      const ddx = Math.abs(1 / rx), ddy = Math.abs(1 / ry), sx = rx < 0 ? -1 : 1, sy = ry < 0 ? -1 : 1;
      let fx = (rx < 0 ? px - mx : mx + 1 - px) * ddx, fy = (ry < 0 ? py - my : my + 1 - py) * ddy;
      while (true) {
        if (fx < fy) { fx += ddx; mx += sx; side = 0; } else { fy += ddy; my += sy; side = 1; }
        if (m[my * S + mx]) break;
      }
      const dist = Math.max(0.05, side ? fy - ddy : fx - ddx), lh = H / dist, top = (H - lh) / 2;
      const hit = side ? px + dist * rx : py + dist * ry, u = (hit - Math.floor(hit)) * TS | 0, wt = side ? wallD : T.wall;
      for (let r = Math.max(0, top | 0); r < Math.min(H, top + lh); r++) buf[r * W + c] = wt[clamp((r - top) / lh * TS | 0, 0, TS - 1) * TS + u];
      for (let r = Math.max(H / 2 + 1 | 0, Math.ceil(top + lh)); r < H; r++) {
        const rd = H / (2 * r - H), i = ((py + rd * ry) * TS & TS - 1) * TS + ((px + rd * rx) * TS & TS - 1);
        buf[r * W + c] = T.floor[i]; buf[(H - 1 - r) * W + c] = T.ceil[i];
      }
      zbuf[c] = dist;
    }
    const inv = 1 / (qx * dy - dx * qy);
    sprites.map(s => { const sx = s.x + 0.5 - px, sy = s.y + 0.5 - py; return { s, tX: inv * (dy * sx - dx * sy), tY: inv * (-qy * sx + qx * sy) }; })
      .filter(p => p.tY > 0.2).sort((p, q) => q.tY - p.tY).forEach(({ s, tX, tY }) => {
        const full = H / tY, sz = full * s.s, cx = W / 2 * (1 + tX / tY), bot = H / 2 + full / 2 - (s.rock ? 0 : (full - sz) / 2);
        for (let c = Math.max(0, cx - sz / 2 | 0); c < Math.min(W, cx + sz / 2); c++) {
          if (tY >= zbuf[c]) continue;
          const u = clamp((c - cx + sz / 2) / sz * TS | 0, 0, TS - 1);
          for (let r = Math.max(0, bot - sz | 0); r < Math.min(H, bot); r++) {
            const v = s.t[clamp((r - bot + sz) / sz * TS | 0, 0, TS - 1) * TS + u];
            if (v >>> 24 > 127) buf[r * W + c] = v;
          }
        }
      });
    octx.putImageData(img, 0, 0);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, hgt);
    ctx.save(); ctx.translate(w / 2, hgt / 2); ctx.rotate(rot); ctx.drawImage(off, -w / 2, -hgt / 2, w, hgt); ctx.restore();
  }
  reset();
  return dt => {
    dt *= k;
    x = toward(x, tx, dt * 2.5); y = toward(y, ty, dt * 2.5); a = toward(a, ta, dt * 3.5);
    rot = toward(rot, flip * Math.PI, dt * 2);
    if (x === tx && y === ty && a === ta) {
      // A rock flips the whole view over, like the OpenGL original; the smiley ends the maze.
      const hitRock = sprites.findIndex(s => s.rock && s.x === tx && s.y === ty);
      if (hitRock > 0) { sprites.splice(hitRock, 1); flip ^= 1; }
      if (tx === S - 2 && ty === S - 2) reset(); else plan();
    }
    render();
  };
}

const FACTORIES = { blank, stars, flying, mystify, marquee, pipes, maze };

// Runs a saver on a canvas until stop() or until the canvas leaves the page.
function run(canvas, name, cfg, k, sized) {
  const ctx = canvas.getContext('2d');
  let frame, raf = 0, last = 0, stopped = false;
  function build() {
    if (sized) sized();
    ctx.imageSmoothingEnabled = false;
    frame = (FACTORIES[name] || blank)(ctx, canvas.width, canvas.height, cfg[name] || {}, k);
  }
  function tick(now) {
    if (stopped) return;
    if (!canvas.isConnected) { stop(); return; }
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    frame(dt);
    raf = requestAnimationFrame(tick);
  }
  function stop() { stopped = true; cancelAnimationFrame(raf); }
  build();
  raf = requestAnimationFrame(tick);
  return { stop, rebuild: build };
}

/* ---------- full screen ---------- */

let running = null;
let lastActivity = Date.now();

// name: a key of SAVERS (default: the chosen one). preview: started from the
// Preview button, so no password is asked for.
export function startScreenSaver(name, { preview = false, cfg = loadScreenSaver(), idle = false } = {}) {
  if (running) return running;
  name = name || cfg.saver;
  if (!FACTORIES[name]) name = 'flying';
  const canvas = h('canvas', { class: 'ss-canvas' });
  const el = h('div', { class: 'ss-full', tabindex: '-1', role: 'img', 'aria-label': SAVERS[name] + ' screen saver' }, canvas);
  document.body.append(el);
  const prevFocus = document.activeElement;
  el.focus({ preventScroll: true });
  const size = () => { canvas.width = innerWidth; canvas.height = innerHeight; };
  const r = run(canvas, name, cfg, idle && reducedMotion.matches ? 0.4 : 1, size);
  const onResize = () => r.rebuild();
  addEventListener('resize', onResize);

  const locked = !preview && cfg.password && cfg.hash;
  const t0 = performance.now();
  let start = null, asking = false;
  const EVENTS = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'mousedown', 'click'];
  function onInput(e) {
    if (asking && el.querySelector('.ss-dlg')?.contains(e.target)) return;
    e.stopPropagation();
    if (e.cancelable && e.type !== 'pointermove') e.preventDefault();
    if (asking || performance.now() - t0 < 500) return;
    // A mouse that only twitches by a pixel or two does not count.
    if (e.type === 'pointermove') {
      if (!start) { start = [e.clientX, e.clientY]; return; }
      if (Math.hypot(e.clientX - start[0], e.clientY - start[1]) < 4) return;
    }
    if (e.type === 'click') return;
    if (locked) askPassword(); else stop();
  }
  for (const t of EVENTS) addEventListener(t, onInput, { capture: true, passive: false });

  function stop() {
    clearTimeout(idleTimer);
    r.stop();
    for (const t of EVENTS) removeEventListener(t, onInput, { capture: true });
    removeEventListener('resize', onResize);
    el.remove();
    running = null;
    lastActivity = Date.now();
    if (prevFocus && prevFocus.isConnected) prevFocus.focus({ preventScroll: true });
  }

  // The Win95 "Windows Screen Saver" box, drawn over the saver itself.
  function box(title, ...kids) {
    const dlg = h('div', { class: 'win dialog active ss-dlg', role: 'dialog', 'aria-label': title },
      h('div', { class: 'titlebar' }, h('span', { class: 't' }, title),
        h('div', { class: 'tbtns' }, h('button', { class: 'tbtn x', type: 'button', 'aria-label': 'Close', onclick: () => back() }, icon('i-x')))),
      h('div', { class: 'win-body' }, ...kids));
    el.querySelector('.ss-dlg')?.remove();
    el.append(dlg);
    return dlg;
  }
  // Like Win95, the box gives up and lets the saver carry on when left alone.
  let idleTimer = 0;
  const nap = () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => { if (asking) back(); }, 30000); };
  el.addEventListener('input', nap);
  el.addEventListener('pointerdown', nap);
  function back() {
    clearTimeout(idleTimer);
    el.querySelector('.ss-dlg')?.remove();
    el.classList.remove('asking');
    asking = false; start = null;
    el.focus({ preventScroll: true });
  }
  function askPassword() {
    asking = true;
    el.classList.add('asking');
    const input = h('input', { class: 'field', type: 'password', autocomplete: 'off', 'aria-label': 'Password' });
    const form = h('form', { class: 'dlg' },
      h('div', { class: 'row' }, icon('i-computer'),
        h('div', { class: 'msg' }, 'This screen saver is password protected. You must type in the screen saver password to turn off the screen saver.')),
      h('label', { class: 'ss-pwrow' }, h('span', { html: '<u>P</u>assword:' }), input),
      h('div', { class: 'btns right' },
        h('button', { class: 'btn default', type: 'submit' }, 'OK'),
        h('button', { class: 'btn', type: 'button', onclick: () => back() }, 'Cancel')));
    form.addEventListener('submit', e => {
      e.preventDefault();
      if (hashPw(input.value) === cfg.hash) { clearTimeout(idleTimer); stop(); return; }
      const ok = h('button', { class: 'btn default', type: 'button', onclick: () => askPassword() }, 'OK');
      box('Windows Screen Saver', h('div', { class: 'dlg' },
        h('div', { class: 'row' }, icon('i-error'), h('div', { class: 'msg' }, 'The password you typed is incorrect. Please try again.')),
        h('div', { class: 'btns' }, ok)));
      ok.focus();
      nap();
    });
    form.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); back(); } });
    box('Windows Screen Saver', form);
    input.focus();
    nap();
  }

  running = { stop, name };
  return running;
}

export function screenSaverRunning() { return !!running; }

/* ---------- idle timer ---------- */

for (const t of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'])
  addEventListener(t, () => { if (!running) lastActivity = Date.now(); }, { capture: true, passive: true });
document.addEventListener('visibilitychange', () => { if (!document.hidden) lastActivity = Date.now(); });

// Media playing or a window that asks not to be covered keeps the saver away.
function blocked() {
  if ([...document.querySelectorAll('video, audio')].some(m => !m.paused && !m.ended)) return true;
  return all().some(w => w.opts.noScreenSaver && w.state !== 'min');
}

setInterval(() => {
  if (running || document.hidden) return;
  const cfg = loadScreenSaver();
  if (cfg.saver === 'none' || !(cfg.wait > 0)) return;
  if (Date.now() - lastActivity < cfg.wait * 60000) return;
  if (blocked()) { lastActivity = Date.now(); return; }
  startScreenSaver(cfg.saver, { cfg, idle: true });
}, 1000);

/* ---------- Display Properties: the Screen Saver tab ---------- */

// A Win95 trackbar row: label, Slow ... Fast.
function slider(label, value, min, max, onchange, lo = 'Slow', hi = 'Fast') {
  const input = h('input', { type: 'range', min, max, step: 1, value, 'aria-label': label });
  input.addEventListener('input', () => onchange(+input.value));
  return h('fieldset', { class: 'group' }, h('legend', null, label),
    h('div', { class: 'ss-track' }, h('span', null, lo), input, h('span', null, hi)));
}

function numberRow(label, value, min, max, onchange) {
  const sp = spinner(value, min, max, onchange, label);
  return h('label', { class: 'dp-row' }, h('span', null, label), sp);
}

// A text box with the little up/down arrows next to it.
function spinner(value, min, max, onchange, label, disabled) {
  const input = h('input', { class: 'field', inputmode: 'numeric', value: String(value), 'aria-label': label, disabled });
  const set = v => { v = clamp(Math.round(+v || min), min, max); input.value = String(v); onchange(v); };
  input.addEventListener('change', () => set(input.value));
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowUp') { e.preventDefault(); set(+input.value + 1); }
    if (e.key === 'ArrowDown') { e.preventDefault(); set(+input.value - 1); }
  });
  const arrow = (d, label) => h('button', { type: 'button', tabindex: '-1', 'aria-label': label, disabled, onclick: () => set(+input.value + d) });
  return h('span', { class: 'ss-spin' + (disabled ? ' off' : '') }, input, h('span', { class: 'ss-arrows' }, arrow(1, 'Up'), arrow(-1, 'Down')));
}

function settingsDialog(name, draft, parent, done) {
  const o = copy(draft[name]);
  const preview = h('canvas', { class: 'ss-mini', width: 144, height: 88, 'aria-hidden': 'true' });
  let r = null;
  const restart = () => { if (r) r.stop(); r = run(preview, name, { [name]: o }, reducedMotion.matches ? 0.4 : 1); };
  const kids = [];
  if (name === 'stars') kids.push(slider('Warp speed', o.speed, 1, 10, v => { o.speed = v; restart(); }),
    numberRow('Starfield density:', o.density, 10, 500, v => { o.density = v; restart(); }));
  if (name === 'flying') kids.push(slider('Warp speed', o.speed, 1, 10, v => { o.speed = v; restart(); }),
    numberRow('Number of windows:', o.count, 1, 50, v => { o.count = v; restart(); }));
  if (name === 'pipes') kids.push(slider('Speed', o.speed, 1, 10, v => { o.speed = v; restart(); }));
  if (name === 'mystify') {
    const polys = h('select', { class: 'field', 'aria-label': 'Polygons' }, ...[1, 2, 3, 4].map(n => h('option', { value: n, selected: n === o.polys }, String(n))));
    polys.addEventListener('change', () => { o.polys = +polys.value; restart(); });
    const radio = (v, label) => {
      const b = h('input', { type: 'radio', name: 'ss-col', value: v, checked: o.colors === v });
      b.addEventListener('change', () => { o.colors = v; restart(); });
      return h('label', { class: 'ss-check' }, b, label);
    };
    kids.push(h('label', { class: 'dp-row' }, h('span', null, 'Polygons:'), polys),
      numberRow('Lines per polygon:', o.lines, 1, 15, v => { o.lines = v; restart(); }),
      h('fieldset', { class: 'group ss-col' }, h('legend', null, 'Colors'), radio('two', 'Fixed colors'), radio('multi', 'Multiple random colors')));
  }
  if (name === 'marquee') {
    const text = h('input', { class: 'field', value: o.text, maxlength: 200, 'aria-label': 'Text' });
    text.addEventListener('input', () => { o.text = text.value; restart(); });
    const color = (k, label) => {
      const c = h('input', { type: 'color', class: 'ss-color', value: o[k], 'aria-label': label });
      c.addEventListener('input', () => { o[k] = c.value; restart(); });
      return h('label', { class: 'dp-row' }, h('span', null, label + ':'), c);
    };
    kids.push(h('label', { class: 'dp-row' }, h('span', null, 'Text:'), text),
      slider('Speed', o.speed, 1, 10, v => { o.speed = v; restart(); }),
      color('bg', 'Background color'), color('fg', 'Text color'));
  }
  const body = h('form', { class: 'dlg ss-set' },
    h('div', { class: 'ss-mini-wrap' }, preview), ...kids,
    h('div', { class: 'btns right' },
      h('button', { class: 'btn default', type: 'submit' }, 'OK'),
      h('button', { class: 'btn', type: 'button', onclick: () => win.close() }, 'Cancel')));
  body.addEventListener('submit', e => { e.preventDefault(); draft[name] = o; done(); win.close(); });
  body.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); win.close(); } });
  const win = createWindow({
    title: SAVERS[name] + ' Setup', body, dialog: true, resizable: false, width: 'auto', parent, taskbar: false,
    onClosed: () => r && r.stop(),
  });
  restart();
  body.querySelector('input, select')?.focus();
}

function passwordDialog(draft, parent, done) {
  const field = label => h('input', { class: 'field', type: 'password', autocomplete: 'new-password', 'aria-label': label });
  const old = draft.hash ? field('Old password') : null;
  const p1 = field('New password'), p2 = field('Confirm new password');
  const row = (label, input) => h('label', { class: 'dp-row' }, h('span', null, label), input);
  const body = h('form', { class: 'dlg ss-pwd' },
    h('div', { class: 'row' }, icon('i-computer'), h('div', null,
      old ? row('Old password:', old) : null,
      row('New password:', p1), row('Confirm new password:', p2),
      h('p', { class: 'dp-note' }, 'Just for fun: the password is kept in this browser only and is not real security.'))),
    h('div', { class: 'btns right' },
      h('button', { class: 'btn default', type: 'submit' }, 'OK'),
      h('button', { class: 'btn', type: 'button', onclick: () => win.close() }, 'Cancel')));
  body.addEventListener('submit', async e => {
    e.preventDefault();
    if (old && hashPw(old.value) !== draft.hash) {
      await msgbox({ title: 'Change Password', text: 'The old password you typed is incorrect.', icon: 'error', parent: win });
      old.select(); return;
    }
    if (p1.value !== p2.value) {
      await msgbox({ title: 'Change Password', text: 'The new password and confirmation password do not match. Please type them again.', icon: 'error', parent: win });
      p1.value = p2.value = ''; p1.focus(); return;
    }
    draft.hash = p1.value ? hashPw(p1.value) : null;
    win.close();
    await msgbox({ title: 'Change Password', text: 'The password has been successfully changed.', icon: 'info', parent });
    done();
  });
  body.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); win.close(); } });
  const win = createWindow({ title: 'Change Password', body, dialog: true, resizable: false, width: 'auto', parent, taskbar: false });
  (old || p1).focus();
}

// screen: the monitor's screen element. getWin: the Display Properties window.
// dirty: called whenever a choice changes, so Apply lights up.
export function screenSaverTab({ screen, getWin, dirty }) {
  let draft = loadScreenSaver();
  const canvas = h('canvas', { class: 'ss-mon', 'aria-hidden': 'true' });
  screen.append(canvas);
  let shown = false, r = null;
  function refresh() {
    if (r) { r.stop(); r = null; }
    const on = shown && draft.saver !== 'none';
    screen.classList.toggle('ss-on', on);
    if (!on) return;
    r = run(canvas, draft.saver, draft, reducedMotion.matches ? 0.4 : 1, () => {
      canvas.width = screen.clientWidth || 144; canvas.height = screen.clientHeight || 88;
    });
  }
  const changed = () => { dirty(); refresh(); sync(); };

  const sel = h('select', { class: 'field', id: 'ss-name', 'aria-label': 'Screen Saver' },
    ...Object.entries(SAVERS).map(([k, v]) => h('option', { value: k, selected: k === draft.saver }, v)));
  sel.addEventListener('change', () => { draft.saver = sel.value; changed(); });
  const setBtn = h('button', { class: 'btn', type: 'button', html: 'Se<u>t</u>tings...' });
  setBtn.addEventListener('click', () => {
    if (draft.saver === 'blank' || draft.saver === 'maze') msgbox({ title: SAVERS[draft.saver], text: 'This screen saver has no options that you can set.', icon: 'info', parent: getWin() });
    else settingsDialog(draft.saver, draft, getWin(), changed);
  });
  const prevBtn = h('button', { class: 'btn', type: 'button', html: 'Pre<u>v</u>iew' });
  prevBtn.addEventListener('click', () => startScreenSaver(draft.saver, { preview: true, cfg: draft }));

  const pwChk = h('input', { type: 'checkbox', checked: draft.password });
  pwChk.addEventListener('change', () => { draft.password = pwChk.checked; changed(); });
  const pwBtn = h('button', { class: 'btn', type: 'button', html: '<u>C</u>hange...' });
  pwBtn.addEventListener('click', () => passwordDialog(draft, getWin(), changed));
  const waitSpin = spinner(draft.wait, 1, 60, v => { draft.wait = v; dirty(); }, 'Wait minutes');
  waitSpin.querySelector('input').value = String(clamp(Math.round(draft.wait) || 1, 1, 60));

  function sync() {
    const none = draft.saver === 'none';
    setBtn.disabled = prevBtn.disabled = none;
    pwChk.disabled = none;
    pwBtn.disabled = none || !draft.password;
    waitSpin.querySelectorAll('input, button').forEach(x => { x.disabled = none; });
    waitSpin.classList.toggle('off', none);
  }

  const panel = h('div', { class: 'dp-panel ss-panel', hidden: true },
    h('fieldset', { class: 'group' }, h('legend', null, h('u', null, 'S'), 'creen Saver'),
      h('div', { class: 'ss-row' }, sel, setBtn, prevBtn),
      h('div', { class: 'ss-row' },
        h('label', { class: 'ss-check' }, pwChk, h('span', { html: '<u>P</u>assword protected' })), pwBtn,
        h('label', { class: 'ss-wait' }, h('span', { html: '<u>W</u>ait:' }), waitSpin, 'minutes'))),
    h('fieldset', { class: 'group ss-energy' }, h('legend', null, 'Energy saving features of monitor'),
      h('div', { class: 'row' }, icon('i-display'), h('div', { class: 'ss-energy-rows' },
        h('label', { class: 'ss-check off' }, h('input', { type: 'checkbox', disabled: true }), 'Low-power standby', spinner(10, 1, 60, () => {}, 'Low-power standby minutes', true), 'minutes'),
        h('label', { class: 'ss-check off' }, h('input', { type: 'checkbox', disabled: true }), 'Shut off monitor', spinner(20, 1, 60, () => {}, 'Shut off monitor minutes', true), 'minutes')))));
  sync();

  return {
    panel,
    show(on) { shown = on; refresh(); },
    commit() { store.set(KEY, draft); lastActivity = Date.now(); },
    destroy() { if (r) r.stop(); },
  };
}

export default { id: 'screensaver', title: 'Screen Saver', icon: 'i-display', open: () => { startScreenSaver(); return null; } };
