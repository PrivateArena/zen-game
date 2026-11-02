# Widgets, focus, and HUD plumbing

Depth for `phaser-text-and-hud`. Every symbol here was checked against Phaser 4.1's
`types/phaser.d.ts`; if your project pins another version, re-check before copying.

## 1. The widget contract

Phaser has no widget base class, so define one and hold every control to it:

```js
// One shape for button, toggle, slider row, list item, ability icon...
// create(scene, spec) -> { container, setState(s), setText(t), setEnabled(on), destroy() }
// States: 'normal' | 'hover' | 'focus' | 'pressed' | 'disabled' — art is a pure function of state.
function paint(widget, state) {
  const fill = { normal: 0x223052, hover: 0x2f4474, focus: 0x2f4474, pressed: 0x1a2440, disabled: 0x1a1f2e }[state];
  widget.bg.setFillStyle(fill, state === 'disabled' ? 0.5 : 1);
  widget.ring.setVisible(state === 'focus');            // keyboard ring, see §2
  widget.label.setColor(state === 'disabled' ? '#6b7590' : '#dfe6f5');
}
```

Rules that keep this from rotting:

- **Container per widget** (`this.add.container(x, y)` + `container.add([...])`), so moving/anchoring a
  control is one transform; `container.setSize(w, h)` before making it interactive.
- **Input in, event out.** The widget emits `scene.events.emit('ui:cast', { unitId, slot })`; the HUD
  listens. Widgets never read game state directly, and gameplay code never touches widget internals.
- **Disabled = `gameObject.disableInteractive()`**, and test it with `if (!go.input)` (it is null while
  non-interactive). Re-enable needs the *same* hit area, so keep the interactive config in the spec.
- Store the pointer listeners so `destroy()` can remove them; a listener on a destroyed object is a leak
  that survives a scene restart.

## 2. Keyboard focus without a focus manager

`pointerover` has no keyboard twin, so keep the focus index in your own code and read keys where Phaser
actually gives you a per-frame hook — `update()` (there is no `inputupdate` scene event):

```js
const focus = { items: [], index: -1 };
const addFocusable = (w) => { focus.items.push(w); if (focus.index < 0) setFocus(0); };  // always focus something
const enabledOnly = () => focus.items.filter(w => w.isEnabled());

function setFocus(next) {
  const list = enabledOnly();
  if (!list.length) { focus.index = -1; return; }                 // never index an empty/locked panel
  focus.items.forEach(w => w.setState('normal'));
  focus.index = ((next % list.length) + list.length) % list.length;   // wrap, incl. negative
  list[focus.index].setState('focus');
}
const moveFocus = (d) => setFocus((focus.index < 0 ? 0 : focus.index) + d);

const keys = this.input.keyboard.addKeys('up,down,left,right,enter,space,tab');
this.input.keyboard.addCapture('UP,DOWN,LEFT,RIGHT,SPACE,TAB');   // stop the page scrolling

update() {                                                        // Scene method, not a scene event
  if (Phaser.Input.Keyboard.JustDown(keys.down) || Phaser.Input.Keyboard.JustDown(keys.right)) moveFocus(1);
  if (Phaser.Input.Keyboard.JustDown(keys.up)   || Phaser.Input.Keyboard.JustDown(keys.left))  moveFocus(-1);
  if (Phaser.Input.Keyboard.JustDown(keys.enter) || Phaser.Input.Keyboard.JustDown(keys.space))
    enabledOnly()[focus.index]?.activate();          // the SAME handler pointerdown calls — never two paths
}
```

- Focus ring: a `Graphics` child with `lineStyle(2, 0xffd166, 1).strokeRoundedRect(x, y, w, h, 6)` — or
  a second, slightly larger `add.rectangle` with `setStrokeStyle` — toggled by `setVisible`.
- Re-derive the focus list when content changes (a widget disabled mid-turn must not stay focused), and
  re-resolve by **id** after a list repopulates, or focus silently jumps.
- Gamepad: route this through the same named actions the gameplay uses (`input-systems`), not raw keys.
- Focus must survive content changes: after a list repopulates, re-resolve the index by id, not by
  position, or focus silently jumps.

## 3. Tooltips and overlays

```js
// A Container, not a Layer: it has a transform, so one setPosition() moves panel + text together.
const tip = this.add.container(0, 0).setDepth(300).setVisible(false);
const tipPanel = this.add.rectangle(0, 0, 10, 10, 0x0b0e17, 0.95).setOrigin(0, 0);  // no input here
const tipText = this.add.text(8, 6, '', { fontSize: '14px', wordWrap: { width: 220 } })
  .setOrigin(0, 0).setMaxLines(6);
tip.add([tipPanel, tipText]);

function showTip(scene, target, lines) {
  tipText.setText(lines);
  const { width, height } = tipText.getBounds();       // measure AFTER the text is set
  tipPanel.setSize(width + 16, height + 12);           // origin (0,0) keeps panel and text in agreement
  const view = scene.cameras.main.worldView;           // world-space rect: has .x/.y/.right/.bottom
  const x = Phaser.Math.Clamp(target.x + target.displayWidth + 8,
                              view.x + 4, view.right - tipPanel.width - 4);
  tip.setPosition(x, target.y).setVisible(true);
}
// Hide on: pointerout, the target's destroy, panel open/close, and scene sleep — or you get ghosts.
```// Hide on: pointerout, the object's destroy, panel open/close, and scene sleep (all three, or ghosts).
```

`Phaser.Display.Align` (`TOP_LEFT … BOTTOM_RIGHT`) plus
`Align.QuickSet(child, alignIn, position, offsetX?, offsetY?)` — where `alignIn` is the object being
aligned *within* and `position` is an `Align.*` constant for the target side — covers "stick this label
under that icon" without hand arithmetic; `Align.To.*` / `Align.In.*` do the same for one-off placement.

## 4. Scrollable lists (there is no scroll container)

```js
// Viewport = a CONTAINER (it has a transform, so moving it moves the rows) + a geometry mask (clip).
let scroll = 0, contentHeight = rows.length * rowHeight;      // own the scroll state; clamp it in ONE place
const clampScroll = (y) => Phaser.Math.Clamp(y, 0, Math.max(0, contentHeight - ph));
const clip = this.add.graphics();                              // mask Geometry needs no display-list slot
clip.fillStyle(0xffffff).fillRect(px, py, pw, ph);
const rows = this.add.container(px, py).setDepth(120)
  .setMask(new Phaser.Display.Masks.GeometryMask(this, clip));
rows.setSize(pw, ph);                                          // ComputedSize, so it can be interactive

function setScroll(y) {
  scroll = clampScroll(y);
  rows.y = py - scroll;                                        // shift the rows, never the clip
}
const viewport = this.add.rectangle(px + pw / 2, py + ph / 2, pw, ph, 0x000000, 0)
  .setInteractive({ draggable: true });          // GameObject-level 'dragstart' | 'drag' | 'dragend' | 'drop'
let dragStart = 0;
let grabY = 0;
viewport.on('dragstart', (pointer) => { dragStart = scroll; grabY = pointer.y; })
  .on('drag', (pointer, dragX, dragY) => setScroll(dragStart + (grabY - dragY)));  // grab-relative delta
this.input.on('wheel', (pointer, currentlyOver, dx, dy) => setScroll(scroll + dy * 24));    // accumulates
```

A `Layer` has **no transform** (it groups draw order, alpha, mask and visibility, and its
`setInteractive`/`disableInteractive` are stubs) — translating a scroll viewport, or toggling input on a
whole panel, needs `Container`s. Redraw `clip` whenever the panel resizes: the mask is a shape you own,
not a layout property. For long rosters, only create rows inside the viewport
(`ceil(ph / rowHeight) + 2`) and rebind them on scroll — the pooling idea of §5, applied to a list.A `Layer` has **no transform** (it groups draw order, alpha, mask, visibility) — translating a scroll
viewport needs a `Container`. Redraw `clip` whenever the panel resizes: the mask is a shape you own, not
a layout property. For long rosters, only create rows inside the viewport (`ceil(ph / rowHeight) + 2`)
and rebind them on scroll — the pooling idea of §5, applied to a list.

## 5. Bars, counters, and stable labels

```js
// Proportional fill beats clipping for HP/XP/turn timers: one Graphics redraw on state change.
function drawBar(g, rect, value, max, color) {
  g.clear();
  g.fillStyle(0x0b0e17, 1).fillRoundedRect(rect.x, rect.y, rect.width, rect.height, 4);
  const w = Math.max(0, (value / max) * (rect.width - 2));
  g.fillStyle(color, 1).fillRoundedRect(rect.x + 1, rect.y + 1, w, rect.height - 2, 3);
}
// Animated number + bar from one tween, so they can never disagree:
this.tweens.addCounter({ from: prev, to: next, duration: 260, ease: 'Sine.Out',
  onUpdate: (t) => { const v = t.getValue(); hpLabel.setText(`${Math.ceil(v)}`); drawBar(g, rect, v, max, c); } });
```

- `setFixedSize(width, height)` (both numbers — there is no `'auto'`) or `setMaxLines(1)` on counters so a
  digit-count change does not shove the layout; align them with `setOrigin(1, 0)` against a right edge.
- `addCounter` is `this.tweens.addCounter(...)` — there is no `this.tweens.counter`.
- The `onUpdate` `setText` above is the deliberate exception to §7: it runs for 260 ms on **one** label as
  part of a tween. The rule it does not break is the per-frame `setText` in `update()` on a value that
  usually did not change.

## 6. Modal / dialog stack

Keep an explicit stack, because Phaser's scene `pause`/`sleep` does not gate input for you:

```js
const stack = [];
function pushOverlay(panel) { if (stack.length) setInteractiveRecursive(stack.at(-1), false);
                              stack.push(panel); panel.setVisible(true); }
function popOverlay()       { const top = stack.pop(); top.setVisible(false);
                              if (stack.length) setInteractiveRecursive(stack.at(-1), true); }
// Walks a CONTAINER tree (a Layer's own setInteractive/disableInteractive are stubs):
function setInteractiveRecursive(node, on) {
  if (node.input) on ? node.setInteractive() : node.disableInteractive();   // enabled flag, not null check
  if (node.list) node.list.forEach(child => setInteractiveRecursive(child, on));
}
```

Every overlay needs: an explicit close key (`Esc` via `JustDown`), a focus ring on its first control, and
input restored on close — the "clicks land through the modal" bug is a missing `stack` entry, not a
missing hit area. To freeze the *game* while a scene-level dialog is up, use `this.scene.pause()` and let
the dialog run in a parallel scene (`phaser-core` owns those verbs).

## 7. Text cost rules

| Situation | Do |
| --- | --- |
| label follows state | `if (next !== current) label.setText(next)`; repaint on the state event, never in `update()` |
| HUD under board zoom | `resolution: 2` (or `Math.min(2, devicePixelRatio)`); re-measure after changing it |
| paragraph in a fixed panel | `wordWrap: { width }` + `setMaxLines(n)`, then `getBounds()` to check it fits |
| many numbers, per frame | `BitmapText` (no canvas re-raster), or pool `Text` objects |
| layout arithmetic | `Phaser.GameObjects.MeasureText(style)` / `GetTextSize(...)` once per layout pass |
| transient numbers | a `TextPool` (see SKILL.md §5), released on `onComplete` |

## 8. HUD smoke test (do it every time you touch UI)

1. Resize to ~360 px wide: nothing overlaps, nothing off-screen, right-docked panels still docked.
2. Keyboard-only (and gamepad, per `game-ui-ux`): reach every control, activate every control, close every overlay with `Esc`; confirm something is focused the moment a panel opens.
3. Hover then close the panel under the cursor: no stuck highlight, no ghost tooltip.
4. Change the render mode to `Phaser.CANVAS` once: `add.nineslice` is undefined there, so NineSlice-based art must fail loudly (or have the fallback), never half-render.
5. HiDPI (2x) and 1x: text crispness and pointer accuracy both hold.
6. End a real match: no listener errors after scene restart (the stale-listener tell of a widget that
   never unbound).
