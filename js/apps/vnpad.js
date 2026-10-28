// Gamepads in VNBox, read with the Gamepad API by the page and turned into the game's mouse and keys
// in the frame (Wine gets no joystick). One fixed map for the standard layout (Xbox names; a Steam
// Deck's buttons sit at the same places). Ported from chimimouryou's vn-gamepad.ts; no DOM imports,
// so tools/vnpad-check.mjs runs it in Node.

// Standard-mapping button index -> action.
export const PAD_BUTTONS = {
  0: 'advance', // A: left click
  1: 'menu', // B: the game's right click
  2: 'skip', // X: skip on/off (holds Ctrl)
  3: 'log', // Y: the text log
  4: 'wheelUp', // LB: mouse wheel up (most games' own backlog)
  5: 'wheelDown', // RB: mouse wheel down
  8: 'fullscreen', // View/Select
  12: 'up', 13: 'down', 14: 'left', 15: 'right',
};

// How far the left stick goes before it counts as a d-pad press, and the travel ignored as drift.
const STICK_PRESS = 0.5, DEAD_ZONE = 0.2;

// The actions held on a pad: its buttons, and the left stick pushed past half way as the d-pad.
export function heldActions(pad) {
  const held = new Set();
  pad.buttons.forEach((b, i) => { if (PAD_BUTTONS[i] && b.pressed) held.add(PAD_BUTTONS[i]); });
  const [x = 0, y = 0] = pad.axes;
  if (x <= -STICK_PRESS) held.add('left');
  if (x >= STICK_PRESS) held.add('right');
  if (y <= -STICK_PRESS) held.add('up');
  if (y >= STICK_PRESS) held.add('down');
  return held;
}

// What changed between two polls: the actions pressed and released since `before`.
export const padChanges = (before, now) => ({
  pressed: [...now].filter(a => !before.has(a)),
  released: [...before].filter(a => !now.has(a)),
});

// The cursor's speed, each axis -1..1: the left stick past its dead zone (squared, so it starts
// slow), else the d-pad at full speed.
export function cursorSpeed(pad) {
  const axis = (v = 0) => Math.abs(v) < DEAD_ZONE ? 0 : Math.sign(v) * ((Math.abs(v) - DEAD_ZONE) / (1 - DEAD_ZONE)) ** 2;
  const on = i => pad.buttons[i] && pad.buttons[i].pressed ? 1 : 0;
  return [axis(pad.axes[0]) || on(15) - on(14), axis(pad.axes[1]) || on(13) - on(12)];
}

// Polls the first connected pad each animation frame while one is connected and the tab is visible;
// pads() gives the pads. change(pressed, released), cursor(dx, dy, ms). Returns the stop function.
export function watchGamepads(pads, { change, cursor }) {
  let held = new Set(), frame = 0, last = 0;
  function poll(time) {
    frame = 0;
    const pad = pads().find(p => p && p.connected);
    const now = pad ? heldActions(pad) : new Set();
    const { pressed, released } = padChanges(held, now);
    held = now;
    if (pressed.length || released.length) change(pressed, released);
    if (!pad || document.visibilityState !== 'visible') return;
    const [dx, dy] = cursorSpeed(pad);
    if ((dx || dy) && last) cursor(dx, dy, Math.min(time - last, 50));
    last = time;
    frame = requestAnimationFrame(poll);
  }
  function start() {
    if (!frame && document.visibilityState === 'visible') { last = 0; frame = requestAnimationFrame(poll); }
  }
  window.addEventListener('gamepadconnected', start);
  document.addEventListener('visibilitychange', start);
  start();
  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('gamepadconnected', start);
    document.removeEventListener('visibilitychange', start);
  };
}
