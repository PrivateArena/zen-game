# AGENTS.md — Zen Game

Instructions for AI coding agents working in this repository. Read this before touching code.

## What this project is

A browser **turn-based tactics game (SRPG)** — a squad of persistent units on a cell grid, per-faction
phases, movement/attack ranges, a combat forecast, an enemy-phase AI, missions with objectives, and a
campaign layer between battles (the Fire Emblem / XCOM family).

Stack: **Phaser 4 + TypeScript + Vite** (`package.json` → `phaser ^4.1.0`; catalog baseline 4.2). One
engine, one renderer. Do not introduce a second engine, a DOM canvas library, or a "helper" renderer.

The skill library lives in `.pi/skills/` and the dispatcher in `.pi/router/SKILL.md`.

The source tree below is the **target** layout; most of it does not exist yet. Create a directory
when the first file that belongs in it lands — do not pre-create empty folders, and do not put
tactics code inside the legacy modules described at the end.

## Non-negotiable session start

1. **Detect, don't assume.** `package.json` dep `phaser` ⇒ the web engine set (`skills/web-engines/`).
   Never switch engines mid-project and never add an engine "just for the UI".
2. **Route before coding.** Open `.pi/router/SKILL.md` §1–§5, classify the task, then read only the
   selected `SKILL.md` bodies. Never bulk-load a category folder.
3. **Load the project baseline** for tactics work — these two are the project's core skills:
   - `skills/web-engines/phaser-tactical-grid/` — cells, grid/iso drawing, pointer→cell, highlights,
     board camera, depth order, path tweening. Its `references/grid-projection-and-picking.md` has the
     projection/inverse math and the picking checklist.
   - `skills/web-engines/phaser-text-and-hud/` — TextStyle, BitmapText, panels/NineSlice, buttons,
     tooltips, HUD camera. Phaser has **no widget toolkit**; build controls from the primitives there.
   - `skills/genres/turn-based-strategy/` — phase + action-point economy, reachability vs. pathfinding,
     cover/terrain, odds and RNG policy, enemy-phase AI, mission objectives, campaign layer. Its
     references cover combat rules and AI/objectives/campaign.
   - `skills/disciplines/game-content-data/` — `src/content/` schemas, stable ids + reference checks,
     effect registry, balance curves as parameters, content tests.
4. **Add only the discipline the task names** (see the hand-off table below) — one genre, one engine
   set, plus at most the 2–3 disciplines actually needed.
5. **Ground truth for Phaser names:** `node_modules/phaser/types/phaser.d.ts` and the official
   `node_modules/phaser/skills/<topic>/SKILL.md` shipped with the package. If a symbol is not in the
   `.d.ts`, it does not exist — do not write it. Phaser 4 **removed** `setFillStyle`/`setLineStyle` on
   `Graphics` (use `fillStyle`/`lineStyle`), `Phaser.GameObjects.ISO`, `add.cube`,
   `Container.useDepth`/`sortChildrenByY`, `Camera.setRenderToTexture`, `tweens.timeline`,
   `tweens.counter` (use `tweens.addCounter`); and `GridShape`/`GridFollower`/`GridSizer` were never
   Phaser at all — the v4 shape is `this.add.grid(...)`.

## Task → who owns it

| The task is… | Read | Do not |
| --- | --- | --- |
| cells, grid/iso drawing, tile hover, board camera, sprite stacking | `phaser-tactical-grid` | re-derive tile size at the call site |
| phases, AP, ranges, forecast, cover, enemy phase, missions, campaign | `turn-based-strategy` | re-teach pathfinding or saving inside game code |
| A\*, path cost, grid graph, enemy FSM/BT | `disciplines/game-ai` | hand-roll a second pathfinder |
| unit stats, XP/level curve, gear, status effects | `disciplines/rpg` (`genres/rpg`) | store derived stats as truth |
| item/unit/terrain/mission tables, ids, validation | `disciplines/game-content-data` | put behavior or display strings in the data |
| mission maps, generated battlemaps | `disciplines/level-design` + `disciplines/procedural-gen` | generate without a connectivity + cover-density check |
| HUD, panels, tooltips, menus, scaling, focus nav | `disciplines/game-ui-ux` (design) + `phaser-text-and-hud` (Phaser API) | mix two UI stacks for one panel |
| cursor/gamepad/d-pad selection, rebinds | `disciplines/input-systems` | mouse-only selection with no keyboard path |
| attack staging, hit-stop, screen shake, juice | `disciplines/game-feel` | animate gameplay state |
| battle/campaign saves, autosave, versioning | `disciplines/save-systems` | serialize GameObjects or tweens |
| sprites/tiles/portraits art direction | `disciplines/create-game-assets` | start art before the style bible |
| stutter, draw calls, allocation spikes | `disciplines/performance-optimization` | optimize before measuring |

## Architecture (fixed — don't relitigate per feature)

```text
src/rules/      pure TypeScript, ZERO Phaser/DOM imports: board, terrain, movement profiles,
                reachability, ranges, phase scheduler, action legality, forecast, damage, RNG,
                event log, snapshot/restore, geometry (cell<->world)
src/content/    typed data: units, classes, weapons, terrain table, status effects, missions,
                difficulty weights, economy numbers (no logic)
src/render/     Phaser view layer: layers, grid + highlight painting, unit sprites, effects
src/scenes/     Phaser scenes: boot, battle, campaign/board-map, results
src/ui/         HUD: unit panel, forecast panel, ranges toggle, end turn, phase banner, objective
src/platform/   persistence (battle + campaign documents), input config, audio, debug tooling
tests/rules/    headless rules tests, no browser, no Phaser import
```

The one rule that keeps a tactics game debuggable:

```
intent ──► rules.resolve(state, intent) ──► [events] ──► state'   (pure, synchronous, deterministic)
                                              │
                                              └────► render: play the event list, then unlock input
```

- Scene/UI code **never** mutates gameplay; it dispatches an `Intent` and renders the resulting events.
- `GameEvent` and `Intent` are discriminated unions in `src/rules/` — the replay log, the AI
  observation surface, the save file, and the test fixtures all read the same types.
- Input is locked while the event queue is draining. Commit state at intent time, animate after.
- One seeded RNG stream per battle; the snapshot stores `seed + streamIndex`, so undo/replay
  reproduce identical hits. Never roll before the forecast is displayed.
- Two save documents — `battle` (phase boundaries) and `campaign` (mission boundaries) — each with its
  own `version` field, written atomically (temp + rename).
- Board geometry (`TILE_W/H`, `cols/rows`, board origin, projection) exists once, in `src/rules/`.
  Everything else imports it.

## Definition of done (per change)

```bash
npm run lint          # 0 errors
npm run build         # `tsc -b && vite build` — 0 type errors, bundle still builds
npx vitest run        # rules tests, once they exist (add with: npm i -D vitest)
npm run dev           # and LOOK at it: hover the 4 board corners at min and max zoom, confirm the
                      # cell under the cursor is the highlighted cell, then end a full phase
```

Gate before claiming any feature works: `npm run lint && npm run build` (the build already typechecks
with `tsc -b`). A tactics
feature is not done until its rules behaviour is asserted in `tests/rules/` — grid range, forecast and
phase tests are the cheapest regressions you will ever get.

## Build order

| Milestone | Ships | Gate |
| --- | --- | --- |
| M0 | board renders, one unit, click-to-select, hover highlight | corner/zoom picking check passes |
| M1 | terrain costs, reachability, ranges, unit stats, phase cycle | headless tests green; no combat yet |
| M2 | forecast → commit → animate → apply; counters; death; end-turn | one scripted battle replays identically |
| M3 | enemy-phase AI with a per-frame budget; threat overlay | AI self-play 50 turns, no softlock |
| M4 | objectives beyond "kill all", turn limit, reinforcements, results screen | win and lose both reachable |
| M5 | roster, XP/level, injuries, deployment cap, campaign map, save/load | quit-and-reload mid-mission |
| M6 | juice, audio, keyboard/gamepad cursor, performance pass | measured, not guessed |

If the schedule slips, cut in this order: reaction/overwatch → fog of war → campaign depth → juice.
**Never** cut the deterministic rules core, the threat/range overlay, or the legibility of the HUD.

## Code style

- No `src/utils/`, `common/`, `helpers/`, `misc/` — directories are named for what they own.
- No hardcoded asset paths, URLs or tuning numbers in code: paths come from `src/platform/`,
  balance numbers from `src/content/`.
- `strict` TypeScript; no `any` in `src/rules/`. Prefer small pure functions over a class hierarchy.
- CSS: plain stylesheets with semantic class names; no inline styles or JS-driven style mutation.
- Keep Phaser imports out of `src/rules/` and gameplay rules out of `src/render/` — that boundary is
  the test surface; crossing it silently kills the ability to test the game at all.

## Legacy state and open decision

The repository still contains a pre-pivot auto-battler / tower-defense scaffold (`src/engine/`,
`src/game/`, `src/games/rome-*`, `GAME_API.md`, `GEMINI.md`, `src/types/game.ts`) that describes a
real-time ECS auto-battle, **not** this genre, and it does not typecheck (`npx tsc -b` currently reports
61 type errors, including two conflicting `TimelineEvent`/`GameStatus` type families). It is not a
foundation for a tactics game: there is no cell board, no phase scheduler, no forecast, no campaign.

Decision pending with the user: delete the legacy `src/` + stale instruction files and keep the
Vite/TS/eslint toolchain (recommended), or surgically salvage the React/Phaser mounting code. Until
that decision is made, do not extend legacy modules; new tactics work goes in the tree above.
