// The Printers folder: the Add Printer wizard, and a print queue for each printer.
// Printing still ends in the browser's own print dialog; the queue is for show.

import { h, icon, store, esc } from '../util.js';
import { createWindow, find, launch } from '../wm.js';
import { menubar } from '../menu.js';
import { msgbox } from '../dialogs.js';
import { root } from '../fs.js';

const KEY = 'w95.printers';
const folder = root.children.find(n => n.name === 'Printers');
// One printer comes installed, so printing works before anyone runs the wizard.
const saved = () => store.get(KEY, { list: [{ name: 'HP LaserJet 4', model: 'HP LaserJet 4', port: 'LPT1:' }], def: 'HP LaserJet 4' });
const queues = new Map();   // printer name -> [{ name, pages, done, started }]

function sync() {
  const { list, def } = saved();
  folder.children = [
    { name: 'Add Printer', kind: 'app', app: 'addprinter', icon: 'i-addprinter' },
    ...list.map(p => ({ name: p.name, kind: 'app', app: 'printqueue', arg: p.name, icon: 'i-printer', printer: true, isDefault: p.name === def })),
  ];
}
sync();

const MAKERS = {
  'Apple': ['Apple LaserWriter II NT', 'Apple LaserWriter Plus', 'Apple StyleWriter'],
  'Brother': ['Brother HL-10h', 'Brother HL-660'],
  'Canon': ['Canon Bubble-Jet BJ-10e', 'Canon Bubble-Jet BJC-600', 'Canon LBP-4'],
  'Epson': ['Epson LQ-570', 'Epson FX-80', 'Epson Stylus COLOR'],
  'HP': ['HP DeskJet 500', 'HP DeskJet 660C', 'HP LaserJet 4', 'HP LaserJet III'],
  'IBM': ['IBM Proprinter', 'IBM 4019 LaserPrinter'],
  'blankiekun': ['blankiekun Furigana Printer', 'blankiekun Visual Novel Plotter'],
};
const PORTS = [['COM1:', 'Communications Port'], ['COM2:', 'Communications Port'], ['FILE:', 'Creates a file on disk'], ['LPT1:', 'ECP Printer Port']];

// ---------- Add Printer wizard ----------

function addPrinter() {
  const existing = find(w => w.app === 'addprinter');
  if (existing) { existing.focus(); return existing; }
  let step = 0, local = true, maker = 'HP', model = 'HP LaserJet 4', port = 'LPT1:', name = '', makeDefault = !saved().list.length, testPage = true;
  const pane = h('div', { class: 'wz-pane' });
  const back = h('button', { class: 'btn', type: 'button', onclick: () => go(step - 1) }, h('span', { html: '&lt; <u>B</u>ack' }));
  const next = h('button', { class: 'btn default', type: 'button', onclick: () => go(step + 1) });
  const radio = (group, label, checked, fn) => {
    const r = h('input', { type: 'radio', name: group, checked });
    r.addEventListener('change', fn);
    return h('label', { class: 'pr-check' }, r, h('span', { html: label }));
  };
  const list = (items, value, fn) => {
    const lb = h('div', { class: 'listbox wz-list', tabindex: '0', role: 'listbox' });
    for (const it of items) {
      const o = h('div', { class: 'opt' + (it === value ? ' sel' : ''), role: 'option' }, it);
      o.addEventListener('click', () => { lb.querySelectorAll('.opt').forEach(x => x.classList.toggle('sel', x === o)); fn(it); });
      lb.append(o);
    }
    return lb;
  };
  const STEPS = [
    () => [h('p', null, 'This wizard will help you to install your printer quickly and easily.'), h('p', null, 'To begin installing your printer, click Next.')],
    () => [h('p', null, 'How is this printer attached to your computer?'),
      h('p', null, 'If it is directly attached to your computer, click Local Printer. If it is attached to another computer, click Network Printer.'),
      radio('wz-where', '<u>L</u>ocal printer', local, () => { local = true; }),
      radio('wz-where', '<u>N</u>etwork printer', !local, () => { local = false; })],
    () => {
      if (!local) return [h('p', null, 'Type the network path or the queue name of your printer.'),
        h('input', { class: 'field', value: '\\\\BLANKIEKUN\\PRINTER', 'aria-label': 'Network path', readonly: true }),
        h('p', { class: 'wz-note' }, 'Nobody on this network has shared a printer. A local printer it is.')];
      const models = h('div');
      const fill = () => models.replaceChildren(list(MAKERS[maker], model, v => { model = v; }));
      if (!MAKERS[maker].includes(model)) model = MAKERS[maker][0];
      fill();
      return [h('p', null, 'Click the manufacturer and model of your printer. If your printer came with an installation disk, click Have Disk.'),
        h('div', { class: 'wz-two' },
          h('div', null, h('b', null, 'Manufacturers:'), list(Object.keys(MAKERS), maker, v => { maker = v; model = MAKERS[v][0]; fill(); })),
          h('div', null, h('b', null, 'Printers:'), models)),
        h('div', { class: 'btns right' }, h('button', { class: 'btn', type: 'button', onclick: () => msgbox({ title: 'Install From Disk', icon: 'error', parent: win, text: 'A:\\ is not accessible.\n\nThe device is not ready.' }) }, 'Have Disk...'))];
    },
    () => [h('p', null, 'Click the port you want to use with this printer, and then click Next.'),
      list(PORTS.map(([p, d]) => `${p}  ${d}`), PORTS.map(([p, d]) => `${p}  ${d}`).find(s => s.startsWith(port)), v => { port = v.split(' ')[0]; })],
    () => {
      if (!name) name = local ? model : 'Network Printer';
      const input = h('input', { class: 'field', value: name, 'aria-label': 'Printer name' });
      input.addEventListener('input', () => { name = input.value; next.disabled = !name.trim(); });
      return [h('p', null, 'You can type a name for this printer, or you can use the name supplied below.'),
        h('label', { class: 'wz-field' }, h('span', { html: '<u>P</u>rinter name:' }), input),
        h('p', null, 'Do you want your Windows-based programs to use this printer as the default printer?'),
        radio('wz-def', '<u>Y</u>es', makeDefault, () => { makeDefault = true; }),
        radio('wz-def', 'N<u>o</u>', !makeDefault, () => { makeDefault = false; })];
    },
    () => [h('p', null, 'After your printer is installed, blankiekun 95 can print a test page so you can confirm that the printer is set up properly.'),
      h('p', null, 'Would you like to print a test page?'),
      radio('wz-test', 'Yes (recommended)', testPage, () => { testPage = true; }),
      radio('wz-test', 'No', !testPage, () => { testPage = false; })],
  ];
  function go(i) {
    if (i >= STEPS.length) return finish();
    step = Math.max(0, i);
    back.disabled = step === 0;
    next.replaceChildren(step === STEPS.length - 1 ? 'Finish' : h('span', null, 'Next >'));
    next.disabled = false;
    pane.replaceChildren(...STEPS[step]());
  }
  async function finish() {
    const n = name.trim() || model;
    const s = saved();
    const unique = s.list.some(p => p.name === n) ? n + ' (Copy 2)' : n;
    s.list.push({ name: unique, model: local ? model : 'Network Printer', port });
    if (makeDefault || !s.def) s.def = unique;
    store.set(KEY, s);
    win.close();
    await copying();
    sync();
    refreshFolder();
    if (testPage) printTest(unique);
  }
  const body = h('div', { class: 'dlg wz' },
    h('div', { class: 'wz-main' }, h('div', { class: 'wz-art', 'aria-hidden': 'true' }, icon('i-printer'), icon('i-computer')), pane),
    h('hr', { class: 'pr-sep' }),
    h('div', { class: 'btns right' }, back, next, h('button', { class: 'btn', type: 'button', onclick: () => win.close() }, 'Cancel')));
  body.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); win.close(); } });
  const win = createWindow({ app: 'addprinter', title: 'Add Printer Wizard', icon: 'i-addprinter', body, dialog: true, resizable: false, width: 'auto', taskbar: true });
  go(0);
  next.focus();
  return win;
}

function copying() {
  return new Promise(res => {
    const bar = h('i');
    const body = h('div', { class: 'dlg', style: { width: 'min(320px, calc(100vw - 24px))' } },
      h('p', { style: { margin: 0 } }, 'Copying files...'), h('p', { style: { margin: 0 } }, 'C:\\WINDOWS\\SYSTEM\\UNIDRV.DLL'),
      h('div', { class: 'sk-progress' }, bar));
    const w = createWindow({ title: 'Copying Files...', body, dialog: true, resizable: false, width: 'auto', taskbar: false });
    let p = 0;
    const t = setInterval(() => {
      p += 7;
      bar.style.width = Math.min(100, p) + '%';
      if (p >= 100) { clearInterval(t); w.close(true); res(); }
    }, 60);
  });
}

// The Printers folder isn't on the disk, so open folder windows are told directly.
function refreshFolder() {
  import('./explorer.js').then(m => m.refreshExplorers());
}

// ---------- printing ----------

const TEST_PAGE = name => `<h2>blankiekun 95 Printer Test Page</h2>
<p>Congratulations!</p><p>If you can read this information, you have correctly installed your ${esc(name)}.</p>
<table><tr><td>Printer name:</td><td>${esc(name)}</td></tr><tr><td>Printer driver:</td><td>UNIDRV.DLL</td></tr>
<tr><td>Data format:</td><td>EMF</td></tr><tr><td>Port:</td><td>LPT1:</td></tr></table>
<p style="font-family:serif">The quick brown fox jumps over the lazy dog. いろはにほへと ちりぬるを</p>`;

function printTest(printer) {
  printJob('Test Page', TEST_PAGE(printer), { printer }).then(async () => {
    const b = await msgbox({ title: printer, icon: 'question', buttons: ['&Yes', '&No'], text: 'Did the test page print correctly?' });
    if (b === 'No') msgbox({ title: 'Print Troubleshooter', icon: 'info', text: 'Make sure the printer is turned on, has paper, and is connected to LPT1.\n\nIf it still won\'t print, the browser\'s print dialog is where the page really went.' });
  });
}

// Sends a document to the default printer: it shows up in the queue, "spools",
// then the browser's print dialog opens. With no printer installed, Windows said so.
export async function printJob(docName, html, { printer, css = '' } = {}) {
  const s = saved();
  const p = printer || s.def;
  if (!p) {
    await msgbox({ title: 'Print', icon: 'warn', text: 'There are no printers installed.\n\nTo install a printer, click Start, point to Settings, click Printers, and then double-click Add Printer.' });
    return false;
  }
  const job = { name: docName, pages: 1, done: 0, started: new Date() };
  const q = queues.get(p) || [];
  q.push(job);
  queues.set(p, q);
  refreshQueue(p);
  await new Promise(res => {
    const t = setInterval(() => {
      job.done = Math.min(100, job.done + 20);
      refreshQueue(p);
      if (job.done >= 100) { clearInterval(t); res(); }
    }, 150);
  });
  const frame = h('iframe', { style: { position: 'fixed', width: '0', height: '0', border: '0', right: '0', bottom: '0' }, 'aria-hidden': 'true' });
  document.body.append(frame);
  frame.contentDocument.open();
  frame.contentDocument.write(`<!doctype html><meta charset="utf-8"><title>${esc(docName)}</title><style>body { font: 12pt sans-serif; } ${css}</style><body>${html}</body>`);
  frame.contentDocument.close();
  try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch {}
  setTimeout(() => frame.remove(), 60_000);
  q.splice(q.indexOf(job), 1);
  refreshQueue(p);
  return true;
}

// ---------- print queue ----------

const queueWins = new Map();
function refreshQueue(p) { const w = queueWins.get(p); if (w) w.refresh(); }

function printQueue(p) {
  const existing = find(w => w.app === 'printqueue' && w.printer === p);
  if (existing) { existing.focus(); return existing; }
  let paused = false;
  const list = h('div', { class: 'pq-list', role: 'table' });
  const status = h('div', { class: 'statusbar' }, h('span'));
  function render() {
    const q = queues.get(p) || [];
    list.replaceChildren(h('div', { class: 'pq-row pq-head' }, ...['Document Name', 'Status', 'Owner', 'Progress', 'Started At'].map(c => h('span', null, c))),
      ...q.map(j => h('div', { class: 'pq-row' }, h('span', null, icon('i-txt'), j.name), h('span', null, paused ? 'Paused' : 'Printing'), h('span', null, 'blankiekun'),
        h('span', null, `${j.done}% of ${j.pages} page`), h('span', null, j.started.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })))));
    status.firstChild.textContent = `${q.length} jobs in queue`;
    win.setTitle(p + (paused ? ' - Paused' : ''));
  }
  const bar = menubar([
    { label: '&Printer', items: () => [
      { label: 'Pause Printing', checked: paused, action: () => { paused = !paused; render(); } },
      { label: 'P&urge Print Jobs', action: () => { queues.set(p, []); render(); } },
      '-',
      { label: 'Set As De&fault', checked: saved().def === p, action: () => { const s = saved(); s.def = p; store.set(KEY, s); sync(); refreshFolder(); } },
      { label: 'Print &Test Page', action: () => printTest(p) },
      '-',
      { label: '&Delete Printer', action: async () => {
        const b = await msgbox({ title: 'Printers', icon: 'question', parent: win, buttons: ['&Yes', '&No'], text: `Are you sure you want to delete the printer '${p}'?` });
        if (b !== 'Yes') return;
        const s = saved();
        s.list = s.list.filter(x => x.name !== p);
        if (s.def === p) s.def = s.list[0] ? s.list[0].name : null;
        store.set(KEY, s);
        sync(); refreshFolder(); win.close();
      } },
      '-',
      { label: '&Close', action: () => win.close() },
    ] },
    { label: '&Document', items: () => [{ label: '&Pause Printing', disabled: true }, { label: '&Cancel Printing', disabled: !(queues.get(p) || []).length, action: () => { queues.set(p, []); render(); } }] },
    { label: '&View', items: () => [{ label: '&Status Bar', checked: !status.hidden, action: () => { status.hidden = !status.hidden; } }] },
    { label: '&Help', items: () => [{ label: '&Help Topics', action: () => launch('help') }] },
  ]);
  const win = createWindow({ app: 'printqueue', title: p, icon: 'i-printer', body: h('div', { class: 'pq' }, bar, list, status), width: 520, height: 220, minW: 260, minH: 140, onClosed: () => queueWins.delete(p) });
  win.printer = p;
  win.refresh = render;
  queueWins.set(p, win);
  render();
  return win;
}

export const addPrinterApp = { id: 'addprinter', title: 'Add Printer', icon: 'i-addprinter', open: addPrinter };
export const queueApp = { id: 'printqueue', title: 'Printer', icon: 'i-printer', open: printQueue };
