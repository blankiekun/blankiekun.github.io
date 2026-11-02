// Display Properties' colour schemes, apart from display.js so that the VNBox player can colour
// itself without loading the screen saver and the sounds.

export const SCHEMES = {
  'Windows Standard': { face: '#c0c0c0', title: '#000080', desktop: '#008080' },
  'Windows Classic': { face: '#d4d0c8', title: '#0a246a', desktop: '#3a6ea5' },
  'Brick': { face: '#c2bfa5', title: '#800000', desktop: '#3f1010' },
  'Desert': { face: '#d5ccbb', title: '#008080', desktop: '#a28d68' },
  'Eggplant': { face: '#90b0a8', title: '#588078', desktop: '#400040' },
  // The loud one from 3.1: red bars, yellow faces.
  'Hot Dog Stand': { face: '#ffff00', title: '#ff0000', desktop: '#ff0000' },
  'Lilac': { face: '#aea8d9', title: '#5a4eb1', desktop: '#57458b' },
  'Maple': { face: '#e6d8ae', title: '#800000', desktop: '#804000' },
  'Marine': { face: '#88c0b8', title: '#000080', desktop: '#004060' },
  'Rainy Day': { face: '#8099b0', title: '#4f6582', desktop: '#000000' },
  'Rose': { face: '#cfafb7', title: '#800040', desktop: '#9f6070' },
  'Slate': { face: '#a0b4c8', title: '#406080', desktop: '#3a5070' },
  'Spruce': { face: '#a2c8a9', title: '#2b7556', desktop: '#005034' },
  'Storm': { face: '#c0c0c0', title: '#800080', desktop: '#000000' },
  'Wheat': { face: '#d6d5a8', title: '#808000', desktop: '#808040' },
  // Pastel moe schemes, each era's default from 3.1 to 2000 (js/version.js).
  'Sakura': { face: '#f2d4dc', title: '#c8507a', desktop: '#e8a0b4' },
  'Lavender': { face: '#dcd4ee', title: '#6a54b0', desktop: '#8a78c8' },
  'Mint': { face: '#cfe8d8', title: '#2a8a68', desktop: '#5aa888' },
  'Me-tan Green': { face: '#d8e4c8', title: '#3a8a3a', desktop: '#3a6ea5' },
  'Miku Teal': { face: '#cce8e8', title: '#1a9a9a', desktop: '#137a7f' },
  'Wired': { face: '#c8c4d0', title: '#4a2a6a', desktop: '#1a1028' },
};

function mix(hex, to, t) {
  const a = parseInt(hex.slice(1), 16), b = parseInt(to.slice(1), 16);
  const c = [16, 8, 0].map(s => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t));
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
}

export function schemeVars(name) {
  const sc = SCHEMES[name] || SCHEMES['Windows Standard'];
  return {
    '--face': sc.face,
    '--light': mix(sc.face, '#ffffff', 0.5),
    '--shadow': mix(sc.face, '#000000', 0.333),
    '--title': sc.title,
    '--title-off': mix(sc.face, '#000000', 0.333),
    '--title-ink-off': sc.face,
    '--select': sc.title,
  };
}
