# Grid combat rules — phases, ranges, cover, odds, determinism

Depth for `turn-based-strategy`. Engine-neutral pseudocode; bind the drawing/picking calls to the
detected engine skill (`phaser-tactical-grid` on web, `godot-tilemap`, `unity-tilemap-2d`).

## 1. Unit-turn state machine

Each unit inside its faction's phase is a small state machine. The board accepts no input while a
state other than `Idle` is active, which is what makes animation-safe commit points explicit.

```text
Idle (AP > 0)
  ├─ select unit        → Moving     (movement range + path preview shown)
  ├─ select target      → Targeting  (forecast shown)
  ├─ use item / skill   → Targeting  (range from item/skill definition)
  └─ end turn           → Spent

Moving   ├─ confirm tile → Moved     (state committed, move animation queued)
         └─ cancel       → Idle      (no state change — cancellation must be free)
Moved    → animation done → Idle (AP -= move cost) | Spent
Targeting├─ confirm      → Resolving → animation/reaction queue drains → Idle | Spent
         └─ cancel       → Idle
Spent (AP == 0 or player ended) → wait for next phase
```

Rules worth encoding as data, not `if`s:

- `action_points(unit)` — 1 for Fire Emblem tempo, 2 for XCOM-style "move + action"; status effects
  subtract, never multiply.
- `legal_actions(unit, state)` — enumerate, don't hardcode; the UI, the AI and the tests all read the
  same list. This is also what makes "is the player softlocked?" a one-line assertion.
- Interrupts (overwatch, counterattack, opportunity attack) are a **priority queue of pending
  triggers** consumed by the resolver, not extra UI states. A trigger can be invalidated by the time
  it fires (target died, moved out of range) — re-validate at fire time.

## 2. Ranges: three different sets, one cache

| Set | Computed as | Used for |
| --- | --- | --- |
| `reach` | Dijkstra over per-cell move cost, capped by `unit.move`, from the unit's cell | blue movement overlay |
| `attackable` | `reach` widened by each weapon's `[min,max]` range, minus blocked LOS | red attack overlay, target list |
| `threat` | union of every visible enemy's `reach + weapon range` | kill-zone overlay, AI safety score |

```python
def neighbors(cell, move_type):
    # 4-dir for orthogonal grids; 8-dir (Chebyshev) only if diagonals may cut corners.
    # Diagonal-corner rules change cover, LOS and "can I flank" — decide once, test once.
    ...

def reach(unit, board):                      # see SKILL.md pattern 2 for the loop
    # costs are terrain-dependent: plains 1, forest 2, mountain 3, river INF (or blocked by
    # movement type: mounted units cannot enter forest, fliers ignore cost entirely).
    ...
```

- Cache `reach` per `(unit_id, board_state_hash)`; the enemy phase re-uses the player's threat map
  for free if you cache it once per phase rather than per unit action.
- Fly/walk differences are a **movement profile** (`{terrain: cost}` map), not a flag.
- Re-check reachability whenever a cell changes state destructively (bridge destroyed, tile floods).

## 3. Terrain, cover, height, facing

Pick one model and keep it consistent, because it drives LOS, AI scoring, and the forecast:

```text
Terrain(cell) = { move_cost_by_profile, defense_bonus, cover_profile, blocks_los, hazard }
Cover:  NONE 0 | HALF (side/back only) | FULL (any side) | none-while-flanked
Facing: 4 or 8 directions from (attacker_cell - target_cell); flanking = no friendly-adjacent
        cell on the opposite edge of the target (XCOM rule) → cover is ignored.
Height: a flat to-hit delta per level difference, applied to the attacker above.
```

- Store cover as *data on the cell* (`half`, `full`), not as a sprite property; the renderer derives
  its art from it, so the rule and the picture cannot disagree.
- Cover should apply to the *target*, and only to the side the attack comes from. That single rule is
  what makes positioning interesting; drop it and the AI's "hide behind the wall" logic breaks too.

## 4. Odds, damage, and the fairness policy

A working Fire-Emblem-flavoured core (tune the constants, keep the shape):

```python
hit  = attacker.skill * weapon.accuracy + bonus(attacker) - target.evade - cover - height - status
crit = attacker.crit + weapon.crit + target.luck * 0 - status
dmg  = attacker.str + weapon.might - defender_defense(target, weapon.damage_type)
dmg  = max(1, dmg)              # a "1 chip" floor keeps every unit relevant; remove it to make
                                # armor-vs-weapon matchups absolute counters instead
result = dmg * (3 if crit else 1) * weapon.might_multiplier   # weapon triangle / effectiveness ×1.5
```

RNG policy — choose one, document it in the code comment next to the roll, and never mix:

| Policy | Behaviour | Cost |
| --- | --- | --- |
| Independent, honest | `rng.percent() < hit`, one stream per battle | 95 % can miss twice; that is mathematically correct and emotionally wrong |
| Flat PRD (Civ-style) | accumulate a "pity" bonus until the hit lands, then reset | needs the pity counters saved with the snapshot |
| Ceiling compression | display `min(hit, 85)` and roll that | the display is now the promise; must be true |
| Deterministic outcome table | outcome decided at battle start by seed | feels scripted; good for replays/dailies |

Rules that keep trust:

- Roll **after** showing, never before; the shown number is a contract.
- Keep one seeded stream per battle, consumed in a fixed order (unit order, then action order). Store
  the stream index in every snapshot so undo/rollback reproduces the same hits.
- Expose the seed: it buys free automated testing, daily challenges, and post-mortems players accept.

## 5. Determinism and the snapshot/replay contract

```text
Rule core:  (state, intent) -> [events]        # pure, no engine types, no time, no random besides rng
Resolver:   state' = fold(state, events)        # reactions/overwatch appended, in priority order
View:       renders state' and *plays* the event list (tweens/animations consume events, never mutate)
```

- The whole battle is then a `seed + initial_state + [intents]` — a replay, a save, a regression test
  and an AI-observation surface are the same artefact.
- Snapshot at: mission start, end of each phase, end of each unit turn. The tactics-specific fields
  are the ones people forget: board + occupancy, per-unit AP/status, the RNG seed **and stream index**,
  pending reaction triggers, the objective/turn counters. (`save-systems` owns slots, versioning and
  atomic writes; battle and campaign are separate documents with separate `version` fields.)
- Never serialize the renderer (sprites, tweens, scene objects). Rebuild presentation from state on
  load; if a field only exists for animation, keep it out of the document.
- Test the core headlessly, with no engine import: `apply(seed, scripted_intents)` must reproduce the
  recorded outcome. Any nondeterminism (iteration order over a set, float accumulation, wall-clock
  reads) shows up as a flaky test here, which is where you want to find it.
