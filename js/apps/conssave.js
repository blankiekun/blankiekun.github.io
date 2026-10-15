// CONscripter's Save Editor (Debug > Save Editor): the numbered variables in the
// running game's save slots and gloval.sav, where games keep their story flags.
// Edits are written back into the game's saves and the game restarts.

import { h } from '../util.js';
import { createWindow } from '../wm.js';
import { msgbox } from '../dialogs.js';
import { scriptConfig, parseSave, parseGlobal, writeVars, decodeText, encodeText } from './consfmt.js';

const INT_MIN = -2147483648, INT_MAX = 2147483647;

// The script as the engine reads it: 0.txt, 1.txt... in order, or nscript.dat unXORed.
async function readScript(game) {
  const top = game.files.filter(f => !f.path.includes('/'));
  const txt = top.filter(f => /^\d+\.txt$/i.test(f.path)).sort((a, b) => parseInt(a.path) - parseInt(b.path));
  if (txt.length) {
    const parts = await Promise.all(txt.map(f => f.file.arrayBuffer()));
    const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength + 1, 0));
    let o = 0;
    for (const p of parts) { out.set(new Uint8Array(p), o); o += p.byteLength; out[o++] = 0x0a; }
    return out;
  }
  const dat = top.find(f => f.path.toLowerCase() === 'nscript.dat');
  if (dat) return new Uint8Array(await dat.file.arrayBuffer()).map(b => b ^ 0x84);
  return new Uint8Array(0);
}

// opts: { parent, game, files (from listSaves), onSave(files, slot) }
export async function openSaveEditor({ parent, game, files, onSave }) {
  const cfg = scriptConfig(await readScript(game));
  const gfile = files.find(f => f.path === 'gloval.sav');
  const global = gfile ? parseGlobal(gfile.data) : null;
  // gloval.sav holds the variables from the border up, so it says where the border is.
  const border = global && global.vars.length <= cfg.range ? cfg.range - global.vars.length : cfg.border;

  const docs = [];
  if (global) docs.push({ label: 'Global variables (gloval.sav)', file: gfile, parsed: global, first: border, slot: null });
  for (const f of files) {
    const m = f.path.match(/^save(\d+)\.dat$/);
    if (!m) continue;
    const parsed = parseSave(f.data, border);
    if (!parsed) continue;
    const when = f.mtime ? new Date(f.mtime).toLocaleString() : '';
    docs.push({ label: `Save slot ${m[1]}` + (when ? ` (${when})` : ''), file: f, parsed, first: 0, slot: +m[1] });
  }
  docs.sort((a, b) => (a.slot ?? -1) - (b.slot ?? -1));
  if (!docs.length) {
    return msgbox({ title: 'Save Editor', icon: 'info', parent, text: `${game.title} has no saves to edit yet.\n\nSave in the game first.` });
  }
  for (const d of docs) d.vars = d.parsed.vars.map(v => ({ num: v.num, text: decodeText(v.str, game.encoding), str: v.str }));

  let doc = docs[0];
  const pick = h('select', { class: 'field', 'aria-label': 'Save file' },
    docs.map((d, i) => h('option', { value: i }, d.label)));
  const find = h('input', { class: 'field', type: 'search', placeholder: 'number, name or text', 'aria-label': 'Find' });
  const all = h('input', { type: 'checkbox' });
  const list = h('div', { class: 'cse-list', role: 'table', 'aria-label': 'Variables' });
  const count = h('span', { class: 'cse-count' });
  const loadBtn = h('button', { class: 'btn', type: 'button', html: 'Save &amp; <u>L</u>oad Slot', onclick: () => save(true) });

  function changed(d) { return d.vars.some((v, i) => v.num !== d.parsed.vars[i].num || v.str !== d.parsed.vars[i].str); }
  function isSet(v, i, d) { return v.num || v.text || v.num !== d.parsed.vars[i].num || v.str !== d.parsed.vars[i].str; }

  function render() {
    const q = find.value.trim().toLowerCase(), exact = q.match(/^[%$]?(\d+)$/);
    const rows = [];
    doc.vars.forEach((v, i) => {
      const no = doc.first + i, name = cfg.names.get(no) || '';
      if (exact) { if (no !== +exact[1]) return; }
      else if (q) { if (!name.toLowerCase().includes(q) && !v.text.toLowerCase().includes(q) && !String(v.num).includes(q)) return; }
      else if (!all.checked && !isSet(v, i, doc)) return;
      rows.push(row(v, i, no, name));
    });
    list.replaceChildren(h('div', { class: 'cse-head', role: 'row' },
      h('span', { role: 'columnheader' }, 'Variable'), h('span', { role: 'columnheader' }, 'Name'),
      h('span', { role: 'columnheader' }, 'Number (%)'), h('span', { role: 'columnheader' }, 'Text ($)')), ...rows);
    if (!rows.length) list.append(h('p', { class: 'cse-empty' }, q ? 'No variables match.' : 'Every variable is 0 and empty. Tick Show all to set one.'));
    count.textContent = `${rows.length} shown · %${doc.first}–%${doc.first + doc.vars.length - 1}`;
    loadBtn.disabled = doc.slot == null;
  }

  function row(v, i, no, name) {
    const orig = doc.parsed.vars[i];
    const r = h('div', { class: 'cse-row', role: 'row' });
    const mark = () => r.classList.toggle('edited', v.num !== orig.num || v.str !== orig.str);
    const num = h('input', { class: 'field', value: String(v.num), inputmode: 'numeric', 'aria-label': `%${no}` });
    num.addEventListener('change', () => {
      const n = Number(num.value.trim());
      if (!Number.isInteger(n) || n < INT_MIN || n > INT_MAX) { num.value = String(v.num); num.classList.add('bad'); return; }
      num.classList.remove('bad');
      v.num = n; mark();
    });
    const text = h('input', { class: 'field', value: v.text, 'aria-label': `$${no}` });
    text.addEventListener('change', () => {
      const b = encodeText(text.value, game.encoding);
      if (!b || b.includes(0)) { text.classList.add('bad'); text.title = 'This text has characters the game\'s Shift JIS can\'t hold.'; return; }
      text.classList.remove('bad'); text.title = '';
      v.text = text.value; v.str = text.value === decodeText(orig.str, game.encoding) ? orig.str : b; mark();
    });
    r.append(h('span', { class: 'cse-no' }, '%' + no), h('span', { class: 'cse-name', title: name }, name), num, text);
    mark();
    return r;
  }

  async function save(load) {
    // A change only lands when the field is left; leave the one being typed in.
    if (document.activeElement && list.contains(document.activeElement)) document.activeElement.dispatchEvent(new Event('change'));
    if (list.querySelector('.bad')) return msgbox({ title: 'Save Editor', icon: 'error', parent: win, text: 'Some values can\'t be saved. Fix the fields marked in red first.' });
    const edited = docs.filter(changed);
    if (!edited.length) { win.close(true); if (load) onSave([], doc.slot); return; }
    const b = await msgbox({ title: 'Save Editor', icon: 'warn', parent: win, buttons: ['&Yes', '&No'],
      text: `Write the changes to ${edited.length} file${edited.length === 1 ? '' : 's'} and restart ${game.title}?\n\nExport Saves first if you want a copy of how they are now.` });
    if (b !== 'Yes') return;
    const out = edited.map(d => ({ path: d.file.path, data: writeVars(d.file.data, d.parsed, d.vars) }));
    win.close(true);
    onSave(out, load ? doc.slot : null);
  }

  pick.addEventListener('change', () => { doc = docs[+pick.value]; render(); list.scrollTop = 0; });
  find.addEventListener('input', render);
  all.addEventListener('change', render);

  const body = h('div', { class: 'cse' },
    h('div', { class: 'cse-bar' }, h('label', null, 'File: ', pick)),
    h('div', { class: 'cse-bar' },
      h('label', { class: 'cse-find' }, 'Find: ', find),
      h('label', null, all, 'Show all')),
    list,
    h('div', { class: 'cse-foot' }, count,
      h('button', { class: 'btn default', type: 'button', html: '<u>S</u>ave &amp; Restart', onclick: () => save(false) }),
      loadBtn,
      h('button', { class: 'btn', type: 'button', onclick: () => win.close() }, 'Cancel')));

  const win = createWindow({
    title: `Save Editor - ${game.title}`, icon: 'i-floppy', body, parent,
    width: 560, height: 440, minW: 360, minH: 240,
    onClose: async () => {
      if (!docs.some(changed)) return true;
      const b = await msgbox({ title: 'Save Editor', icon: 'question', parent: win, buttons: ['&Yes', '&No'], text: 'Throw away your changes?' });
      return b === 'Yes';
    },
  });
  render();
  return win;
}
