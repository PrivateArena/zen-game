---
name: phaser-text-and-hud
description: >
  Build Phaser 4 text and heads-up displays from the raw GameObjects: TextStyle keys, BitmapText and
  bitmap fonts, NineSlice and rectangle panels, Graphics rounded rects, hand-rolled buttons/lists/
  tooltips (Phaser ships no UI toolkit), pointerover/pointerout hover and cursor state, keyboard focus
  with JustDown, an unzoomed HUD camera via cameras.add + ignore, resolution-crisp text under zoom,
  floating damage numbers, and text-update cost rules. Use when a Phaser game needs text, a HUD,
  menus, settings, tooltips, health/score bars, or a dialog/overlay — when the request mentions
  Phaser text, TextStyle, BitmapText, nineslice, add.rectangle panel, setInteractive hover, HUD camera,
  setScrollFactor, scale FIT, or unreadable/small text; for HUD design concepts use game-ui-ux; for
  board cell picking use phaser-tactical-grid.
---

# Phaser 4 Text & HUD

The rendering half of a game's interface: Phaser 4 has **no widget library** — the scene-object factory
has 49 keys and not one of them is a button, label, slider or panel. This skill builds those from
`Text`, `BitmapText`, `NineSlice`, `Rectangle`, `Graphics`, `Container`, `Layer`, `Group` and input
events. Targets **Phaser 4.2** for new projects (identical API in 4.1); keep an existing project on its
pinned `phaser` version.

## When to use

- Use when a Phaser game needs text that is legible, HUD panels, bars, tooltips, buttons, menus,
  settings rows, dialogs, pause overlays, or floating combat/damage numbers.
- Use when wiring hover/press/focus behaviour — Phaser's is per-GameObject `setInteractive` +
  `pointerover`/`pointerout`, not a focus manager.
- Use when text goes blurry, or when updating a score/HP label costs frames.

**When _not_ to use:** layout/resolution/safe-area/focus-navigation *design* → `game-ui-ux` (it owns
the concepts; this file binds them to Phaser calls). Scene lifecycle and the asset loader →
`phaser-core`. Grid/board interaction → `phaser-tactical-grid`. Real-time bodies →
`phaser-arcade-physics`. A full widget framework is a third-party plugin, not core — say so rather
than pretending.

## Core workflow

1. **Check the render mode and version first.** `package.json` → `phaser` version; `config.type`.
   `NineSlice` is registered **only under WebGL**, so in a `Phaser.CANVAS` build
   `this.add.nineslice` is not a function at all — panel art built on it must have a fallback.
2. **Pick the text technology per job.** `Text` (canvas-rendered, any font, crisp at `resolution`) for
   dense/paragraph text; `BitmapText` for large arcade numerals and per-character tint; a `RenderTexture`
   only for static composites. Do not mix two systems in one panel.
3. **Build widgets once, in one module** (`src/ui/widgets/`), each with the same shape: `create` →
   `setInteractive(config)` → `pointerover`/`pointerout`/`pointerdown` → `setState(hover|pressed|disabled)`
   → emits a scene event. The HUD consumes events, not widgets' internals.
4. **Layer the HUD on its own `Layer` and camera**, and `ignore` the world layers, so board zoom/pan
   never moves your panels.
5. **Drive content from state events**, never from `update()`: subscribe to the rules/game emitter and
   repaint only what changed.
6. **Verify on a small screen and with the keyboard only** — resize the window to a phone-width
   viewport and complete the flow without a mouse.

## Patterns

### 1. Text styles: the keys that actually exist

```js
const label = this.add.text(24, 24, 'Turn 3 / 12', {
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: '20px',            // string or number
  fontStyle: 'bold',           // NOT `weight`
  color: '#e8ecf5',
  stroke: '#0b0e17', strokeThickness: 4,
  shadow: { offsetX: 0, offsetY: 2, color: '#000', blur: 4, fill: true }, // NOT shadow.x/y
  align: 'left',               // 'left' | 'center' | 'right' | 'justify'
  wordWrap: { width: 260, useAdvancedWrap: true },   // NOT wrapWidth / breakWords / whiteSpace
  lineSpacing: 4, letterSpacing: 0.5,
  padding: { x: 6, y: 4 },     // object, or { left, top, right, bottom }
  resolution: Math.min(2, window.devicePixelRatio || 1),   // crisp at HUD zoom
});
label.setOrigin(0, 0);
// Missing in v4: setBreakWords, setMaxWidth (BitmapText only), setMaskFilter, Phaser.Display.Text.*
```

To size a panel to its text, measure with an existing object's style:
`Phaser.GameObjects.GetTextSize(text, textObject.style, out)` (and `MeasureText(style)` underneath) both
need a real `TextStyle`, so reuse a label you already created instead of building a throwaway style.

### 2. Panel: NineSlice art, or Graphics when you have no art

```js
// Nine-sliceeled art: (x, y, texture, frame, width, height, left, right, top, bottom)
const panel = this.add.nineslice(0, 0, 'ui-atlas', 'panel', 320, 180, 12, 12, 12, 12)
  .setOrigin(0, 0).setDepth(100);
panel.setSize(320, 220);                    // relayout content after every resize
panel.setSlices(320, 220, 12, 12, 12, 12); // v4: slices replaced setRadius/setTileMode
// WebGL-only object; with config.type = Phaser.CANVAS it is not created at all.

// No art? Draw it. There is no RoundedRectangle GameObject/Geom in v4, but Graphics has rounded rects:
const bg = this.add.graphics().setDepth(99);
bg.fillStyle(0x141a2a, 0.92).fillRoundedRect(0, 0, 320, 180, 8);
bg.lineStyle(1, 0x35507a, 1).strokeRoundedRect(0.5, 0.5, 319, 179, 8);
// Or one cheap flat panel object: this.add.rectangle(x, y, w, h, 0x141a2a, 0.92)
```

### 3. A button widget (Phaser gives you none)

```js
// src/ui/widgets/button.js — same shape for every control: state -> art, click -> scene event.
export function makeButton(scene, { x, y, width, height, label, onTap }) {
  const c = scene.add.container(x, y).setDepth(110);
  const bg = scene.add.rectangle(0, 0, width, height, 0x223052, 1);
  const text = scene.add.text(0, 0, label, { fontSize: '18px', color: '#dfe6f5' }).setOrigin(0.5);
  c.add([bg, text]);

  let state = 'normal';        // 'normal' | 'hover' | 'focus' | 'disabled'
  const FILL = { normal: 0x223052, hover: 0x2f4474, focus: 0x2f4474, disabled: 0x1a1f2e };
  const paint = () => bg.setFillStyle(FILL[state], state === 'disabled' ? 0.5 : 1);
  const down  = () => { if (state !== 'disabled') { state = 'hover'; paint(); } };

  // One call only: a second setInteractive() takes the "already enabled" fast path and ignores config.
  bg.setInteractive({ useHandCursor: true });   // keys: hitArea, hitAreaCallback, useHandCursor, cursor,
  bg.on('pointerover', down)                                // draggable, dropZone, pixelPerfect,
    .on('pointerdown', () => {                              // alphaTolerance
      if (state === 'disabled') return;
      scene.tweens.add({ targets: c, scale: 0.96, yoyo: true, duration: 70 });
      onTap();
    });
  bg.on('pointerout', () => { state = 'normal'; paint(); });
  paint();

  return {
    container: c,
    setText: (s) => text.setText(s),
    // disableInteractive() only flips input.enabled — `bg.input` stays non-null, and a later
    // setInteractive() takes the "already enabled" fast path, restoring the ORIGINAL config.
    setEnabled: (on) => {
      if (on) { bg.setInteractive(); state = 'normal'; } else { bg.disableInteractive(); state = 'disabled'; }
      paint();
    },
    isEnabled: () => !!bg.input?.enabled,
    destroy: () => { bg.removeAllListeners(); c.destroy(); },
  };
}
```

Keyboard parity comes from the focus ring in `references/widgets-and-hud.md` — `pointerover` has no
keyboard equivalent, and `Align`-based focus art must respond to the same `state` variable.

### 4. HUD on its own camera, immune to board zoom

```js
const hudCam = this.cameras.add(0, 0, this.scale.width, this.scale.height);  // no zoom, no scroll
hudCam.ignore([worldLayers.ground, worldLayers.units, worldLayers.effects]);  // GameObjects/Groups/Layers
this.cameras.main.ignore(hudLayer);                    // and the world camera must not draw the HUD
// There is no camera.removeFromIgnore(): un-ignore by resetting the object's `cameraFilter`.
hudLayer.setDepth(1000);  // display-list order still matters within a camera
```

### 5. Floating numbers and other transient text (reuse, don't spawn)

```js
// A Text pool. Group.create() takes (x, y, key, frame, ...) — no style — so own the list yourself.
class TextPool {
  constructor(scene, count, style) {
    this.scene = scene; this.free = []; this.busy = new Set();
    for (let i = 0; i < count; i++) {
      this.free.push(scene.add.text(0, 0, '', style).setDepth(200).setVisible(false));
    }
  }
  take(x, y, text) {
    const t = this.free.pop() ?? this.grow();
    t.setPosition(x, y).setText(text).setAlpha(1).setScale(1).setVisible(true);
    this.busy.add(t); return t;
  }
  release(t) { if (this.busy.delete(t)) { t.setVisible(false); this.free.push(t); } }
  grow() { return this.scene.add.text(0, 0, '', this.style).setDepth(200); }   // same style, or the
}                                                                              // grown ones look wrong

const numbers = new TextPool(this, 24, { fontSize: '22px', fontStyle: 'bold' });
const floatNumber = (x, y, value, color) => {        // arrow: `this.tweens` stays bound to the Scene
  const t = numbers.take(x, y, String(value)).setColor(color);
  this.tweens.add({ targets: t, y: y - 42, alpha: 0, scale: 1.25, duration: 620, ease: 'Cubic.Out',
                    onComplete: () => numbers.release(t) });      // never destroy per hit
};
// For homogeneous *sprite* pools use this.add.group({ classType, maxSize, runChildUpdate }).
```

### 6. BitmapText for big numerals, and the arg-order trap

```js
this.load.bitmapFont('arcade', 'fonts/arcade.png', 'fonts/arcade.xml');   // (key, texture, fontData)
const hp = this.add.bitmapText(x, y, 'arcade', '24', 32);   // (x, y, font, TEXT, size) — text BEFORE size
hp.setRightAlign().setLetterSpacing(1).setDropShadow(0, 2, 0x000000, 0.6);
hp.setMaxWidth(120);                       // Text has no setMaxWidth; BitmapText does
// There is no setAlign(): use setLeftAlign() / setCenterAlign() / setRightAlign()
```

### 7. Responsive HUD

```js
// config: { scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH } }
this.scale.on('resize', (gameSize) => {
  hudCam.setSize(gameSize.width, gameSize.height);
  layoutHud(gameSize.width, gameSize.height);   // re-run the ANCHOR math, don't just scale the layer
});
// Anchor by edges, not by pixels: this.scale.width - PANEL_W - MARGIN for a right-docked panel,
// Phaser's types expose no safe-area inset, so on mobile pass your own insets through config
// and apply them inside that same layout function (see game-ui-ux).
```

## Pitfalls

- **`TypeError: ... setMaxWidth`/`setAlign` is not a function** → those exist on `BitmapText`, not
  `Text` (and `BitmapText` has `setLeftAlign/setCenterAlign/setRightAlign`, no `setAlign`).
- **`this.add.bitmapText(x, y, font, 32, 'HP')` prints a number as the text** → v4 signature is
  `(x, y, font, text, size, align)`. A v3 tutorial's argument order is the usual cause.
- **`this.add.nineslice is not a function` in the Canvas build** → `NineSlice` is registered only under
  `WEBGL_RENDERER`, so the factory key itself is missing. Feature-detect it or fall back to
  `add.rectangle`/`Graphics` art; do not assume `Phaser.AUTO` means WebGL.
- **Text stays blurry after zooming the HUD** → the canvas texture was baked at `resolution: 1`; set
  `resolution` (or `fontSize` in the layout pass) and re-measure — `setText` does not re-rasterise at a
  new resolution by itself.
- **Moving a `Layer` does nothing** → in Phaser 4 `Layer` is a grouping device (depth, alpha, mask,
  visibility) with **no transform component**. Use a `Container` when you need to translate or
  scale a group — and remember a Container's children sort in container-local depth space.
- **HUD scrolls/zooms with the board** → the objects are drawn by the world camera. Put them on their
  own `Layer` + `cameras.add()` HUD camera and `ignore()` the world layers, or `setScrollFactor(0)` for
  a single element.
- **Two canvases after a hot reload** → destroy the old `Phaser.Game` on unmount; see `phaser-core`.
- **Hover highlight sticks** → you listened to `gameobjectover` but not `gameobjectout`, or the object was
  destroyed while hovered. Reset state on `pointerout`, `destroy`, and when the panel closes.
- **Clicks land through a modal** → the overlay has no interactive hit area. Give the backdrop a
  full-screen `rectangle`/`Zone` with `setInteractive()` above the world, and turn the world's controls
  off with `gameObject.disableInteractive()` (restore with `setInteractive(...)`); there is no
  `input.resetInput()` in v4.
- **Score label updates every frame and the frame time creeps** → each *changed* `setText` re-renders a
  canvas texture. Update on state events, guard with `if (next !== current)`, and pool transient text
  instead of `add.text` per hit.
- **`RoundedRectangle` / `Phaser.Geom.RoundedRectangle` is undefined** → removed in v4; use
  `Graphics.fillRoundedRect`, or `add.rectangle`, or NineSlice art.
- **`Phaser.Display.Text.MeasureWidth` gone** → use `Phaser.GameObjects.MeasureText(style)` /
  `GetTextSize(...)`; there is no `Phaser.UI`, no `add.button`/`add.label`/`add.gridFollower` in core.
- **RTL/Arabic text renders in the wrong direction** → call `setRTL(true)` **before** `setText`.
- **`this.input.setHotkeys` is not a function** → no such API; bind keys with
  `this.input.keyboard.addKeys(...)` and `Phaser.Input.Keyboard.JustDown(key)`.

## References

- For the widget set (focus ring + keyboard navigation, list/scroll, tooltip layer, bars, modal stack),
  text/texture cost rules and a HUD smoke test, read `references/widgets-and-hud.md`.

## Related skills

- `game-ui-ux` — anchors, scaling, safe areas, focus navigation, HUD/event-driven updates (the design).
- `phaser-core` — game config, Scene lifecycle, loader, scene transitions, camera basics.
- `phaser-tactical-grid` — board layers and the camera the HUD must not inherit.
- `input-systems` — action mapping and rebinding that feed the keyboard path into this HUD.
- `game-feel` — what the numbers and flashes should *feel* like; this skill supplies the objects.
