---
name: turn-based-strategy
description: >
  Build a grid-based turn-based tactics game (SRPG): a squad of persistent units, per-faction phases
  with an action-point economy, movement and attack range highlighting, terrain and cover, a combat
  forecast with hit and damage odds, enemy-phase AI, mission objectives with a turn limit, and a
  campaign layer between battles. Use for games like Fire Emblem, XCOM, Advance Wars or Tactics Ogre,
  or when the request mentions SRPG, grid tactics, player/enemy phase, action points, kill zone,
  threat range, overwatch, combat forecast, squad permadeath, or a tactics mission map. For menu
  combat without a board use rpg; for a single-hero procedural dungeon crawl use roguelike; for card
  turn structure use card-game.
---

# Turn-Based Strategy (Grid Tactics / SRPG)

A playbook for the tactical genre: a discrete, fully-deterministic rule core driving a cell board in
phases, wrapped in a campaign layer that persists the roster between battles. This is a
**compositional** skill — it owns the *structure* (phase schedule, action economy, range math,
forecast, mission objectives, campaign state) and hands pathfinding, saving, UI layout and AI
algorithms to the discipline skills that teach them.

## When to use

- Use when the player commands **several units on a board**, takes turns with an enemy faction, and
  position, facing, terrain and action economy decide the fight.
- Use when battles are discrete **missions** inside a larger campaign with a roster, economy, and
  progression between them (Fire Emblem, XCOM, Advance Wars, Hero Siege).
- Use when the request mentions phases, action points, movement/attack range, overwatch/reaction
  fire, cover, threat ranges, a combat forecast, or losing a named unit permanently.

**When _not_ to use:** one hero, menu-based combat, levels and quests → `rpg`. Single avatar,
procedurally-generated permadeath dungeon with an energy-style initiative queue → `roguelike`.
Deck/hand turn phases → `card-game`. Real-time units on a board → `tower-defense` (or the engine
movement skill). Grid *drawing* and pointer picking are the engine's job — see Composition.

## The two-layer rule (design anchor)

A tactics game is **two games**: a *battle* (tactical puzzle under a turn limit) and a *campaign*
(resource management over a roster you cannot fully replace). Every system decision splits along
that line — HP/position/status are battle state; XP, class, injuries, currency and research are
campaign state. Persist them separately; never let battle state leak into the save that carries
progression.

## Core loop

**Read the mission (objective, intel, turn limit) → deploy the squad → Player phase: for each unit
move, then act (attack/skill/item/wait), spend action points → resolve combat → Enemy phase: AI acts
→ repeat while the objective is unmet → mission result → campaign screen: level up, heal, re-equip,
buy, choose the next mission.** The tension is an economy of *information and action*: which units
do what, in which order, before the enemy votes on your plan.

## Core workflow

1. **Inspect before you design.** Read the existing geometry module, the rules core (if any), the
   engine skill's grid surface, and the current unit/turn data model. Almost every tactics bug is two
   modules disagreeing about a cell, a movement cost, or who owns AP.
2. **Fix the two-layer split.** Decide which fields are battle state (HP, cell, AP, status) and which
   are campaign state (XP, level, injuries, gear, currency), before the first feature lands.
3. **Build the rules core headless.** Terrain costs → `reach` → `attack_from` → legal actions →
   forecast → phase scheduler, with no renderer and no `dt`; assert each on hand-authored 8×8 boards.
4. **Commit state, then animate.** One path only: intent → `resolve` → events → state' → presentation,
   with input locked while the event queue drains.
5. **Enemy phase, then HUD, then campaign.** The AI consumes the same reach/threat tables the player
   overlay draws; the HUD consumes the forecast the core already produces.
6. **Verify by playing one mission end to end** — win, lose, and quit-and-reload mid-battle — and
   confirm a recorded mission replays to the same result hash.

## Must-have systems

1. **Board + terrain model** — cells with movement cost, passability, height, cover, hazards, and
   optional line-of-sight blocking. Data, not tiles: the renderer is replaceable.
2. **Phase scheduler + action economy** — whose turn it is, how many action points (AP) each unit
   gets, what is still legal for it (refs).
3. **Unit model** — stats, HP, movement type, weapon/skills/item, faction, status effects, AI flag,
   and a campaign identity (name, class, level, XP, injuries) that outlives the battle.
4. **Reachability + range display** — movement range is a *cost-limited flood fill*, attack range is
   that set widened by weapon range; both are drawn and cached per unit (refs). A\* alone is not
   enough — `game-ai` for the path itself.
5. **Combat forecast + resolution** — hit chance, crit, damage and counter ranges, displayed *before*
   the commit, resolved by a seeded RNG stream (refs).
6. **Reaction/interrupt layer** — overwatch, counterattacks, opportunity attacks: rules that fire
   inside someone else's phase, so resolution must be re-entrant, not linear (refs).
7. **Enemy-phase AI** — score candidate (tile, action) pairs by expected damage, kills, objective
   pressure and self-preservation; never exhaustive over the whole board (refs, `game-ai`).
8. **Mission rules** — win/loss beyond "kill everything": turn limit, defend/escort/escape,
   reinforcement waves, rout threshold (refs).
9. **Tactics HUD** — unit panel, ranges toggle, forecast panel, end-turn control, phase banner,
   readable threat overlay; `game-ui-ux` for the layout.
10. **Campaign layer** — roster, wounded/heal queue, currency, research/base, deployment limits,
    map/chapter progression (refs).
11. **Determinism + persistence** — snapshot/restore the whole battle, per-phase autosave, replay
    log; `save-systems` for the mechanics, refs for what belongs in each layer.

## Design knobs

| Knob | Effect | Notes |
| --- | --- | --- |
| Displayed vs. real hit chance | perceived fairness | Honesty beats smoothing; see refs. |
| Action points per unit | tempo | 1 (FE) = chess-like; 2 (XCOM 2) = mobility matters. |
| Move range vs. map size | engagement distance | Map ≈ 3x move range for a two-turn fight. |
| Time-to-kill | lethality/stakes | Tactics wants 1–3 hits; more = attrition slog. |
| Threat range shown | planability | Hidden threat punishes the player for guessing. |
| Reinforcements | urgency, turn pressure | Timed waves beat a hard turn cap alone. |
| Unit replacement cost | permadeath weight | Irreplaceable units = real loss, needs assist/repair. |
| Cover/terrain values | positional play | Should beat raw stats in early missions. |
| XP curve + deployment cap | roster breadth | Forces benching = emotional stakes. |
| Fog / detection | scouting value | Adds a search phase; expensive to build, big payoff. |

## Patterns

### 1. Phase scheduler with per-unit action points

```python
```python
# Pseudocode. Phases are data-driven; the scheduler owns no game rules. The UI layer calls commit()
# when the player confirms an intent - the scheduler itself never blocks on input.
def begin_player_phase(state):
    for unit in state.units(faction="player", alive=True):
        unit.ap = action_points(unit)            # 1 (FE) or 2 (XCOM 2), modified by status effects

def commit(state, unit, intent):                 # called by the UI on confirm
    if not is_legal(unit, intent, state): raise IllegalIntent(unit, intent)
    events = resolve(unit, intent, state)        # PURE: (state, intent) -> [events]; no I/O, no await
    state.apply(events)                          # state' is now authoritative
    unit.ap -= cost_of(intent)                   # spent exactly once, here and nowhere else
    if state.objective_decided(): end_battle(state)
    return events                                # presentation replays `events`, never the reverse

def end_unit_turn(state, unit):                  # player ended the unit, or AP reached 0
    unit.ap = 0
    checkpoint(state, boundary="end-of-unit-turn")     # cheap: a few KB of numbers
```

### 2. Reachability (not pathfinding) and the range overlays

```python
# Cost-limited Dijkstra over terrain costs. A* (game-ai) answers "how do I reach THAT cell";
# this answers "which cells can I act from at all" - you need the set first, then the path.
def reach(unit, board):
    cost = {unit.cell: 0}
    frontier = PriorityQueue([(unit.cell, 0)])
    while frontier:
        cell, c = frontier.pop_min()
        for nxt in board.neighbors(cell, unit.move_profile):      # walls/height filtered
            nc = c + board.move_cost(nxt, unit.move_profile)       # swamp 2, ridge 3, cliff INF
            if nc > unit.move or board.blocks(nxt, unit): continue  # budget + hard blockers
            if nc < cost.get(nxt, INF):
                cost[nxt] = nc; frontier.push((nxt, nc))
    return cost                                    # cell -> cost; keys() = the blue overlay

def attack_from(cell, unit, board, weapon):
    return {t for t in board.cells
            if weapon.min_range <= board.distance(cell, t) <= weapon.max_range
            and board.line_of_sight(cell, t, unit)}      # LOS-filtered, or ranges lie behind walls

# blue = reach(unit).keys();  red = union of attack_from(c, ...) over that set
# cache per (unit, board_version); the enemy phase and the threat map reuse the same tables.
# Occupancy rule that keeps boards playable: allies are pass-through, enemies and obstacles block,
# and no unit may END its move on an occupied cell.
```

### 3. Forecast before the commit, seeded RNG inside it

```python
# Pseudocode. Deterministic per battle: one seeded stream, consumed in a fixed order.
def forecast(attacker, target, state):
    hit  = clamp(attacker.skill * weapon.acc + hit_mods(attacker, target, state) - target.evasion
                 - cover_bonus(target, state) - height_bonus(attacker, target, state), 5, 95)
    dmg  = [max(1, attack - defense(v)) for v in target.variants]   # per-defense/per-armor case
    crit = crit_chance(attacker, target, state)
    return Forecast(hit=hit, damage=dmg, crit=crit, counter=forecast_of(target, attacker))

def resolve(intent, state):
    events = [Move(intent.unit, intent.dest)]
    f = forecast(intent.unit, intent.target, state)
    events.append(Hit() if state.rng.percent() < f.hit else Miss())   # roll AFTER display
    state.queue_triggers(reactions_that_would_fire(state, intent))   # counters, overwatch
    while state.pending_triggers():                        # may enqueue more: resolve to fixpoint
        events += state.fire_next_trigger()                # fixed priority order = deterministic
    return events
```

## Pitfalls / failure modes

- **"95 % hit, missed twice" outrage** → independent rolls on high displayed odds still fail. Either
  lower the ceiling and mean-shift the odds honestly, or use a seeded/pseudo-random distribution —
  but *never* silently change the number you displayed. Policy and mitigation math in refs.
- **Using A\* to compute the movement range** → pathfinding answers "how do I get to *that* cell";
  you need "which cells can I reach at all". Run a cost-limited Dijkstra/flood fill; cache it per
  (unit, board state hash) and reuse for the enemy phase.
- **Own units wall you in / units become stuck** → treat allies as pass-through and only forbid
  *ending* on an occupied cell; if a cell becomes occupied mid-move, re-seat the unit rather than
  erroring. Verify with a "can every unit still act?" assertion after every event.
- **Input accepted during the attack animation** → double moves and desynced state. Commit state at
  intent time, then play the animation, and lock the board until the queued events finish (`puzzle`
  documents the same rule for cascades).
- **Enemy phase freezes the frame** → scoring every (tile, action) pair for every unit is a lot of
  path calls. Restrict candidates to cells inside the unit's reach that are in line-of-fire of a
  target, budget the search per frame, and cache reachability; measure before optimizing.
- **Undo that re-rolls the dice** → a rollback save must restore the RNG position with the state,
  or "undo" becomes a re-roll. Keep the battle seed + stream index in the snapshot (`save-systems`).
- **No threat/kill-zone display** → the player plans blind and blames the game. Show enemy reach and
  attack ranges as an optional overlay; it is the single cheapest difficulty-legibility win.
- **Objectives that always mean "kill all"** → one solution fits all. Add defend/escort/escape/
  survive-N/steal-item variants and let loss conditions differ from win conditions (refs).
- **Permadeath without replenishment** → the roster shrinks below the deployment cap and the campaign
  becomes unplayable. Provide a recruit/repair/reserve pipeline in the campaign layer, and make the
  loss *recoverable but costly*.
- **Battle state saved into the campaign file (or vice versa)** → corrupted progression on load.
  Two documents with their own `version` fields, written at phase and mission boundaries.
- **Balancing on stats alone** → the map is the balance. Test each mission for "can the player end
  turn in cover with a guaranteed kill?" — if the answer is trivially yes, change the terrain, not
  the numbers.

## Composition (build it from these skills)

- **Board & cells:** `phaser-tactical-grid` (web: cell math, grid drawing, pointer→cell, board
  camera, depth-sorted units), `godot-tilemap` / `unity-tilemap-2d` elsewhere. Pixi/three:
  `pixijs-rendering` / `threejs-scene-setup` and the picking rules in `phaser-tactical-grid`'s
  projection reference.
- **Pathfinding & enemy AI:** `game-ai` (A\*, grid adapter, heuristics, FSM/BT) +
  `ai-behavior-trees-utility-ai` if the enemy phase wants a scored/utility evaluator.
- **Stats & progression:** `rpg` for derived stats, XP curves, buffs and inventory; do not re-derive
  them here.
- **Maps:** `level-design` for encounter/pacing and the critical path; `procedural-gen` for generated
  battlemaps (seeded, connectivity-verified — cover density is a balance input).
- **UI/UX:** `game-ui-ux` for panels, tooltips, focus navigation and scaling; the *content* of those
  panels is the forecast, range and objective data above.
- **Input:** `input-systems` for the cursor/gamepad selection model (move cursor, confirm, cancel).
- **Feel:** `game-feel` for the attack cut-in/staging, camera punch and hit-stop; `audio-design` for
  hit/miss/death cues and the phase-change sting.
- **Persistence & determinism:** `save-systems` for slots, versioning, atomic writes; `save-systems`
  + the deterministic core make replays and automated tactics tests possible.
- **Campaign story:** `dialogue-systems` for between-mission talk segments.

## References

- For the phase/AP state machine, range and cover math, RNG/fairness policies, and the
  snapshot/replay contract, read `references/grid-combat-rules.md`.
- For enemy-phase action scoring, threat ranges, mission objective archetypes, fog, and the
  campaign/roster layer, read `references/ai-objectives-campaign.md`.
