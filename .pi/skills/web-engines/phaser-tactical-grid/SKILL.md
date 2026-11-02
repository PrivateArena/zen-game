---
name: phaser-tactical-grid
description: >
  Draw and drive a cell grid in Phaser 4: square or isometric board rendering with the Grid shape and
  a Graphics highlight overlay, cell-to-world and world-to-cell conversion under camera zoom, one
  interactive board Zone for hover and click picking, pan/zoom board camera with bounds, depth-sorted
  unit sprites, and tweening a unit along a cell path. Use for a tactics, board, puzzle or city grid
  in Phaser — when the request mentions grid, cell, tile, tilemap, isometric/iso board, screen to
  cell, tile hover, range highlight, board camera, or Phaser add.grid, TilemapLayer, worldView; for
  real-time bodies, colliders and gravity use phaser-arcade-physics; for turn phases, ranges and
  combat rules use turn-based-strategy.
---

# Phaser 4 Tactical Grid

Give a Phaser game a *cell board*: a grid of cells you can draw, hover, click, highlight, pan, zoom,
and walk a sprite across cell by cell. Targets **Phaser 4.2** for new projects (the same code runs on
4.1); keep an existing project on its pinned `phaser` version unless migration is requested. The
board model lives in plain data; Phaser only renders it and reports pointers.

## When to use

- Use when the game is organised by cells: tactics/SRPG boards, board games, puzzle grids, tower-defense
  lanes, city/build grids, inventory grids, scrollable tile maps.
- Use for drawing the grid, converting a pointer position to a cell, highlighting a set of cells
  (movement/attack ranges), a board camera, and animating along a cell path.
- Use when a Phaser project has no tilemap skill to lean on — this is the web tile/grid skill.

**When _not_ to use:** velocity, gravity, colliders, groups of moving bodies → `phaser-arcade-physics`.
Scene setup, the loader, and scene transitions → `phaser-core`. Turn order, action economy, range and
combat rules → `turn-based-strategy`. Pixi/three grids → `pixijs-rendering` / `threejs-scene-setup`
(see the projection reference for the engine-neutral math).

## Core workflow

1. **Read the pinned version first.** `package.json` + the lockfile decide which API names are legal
   (4.1 and 4.2 share everything below; v3 snippets are the hazard, not v4 point releases).
2. **Pin the geometry constants next.** One module owns `TILE_W`, `TILE_H`, board `cols`/`rows` and the
   board's world origin `ORIGIN_X`/`ORIGIN_Y`. Every other file derives from it — never re-derive a
   tile size from a sprite frame at the call site.
3. **Keep cells in data, not in GameObjects.** A `Uint8Array`/array-of-objects grid is cheap to copy,
   compare, hash and test. Sprites are the *view* of it, rebuilt or patched when the data changes.
4. **Draw the static grid once.** `this.add.grid(...)` for the cell lattice, or a pre-rendered
   `generateTexture()` for a big map; put highlights on a separate `Graphics` that you `clear()` and
   repaint per frame of interaction.
5. **Convert the pointer to a cell; never pick per cell.** Read the pointer's world position and do
   the division — 1 000 interactive GameObjects, or a `hitAreaTest` that returns an empty array on
   `hover`/`out`, is the classic web tactics perf-and-correctness mistake.
6. **Convert through the camera, always.** Use `pointer.worldX/worldY` (or `camera.getWorldPoint`) so
   zoom/scroll/rotation are already undone before you do the cell division.
7. **Layer the scene**: ground → highlights → units → effects → board UI, as `this.add.layer()`
   containers with explicit `setDepth`, so a unit never paints over the end-turn button.
8. **Verify visually.** Serve it, hover the four board corners and a zoomed-in centre cell, and check
   the printed cell index matches the highlighted tile at both scroll extremes.

## Patterns

### 1. Board geometry as the single source of truth

```js
// board/geometry.js — no Phaser import: pure, unit-testable, reused by the rules core.
export const TILE_W = 48, TILE_H = 48;             // square cells; iso uses 2:1 (see references)
export const ORIGIN_X = 0, ORIGIN_Y = 0;            // board's world top-left

export function cellToWorld(cx, cy) {                 // cell -> world (top-left of the tile rect)
  return { x: ORIGIN_X + cx * TILE_W, y: ORIGIN_Y + cy * TILE_H };
}
export function centerOf(cx, cy) {                    // where a unit sprite anchors
  return { x: ORIGIN_X + (cx + 0.5) * TILE_W, y: ORIGIN_Y + (cy + 0.5) * TILE_H };
}
export function worldToCell(wx, wy) {                 // world -> cell
  return { cx: Math.floor((wx - ORIGIN_X) / TILE_W), cy: Math.floor((wy - ORIGIN_Y) / TILE_H) };
}
export const inBounds = (cx, cy, cols, rows) => cx >= 0 && cy >= 0 && cx < cols && cy < rows;
```

For isometric cells the formulas change but the contract does not — see
`references/grid-projection-and-picking.md`. Whatever the shape, `worldToCell(centerOf(cx, cy))` must
return `{cx, cy}` for every cell on the board: that round-trip is the test, and it costs five lines.

### 2. Grid drawing (v4 names — `setFillStyle` is gone from Graphics)

```js
// Static lattice: the built-in Grid shape (a Shape, so setFillStyle/setStrokeStyle are its setters).
const grid = this.add.grid(0, 0, cols * TILE_W, rows * TILE_H, TILE_W, TILE_H, 0x000000, 0);
grid.setStrokeStyle(1, 0x2a2f45, 0.6);
grid.setAltFillStyle(0x1b2030, 0.35);                 // checkerboard for readability (positional args)
grid.setDepth(-30);

// Dynamic highlight layer: cleared and repainted on selection change, not per frame.
const highlight = this.add.graphics().setDepth(-20).setAlpha(0.45);
export function paint(cells, color) {
  highlight.clear();
  highlight.fillStyle(color, 1);                          // NOT setFillStyle — removed in Phaser 4
  for (const { cx, cy } of cells) highlight.fillRect(cx * TILE_W, cy * TILE_H, TILE_W, TILE_H);
}
```

### 3. Pointer → cell: read the world position, do the math

```js
const cam = this.cameras.main;
const cellFrom = (pointer) => {
  pointer.updateWorldPoint(cam);                         // refresh world coords for THIS camera
  const { cx, cy } = worldToCell(pointer.worldX, pointer.worldY);
  return inBounds(cx, cy, cols, rows) ? { cx, cy } : null;
};

this.input.on('pointermove', (p) => this.events.emit('cell-hover', cellFrom(p)));
this.input.on('pointerdown', (p) => {
  const cell = cellFrom(p);
  if (cell) this.events.emit('cell-tap', cell);
});
// Mouse-less boards: keep a cursor cell in the rules core and emit the SAME events from d-pad input.
```

Prefer this over making every tile interactive. If you do need a hit-tested board object (drag and drop,
a drop zone), make **one** `Zone` covering the board — `this.add.zone(boardW / 2, boardH / 2, boardW,
boardH)`, since a Zone is centred on its position — and give it `new Phaser.Geom.Rectangle(0, 0, boardW,
boardH)` plus `Phaser.Geom.Rectangle.Contains`; the string hit-area form `setInteractive(rect, 'rect')`
is not supported in Phaser 4.

`pointer.worldX/worldY` are refreshed when input is processed against a camera, so call
`updateWorldPoint(cam)` (or use `cam.getWorldPoint(pointer.x, pointer.y, out)`) before deriving a
cell — otherwise the first hover after a zoom is off.

### 4. Layers, depth, and drawing order

```js
const layers = {
  ground:    this.add.layer().setDepth(-30),
  highlight: this.add.layer().setDepth(-20),
  units:     this.add.layer().setDepth(0),
  effects:   this.add.layer().setDepth(10),
};
const hudLayer = this.add.layer().setDepth(100);          // stays fixed while the board pans
layers.ground.add(grid); layers.units.add(unitSprite);

// Square boards: row order is fine. Isometric boards need painter's order:
units.forEach(u => u.setDepth(u.x + u.y));               // greater = drawn later = nearer camera
```

Depth-sort the display list with `this.children.queueDepthSort()` when depth changes outside `create`;
a `Container` sorts its children in container-local depth space, so `add.layer()` is the reliable
stacking tool for board pieces.

### 5. Board camera: pan, zoom, clamp

```js
const boardW = cols * TILE_W, boardH = rows * TILE_H;
const cam = this.cameras.main.setBounds(0, 0, boardW, boardH);
cam.setZoom(1.5);                                        // min zoom 0.001
cam.centerOn(boardW / 2, boardH / 2);
// Drag-pan: divide the screen delta by zoom, then clamp against the same rect passed to setBounds.
// There are no `cam.minX`/`cam.maxX` properties, and the visible span changes with zoom:
const panBy = (dx, dy) => {
  const viewW = cam.width / cam.zoom, viewH = cam.height / cam.zoom;
  cam.setScroll(Phaser.Math.Clamp(cam.scrollX + dx / cam.zoom, 0, Math.max(0, boardW - viewW)),
                Phaser.Math.Clamp(cam.scrollY + dy / cam.zoom, 0, Math.max(0, boardH - viewH)));
};

const hud = this.cameras.add(0, 0, this.scale.width, this.scale.height);  // unzoomed UI camera
// Every camera renders the display list, so filter by layer: `ignore()` takes Game Objects, arrays or
// Groups — never another Camera.
hud.ignore([layers.ground, layers.highlight, layers.units, layers.effects]);
this.cameras.main.ignore(hudLayer);
```

Cull before drawing: `cam.worldView` is a `Rectangle` in world space — skip sprites whose
`Phaser.Geom.Rectangle.Contains(cam.worldView, sprite.x, sprite.y)` is false.

### 6. Walk a unit along a cell path

```js
// tweens.chain runs the steps in order; the rules core already committed the move, so this
// presentation must not be interrupted by input.
const steps = path.map(({ cx, cy }) => ({
  targets: sprite, x: cx * TILE_W + TILE_W / 2, y: cy * TILE_H + TILE_H / 2,
  duration: 90, ease: 'Sine.InOut',
}));
this.tweens.chain({ targets: sprite, tweens: steps,
  onComplete: () => this.events.emit('unit-arrival', unit.id) });  // unlock input here, not on a timer
```

### 7. Authored art: use a Tiled tilemap instead of hand-drawing

```js
this.load.tilemapTiledJSON('mission-1', 'maps/mission-1.json');      // in preload()
const map = this.make.tilemap({ key: 'mission-1' });                 // in create()
const tiles = map.addTilesetImage('ground', 'ground-atlas');         // -> Tileset (or null)
const layer = map.createLayer('ground', tiles, 0, 0);
const cell = map.worldToTileXY(pointer.worldX, pointer.worldY, true); // -> { x, y } or null
map.getTileAt(cx, cy, false, layer);                                 // rule data can live in tile NaN
```

`worldToTileXY`/`tileToWorldXY` (plural — there is no `tileToWorld`) handle orthogonal *and* isometric
orientations, so if your art comes from Tiled, let the tilemap do the projection and keep your rule grid
in sync with it.

## Pitfalls

- **`g.fillRect` works but nothing is coloured / `setFillStyle is not a function`** → Phaser 4 dropped
  `setFillStyle`/`setLineStyle` from `Graphics`; use `fillStyle(color, alpha)` / `lineStyle(width,
  color, alpha)`. `Shape` (including `add.grid`) keeps `setFillStyle`/`setStrokeStyle`.
- **`Phaser.GameObjects.ISO is undefined`, `add.cube` missing** → the v3
  isometric game objects and the Camera3D `useDepth`/`sortChildrenByY` helpers are not in Phaser 4.
  Project cells yourself (`references/grid-projection-and-picking.md`), or use `IsoBox`/`IsoTriangle`,
  or a Tiled isometric tilemap.
- **`GridShape`, `GridFollower`, `GridSizer` are undefined** → those are v3-era/FGUI names. Phaser 4
  has the `grid` shape (`this.add.grid(...)`); UI-layout grid followers are a third-party plugin.
- **Hover is one cell off after zooming or panning** → you divided the *screen* position by the tile
  size, or used a stale `worldX`. Convert with `pointer.updateWorldPoint(cam)` / `cam.getWorldPoint`
  first, and floor the result.
- **The board lags while hovering** → one interactive GameObject per cell, or repainting highlights
  inside `update()`. Use one board `Zone` and repaint only on selection/state change.
- **`setInteractive(...)` silently does nothing** → the object has zero size, or its hit-area rectangle
  does not cover the object's local box (`add.zone(x, y, w, h)` is centred on its position). Verify
  that `gameObject.input` exists after the call.
- **One big `add.grid` renders nothing** → a `Grid` has no fill colour and no stroke by default, so
  it is technically drawing and you cannot see it: pass `fillColor`/`fillAlpha` or call
  `setStrokeStyle`. If the lattice is off by one pixel at the far edge, use `setStrokeOutside(true)`
  (and `setCellPadding` to separate the cells).
- **Units disappear behind the HUD or each other** → depth on a `Container` is container-local; put the
  board pieces in `this.add.layer()` containers, and set per-unit depth for isometric overlap.
- **`this.tweens.timeline(...)` / `this.time.timeline(...)` are not functions** → a timeline is a game
  object: `this.add.timeline(events)` — and it **starts paused**, so call `.play()`. `this.time` is the
  Clock (`addEvent`/`delayedCall`). The counter is `this.tweens.addCounter(...)`. Tween completion is
  `onComplete`, not a `callback` key.
- **Two `new Phaser.Game` canvases after a hot reload** → destroy the previous instance on unmount;
  see `phaser-core` before debugging the board.
- **`tileToWorld` returns undefined** → the method is `tileToWorldXY` / `tileToWorldX` / `tileToWorldY`.
- **A GPU tilemap layer renders nothing** → `TilemapGPULayer` is WebGL-only, orthogonal-only, and needs
  `generateLayerDataTexture()`; fall back to the regular `TilemapLayer` for isometric content.

## References

- For isometric and hex cell projection/inverse math, picking accuracy at diamond edges, culling, and
  matrix helpers, read `references/grid-projection-and-picking.md`.

## Related skills

- `phaser-core` — game config, Scene lifecycle, loader, scene transitions, camera basics.
- `phaser-arcade-physics` — real-time bodies/colliders; a turn-based board does not need it.
- `turn-based-strategy` — the genre rules that consume this skill's cell sets.
- `game-ui-ux` — HUD/menu layout, scaling, focus navigation for the board UI.
