// Installing a Windows game in VNBox from a disc image (ISO, BIN+CUE, MDF+MDS) or an installer folder.
// Ported from chimimouryou's windows-install.ts (#310). The images go to the site's private storage
// (OPFS vn-discs/<id>/), which the engine reads a block at a time (cdrom=opfs:...), and the installer
// runs with the game's own folder (vn/<title>, empty) mounted at C:\files\<title>, its install target,
// so what it writes into the registry points where the game runs later. What it installs lands in the
// engine's IndexedDB layers (vnsaves.js); once it exits, the game's files are moved from there into
// the OPFS folder, as if the folder had been opened. No DOM imports: tools/vninstall-check.mjs runs it.

import { saveAreas, listSaves, readSaves, deleteSaves } from './vnsaves.js';

// VNBox's CD-ROM drive (DEFAULT_CDROM_DRIVE in boxedwine-shell.js).
export const DISC_DRIVE = 'e';
// Where an installer folder is copied inside the game's folder for the install.
export const SETUP_FOLDER = '_setup';
export const DISC_FILE = /\.(iso|cue|bin|mds|mdf|img|wav)$/i;
// Installers, uninstallers and settings tools: last in a list of programs.
const NOT_GAME = /^(unins|setup|install|config|vcredist|dxsetup|dxwebsetup|directx|patch|update)/i;
const SETUPISH = /setup|install/i;

const base = name => name.replace(/\.[^.]*$/, '').toLowerCase();
const ext = name => name.slice(name.lastIndexOf('.') + 1).toLowerCase();
const MAIN_ORDER = ['cue', 'mds', 'iso', 'mdf', 'img', 'bin'];

// The picked image files grouped into discs [{ main, files }] (a CUE's BINs, an MDS's MDF), in name order.
export async function discsOf(picked) {
  const byName = new Map(picked.map(f => [f.name.toLowerCase(), f]));
  const used = new Set(), discs = [];
  for (const kind of MAIN_ORDER) {
    for (const main of picked.filter(f => ext(f.name) === kind && !used.has(f))) {
      const files = [main];
      if (kind === 'cue') {
        for (const m of (await main.text()).matchAll(/^\s*FILE\s+(?:"([^"]*)"|(\S+))/gim)) {
          const f = byName.get((m[1] ?? m[2]).replace(/^.*[\\/]/, '').toLowerCase());
          if (f && !files.includes(f)) files.push(f);
        }
      } else if (kind === 'mds') {
        // The MDS names its MDF ("*.mdf" = its own name), most often an .mdf, sometimes an .iso.
        files.push(...picked.filter(f => f !== main && base(f.name) === base(main.name)));
      }
      files.forEach(f => used.add(f));
      discs.push({ main, files });
    }
  }
  return discs.sort((a, b) => a.main.name.localeCompare(b.main.name, undefined, { numeric: true }));
}

// A disc's OPFS folder (from its file names and sizes: hashing GBs takes too long; FNV-1a).
export function discFolder(disc) {
  let hash = 0x811c9dc5;
  for (const c of disc.files.map(f => `${f.name}:${f.size}`).join('/')) hash = Math.imul(hash ^ c.charCodeAt(0), 0x01000193);
  return 'vn-discs/d' + (hash >>> 0).toString(36);
}
// A disc as the engine's cdrom= list and the game's record name it: its main file under the OPFS root.
export const discPath = disc => `${discFolder(disc)}/${disc.main.name}`;
export const discSize = discs => discs.reduce((n, d) => n + d.files.reduce((m, f) => m + f.size, 0), 0);

// The sector layouts a data track can be stored in: bytes per sector, user data offset.
const LAYOUTS = [[2048, 0], [2352, 16], [2352, 24], [2336, 8], [2448, 16], [2448, 24]];
const MAX_ENTRIES = 20000;

// The ISO 9660 file system of a disc's first data track (as VNBox mounts it), or null when there is
// none (UDF-only DVDs, audio CDs): { label, files: [{ path, size, sector }], read(file, max) }.
// Reads only the sectors it needs.
export async function listDisc(disc) {
  // The data file: the CUE's first file, the MDS's image, else the main file.
  const data = disc.files.find(f => !/\.(cue|mds|wav)$/i.test(f.name));
  if (!data) return null;
  const bytes = async (from, length) => new Uint8Array(await data.slice(from, from + length).arrayBuffer());
  let layout = null;
  for (const l of LAYOUTS) {
    const head = await bytes(16 * l[0] + l[1], 6);
    if (head[0] === 1 && String.fromCharCode(...head.subarray(1)) === 'CD001') { layout = l; break; }
  }
  if (!layout) return null;
  const [sectorSize, offset] = layout;
  async function readSectors(sector, length) {
    if (sectorSize === 2048) return bytes(sector * 2048, length);
    const out = new Uint8Array(length);
    for (let done = 0; done < length; done += 2048) {
      const part = await bytes((sector + done / 2048) * sectorSize + offset, 2048);
      out.set(part.subarray(0, Math.min(2048, length - done)), done);
    }
    return out;
  }
  const u32 = (v, at) => (v[at] | v[at + 1] << 8 | v[at + 2] << 16 | v[at + 3] << 24) >>> 0;

  // The primary descriptor, or a Joliet one (UCS-2 names) when the disc has it.
  let root = await readSectors(16, 2048), joliet = false;
  for (let s = 17; s < 32; s++) {
    const d = await readSectors(s, 2048);
    if (d[0] === 255) break;
    if (d[0] === 2 && d[88] === 0x25 && d[89] === 0x2f && [0x40, 0x43, 0x45].includes(d[90])) { root = d; joliet = true; break; }
  }
  const decoder = new TextDecoder(joliet ? 'utf-16be' : 'shift_jis');
  const label = decoder.decode(root.subarray(40, 72)).replace(/\0/g, '').trim();
  const files = [], seen = new Set();
  async function walk(sector, size, prefix, depth) {
    if (seen.has(sector) || depth > 16 || files.length > MAX_ENTRIES) return;
    seen.add(sector);
    const dir = await readSectors(sector, Math.min(size, 1 << 20));
    for (let at = 0; at < dir.length && files.length <= MAX_ENTRIES;) {
      const length = dir[at];
      // Records never cross a sector: a zero length skips to the next one.
      if (!length) { at = (Math.floor(at / 2048) + 1) * 2048; continue; }
      const nameLength = dir[at + 32], name = dir.subarray(at + 33, at + 33 + nameLength);
      if (!(nameLength === 1 && name[0] <= 1)) {
        const path = prefix + decoder.decode(name).replace(/;\d+$/, '').replace(/\.$/, '');
        if (dir[at + 25] & 2) await walk(u32(dir, at + 2), u32(dir, at + 10), path + '/', depth + 1);
        else files.push({ path, size: u32(dir, at + 10), sector: u32(dir, at + 2) });
      }
      at += length;
    }
  }
  await walk(u32(root, 158), u32(root, 166), '', 0);
  return { label, files, read: (file, max = file.size) => readSectors(file.sector, Math.min(file.size, max)) };
}

// The program autorun.inf's open= (or shellexecute=) line runs, '/'-separated, and its arguments.
export function autorunProgram(text) {
  let section = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim(), header = /^\[(.+)\]$/.exec(line);
    if (header) section = header[1].trim().toLowerCase();
    if (section !== 'autorun') continue;
    const value = (/^(?:open|shellexecute)\s*=\s*(.+)$/i.exec(line) || [])[1];
    if (!value) continue;
    const quoted = /^"([^"]+)"\s*(.*)$/.exec(value.trim());
    const words = value.trim().split(/\s+/);
    const [program, args] = quoted ? [quoted[1], quoted[2]] : [words[0], words.slice(1).join(' ')];
    return { program: program.replace(/^\.?[\\/]+/, '').replaceAll('\\', '/'), args };
  }
  return null;
}

// Files that copy protection installs or checks for: such games don't run in VNBox.
const PROTECTION = [
  [/(?:^|\/)(?:cms16\.dll|cms_95\.dll|cms32_95\.dll|cmsnt\.dll|paul\.dll|drm_data)$/i, 'SecuROM'],
  [/(?:^|\/)(?:00000001\.tmp|clcd16\.dll|clcd32\.dll|clokspl\.exe|dplayerx\.dll|secdrv\.sys|.*\.icd)$/i, 'SafeDisc'],
  [/(?:^|\/)(?:protect\.dll|protect\.exe|sfdrvup\.exe|sfdrvrem\.exe|.*\.sfx)$/i, 'StarForce'],
];
export const copyProtection = paths => PROTECTION.filter(([re]) => paths.some(p => re.test(p))).map(([, name]) => name);

export const INSTALLER_NAMES = { inno: 'Inno Setup', nsis: 'NSIS', installshield: 'InstallShield' };

// The installer an .exe is, from the start of it (its resources name the tool), or undefined.
export function installerKind(bytes) {
  const text = new TextDecoder('latin1').decode(bytes);
  const has = word => text.includes(word) || text.includes(word.split('').join('\0'));
  if (has('Inno Setup')) return 'inno';
  if (has('Nullsoft')) return 'nsis';
  if (has('InstallShield')) return 'installshield';
}

// Arguments that install without asking, into dir (InstallShield: its own default folder).
export function silentArgs(kind, dir) {
  if (kind === 'inno') return `/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP- /DIR="${dir}"`;
  // NSIS takes /D= last and unquoted.
  if (kind === 'nsis') return `/S /D=${dir}`;
  // InstallShield's MSI setup.exe hands /v's text to msiexec (/qn: no windows). It installs where
  // the package says, often Program Files: installedPrograms looks there too.
  return '/s /v/qn';
}

// The game folder as the installer sees it (VNBox mounts vn/<title> at C:\files\<title>).
export const installDir = title => `C:\\files\\${title}`;

// A disc's programs, autorun's first, then setup tools, shallow before deep.
export function discPrograms(files, autorun) {
  const auto = p => p.toLowerCase() === (autorun ? autorun.program.toLowerCase() : '');
  return files.filter(f => /\.exe$/i.test(f.path)).map(f => f.path).sort((a, b) =>
    auto(b) - auto(a) || SETUPISH.test(b) - SETUPISH.test(a) || a.split('/').length - b.split('/').length || a.localeCompare(b));
}

// The target of a Windows shortcut (.lnk): its LinkInfo's local path.
export function lnkTarget(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 0x4c || view.getUint32(0, true) !== 0x4c) return undefined;
  const flags = view.getUint32(0x14, true);
  let at = 0x4c;
  if (flags & 1) at += 2 + view.getUint16(at, true);
  if (!(flags & 2) || at + 0x1c > bytes.length) return undefined;
  const infoHeader = view.getUint32(at + 4, true), infoFlags = view.getUint32(at + 8, true);
  if (!(infoFlags & 1)) return undefined;
  const string = (from, wide) => {
    let end = from;
    while (end + (wide ? 1 : 0) < bytes.length && (bytes[end] || (wide && bytes[end + 1]))) end += wide ? 2 : 1;
    return new TextDecoder(wide ? 'utf-16le' : 'shift_jis').decode(bytes.subarray(from, end));
  };
  if (infoHeader >= 0x24 && at + 0x20 <= bytes.length) {
    const unicode = view.getUint32(at + 0x1c, true);
    if (unicode) return string(at + unicode, true);
  }
  return string(at + view.getUint32(at + 0x10, true), false);
}

// A Windows path → [area index, path in that area]: C:\files\<title>\... and the prefix's C:\.
function areaPath(target, title) {
  const path = target.replaceAll('\\', '/'), inFolder = 'c:/files/' + title.toLowerCase() + '/';
  if (path.toLowerCase().startsWith(inFolder)) return [0, path.slice(inFolder.length)];
  if (/^c:\//i.test(path)) return [1, 'drive_c/' + path.slice(3)];
  return null;
}

// Not programs: Windows' own folder, and the icons Windows Installer keeps as .exe files for shortcuts.
const NOT_INSTALLED = /^drive_c\/(?:windows\/|users\/[^/]+\/AppData\/Roaming\/Microsoft\/Installer\/)/i;

// The programs an install left: [{ area (0 game folder, 1 prefix), path, size, shortcut }], .exe
// files written into the game folder or the prefix's drive_c, the ones a shortcut (Start Menu,
// desktop) points at first, setup tools last, then biggest first. Every file in the prefix's database
// is one Wine wrote for this game (the base prefix is in the engine's zip). Not by time: installers
// give the files they copy their original dates.
export async function installedPrograms(title) {
  const areas = saveAreas(title);
  const [game, prefix] = await Promise.all(areas.map(listSaves));
  const fresh = prefix.filter(e => !e.dir);
  const found = new Map(), add = (area, e) => found.set(area + '|' + e.path.toLowerCase(), { area, path: e.path, size: e.size, shortcut: false });
  for (const e of game) if (!e.dir && /\.exe$/i.test(e.path) && !e.path.startsWith(SETUP_FOLDER + '/')) add(0, e);
  for (const e of fresh) if (/^drive_c\/.*\.exe$/i.test(e.path) && !NOT_INSTALLED.test(e.path)) add(1, e);
  const links = fresh.filter(e => /\.lnk$/i.test(e.path));
  for (const link of await readSaves(areas[1], links)) {
    const place = areaPath(lnkTarget(link.data) || '', title);
    const program = place && found.get(place[0] + '|' + place[1].toLowerCase());
    if (program) program.shortcut = true;
  }
  const name = p => p.slice(p.lastIndexOf('/') + 1);
  return [...found.values()].sort((a, b) => b.shortcut - a.shortcut || NOT_GAME.test(name(a.path)) - NOT_GAME.test(name(b.path)) || b.size - a.size);
}

// The folder holding an installed program, as it is moved into the game's folder: all of the game
// folder's layer, else the program's folder under Program Files, a user's AppData\Local or Roaming
// (per-user installs), or drive_c.
export function programRoot(program) {
  if (program.area === 0) return '';
  const parts = program.path.split('/');
  const depth = /^program files/i.test(parts[1] || '') ? 3 : /^users\/[^/]+\/appdata\/(?:local|roaming)$/i.test(parts.slice(1, 5).join('/')) ? 6 : 2;
  return parts.slice(0, Math.min(depth, parts.length - 1)).join('/');
}

// Moves an installed game into its OPFS folder (dir, vn/<title>) and out of the engine's IndexedDB
// layer, where it would load whole into memory each start; removes the installer folder's copy.
// Returns { exe (the program's path in the folder), size }.
export async function moveInstalled(title, dir, program, progress) {
  const area = saveAreas(title)[program.area], root = programRoot(program);
  const entries = (await listSaves(area)).filter(e => !root || e.path.startsWith(root + '/'));
  const files = entries.filter(e => !e.dir), total = files.reduce((n, e) => n + e.size, 0);
  const inFolder = p => root ? p.slice(root.length + 1) : p;
  let done = 0;
  progress(0, total);
  for (const e of files) {
    // One file at a time: an install can be GBs.
    for (const f of await readSaves(area, [e])) {
      const parts = inFolder(f.path).split('/');
      let d = dir;
      for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
      const out = await (await d.getFileHandle(parts.at(-1), { create: true })).createWritable();
      await out.write(f.data);
      await out.close();
    }
    progress(done += e.size, total);
  }
  await deleteSaves(area, entries, '');
  await dir.removeEntry(SETUP_FOLDER, { recursive: true }).catch(() => {});
  return { exe: inFolder(program.path), size: total };
}
