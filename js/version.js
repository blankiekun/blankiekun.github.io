// Which Windows this desktop is pretending to be. Windows Setup (setup.js) moves between the
// rows; the choice is kept in localStorage and the page reloads to pick it up, since most text
// is built once when its module loads.

import { store } from './util.js';

export const KEY = 'w95.version';

// App and folder names as the 95 code spells them, and what each era called them.
const OLD = { 'Windows Explorer': 'File Manager', Explorer: 'File Manager', Paint: 'Paintbrush', WordPad: 'Write',
  'Close Program': 'Task List', HyperTerminal: 'Terminal', 'Clipboard Viewer': 'Clipboard Viewer', 'My Computer': 'Main',
  'Network Neighborhood': 'Network', 'Display Properties': 'Desktop' };
const ANCIENT = { ...OLD, 'Windows Explorer': 'MS-DOS Executive', Explorer: 'MS-DOS Executive', Paint: 'Paint', 'Clipboard Viewer': 'Clipboard' };
// Each era's mail program; the window title keeps its folder ("Inbox - Outlook Express").
const mail = n => ({ Inbox: n, 'blankiekun Exchange': n, 'Inbox - blankiekun Exchange': 'Inbox - ' + n });
const ME = { ...mail('Outlook Express'), 'Picture Viewer': 'Imaging', 'Media Player': 'Windows Media Player', 'Network Neighborhood': 'My Network Places' };
const NT = { ...ME, 'Picture Viewer': 'Picture and Fax Viewer', 'MS-DOS Prompt': 'Command Prompt', 'Close Program': 'Windows Task Manager', 'System Monitor': 'Performance', ScanDisk: 'Check Disk' };
const AERO = { ...NT, 'Picture Viewer': 'Photo Viewer', ...mail('Windows Mail'), 'My Computer': 'Computer', 'Network Neighborhood': 'Network', 'Display Properties': 'Personalization', 'System Monitor': 'Resource Monitor' };
const METRO = { ...AERO, 'Picture Viewer': 'Photos', ...mail('Mail'), 'Windows Explorer': 'File Explorer', Explorer: 'File Explorer', 'Disk Defragmenter': 'Optimize Drives', 'Windows Task Manager': 'Task Manager', 'Close Program': 'Task Manager' };
const EDGE = { ...METRO, 'My Computer': 'This PC', 'Internet Explorer': 'blankiekun Edge', 'Microsoft Internet Explorer': 'blankiekun Edge' };

// Programs each era didn't ship. They still open; their icons just say so.
const NOT_31 = ['ie', 'cdplayer', 'defrag', 'scandisk', 'resmeter', 'sysmon', 'winpopup', 'freecell', 'hearts', 'dialer', 'recycle', 'network', 'inbox'];
const NOT_1 = [...NOT_31, 'minesweeper', 'solitaire', 'mplayer', 'sndrec', 'charmap', 'regedit', 'screensaver', 'taskman'];
const NOT_NT = ['winpopup', 'resmeter'];
const NOT_XP = [...NOT_NT, 'cdplayer'];
const NOT_AERO = [...NOT_XP, 'hyperterm', 'clipbrd', 'dialer'];
const NOT_7 = [...NOT_AERO, 'inbox'];
const NOT_METRO = [...NOT_AERO, 'solitaire', 'minesweeper', 'freecell', 'hearts'];

const DOS_OFF = { shutTitle: 'Exit Windows', shutAsk: 'This will end your Windows session.', dosMode: false, waitText: '', offText: 'C:\\WINDOWS>', logoff: '' };
const NINE = { shutAsk: 'Are you sure you want to:', dosMode: true, waitText: 'Please wait while your computer shuts down.', offText: "It's now safe to turn off\nyour computer.", logoff: 'Log Off blankiekun...' };
const NEW_OFF = { shutTitle: 'Shut Down Windows', shutAsk: 'What do you want the computer to do?', dosMode: false };

// One row per version, in upgrade order (ME is the last 9x, so it comes before 2000).
// short: the superscript in logos; number: the build; ver: what the DOS VER command prints.
export const VERSIONS = [
  { id: '1.0', short: '1.0', number: '1.01', date: [1985, 10, 20], copy: '1985', ramKB: 640, ie: '', start: '', desktop: '#ffffff', wallpaper: 'Rooftop', scheme: 'Windows Standard',
    ver: 'MS-DOS Version 3.10', dosCopy: '(C)Copyright blankiekun 1981-1985.', names: ANCIENT, absent: NOT_1, ...DOS_OFF },
  { id: '2.0', short: '2.0', number: '2.03', date: [1987, 11, 9], copy: '1985-1987', ramKB: 1024, ie: '', start: '', wallpaper: 'Moonlit Swings',
    ver: 'MS-DOS Version 3.30', dosCopy: '(C)Copyright blankiekun 1981-1987.', names: ANCIENT, absent: NOT_1, ...DOS_OFF },
  { id: '3.1', short: '3.1', number: '3.10.103', date: [1992, 3, 6], copy: '1985-1992', ramKB: 4096, ie: '', start: '', desktop: '#c0c0c0', wallpaper: 'Sunset Shore', scheme: 'Lavender',
    ver: 'MS-DOS Version 5.00', dosCopy: '(C)Copyright blankiekun 1981-1991.', names: OLD, absent: NOT_31, ...DOS_OFF },
  { id: '95', short: '95', number: '4.00.950', sys: '4.00.950 B', date: [1995, 7, 24], copy: '1981-1995', ramKB: 16384, ie: '4.70.1155', wallpaper: 'Wired', scheme: 'Wired',
    ver: 'blankiekun 95. [Version 4.00.1111]', dosCopy: '(C)Copyright blankiekun 1981-1995.', start: 'Start', names: {}, absent: [], desktop: '#008080', shutTitle: 'Shut Down blankiekun 95', ...NINE },
  { id: '98', short: '98', number: '4.10.2222', sys: '4.10.2222 A', date: [1998, 5, 25], copy: '1981-1999', ramKB: 32768, ie: '5.00.2614.3500', wallpaper: 'Lain', scheme: 'Sakura',
    ver: 'blankiekun 98 [Version 4.10.2222]', dosCopy: '(C)Copyright blankiekun 1981-1998.', start: 'Start', names: { 'Picture Viewer': 'Imaging' }, ...NINE },
  { id: 'me', short: 'Me', number: '4.90.3000', date: [2000, 8, 14], copy: '1981-2000', ramKB: 65536, ie: '5.50.4134.0100', desktop: '#3a6ea5', wallpaper: 'Ed and Ein', scheme: 'Me-tan Green',
    ver: 'blankiekun Millennium [Version 4.90.3000]', dosCopy: '(C)Copyright blankiekun 1981-2000.', start: 'Start', names: ME, ...NINE, ...NEW_OFF },
  { id: '2000', short: '2000', number: '5.00.2195', sys: '5.00.2195\nService Pack 4', date: [2000, 1, 17], copy: '1985-2000', ramKB: 131072, ie: '5.00.3700.1000', nt: true, scheme: 'Mint', wallpaper: 'Snow Town',
    ver: 'blankiekun 2000 [Version 5.00.2195]', dosCopy: '(C) Copyright 1985-2000 blankiekun.', start: 'Start', names: { ...NT, 'Picture Viewer': 'Imaging' }, absent: NOT_NT, ...NINE, ...NEW_OFF,
    waitText: 'Saving your settings...', offText: 'It is now safe to turn off\nyour computer.' },
  { id: 'xp', short: 'XP', number: '5.1.2600', sys: 'Version 2002\nService Pack 2', date: [2001, 9, 25], copy: '1985-2001', ramKB: 262144, ie: '6.0.2900.2180', nt: true, desktop: '#004e98', wallpaper: 'Peeking', scheme: 'Windows Classic',
    ver: 'blankiekun XP [Version 5.1.2600]', dosCopy: '(C) Copyright 1985-2001 blankiekun.', start: 'start', names: NT, absent: NOT_XP, ...NINE,
    shutTitle: 'Turn off computer', shutAsk: 'What do you want the computer to do?', dosMode: false, waitText: 'blankiekun is shutting down...', offText: 'It is now safe to turn off\nyour computer.', logoff: 'Log Off' },
  { id: 'vista', short: 'Vista', number: '6.0.6002', sys: 'Service Pack 2', date: [2007, 0, 30], copy: '2007', ramKB: 1048576, ie: '7.0.6002.18005', nt: true, desktop: '#0b3040', wallpaper: 'Miku Error',
    ver: 'blankiekun [Version 6.0.6002]', dosCopy: 'Copyright (c) 2006 blankiekun. All rights reserved.', start: '', names: AERO, absent: NOT_AERO, ...NINE,
    shutTitle: 'Shut Down Windows', shutAsk: 'What do you want the computer to do?', dosMode: false, waitText: 'Shutting down...', offText: '', logoff: 'Log off' },
  { id: '7', short: '7', number: '6.1.7601', sys: 'Service Pack 1', date: [2009, 9, 22], copy: '2009', ramKB: 4194304, ie: '8.0.7601.17514', nt: true, desktop: '#1c5fa8', wallpaper: 'Light Music',
    ver: 'blankiekun [Version 6.1.7601]', dosCopy: 'Copyright (c) 2009 blankiekun. All rights reserved.', names: AERO, absent: NOT_7 },
  // 8.1 with IE 11, the version people kept using (and the one with the Start button back); the id stays '8'.
  { id: '8', short: '8.1', number: '6.3.9600', date: [2013, 9, 17], copy: '2013', ramKB: 4194304, ie: '11.0.9600.16384', nt: true, desktop: '#1b6f8c', wallpaper: 'Violet Meadow',
    ver: 'blankiekun [Version 6.3.9600]', dosCopy: '(c) 2013 blankiekun. All rights reserved.', names: METRO, absent: NOT_METRO, waitText: 'Shutting down', logoff: 'Sign out' },
  { id: '10', short: '10', number: '10.0.19045', sys: 'Version 22H2', date: [2015, 6, 29], copy: '', ramKB: 8388608, ie: '', desktop: '#003b86', wallpaper: 'Suga Stairs',
    ver: 'blankiekun [Version 10.0.19045]', dosCopy: '(c) blankiekun. All rights reserved.', names: { ...EDGE, 'Sound Recorder': 'Voice Recorder' }, absent: NOT_METRO },
  { id: '11', short: '11', number: '10.0.22631', sys: 'Version 23H2', date: [2021, 9, 5], copy: '', ramKB: 16777216, ie: '', desktop: '#8fb6f2', wallpaper: 'Journey On',
    ver: 'blankiekun [Version 10.0.22631]', dosCopy: '(c) blankiekun. All rights reserved.', names: { ...EDGE, 'MS-DOS Prompt': 'Terminal' }, absent: NOT_METRO },
// Each row only says what changed since the one before it.
].reduce((rows, r) => [...rows, { nt: false, ...rows.at(-1), sys: r.number, ...r }], []);

// A ?v=xp link switches the visitor to that version for good; the param is then dropped so a later
// switch from Windows Setup isn't undone by a reload. Unknown ids are ignored.
const url = new URL(location.href), want = url.searchParams.get('v');
if (want !== null) {
  if (VERSIONS.some(r => r.id === want)) store.set(KEY, want);
  url.searchParams.delete('v');
  history.replaceState(null, '', url);
}
export const V = VERSIONS.find(r => r.id === store.get(KEY, '95')) || VERSIONS[3];
export const OS = 'blankiekun ' + V.short;
// Programs only some eras had. Elsewhere they're left out of the Start menu and the desktop.
const ONLY = { reversi: ['1.0', '2.0'], clock: ['1.0', '2.0', '3.1', 'vista', '7'], spider: ['xp', 'vista', '7'], stickynotes: ['7', '8', '10', '11'], restore: ['me', 'xp'], settings: ['10', '11'], snip: ['7', '8', '10', '11'], viewer: ['98', 'me', '2000', 'xp', 'vista', '7', '8', '10', '11'] };
// Eras where FreeCell and Solitaire hide their cheat codes.
export const CHEATS = ['95', '98', 'me', '2000', 'xp', 'vista', '7'].includes(V.id);
export const absent = app => V.absent.includes(app) || (ONLY[app] ? !ONLY[app].includes(V.id) : false);

// The names the 95 code uses, swapped for this era's. Every era's keys are in the pattern so a
// longer name ("Internet Explorer") always wins over a shorter one inside it ("Explorer").
const KEYS = [...new Set(['blankiekun 95', ...VERSIONS.flatMap(r => Object.keys(r.names))])].sort((a, b) => b.length - a.length);
const RE = new RegExp('\\b(' + KEYS.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b', 'g');
export const rename = s => typeof s === 'string' ? s.replace(RE, k => k === 'blankiekun 95' ? OS : V.names[k] ?? k) : s;

export const ram = kb => kb >= 1048576 ? kb / 1048576 + ' GB' : kb >= 1024 ? kb / 1024 + '.0MB' : kb + ' KB';

console.assert(rename('Internet Explorer') === (V.names['Internet Explorer'] ?? 'Internet Explorer'), 'rename: longest name wins');
console.assert(rename('&About blankiekun 95') === '&About ' + OS, 'rename: the OS name');
