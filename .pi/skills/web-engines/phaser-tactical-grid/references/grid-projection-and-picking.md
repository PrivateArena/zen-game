# Grid projection, picking, and cell utilities

Depth for `phaser-tactical-grid`. Everything here is pure math plus the small Phaser surface the
SKILL.md lists; the engine never has to know your cell shape.

## 1. Square (flat orthogonal) cells

```js
// ORIGIN_X / ORIGIN_Y = board's world top-left (the same constants as SKILL.md's geometry module);
// TILE_W/TILE_H may differ (wide tiles are still orthogonal)
cellToWorld: (cx, cy) => ({ x: ORIGIN_X + cx * TILE_W,       // top-left of the tile rect
                            y: ORIGIN_Y + cy * TILE_H })
centerOf:    (cx, cy) => ({ x: ORIGIN_X + (cx + 0.5) * TILE_W,
                            y: ORIGIN_Y + (cy + 0.5) * TILE_H })
worldToCell: (wx, wy) => ({ cx: Math.floor((wx - ORIGIN_X) / TILE_W),
                            cy: Math.floor((wy - ORIGIN_Y) / TILE_H) })
```

The `Math.floor` inverse is exact for rectangles — including negative coordinates — so a square board
needs no picking fallback.

## 2. Isometric (diamond) cells

Same lattice, sheared. `HW = TILE_W / 2`, `HH = TILE_H / 2` (a 2:1 tile is 64×32 → HW 32, HH 16).

```js
// Convention: (px, py) is the diamond's TOP vertex; the tile's centre is (px, py + HH),
// its left/right vertices are (px -+ HW, py + HH), and the bottom vertex is (px, py + 2*HH).
cellToWorld: (cx, cy) => ({ x: ORIGIN_X + (cx - cy) * HW,
                            y: ORIGIN_Y + (cx + cy) * HH })
centerOf:    (cx, cy) => ({ x: ORIGIN_X + (cx - cy) * HW,
                            y: ORIGIN_Y + (cx + cy) * HH + HH })

function worldToCell(wx, wy) {
  const a = (wx - ORIGIN_X) / HW;
  const b = (wy - ORIGIN_Y) / HH;
  return { cx: Math.floor((a + b) / 2), cy: Math.floor((b - a) / 2) };
}
```

That inverse is **exact**, not an approximation — no half-tile fudge needed. Substituting
`u = (a + b) / 2`, `v = (b - a) / 2` turns the shear into a plain axis-aligned grid, and the diamond
maps to the unit square `[cx, cx+1) × [cy, cy+1)` in `(u, v)` space: the top vertex is `(0, 0)`, the
right vertex `(1, 1)`, the bottom `(0, 2)`, the left `(-1, 1)` in `(a, b)`. So `Math.floor` lands in the
right cell, including for negative coordinates. Do **not** add a `+HW/2`/`+HH/2` offset "to centre the
sample" — that shifts every pick by a quarter tile, which is exactly the bug people blame `floor` for.

What actually breaks iso picking:

- **Convention mismatch.** If your art is anchored by its centre (or Tiled anchors by the bounding-box
  top-left), the offsets differ per axis. Fix the constant in `cellToWorld`/`centerOf`, keep one
  inverse, and assert the round-trip: `worldToCell(centerOf(cx, cy)) === {cx, cy}` for every cell.
- **Non-integer `HW`/`HH`** (e.g. a 50×25 tile at a zoomed scale) plus `Math.round` somewhere else.
  Keep the projection in float space; only cell indices are integers.
- **Sample point taken in screen space.** See §4 step 1.

- Keep the projection in **one** module and let renderers, hit tests, and pathfinding all call it. The
  classic iso bug is two files disagreeing about whether the anchor is the top vertex or the centre.
- Draw order: `depth = cx + cy` (ties broken by `cy`), or `depth = sprite.y` for tall props whose base
  must sit lower. Re-sort with `this.children.queueDepthSort()` when units move.
- Tiled-authored isometric maps: `map.orientation` is `ISOMETRIC`, `map.tileWidth/tileHeight` give the
  diamond size, and `layer.getIsoTileAtWorldXY()` / `layer.getTileCorners()` do exactly this work for
  you — prefer them over hand-rolled math when a tilemap already exists.

## 3. Hex and staggered boards

Do not improvise the geometry: derive it from the map's own metadata (`orientation`, `tileWidth`,
`tileHeight`, `hexSideLength`, `staggerIndex` on a Tiled map) and use the axial/cube coordinate
conversions for neighbours and distance. Hexagonal and staggered-isometric orientations exist in
`Phaser.Tilemaps` — read the tilemap docs for the installed version rather than copying a v3 tutorial,
and validate the projection with the round-trip assertion from §4 before writing any gameplay on top
of it.

## 4. Picking checklist (any cell shape)

1. Take the pointer position **in world space**: `pointer.updateWorldPoint(cam)` then
   `pointer.worldX/worldY` (or `cam.getWorldPoint(pointer.x, pointer.y, out)`).
2. Invert the projection to a candidate cell.
3. Reject `!inBounds(cx, cy, cols, rows)` — division happily returns cell `-1`.
4. For any non-square projection, assert the round-trip `worldToCell(centerOf(cx, cy))` over every
   cell instead of adding per-case fudge factors.
5. Emit the *cell*, never the pixel, to the rules core.

Regression test that catches 90 % of projection bugs: for every cell, project its centre, invert it,
and assert you get the same cell back. Run it at four zoom levels and at the scroll extremes — with
one `it()` per board size, no renderer needed.

## 5. Culling and dirty rectangles

```js
const view = cam.worldView;                       // Rectangle in world space, updated per frame
// Square board: convert the view rect's corners to cells and iterate only that window.
const min = worldToCell(view.x, view.y);
const max = worldToCell(view.right, view.bottom);
for (let cy = Math.max(0, min.cy); cy <= Math.min(rows - 1, max.cy); cy++) {
  for (let cx = Math.max(0, min.cx); cx <= Math.min(cols - 1, max.cx); cx++) paintIfVisible(cx, cy);
}
```

For a static ground picture, bake it once — `graphics.generateTexture('board', w, h)` then one
`this.add.image(...)` — and keep only the *highlight* layer dynamic. Repainting 900 `fillRect`s per
hover is the difference between 60 and 20 fps on a low-end laptop.

## 6. Phaser utilities worth knowing

| Need | Call |
| --- | --- |
| distance in cells, square board | `Phaser.Math.Distance.Between` on cells, or Chebyshev/`Snake` for 8-dir and AoE shapes |
| snap a dragged sprite to a cell centre | `Phaser.Math.Snap.To(value, step)` / `Snap.Floor` |
| clamp a camera or cell index | `Phaser.Math.Clamp(v, min, max)` |
| lay out an inventory/item grid in the UI | `Phaser.Actions.GridAlign(items, { width, height, cellWidth, cellHeight, position, x, y })` (item counts, not pixels) |
| flip/rotate a text map, or derive facing | `Phaser.Utils.Array.Matrix.RotateLeft/RotateRight/TransposeMatrix/ReverseColumns` |
| print a debug map in the console | `Phaser.Utils.Array.Matrix.MatrixToString(matrix)`, or a `.map(row => row.join('·')).join('\n')` line |
| rect containment for `setInteractive` | `Phaser.Geom.Rectangle` + `Phaser.Geom.Rectangle.Contains` |
| board-space → screen-space for floating labels | `cam.matrixCombined.transformPoint(wx, wy, out)` — the forward of `getWorldPoint` |

Removed or never-present in Phaser 4 — do not reach for these: `Phaser.GameObjects.ISO`,
`add.cube`/`IsoscelesTriangle`/`IsometricBlock`, `GridShape`/`GridFollower`/`GridSizer`,
`Container.useDepth`/`sortChildrenByY`, `Camera.setRenderToTexture`, `Matrix.Crop`,
`Phaser.Grid.AlignToGrid`.

## 7. The same board on the other web stacks

Keep the geometry module engine-free and only the *projection* stays portable:

- **PixiJS v8** (`pixijs-rendering`): parent the board to one `Container`; get the cell by converting
  the pointer's global position into that container's local space (`container.toLocal(...)`) and then
  applying `worldToCell`. Redraw highlights with a single `Graphics` pass.
- **three.js** (`threejs-scene-setup`): with an orthographic top-down or 3/4 camera, cast a
  `Raycaster` from the normalized pointer and intersect an infinite ground `Plane`; convert the hit
  point with the same `worldToCell`. For a 3D tactics board, the height axis is now real — keep cell
  coordinates integral in the rules core and derive elevation from the tile data.
