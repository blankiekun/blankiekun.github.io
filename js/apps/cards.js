// The playing cards shared by Solitaire, FreeCell and Hearts. The look lives in
// css/apps.css (.cd, .cd-front, .cd-back); a card is sized by --cw/--ch and its
// back pattern comes from a [data-back] attribute on an ancestor.

import { h } from '../util.js';

// Suits in Microsoft's order: clubs, diamonds, hearts, spades.
export const SUITS = ['♣', '♦', '♥', '♠'];
export const SUIT_NAMES = ['clubs', 'diamonds', 'hearts', 'spades'];
export const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const RANK_NAMES = ['', 'ace', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'jack', 'queen', 'king'];
export const red = s => s === 1 || s === 2;
export const cardName = c => RANK_NAMES[c.r] + ' of ' + SUIT_NAMES[c.s];

// Pip positions as fractions of the card's face, for 1-10.
const PIPS = {
  1: [[.5, .5]], 2: [[.5, .2], [.5, .8]], 3: [[.5, .2], [.5, .5], [.5, .8]],
  4: [[.3, .2], [.7, .2], [.3, .8], [.7, .8]],
  5: [[.3, .2], [.7, .2], [.5, .5], [.3, .8], [.7, .8]],
  6: [[.3, .2], [.7, .2], [.3, .5], [.7, .5], [.3, .8], [.7, .8]],
  7: [[.3, .2], [.7, .2], [.5, .35], [.3, .5], [.7, .5], [.3, .8], [.7, .8]],
  8: [[.3, .2], [.7, .2], [.5, .35], [.3, .5], [.7, .5], [.5, .65], [.3, .8], [.7, .8]],
  9: [[.3, .2], [.7, .2], [.3, .4], [.7, .4], [.5, .5], [.3, .6], [.7, .6], [.3, .8], [.7, .8]],
  10: [[.3, .2], [.7, .2], [.5, .3], [.3, .4], [.7, .4], [.3, .6], [.7, .6], [.5, .7], [.3, .8], [.7, .8]],
};

// The face of card c = { s: suit 0-3, r: rank 1-13 }.
export function cardFace(c) {
  const sym = SUITS[c.s];
  const corner = cls => h('div', { class: 'cd-corner ' + cls }, h('b', null, RANKS[c.r]), h('i', null, sym));
  const mid = h('div', { class: 'cd-mid' });
  if (c.r <= 10) {
    for (const [x, y] of PIPS[c.r]) {
      mid.append(h('span', { class: 'cd-pip' + (y > .55 ? ' flip' : '') + (c.r === 1 ? ' ace' : ''), style: { left: x * 100 + '%', top: y * 100 + '%' } }, sym));
    }
  } else {
    mid.append(h('div', { class: 'cd-court' }, h('b', null, RANKS[c.r]), h('i', null, sym), h('b', { class: 'flip' }, RANKS[c.r])));
  }
  return h('div', { class: 'cd-front' + (red(c.s) ? ' red' : '') }, corner('tl'), mid, corner('br'));
}

// A whole card element, face and back; add the class "up" to show the face.
export function cardEl(c, attrs) {
  return h('div', { class: 'cd', 'data-id': c.id, role: 'img', ...attrs }, cardFace(c), h('div', { class: 'cd-back' }));
}
