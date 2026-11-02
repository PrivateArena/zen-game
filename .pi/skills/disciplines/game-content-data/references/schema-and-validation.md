# A worked content schema, validation, and the storage decision

Depth for `game-content-data`. TypeScript for readability (any typed language works); the shapes are the
portable part. The example is a grid-tactics game — the same layout covers items/spells/waves/levels.

## 1. Tables and their join graph

```text
terrain ─┐                      effects ─┐
weapons ──┼──> units ──> rosters ──> deployment (mission) ──> missions ──> chapter
classes ─┘        │                                      └──> waves ──> enemies (units)
statusEffects ────┘   (every arrow is a `<name>Id` / `<name>Ids` field)
```

Author the leaf tables first (terrain, weapons, effects), then the composites (units, missions). A cycle
in this graph means a concept is mis-split (e.g. "weapons" carrying unit-specific tuning).

```ts
// terrain.ts — the balance of a tactics game lives mostly here, not in unit stats.
export interface TerrainDef {
  id: string;                       // 'plains', 'forest', 'ridge', 'ford'
  nameKey: string;
  moveCost: Partial<Record<MoveProfileId, number>>;   // omitted profile = impassable for it;
  //                                       an entry of 0 is illegal (use `blocking` for walls)
  blocking: boolean;                // cannot be entered at all (walls)
  cover: 'none' | 'half' | 'full';
  blocksLineOfSight: boolean;
  height: number;                   // 0..3 -> to-hit and movement consequences
  hazardEffectIds: string[];        // refs effects.ts; applied on entry or on phase tick
  art: { tile: string; icon: string };   // texture keys, validated against the asset manifest
}

// effects.ts — the ONE registry-backed concept type; kinds are code, params are data.
export interface EffectDef {
  id: string;                       // 'burn_dmg_15', 'mounted_walk_penalty'
  kind: EffectKind;                 // the union in §2 — every kind has an EFFECTS entry
  duration: number;                 // phases; -1 = while equipped
  tags: string[];                   // 'dispellable', 'stackable' — queried by AI and UI
  params: Record<string, number>;   // validated per-kind by the effect registry
}

// units.ts (see SKILL.md §1), weapons.ts, classes.ts, missions.ts:
export interface MissionDef {
  id: string; nameKey: string; briefingKey: string;
  mapId: string;                    // ref maps (authored in the engine's tile tool or generated)
  objective: ObjectiveSpec;         // { kind: 'survive', turns: 8 } | { kind: 'rout' } | ...
  lossConditions: LossCondition[];  // distinct from objectives, or "lose" becomes undefined behaviour
  enemyWaveIds: string[];           // ORDERED -> array, not record
  reinforcementWaves: { atTurn: number; waveId: string; telegraph: boolean }[];
  rewards: { xp: number; gold: number; itemIds: string[] };
  unlockAfterMissionId: string | null;   // ref -> missions; the suffix is what the validator reads
  seedPolicy: 'fixed' | 'player' | 'perAttempt';
}
```

Rules this buys you: the validator knows every `*Id` field without being told, tooltips can render any
record generically, and a new mission is data.

## 2. Effect registry with per-kind parameter checks

```ts
type Cleanup = () => void;
type EffectImpl = (e: EffectDef, ctx: Ctx) => void | Cleanup;    // same shape as SKILL.md §3
export const EFFECTS: Record<EffectKind, { run: EffectImpl; params: readonly string[] }> = {
  dot:         { run: applyDot,        params: ['power', 'ticks'] },
  statMod:     { run: applyStatMod,    params: ['stat', 'flat', 'percent'] },
  moveMod:     { run: applyMoveMod,    params: ['delta', 'profiles'] },
  onKill:      { run: applyOnKill,     params: ['gold', 'xp'] },
  onPhaseTick: { run: applyPhaseTick,  params: ['power'] },
};
// validateContent() then checks, for every effectId referenced anywhere:
//   - the kind has an EFFECTS entry (compile-checked by Record<EffectKind, …>)
//   - params contains exactly the declared keys — missing AND unknown are errors, not silent typos
```

Unknown params are the classic content bug: `{ powerr: 15 }` silently does nothing. Rejecting them costs
one `Set` comparison per row.

## 3. Content tests (they run in seconds and pay forever)

```ts
test('every reference resolves', () => expect(validateContent(db).filter(p => p.level === 'error')).toEqual([]));
test('every effectId referenced by content is implemented', ...);
test('missions form an acyclic unlock graph with one entry point', ...);
test('each mission is winnable by the AI-agnostic floor', () => {          // cheap sanity, not balance
  for (const m of Object.values(db.missions))
    expect(enemyPowerBudget(m, db)).toBeLessThan(playerPowerBudget(m.deployment, db) * 1.35);
});
test('the economy is monotonic', () => {                                  // cost curves never invert
  for (let i = 1; i < MAX_RANK; i++) expect(upgradeCost(i + 1, db)).toBeGreaterThan(upgradeCost(i, db));
});
test('no content depends on Object.keys order', () => shuffleAndRevalidate(db));
```

The last three are the ones that catch design bugs, not just typos: an unbeatable mission, a cost curve
that inverts at rank 4, a wave list accidentally stored as a record.

## 4. Storage decision

| Axis | Typed source module (TS/C# consts) | Serialized data (JSON/CSV) | Engine asset (`.tres`, `.asset`) |
| --- | --- | --- | --- |
| Editor/type safety | best (compiler) | needs a validator | best in-editor, weak outside it |
| Designer edits without a build | no | yes | yes, in the editor |
| Diff/review friendliness | good | best (text) | poor (binary/text hybrid) |
| Runtime cost | zero (bundled) | parse + validate at load | engine importer cost |
| Live tuning | needs reload/hot-reload | trivial | editor-tweakable |
| Right choice | ids, kinds, formulas, code-coupled refs | balance tables, missions, l10n | when the editor *is* the authoring tool |

Hybrid is normal: **refs and ids in code, numbers in data**. What is fatal is the same number in two
places.

## 5. Content versioning vs save versioning

- Content has a version too, but you do not migrate it — it ships with the build. What you *do* keep:
  stable ids (never renumber), and a changelog table for anything a save file or analytics references.
- Anything a save references by id (unlocked units, owned items, completed missions) must survive a
  content change: keep an `aliases: { 'oldId': 'newId' }` map in the content and resolve it on load, then
  migrate (`save-systems` owns the migration mechanics).
- Delete content by **deprecating first** (`retired: true` + validation forbids new references) and only
  remove the row once no shipped save can point at it.

## 6. Localizing content

```text
content:   { id: 'militia', nameKey: 'unit.militia.name', bioKey: 'unit.militia.bio' }
l10n table:'unit.militia.name' -> { en: 'Militia', de: 'Miliz',  pluralOne?: … }
```

- Never store translated strings in content rows; never store a formatted string that embeds a number
  (`"Cost: 3"` → `"{cost}"` + formatter), or pluralization and RTL break at release.
- Keep text keys derived from ids by convention, and validate that every `*Key` has an entry for each
  shipped locale — a missing key should look like an error in the report, not a blank tooltip.
- Reserve layout room by measuring the longest locale, not the source language (`game-ui-ux`).
