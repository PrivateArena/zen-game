# Reusable Engine API Reference

This document catalogs the APIs and structures for the reusable simulation game engine and the backward-compatible adapter.

---

## 🏎️ 1. CoreEngine API (`src/engine/CoreEngine.ts`)

`CoreEngine` manages the state loop headlessly, executes registered strategies, evaluates timeline conditions, and serves as the primary system of record.

### Methods

#### `constructor(config: GameConfig, registry: BehaviorRegistry)`
Creates a new simulation environment applying template configurations.

#### `start(): void`
Resumes simulation ticker.

#### `pause(): void`
Halts simulation ticker execution.

#### `reset(): void`
Resets stats to configuration baseline values and spawns initial entity positions.

#### `tick(dt: number): void`
Manually steps simulation execution forward by `dt` seconds (invaluable for headless tests or fast-forward rollouts).

#### `getState(): GameState`
Returns a read-only structured representation of the current active entities and global statistics.

#### `getContext(): EngineContext`
Returns the mutable internal state context (primarily used by behavior strategy loops).

#### `setSpeed(speed: number): void`
Sets time dilation scalar (e.g., `0.5x`, `1x`, `2x`).

---

## 🧠 2. AI & Testing Agent APIs

The following APIs are designed specifically to support AI agents, automated verification, and testing rollbacks.

### Deterministic Action Bus (Pattern A)

#### `dispatchAction(action: GameAction): boolean`
Triggers state updates through the unified action command flow.
* **Params**: `action: { type: string, payload: Record<string, any>, timestamp: number }`
* **Returns**: `boolean` indicating if the action succeeded.

#### `getAvailableActions(): ActionDefinition[]`
Allows agents to query active action metadata schemas dynamically.

### State Snapshots & Time Travel (Pattern B)

#### `getSnapshot(): string`
Serializes the complete current game state (tick, timer, entities, stats) into a JSON string.

#### `loadSnapshot(snapshotJson: string): void`
Overwrites the engine's active context with the serialized snapshot data. Restores exact state instantly.

### Global Screenshot Capturer (Pattern C)

#### `window.captureGameFrame(): Promise<string>`
Global hook registered on the browser namespace. Resolves with a Base64-encoded PNG image of the game screen layout.
* **Pre-requisite**: Phaser WebGL contexts must be initialized with `preserveDrawingBuffer: true`.

---

## 🔗 3. SimulationCore Compatibility Adapter (`src/game/SimulationCore.ts`)

Serves as the adapter layer mapping React state hooks and Phaser scene callbacks to `CoreEngine` without altering existing UI features.

### Methods

* `getState(): GameState` (maps generic template Entities to backward-compatible legacy Units list)
* `getConfig(): GameConfig` (maps internal config templates)
* `purchaseTower(slotId: string, towerType: string, cost: number): boolean` (internally translates UI clicks to `dispatchAction({ type: 'BUILD_TOWER', ... })`)
* `subscribe(listener: (state: GameState) => void): () => void`
* `selectSlot(slotId: string | null): void`
* `triggerDiagnosticPulse(): void`
* `addLog(msg: string): void`

---

## 📡 4. Zero-Friction DOM Event AI Interface

To bypass browser sandboxing restrictions (e.g. extension execution boundaries), agents can interact with the engine entirely through standard DOM custom events dispatched to the `document` element.

### Sending Requests

Dispatch a `'zen-agent-request'` CustomEvent containing the action and payload:

```javascript
// 1. Start the game
document.dispatchEvent(new CustomEvent('zen-agent-request', {
  detail: { action: 'start' }
}));

// 2. Build a tower on a slot
document.dispatchEvent(new CustomEvent('zen-agent-request', {
  detail: {
    action: 'build',
    payload: { slotId: 'Slot-Plot-1-1', type: 'Ground', cost: 100 }
  }
}));

// 3. Take a screenshot
document.dispatchEvent(new CustomEvent('zen-agent-request', {
  detail: { action: 'screenshot' }
}));
```

### Receiving Responses

Listen for the `'zen-agent-response'` CustomEvent on the document:

```javascript
document.addEventListener('zen-agent-response', (e) => {
  const { action, success, state, screenshot, error } = e.detail;
  console.log(`Resolved action: ${action}, Success: ${success}`);
  
  if (action === 'screenshot') {
    // base64 png data url
    console.log(screenshot);
  }
});
```
