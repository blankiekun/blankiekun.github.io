// System Tools: ScanDisk and Disk Defragmenter. Both only pretend, slowly, the way
// the real ones felt.

import { h, icon, reducedMotion } from '../util.js';
import { createWindow } from '../wm.js';
import { msgbox } from '../dialogs.js';
import { root, folderStats, drive } from '../fs.js';
import { usedOn, CAPACITY } from '../props.js';

const DRIVES = () => root.children.filter(d => d.kind === 'drive' && (d.letter === 'C' || d.letter === 'D'));

function progress() {
  const bar = h('i');
  const el = h('div', { class: 'sk-progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': 0 }, bar);
  el.set = p => { const v = Math.round(p * 100); bar.style.width = v + '%'; el.setAttribute('aria-valuenow', v); };
  return el;
}

// ---------- ScanDisk ----------

const STEPS = ['Checking file allocation table...', 'Checking folders...', 'Checking files...', 'Checking free space...', 'Checking surface scan...'];

function scandisk(letter = 'C') {
  let timer = null;
  const list = h('div', { class: 'listbox sk-drives', tabindex: '0', role: 'listbox', 'aria-label': 'Drives' });
  let picked = drive(letter) && DRIVES().includes(drive(letter)) ? drive(letter) : DRIVES()[0];
  for (const d of DRIVES()) {
    const o = h('div', { class: 'opt' + (d === picked ? ' sel' : ''), role: 'option' }, icon(d.icon), d.name);
    o.addEventListener('click', () => { picked = d; list.querySelectorAll('.opt').forEach(x => x.classList.toggle('sel', x === o)); });
    list.append(o);
  }
  const thorough = h('input', { type: 'radio', name: 'sd-type', id: 'sd-th' });
  const fix = h('input', { type: 'checkbox', id: 'sd-fix', checked: true });
  const bar = progress();
  const status = h('div', { class: 'sk-status' }, ' ');
  const startBtn = h('button', { class: 'btn default', type: 'button', onclick: start }, 'Start');
  const closeBtn = h('button', { class: 'btn', type: 'button', onclick: () => win.close() }, 'Close');

  function start() {
    if (timer) { clearInterval(timer); timer = null; startBtn.textContent = 'Start'; status.textContent = 'Check was cancelled.'; bar.set(0); return; }
    const steps = thorough.checked ? STEPS : STEPS.slice(0, 4);
    const total = thorough.checked ? 160 : 60;
    let t = 0;
    startBtn.textContent = 'Cancel';
    timer = setInterval(() => {
      t++;
      bar.set(t / total);
      status.textContent = steps[Math.min(steps.length - 1, Math.floor(t / total * steps.length))];
      if (t >= total) { clearInterval(timer); timer = null; startBtn.textContent = 'Start'; bar.set(0); status.textContent = ' '; results(); }
    }, reducedMotion.matches ? 60 : 40);
  }
  function results() {
    const st = folderStats(picked);
    const used = usedOn(picked.letter), total = picked.letter === 'C' ? CAPACITY : 52_428_800;
    const fmt = n => n.toLocaleString('en-US').padStart(15);
    msgbox({ title: `ScanDisk Results - ${picked.name}`, icon: 'i-drive', parent: win, html:
      `<p>ScanDisk did not find any errors on this drive.</p><pre class="sk-results">${fmt(total)} bytes total disk space
${fmt(0)} bytes in bad sectors
${fmt(st.folders * 4096)} bytes in ${st.folders} folders
${fmt(used)} bytes in ${st.files} user files
${fmt(total - used)} bytes available on disk

${fmt(4096)} bytes in each allocation unit
${fmt(Math.floor(total / 4096))} total allocation units on disk
${fmt(Math.floor((total - used) / 4096))} available allocation units</pre>` });
  }

  const body = h('div', { class: 'dlg sk' },
    h('div', { class: 'sk-row' }, icon('i-drive'), h('span', null, 'Select the drive(s) you want to check for errors:')),
    list,
    h('fieldset', { class: 'group' }, h('legend', null, 'Type of test'),
      h('label', { class: 'pr-check' }, h('input', { type: 'radio', name: 'sd-type', checked: true }), h('span', null, h('b', null, 'Standard'), h('br'), 'checks files and folders for errors')),
      h('label', { class: 'pr-check', for: 'sd-th' }, thorough, h('span', null, h('b', null, 'Thorough'), h('br'), 'performs Standard test and scans disk surface for errors'))),
    h('label', { class: 'pr-check', for: 'sd-fix' }, fix, 'Automatically fix errors'),
    status, bar,
    h('div', { class: 'btns right' }, startBtn, closeBtn,
      h('button', { class: 'btn', type: 'button', onclick: () => msgbox({ title: 'ScanDisk Advanced Options', icon: 'info', parent: win, text: 'The defaults are fine. They always were.' }) }, 'Advanced...')));
  const win = createWindow({ app: 'scandisk', title: 'ScanDisk - ' + picked.name, icon: 'i-drive', body, dialog: true, resizable: false, width: 'auto', taskbar: true, onClosed: () => clearInterval(timer) });
  startBtn.focus();
  return win;
}

// ---------- Disk Defragmenter ----------

function defrag(letter) {
  const pick = drive(letter || '');
  if (!pick || !DRIVES().includes(pick)) return selectDrive();
  return run(pick);
}

function selectDrive() {
  const sel = h('select', { class: 'field', id: 'df-drive' }, ...DRIVES().map(d => h('option', { value: d.letter }, d.name)));
  const form = h('form', { class: 'dlg', style: { width: 'min(320px, calc(100vw - 24px))' } },
    h('label', { for: 'df-drive' }, 'Which drive do you want to defragment?'), sel,
    h('p', { class: 'sk-note' }, 'Copyright © 1981-1995 blankiekun. Defragments your files so they open a tiny bit faster.'),
    h('div', { class: 'btns right' }, h('button', { class: 'btn default', type: 'submit' }, 'OK'), h('button', { class: 'btn', type: 'button', onclick: () => win.close() }, 'Exit')));
  form.addEventListener('submit', e => { e.preventDefault(); const d = drive(sel.value); win.close(); run(d); });
  form.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); win.close(); } });
  const win = createWindow({ title: 'Select Drive', icon: 'i-defrag', body: form, dialog: true, resizable: false, width: 'auto', taskbar: true });
  sel.focus();
  return win;
}

// The map: one cell per cluster. Optimized clusters gather at the front.
const FREE = 0, FRAG = 1, DONE = 2, READ = 3, WRITE = 4;

function run(d) {
  const COLS = 40, ROWS = 18, N = COLS * ROWS;
  const used = Math.max(0.2, Math.min(0.85, usedOn(d.letter) / (d.letter === 'C' ? CAPACITY : 52_428_800) + 0.15));
  const cells = new Uint8Array(N);
  for (let i = 0; i < N; i++) cells[i] = Math.random() < used ? FRAG : FREE;
  const want = cells.reduce((s, c) => s + (c === FRAG), 0);
  const canvas = h('canvas', { class: 'df-map', width: COLS * 8, height: ROWS * 10, 'aria-label': 'Cluster map' });
  const g = canvas.getContext('2d');
  const COLORS = ['#fff', '#0000ff', '#00ffff', '#00ff00', '#ff0000'];
  function draw() {
    for (let i = 0; i < N; i++) {
      const x = (i % COLS) * 8, y = Math.floor(i / COLS) * 10;
      g.fillStyle = '#000'; g.fillRect(x, y, 8, 10);
      g.fillStyle = COLORS[cells[i]]; g.fillRect(x + 1, y + 1, 6, 8);
    }
  }
  const bar = progress();
  const pct = h('span', null, '0% Complete');
  const state = h('span', null, 'Defragmenting file structure...');
  let next = 0, timer = null, paused = false, flash = [];
  const pauseBtn = h('button', { class: 'btn', type: 'button', onclick: () => { paused = !paused; pauseBtn.textContent = paused ? 'Resume' : 'Pause'; state.textContent = paused ? 'Paused.' : 'Defragmenting files...'; } }, 'Pause');
  // Each step finds the next fragmented cluster, reads it and writes it to the front.
  function step() {
    if (paused) return;
    for (const i of flash) if (cells[i] === READ) cells[i] = FREE; else if (cells[i] === WRITE) cells[i] = DONE;
    flash = [];
    while (next < N && cells[next] === DONE) next++;
    let src = -1;
    for (let i = N - 1; i >= next; i--) if (cells[i] === FRAG) { src = i; break; }
    if (src < 0 || next >= N) return finish();
    if (src === next) { cells[next] = DONE; }
    else { cells[src] = READ; cells[next] = WRITE; flash = [src, next]; }
    const done = cells.reduce((s, c) => s + (c === DONE || c === WRITE), 0);
    bar.set(done / want);
    pct.textContent = Math.floor(done / want * 100) + '% Complete';
    state.textContent = 'Defragmenting files...';
    draw();
  }
  function finish() {
    clearInterval(timer); timer = null;
    for (let i = 0; i < N; i++) if (cells[i] === READ) cells[i] = FREE; else if (cells[i] === WRITE) cells[i] = DONE;
    draw(); bar.set(1); pct.textContent = '100% Complete'; state.textContent = 'Defragmentation of ' + d.name + ' is complete.';
    msgbox({ title: 'Disk Defragmenter', icon: 'question', parent: win, buttons: ['&Yes', '&No'], text: `Defragmentation of ${d.name} is complete.\n\nDo you want to quit Disk Defragmenter?` })
      .then(b => { if (b === 'Yes') win.close(); });
  }
  const legend = () => msgbox({ title: 'Defrag Legend', icon: null, parent: win, html:
    '<div class="df-legend"><p><i style="background:#00ffff"></i>Optimized data (belongs at beginning of drive)</p><p><i style="background:#0000ff"></i>Data that will not be moved / not yet optimized</p><p><i style="background:#fff"></i>Free space</p><p><i style="background:#00ff00"></i>Data that is currently being read</p><p><i style="background:#ff0000"></i>Data that is currently being written</p><p>Each box represents one disk cluster.</p></div>' });

  const body = h('div', { class: 'df' },
    h('div', { class: 'df-wrap' }, canvas),
    h('div', { class: 'df-foot' },
      h('div', { class: 'df-left' }, state, bar, pct),
      h('div', { class: 'btns' },
        h('button', { class: 'btn', type: 'button', onclick: () => win.close() }, 'Stop'), pauseBtn,
        h('button', { class: 'btn', type: 'button', onclick: legend }, 'Legend'))));
  const win = createWindow({ app: 'defrag', title: 'Defragmenting ' + d.name, icon: 'i-defrag', body, width: 360, height: 'auto', resizable: false, onClosed: () => clearInterval(timer) });
  draw();
  timer = setInterval(step, reducedMotion.matches ? 120 : 45);
  return win;
}

export const scandiskApp = { id: 'scandisk', title: 'ScanDisk', icon: 'i-drive', open: scandisk };
export const defragApp = { id: 'defrag', title: 'Disk Defragmenter', icon: 'i-defrag', open: defrag };
