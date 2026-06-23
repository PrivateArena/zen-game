import type {
  GameConfig,
  EngineContext,
  Entity,
  GameState,
  GameAction,
  ActionDefinition,
} from './types';
import { BehaviorRegistry, GlobalLayoutRegistry } from './BehaviorRegistry';

export class CoreEngine {
  private context: EngineContext;
  private listeners: Set<(state: GameState) => void> = new Set();
  private intervalId: number | null = null;
  private lastUpdateTime: number = 0;
  private simulationSpeed: number = 1;
  private selectedSlotId: string | null = null;

  constructor(
    config: GameConfig,
    private registry: BehaviorRegistry
  ) {
    this.context = {
      entities: new Map(),
      globalStats: { ...config.initialGlobalStats },
      currentTick: 0,
      elapsedTime: 0,
      status: 'idle',
      logs: [`Grid: ${config.title} online.`],
      firedEventIds: [],
      config,
    };
    this.spawnInitialEntities();
  }

  private spawnInitialEntities() {
    this.context.entities.clear();
    for (const group of this.context.config.initialEntities) {
      const template = this.context.config.entityTemplates[group.template];
      if (!template) continue;
      const layoutFn = GlobalLayoutRegistry[group.layout.type] ?? GlobalLayoutRegistry['fixed'];

      for (let i = 0; i < group.count; i++) {
        const pos = layoutFn(group.layout, i);
        const id = group.customIdPrefix
          ? `${group.customIdPrefix}-${i + 1}`
          : `${group.template}-${Math.random().toString(36).substring(2, 9)}`;

        this.context.entities.set(id, {
          id,
          type: group.template,
          factionId: group.factionId,
          x: pos.x,
          y: pos.y,
          hp: template.baseStats.hp,
          maxHp: template.baseStats.hp,
          damage: template.baseStats.damage,
          speed: template.baseStats.speed,
          range: template.baseStats.range,
          behavior: template.behavior,
          statusText: 'Standing ready',
          tags: [...template.tags],
          stats: { ...template.baseStats },
          components: JSON.parse(JSON.stringify(template.components ?? {})),
        });
      }
    }
  }

  // AI Interface: Execute actions from agent/player
  public dispatchAction(action: GameAction): boolean {
    const handler = this.registry.getActionHandler(action.type);
    if (!handler) {
      this.addLog(`[ACTION ERROR] No action handler found for: ${action.type}`);
      return false;
    }
    const success = handler(action.payload, this.context);
    if (success) {
      this.notify();
    }
    return success;
  }

  public getAvailableActions(): ActionDefinition[] {
    return this.registry.getAvailableActions();
  }

  // AI Interface: Get fully serialized state (telemetry)
  public getSnapshot(): string {
    return JSON.stringify({
      currentTick: this.context.currentTick,
      elapsedTime: this.context.elapsedTime,
      status: this.context.status,
      firedEventIds: this.context.firedEventIds,
      globalStats: this.context.globalStats,
      logs: this.context.logs,
      selectedSlotId: this.selectedSlotId,
      entities: Array.from(this.context.entities.values()),
    });
  }

  // AI Interface: Restore state (tree-search, playback, rollback)
  public loadSnapshot(snapshotJson: string): void {
    const data = JSON.parse(snapshotJson);
    this.context.currentTick = data.currentTick;
    this.context.elapsedTime = data.elapsedTime;
    this.context.status = data.status;
    this.context.firedEventIds = data.firedEventIds;
    this.context.globalStats = data.globalStats;
    this.context.logs = data.logs;
    this.selectedSlotId = data.selectedSlotId;

    this.context.entities.clear();
    for (const e of data.entities) {
      this.context.entities.set(e.id, e);
    }
    this.notify();
  }

  // Run controls
  public start(): void {
    if (this.context.status === 'running') return;
    this.context.status = 'running';
    this.addLog('Simulation system running.');
    this.lastUpdateTime = performance.now();
    this.runLoop();
    this.notify();
  }

  public pause(): void {
    if (this.context.status !== 'running') return;
    this.context.status = 'paused';
    this.addLog('Simulation system paused.');
    if (this.intervalId) {
      cancelAnimationFrame(this.intervalId);
      this.intervalId = null;
    }
    this.notify();
  }

  public reset(): void {
    this.pause();
    this.context.status = 'idle';
    this.context.elapsedTime = 0;
    this.context.currentTick = 0;
    this.context.firedEventIds = [];
    this.context.logs = ['Simulation system reset.'];
    this.context.globalStats = { ...this.context.config.initialGlobalStats };
    this.selectedSlotId = null;
    this.spawnInitialEntities();
    this.notify();
  }

  public getContext(): EngineContext {
    return this.context;
  }

  public getSpeed(): number {
    return this.simulationSpeed;
  }

  public setSpeed(speed: number): void {
    this.simulationSpeed = speed;
    this.addLog(`Simulation speed set to ${speed}x.`);
    this.notify();
  }

  public selectSlot(slotId: string | null): void {
    this.selectedSlotId = slotId;
    this.notify();
  }

  public getSelectedSlotId(): string | null {
    return this.selectedSlotId;
  }

  public addLog(msg: string): void {
    this.context.logs.unshift(msg);
    if (this.context.logs.length > 50) {
      this.context.logs.pop();
    }
  }

  public subscribe(listener: (state: GameState) => void) {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public notify(): void {
    const state = this.getState();
    this.listeners.forEach(l => l(state));
  }

  public getState(): GameState {
    return {
      status: this.context.status,
      entities: Array.from(this.context.entities.values()).map(e => ({ ...e })),
      simulationSpeed: this.simulationSpeed,
      elapsedTime: this.context.elapsedTime,
      logs: [...this.context.logs],
      firedEventIds: [...this.context.firedEventIds],
      globalStats: { ...this.context.globalStats },
      selectedSlotId: this.selectedSlotId,
    };
  }

  private runLoop = () => {
    if (this.context.status !== 'running') return;
    const now = performance.now();
    const dt = (now - this.lastUpdateTime) / 1000;
    this.lastUpdateTime = now;

    this.tick(dt * this.simulationSpeed);

    this.intervalId = requestAnimationFrame(this.runLoop);
  };

  public tick(dt: number): void {
    if (dt <= 0 || this.context.status === 'awaiting-interaction' || this.context.status === 'gameover') return;

    this.context.currentTick++;
    this.context.elapsedTime += dt;

    // 1. Run behaviors for all alive entities
    for (const entity of this.context.entities.values()) {
      if (entity.hp <= 0) continue;
      const strategy = this.registry.getStrategy(entity.behavior);
      if (strategy) {
        strategy(entity, this.context, dt);
      }
    }

    // 2. Evaluate timeline hooks
    this.evaluateTimelineEvents();

    // 3. Evaluate win/loss conditions
    this.evaluateGameOver();

    this.notify();
  }

  private evaluateTimelineEvents(): void {
    for (const event of this.context.config.timelineEvents) {
      if (this.context.firedEventIds.includes(event.id)) continue;

      let shouldFire = false;
      if (event.trigger.type === 'time') {
        shouldFire = this.context.elapsedTime >= event.trigger.value;
      } else if (event.trigger.type === 'faction_hp_percent' && event.trigger.faction) {
        const factionUnits = Array.from(this.context.entities.values()).filter(
          u => u.factionId === event.trigger.faction
        );
        const totalMaxHp = factionUnits.reduce((acc, u) => acc + u.maxHp, 0);
        const totalCurrentHp = factionUnits.reduce((acc, u) => acc + (u.hp > 0 ? u.hp : 0), 0);
        if (totalMaxHp > 0) {
          const percent = (totalCurrentHp / totalMaxHp) * 100;
          shouldFire = percent <= event.trigger.value;
        }
      } else if (
        event.trigger.type === 'global_stat_threshold' &&
        event.trigger.statKey !== undefined
      ) {
        const val = this.context.globalStats[event.trigger.statKey] ?? 0;
        shouldFire = val <= event.trigger.value;
      }

      if (shouldFire) {
        this.context.firedEventIds.push(event.id);
        this.triggerTimelineEvent(event);
      }
    }
  }

  private triggerTimelineEvent(event: any): void {
    this.context.status = 'awaiting-interaction';
    this.addLog(`[TIMELINE] Triggered educational milestone: ${event.id}`);
    this.pause();

    const dispatchResume = (result: { success: boolean }) => {
      // Resume callback
      const outcome = result.success ? event.duoduoHook.onSuccess : event.duoduoHook.onFailure;
      if (outcome && outcome.action === 'buff_faction') {
        Array.from(this.context.entities.values())
          .filter(u => u.factionId === outcome.faction && u.hp > 0)
          .forEach(u => {
            if (outcome.stat === 'damage') {
              u.damage *= outcome.multiplier;
              this.addLog(`[BUFF] ${outcome.faction} weapon damage boosted ${outcome.multiplier}x!`);
            }
            if (outcome.stat === 'speed') {
              u.speed *= outcome.multiplier;
              this.addLog(`[DEBUFF] ${outcome.faction} movement rate accelerated ${outcome.multiplier}x!`);
            }
          });
      }

      this.addLog(`[TIMELINE] Event resolved.`);
      this.context.status = 'running';
      this.lastUpdateTime = performance.now();
      this.runLoop();
    };

    // Fire window event for UI listener
    window.dispatchEvent(
      new CustomEvent('zen-game-intercept', {
        detail: {
          eventId: event.id,
          hook: event.duoduoHook,
          resume: dispatchResume,
        },
      })
    );
  }

  private evaluateGameOver(): void {
    const activeFactions = new Set<string>();
    for (const u of this.context.entities.values()) {
      if (u.hp > 0 && u.behavior !== 'empty_slot') {
        activeFactions.add(u.factionId);
      }
    }

    const lives = this.context.globalStats['lives'] ?? 0;

    if (lives <= 0) {
      this.context.status = 'gameover';
      this.addLog('Simulation Terminated: Defense breached.');
      this.pause();
    } else if (!activeFactions.has('monsters')) {
      this.context.status = 'gameover';
      this.addLog('Simulation Terminated: Threat neutralized. VICTORY!');
      this.pause();
    }
  }
}
