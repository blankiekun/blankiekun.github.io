// node tools/vnpad-check.mjs: checks js/apps/vnpad.js's button map, stick and cursor speed.
import assert from 'node:assert/strict';
import { heldActions, padChanges, cursorSpeed } from '../js/apps/vnpad.js';

const pad = (pressed, axes = [0, 0]) => ({ axes, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) })) });

assert.deepEqual([...heldActions(pad([0, 2, 9]))], ['advance', 'skip']); // Start has no action
assert.deepEqual([...heldActions(pad([], [-0.6, 0.7]))].sort(), ['down', 'left']);
assert.deepEqual([...heldActions(pad([], [0.4, -0.4]))], []);
assert.deepEqual(padChanges(new Set(['advance', 'up']), new Set(['up', 'menu'])), { pressed: ['menu'], released: ['advance'] });
// Drift is nothing, full tilt is 1, the d-pad stands in for a still stick.
assert.deepEqual(cursorSpeed(pad([], [0.1, -1])), [0, -1]);
assert.deepEqual(cursorSpeed(pad([14, 13])), [-1, 1]);
assert.ok(Math.abs(cursorSpeed(pad([], [0.6, 0]))[0] - 0.25) < 1e-9);
console.log('vnpad ok');
