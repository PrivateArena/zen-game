---
name: game-content-data
description: >
  Model game content as data with a schema: typed records for units, items, weapons, spells, terrain,
  status effects, moves, waves and missions; stable IDs and cross-table references; behavior referenced
  by effect id instead of branching code; derived stats recomputed instead of stored; load-time
  validation that fails loudly on dangling or duplicate IDs; balance curves as parameters; localization
  keys instead of hardcoded strings; and content tests. Use when defining or refactoring content/data
  tables, "how should items/enemies be data", stat blocks, JSON vs typed modules vs engine resources,
  .tres/ScriptableObject-style assets, a content registry, or a balance table nobody can edit safely.
  For player-save format and migration use save-systems; for art production use create-game-assets; for
  stat/XP formula design use rpg; for engine asset APIs use the detected engine skill.
---

# Game Content as Data

Turn "content" into an inspectable, validating, editor-friendly **system**: a schema per concept, IDs
that other tables can reference, behavior attached by name, and checks that run in a test as well as at
boot. This is a **cross-engine** discipline — it owns the shape of content and the checks around it, and
binds storage to the detected engine (`godot-resources`, `unity-scriptableobjects`, or plain typed
TS/JSON on the web).

## When to use

- Use when adding or restructuring tables: unit/enemy stats, weapons, items, abilities, status effects,
  terrain, spawns, waves, missions, dialogue-adjacent records, upgrade costs, loot tables.
- Use when "just another `if (id === 'sword')`" appears in gameplay code, or when a designer cannot edit
  a number without touching logic.
- Use when the codebase has numbers duplicated in a config file and in test expectations, or when a
  content typo surfaces as a runtime crash five screens later.

**When _not_ to use:** the player's saved state, slots, and versioned migration → `save-systems`
(same instincts, different subject: that data is *written by the game*). Art, sprite and 3D asset
pipelines → `create-game-assets`. Which numbers are *fun* (XP curves, damage math) → `rpg`,
`tower-defense`, `turn-based-strategy`. Engine resource/asset classes and importers → the engine skill.

## Core workflow

1. **Enumerate the concepts and their editors.** For each table ask: does a designer change this by hand
   (→ data, comments, ranges) or does it change only with code review (→ typed constants are fine)?
   Everything referenced at runtime by id must be data.
2. **Write the schema before the rows.** One record shape per concept, in one file, with the field list,
   units, and legal ranges in a comment block. Content editors then can't invent fields silently.
3. **Decide storage:** source-controlled typed module, or serialized data (JSON/CSV/Tres/asset) loaded at
   runtime. Source-controlled TS/JSON is the default for code-first projects; engine-native asset
   formats when the editor is the authoring tool. Never both for the same table.
4. **Separate decisions from behavior.** Data names an effect (`"effectId": "burn_dmg_15"`), code
   implements effects in one registry. This is the single change that makes a content set scalable.
5. **Validate at load, in dev, loudly** — dangling references, out-of-range numbers, NaN, empty text
   keys, unknown effect parameters — and run the same validator in tests. Silent defaults (`?? 0`) are how
   typos ship. (Duplicate ids must be caught at the *source*, before parsing; see Pattern 4.)
6. **Recompute derived values** from base data + modifiers; store only authored numbers.
7. **Add the content test** with the feature: the validator plus two or three "the numbers add up"
   assertions (can the player afford the level-1 shop? is mission 3 reachable?).

## Patterns

### 1. One record per concept, IDs as the only join key

```ts
// src/content/units.ts — authored numbers ONLY. Ids are stable, opaque, never reused, never numeric.
export interface UnitDef {
  id: string;                 // 'militia', 'archer_yarl'  (kebab-case, no display text)
  nameKey: string;            // 'unit.militia.name'       (localized, never a literal string)
  classId: string;            // ref -> classes.ts
  weaponIds: string[];        // ref -> weapons.ts
  base: { hp: number; str: number; mag: number; skl: number; spd: number; lck: number; mov: number };
  growths?: Partial<Record<keyof UnitDef['base'], number>>;   // per-level odds, 0..1
  effectIds: string[];        // passive/terrain/AI hooks, resolved in code
  rank: number;               // 1..5, used by deployment-cost and unlock rules
}
```

- Reference *fields* by suffix (`classId`, `weaponIds`, `effectIds`, `missionId`) — a bare `class` or
  `weapon` is ambiguous, and the suffix is what makes the validator mechanical.
- Keep one table per concept in a keyed record (`by id`), not an array you search by scanning; arrays
  are for **ordered** things (a mission's wave list).

### 2. Derived stats: store the inputs, compute the outputs

```ts
export const derived = (u: UnitDef, lvl: number, gear: string[], effects: EffectCtx[]) => {
  const b = applyGrowths(u.base, lvl, u.growths);         // authored base + level growth
  return {
    maxHp: b.hp + gearBonus(gear, 'hp') + effectsFlat(effects, 'hp'),
    hit:   b.skl * 2 + weaponAccuracy(gear[0]) + effectsFlat(effects, 'hit'),
    // ... ONE formula, used by the forecast, the tooltip, the AI and the tests
  };
};
// Never persist `hit`. If a formula changes, every stored value is now a lie.
```

### 3. Effects: data names them, code implements them

```ts
// content row:  { id: 'burn_dmg_15', kind: 'dot', duration: 3, tags: ['dispellable'], params: { power: 15, ticks: 3 } }
export type EffectKind = 'dot' | 'statMod' | 'moveMod' | 'onKill' | 'onPhaseTick';
type Cleanup = () => void;
type EffectImpl = (e: EffectDef, ctx: Ctx) => void | Cleanup;         // return a cleanup to unsubscribe

export const EFFECTS: Record<EffectKind, { run: EffectImpl; params: readonly string[] }> = {
  dot:         { run: applyDot,        params: ['power', 'ticks'] },
  statMod:     { run: applyStatMod,    params: ['stat', 'flat', 'percent'] },
  moveMod:     { run: applyMoveMod,    params: ['delta', 'profiles'] },
  onKill:      { run: applyOnKill,     params: ['gold', 'xp'] },
  onPhaseTick: { run: applyPhaseTick,  params: ['power'] },
};   // Record<EffectKind, …> makes a missing implementation a COMPILE error, not a runtime crash
```

Adding content must mean "add a row + maybe an effect", never "edit a 40-branch `switch`". If a row needs
bespoke logic, that is a signal the `kind` taxonomy is missing a concept, not that a special case belongs
inline.

### 4. Load-time validation that reads like a bug report

```ts
export type Problem = { level: 'error' | 'warn'; where: string; msg: string };
export type ContentDb = Record<string, Record<string, object>>;      // table -> id -> row

const refTableFor = (field: string) => field.replace(/Ids?$/, '') + 's';   // classId -> classes
const NOT_REFS = new Set(['itemIdOfTrade']);        // fields that end in Id but are not references

function checkRow(db: ContentDb, table: string, id: string, node: unknown, out: Problem[], path = '') {
  if (Array.isArray(node)) { node.forEach((v, i) => checkRow(db, table, id, v, out, `${path}[${i}]`)); return; }
  if (!node || typeof node !== 'object') return;
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const where = `${table}/${id}${path}.${key}`;
    if (!NOT_REFS.has(key) && /Id$/.test(key) && typeof value === 'string') {
      if (!db[refTableFor(key)]?.[value]) out.push({ level: 'error', where, msg: `dangling ref ${value}` });
    } else if (!NOT_REFS.has(key) && /Ids$/.test(key) && Array.isArray(value)) {
      for (const v of value as string[])
        if (!db[refTableFor(key)]?.[v]) out.push({ level: 'error', where, msg: `dangling ref ${v}` });
    } else if (typeof value === 'number' && !Number.isFinite(value)) {
      out.push({ level: 'error', where, msg: 'NaN or Infinity' });
    } else {
      checkRow(db, table, id, value, out, `${path}.${key}`);          // nested: rewards.itemIds, waves[]
    }
  }
}
export const validateContent = (db: ContentDb): Problem[] =>
  Object.entries(db).flatMap(([table, rows]) =>
    Object.keys(rows).map(id => { const p: Problem[] = []; checkRow(db, table, id, rows[id], p); return p; })
      .flat());
// dev boot: throw with the list. CI: fail the test. prod: report and load anyway.
```

Two honest caveats. **Duplicate ids cannot be found here** — a parsed object's keys are unique by
construction, and JSON with repeated keys has already collapsed (last one wins); detect duplicates at the
source (a CSV/JSON array of rows, or a parse reviver). And the `Id`-suffix convention only works if
reference fields actually end that way — so name them `classId`, `weaponIds`, `unlockAfterMissionId`, and
keep the exceptions in `NOT_REFS`.

### 5. Balance: parameters and a generator, not a wall of hand-typed rows

```ts
// Prefer a curve + parameters you can reason about, then EXPAND it into the table you actually load.
const HP_CURVE = { base: 12, growth: 1.18, bossSpike: 2.4 };     // refs: turn-based-strategy
export const enemyTable = expandLevels(HP_CURVE, /* levels */ 20);
// Committed as generated data with a header: "generated from balance-curves.ts, do not hand-edit".
```

A generator makes "what happens at level 40?" a one-line experiment; a 200-row hand-typed table makes it
a migration.

## Pitfalls

- **Behavior in the data file** (functions in JSON, `if (id === …)` in gameplay code) → data can't be
  diffed/validated/loaded by non-programmers and logic hides in content. Reference effects by id, implement
  in a registry.
- **Storing derived stats** → desync the moment a formula or item changes. Recompute; persist only
  authored inputs (`save-systems` covers what *player* state to persist).
- **Silent fallbacks** — `row.rank ?? 1`, `data[name] ?? DEFAULT` → a typo becomes a mystery bug in the
  shipped game. Throw in dev, fail the test, and keep the fallback out of the loading path.
- **Numeric or display-derived IDs** (`id: 3`, `id: archerName`) → renaming/adding content breaks saves,
  unlocks and analytics. Opaque stable ids; never renumber, never reuse.
- **One `config.ts` with everything** → unreviewable diffs, merge conflicts, no ownership. One file per
  concept, one owner each.
- **Two sources of truth** (a table plus a hardcoded tuning block, or a table plus tests that retype the
  numbers) → tests pass while the game ships different numbers. Import the table in the test.
- **Unvalidated JSON typed as `any`** → the compiler approves a shape the loader then crashes on. Type the
  record, parse once at the boundary, and keep the validator in CI.
- **Raw display strings in content** → every translation is a content edit. Use `nameKey`/`descKey` with a
  localization table (and `Plural`/`Gender` hooks where the language needs them).
- **Ordered lists stored as keyed records** (or vice versa) → wave/mission order silently changes with key
  order. Arrays where order is meaning; maps where lookup is meaning.
- **Loading every table at boot** → long startup, wasted memory on a 400-item RPG; keep a per-zone/
  per-screen lazy path with the schema still validated up front.
- **No content tests** → the first signal of a dangling id is the player. The validator + three "the numbers
  add up" assertions cost minutes and catch most content regressions.

## Engine bindings

| Engine | Storage | Notes |
| --- | --- | --- |
| Godot 4.x | `Resource` + `.tres` | see `godot-resources` for typed Resource, `@export`, threaded loading |
| Unity 6.x | `ScriptableObject` `.asset` | see `unity-scriptableobjects` for `CreateAssetMenu` and event channels |
| Web (Phaser/Pixi/three) | typed TS modules or `.json` | parse once at the boundary, keep the schema in `.ts`, ship the validator in dev + tests |
| Server-authoritative games | the same tables, shipped server-side | the client table is a *copy*; never trust it — validate purchases against the server's own data |

## References

- For a worked tactics-game schema (terrain/weapon/unit/status/mission), the effect registry, content
  tests and the JSON-vs-TS-vs-engine-asset trade-off table, read `references/schema-and-validation.md`.

## Related skills

- `save-systems` — the same validation/versioning instincts applied to state the game writes.
- `rpg` / `turn-based-strategy` / `tower-defense` — which numbers to author and what should hurt.
- `godot-resources` / `unity-scriptableobjects` — the engine-native half of the storage decision.
- `create-game-assets` — the art that the ids point at, and its naming/manifest discipline.
- `performance-optimization` — when content volume becomes a load-time or memory problem.
