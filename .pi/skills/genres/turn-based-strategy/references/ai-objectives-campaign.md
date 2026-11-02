# Enemy phase, missions, and the campaign layer

Depth for `turn-based-strategy`. Pathfinding internals (A\*, heuristics, grid adapter) belong to
`game-ai`; this file covers what is specific to a tactics enemy phase and to the meta-game around
battles.

## 1. Enemy-phase AI: score (tile, action) pairs

Do not write "the AI attacks the nearest player unit". Enumerate the same legal-action list the player
UI enumerates, and score it. One unit's turn:

```python
def enemy_turn(unit, state, budget_ms=8):
    cost  = reach(unit, state.board)          # shared cache: cell -> cost (see grid-combat-rules)
    candidates = [(cell, action)
                  for cell in cost if not state.board.occupied(cell)
                  for action in legal_actions_after(unit, cell, state)]
    if not candidates: return Action.Wait()
    scored = [(score(unit, cell, action, state), cell, action) for cell, action in candidates]
    scored.sort(key=lambda s: -s[0])                           # ties broken by fixed cell order
    return pick_with_noise(scored, temperature=state.difficulty)   # higher difficulties: less noise
```

Scoring terms (weights are the actual difficulty dial — tune these, not unit stats):

```text
score = expected_damage            (forecast dmg, capped at target HP)
      + 40 * kills_a_player_unit   (permanent loss is the AI's best move; make it visible to the player)
      + 25 * objective_progress    (advancing toward the point it must reach/defend)
      + 10 * ends_in_cover         (HALF=6, FULL=14, none=0)
      - 20 * exposure_to_threat    (player attackable-from count after the move)
      +  6 * removes_a_hazard      (breaks a bridge, ignites oil, pushes into water)
      - 15 * wasted_action         (attack that will not kill and cannot wound)
```

Practical constraints:

- **Budget the search.** Cap candidates (nearest N targets, k-best cells per target), and spread a
  large enemy phase over frames with a per-frame time budget, showing the phase banner while it works.
- **Determinism beats cleverness.** Break ties by fixed cell index, seed the noise, and log the chosen
  score tuple — the only reliable way to debug "why did it walk into my squad".
- **Difficulty = information + noise + stats**, in that order of honour. Giving the AI perfect fog
  knowledge is a cheaper and less resentful lever than +30 % damage.
- Two archetypes cover most designs: *skirmisher* (maximise damage/cover, will disengage) and
  *objective-runner* (ignore the player, race the mission goal). Mix them; the mix is what makes the
  player's job ambiguous.
- For reaction/overwatch AI and utility scoring curves, hand off to `ai-behavior-trees-utility-ai`
  rather than growing this scorer forever.

## 2. Threat range (the overlay the player is owed)

```python
threat = {cell: 0 for cell in board}
for enemy in visible_enemies:                       # fog-of-war: only *known* enemies
    cost = reach(enemy, board)                      # cell -> movement cost
    cells = set(cost) | {t for c in cost for t in attack_from(c, enemy, board, enemy.weapon)}
    for cell in cells:                              # every cell this enemy can shoot into
        victim = nearest_player_there(cell, board)
        threat[cell] += 1 + (forecast(enemy, victim, board).expected_damage(enemy) / 10)
```

- Recompute on: unit death, new reinforcement, terrain change, and fog change. Cache per phase, keyed
  on the same `board_version` the range overlays use.
- The same map is the AI's `exposure_to_threat` term — compute it once, use it twice.
- Enemies the player has not detected must not contribute, or scouting stops mattering.

## 3. Mission objective archetypes

An objective is a *predicate over battle state* plus a loss predicate. Keep both as data so a
mission is a file, not a code path.

| Archetype | Win | Design pressure |
| --- | --- | --- |
| Eliminate | all enemies dead | straightforward combat test |
| Survive N turns | turn > N, key unit(s) alive | defense, positioning, healing economy |
| Escort / defend point | NPC/point alive for N turns | splits the squad, AI targets the escort |
| Escape | units reach exit cell(s) | traversing threat, sacrifice decisions |
| Rout | enemy morale < threshold | kill leaders, not everyone |
| Steal / destroy object | object state changed | timed, reinforcements pressure the return trip |
| Scouted run | visit all intel points | rewards mobility + fog mechanics |

Reinforcement waves are the standard anti-turtle tool: a wave at a fixed turn or on a player action
(e.g. first kill) resets the "wait safely in cover" strategy. Always telegraph them — a revealed
spawn tile, an alarm, a turn counter in the HUD — because hidden reinforcements read as cheating.

## 4. Fog, detection, and the information economy

- Grid visibility: radius per unit + line-of-sight blocking, re-rendered on every move. Reuse the
  `game-ai`/`roguelike` FOV technique; the tactics difference is that *the enemy phase consumes it*.
- Detection events (unit seen, trap triggered) belong in the event log so replays and saves agree.
- Store what the player *knows* (last-seen position, knowledge TTL) separately from what *is* — that
  buffer is what makes scouting, overwatch and ambush fun.

## 5. The campaign layer

```text
Campaign = { roster[], currency, resources, research/base, chapter map, mission history, seed }
Roster     = [{ id, name, class, level, xp, hp/max (wounds persist), status, gear, injuries, loyalty }]
Mission    = { id, map, objective, enemies, rewards, unlock conditions, difficulty gates }
```

- The battle hands back: XP per unit, casualties, loot, mission flags, time pressure (chapter clock).
- Progression loop that survives balance drift: XP is earned per *contribution* (damage dealt/kills)
  with a share for survivors, so benching a unit is a real cost — deployment cap < roster size is the
  interesting constraint, not the XP curve.
- Recovery economics: instant heal = no attrition; paid delayed heal = every wound costs turns and
  money, which is what makes the map matter. Pick deliberately; the two feel completely different.
- Loss must stay *recoverable but expensive* (recruit pipeline, rescue/revive window, or a costly
  permanent death). If a single bad roll can end a 20-hour campaign, offer an Assist/ironman split up
  front, as Fire Emblem does.
- Serialize `Campaign` and `Battle` as two documents, each with its own `version` (`save-systems`);
  write the campaign only at mission boundaries and the battle at phase boundaries.

## 6. Test hooks that pay for themselves

- **Board fixture tests**: hand-authored 8x8 boards asserting `reach`, `attackable`, cover and forecast
  numbers — cheap, no renderer, catches nearly every rules regression.
- **Scripted-intent replay**: a recorded mission replays to the identical result hash.
- **AI self-play smoke test**: run enemy phase against itself for 50 turns; assert no crash, no
  softlock, and that at least one objective predicate can be satisfied. This is how you find the
  "AI walks into the squad" bug class before a human does.
- **Legal-action coverage**: after random intents, assert some unit always has a legal action while the
  objective is unmet — the anti-softlock invariant from `grid-combat-rules`.
