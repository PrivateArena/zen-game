# Zen Game — Project Architecture Overview

## Purpose

Multi-genre game framework built with React 18 + Phaser 3 + TypeScript. An ECS-like engine drives an auto-battle arena ("rome-autobattle") with a tower-defense mode partially scaffolded ("rome-aegis"). Designed for AI-agent integration via snapshot/restore, action dispatch, and observable state.

---

## File Tree

```
src/
  main.tsx
  App.tsx
  components/
    GameCanvas.tsx
    UIOverlay.tsx
  engine/
    CoreEngine.ts
    BehaviorRegistry.ts
    types.ts
  game/
    SimulationCore.ts
    MainScene.ts
  games/
    rome-aegis/
      behaviors.ts
      config.ts
    rome-autobattle/
      behaviors.ts
      config.ts
  types/
    game.ts
```

---

## Architecture Diagram (ASCII)

```
main.tsx
  └── <App />  (React root, owns SimulationCore instance)
        │
        ├── SimulationCore  (game logic orchestrator)
        │     │
        │     ├── CoreEngine  (generic ECS tick engine)
        │     │     ├── BehaviorRegistry
        │     │     │     ├── getStrategy()        → entity AI per tick
        │     │     │     ├── getActionHandler()   → route dispatched action
        │     │     │     └── getAvailableActions()→ enumerate legal actions
        │     │     ├── getSnapshot() / loadSnapshot()  → AI serialization
        │     │     ├── subscribe() / notify()     → observer pattern
        │     │     ├── start() / pause() / reset()
        │     │     ├── tick() → evaluateTimelineEvents() → evaluateGameOver()
        │     │     └── types.ts (Entity, GameAction, EngineContext, etc.)
        │     │
        │     ├── RomeAutobattleConfig        (GameConfig)
        │     └── SeekAndDestroyStrategy      (BehaviorStrategy)
        │         gridToPixel                  (coord helper)
        │
        ├── <GameCanvas />  (Phaser canvas host)
        │     └── MainScene  (Phaser.Scene)
        │           ├── init / preload / create / update
        │           ├── drawArenaGrid()
        │           ├── drawCombatIndicators()
        │           ├── createUnitContainer()
        │           ├── drawDragHighlights()
        │           └── reads SimulationCore state via getState()
        │
        └── <UIOverlay />  (React HUD, subscribes to SimulationCore)
              └── renders shop, stats, logs from GameState
```

---

## Component Roles

### Entry / React Shell

| File | Role | Key Exports |
|---|---|---|
| `src/main.tsx` | React DOM mount, StrictMode | `createRoot(App)` |
| `src/App.tsx` | Root component; holds `SimulationCore` in ref, wires UI | `App` |

### React UI Components

| File | Role | Key Exports |
|---|---|---|
| `src/components/GameCanvas.tsx` | Mounts Phaser game instance, owns MainScene lifecycle | `GameCanvas(props)` |
| `src/components/UIOverlay.tsx` | HUD overlay — shop, stats, log, drag-drop feedback | `UIOverlay` (default) |

### Engine Layer

| File | Role | Key Exports |
|---|---|---|
| `src/engine/types.ts` | All engine-level type definitions | `Entity`, `GameAction`, `GameState`, `GameConfig`, `EngineContext`, `BehaviorStrategy`, `ActionHandler`, `TimelineEvent`, `TriggerConfig`, `DuoduoHook` |
| `src/engine/CoreEngine.ts` | Generic tick engine. Manages entities, actions, timeline, game-over, observer subscribers, snapshot serialize/deserialize | `class CoreEngine` — `tick()`, `dispatchAction()`, `getSnapshot()`, `loadSnapshot()`, `subscribe()`, `getState()`, `start/pause/reset/setSpeed/selectSlot` |
| `src/engine/BehaviorRegistry.ts` | Registry for pluggable BehaviorStrategy + ActionHandler lookups | `class BehaviorRegistry` — `registerStrategy()`, `getStrategy()`, `registerAction()`, `getActionHandler()`, `getAvailableActions()` |

### Game Orchestration

| File | Role | Key Exports |
|---|---|---|
| `src/game/SimulationCore.ts` | Auto-battle game logic: shop, economy, XP, unit buy/sell/merge/move, round lifecycle, combat resolution, subscribe for React. Wraps CoreEngine + BehaviorRegistry | `class SimulationCore` — `start()/pause()/reset()`, `buyUnit()/sellUnit()/rerollShop()/buyXp()`, `startRound()/startCombat()/resolveRound()`, `onIntercept()`, `tick()`, `subscribe()` |
| `src/game/MainScene.ts` | Phaser 3 Scene: rendering, sprite management, drag-drop interaction, combat indicators, arena grid | `class MainScene(Phaser.Scene)` — `init/preload/create/update`, `compileFactionTextures()`, `drawArenaGrid()`, `drawCombatIndicators()`, `createUnitContainer()`, `drawDragHighlights()` |

### Game Mode Definitions

| File | Role | Exports |
|---|---|---|
| `src/games/rome-autobattle/config.ts` | GameConfig for autobattle mode | `RomeAutobattleConfig: GameConfig` |
| `src/games/rome-autobattle/behaviors.ts` | AI strategies for autobattle | `SeekAndDestroyStrategy: BehaviorStrategy`, `gridToPixel()` |
| `src/games/rome-aegis/config.ts` | GameConfig for tower defense mode | `RomeAegisConfig: GameConfig` |
| `src/games/rome-aegis/behaviors.ts` | AI strategies for tower defense | `TowerAttackStrategy`, `EnemyPathStrategy`, `EmptySlotStrategy`, `BuildTowerAction: ActionHandler`, `BUILD_TOWER_DEFINITION: ActionDefinition` |

### Shared Types

| File | Role | Key Exports |
|---|---|---|
| `src/types/game.ts` | Domain-level types (shared between engine and React UI) | `GameStatus`, `Point2D`, `Unit`, `FactionConfig`, `LayoutConfig`, `EntityConfig`, `TriggerConfig`, `DuoduoHook`, `TimelineEvent`, `GameConfig`, `GameState` |

---

## Key Architectural Patterns

### 1. Strategy Pattern — BehaviorRegistry
`BehaviorStrategy` (`src/engine/types.ts:128`) is a function type `(unit, context, dt) => GameAction | null`. Strategies are registered per game mode and called each tick by `CoreEngine.tick()` → `getStrategy()`. Examples:
- `rome-autobattle`: `SeekAndDestroyStrategy` — find nearest enemy, move, attack.
- `rome-aegis`: `TowerAttackStrategy`, `EnemyPathStrategy`, `EmptySlotStrategy`.

### 2. Command Pattern — ActionHandler
`ActionHandler` (`src/engine/types.ts:129`) is `(payload, context) => void`. Dispatched via:
`SimulationCore` → `CoreEngine.dispatchAction()` → `BehaviorRegistry.getActionHandler()` → mutates engine state.
`rome-aegis` implements `BuildTowerAction`, registered with `BUILD_TOWER_DEFINITION`.

### 3. Observer Pattern — subscribe/notify
`CoreEngine` maintains subscriber callbacks (via `subscribe()`). On every mutation (`dispatchAction`, `start`, `pause`, `setSpeed`, `selectSlot`, `tick`, `loadSnapshot`), it calls `notify()` which invokes all subscribers with the current `GameState`. React components (`UIOverlay`) subscribe to stay in sync.

### 4. Snapshot/Restore for AI Integration
`CoreEngine.getSnapshot()` returns fully serialized state. `CoreEngine.loadSnapshot(snapshot)` restores it and notifies subscribers. Enables tree-search, rollback, and AI telemetry.

### 5. Pluggable Game Modes
Game modes live under `src/games/<name>/` as self-contained modules exporting:
- `GameConfig` (`src/types/game.ts:GameConfig`) — factions, entities, triggers, layout, economy tuning.
- `BehaviorStrategy` implementations — per-entity AI.
- `ActionHandler` implementations — custom actions.

Currently `SimulationCore` hardcodes `RomeAutobattleConfig` + `SeekAndDestroyStrategy`. Switching to tower defense requires only changing config + behavior imports.

---

## Data Flow

```
User Input / AI Agent
  │
  ▼
SimulationCore.method()          e.g. buyUnit, moveUnit, dispatchAction
  │
  ▼
CoreEngine.dispatchAction()
  │
  ├─► BehaviorRegistry.getActionHandler() → mutate Entity[]
  ├─► addLog()
  └─► notify() → subscribers (React UI)
         │
         ▼
      UIOverlay re-renders
      MainScene.update() → redraws sprites

Tick loop:
  CoreEngine.tick()
    ├─► for each Entity → getStrategy() → returns GameAction | null
    ├─► dispatchAction(action)  (if strategy returned one)
    ├─► evaluateTimelineEvents()
    ├─► evaluateGameOver()
    └─► notify() → subscribers
```
