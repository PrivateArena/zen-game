import type { GameState, Unit, GameConfig, EntityConfig, DuoduoHook } from '../types/game';

// Standard layout computation functions
export type LayoutFn = (entity: EntityConfig, index: number) => { x: number; y: number };

export const LayoutRegistry: Record<string, LayoutFn> = {
  'vertical-line': (entity, i) => ({
    x: entity.layout.startX ?? 150,
    y: (entity.layout.startY ?? 100) + i * (entity.layout.spacing ?? 65),
  }),
  'scatter': (entity) => {
    const box = entity.layout.boundingBox ?? { x: 500, y: 100, w: 100, h: 300 };
    return {
      x: box.x + Math.random() * box.w,
      y: box.y + Math.random() * box.h,
    };
  }
};


// Extensible Behavior Strategy pattern
export interface BehaviorStrategy {
  execute(unit: Unit, state: GameState, dt: number): void;
}

export class AggressiveSeekStrategy implements BehaviorStrategy {
  execute(unit: Unit, state: GameState, dt: number): void {
    let closestEnemy: Unit | null = null;
    let minDistance = Infinity;

    for (const other of state.units) {
      if (other.factionId !== unit.factionId && other.hp > 0) {
        const dx = other.x - unit.x;
        const dy = other.y - unit.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDistance) {
          minDistance = dist;
          closestEnemy = other;
        }
      }
    }

    if (closestEnemy) {
      unit.targetId = closestEnemy.id;
      const dx = closestEnemy.x - unit.x;
      const dy = closestEnemy.y - unit.y;

      if (minDistance > unit.range) {
        // Move towards enemy
        unit.x += (dx / minDistance) * unit.speed * dt;
        unit.y += (dy / minDistance) * unit.speed * dt;
        unit.statusText = `Moving to attack ${closestEnemy.id}`;
      } else {
        // Engaged in combat
        const damageApplied = unit.damage * dt;
        closestEnemy.hp = Math.max(0, closestEnemy.hp - damageApplied);
        unit.statusText = `Engaging ${closestEnemy.id}`;
      }
    } else {
      unit.targetId = undefined;
      unit.statusText = 'Securing area (Victory)';
    }
  }
}

export class PhalanxHoldStrategy implements BehaviorStrategy {
  execute(unit: Unit, state: GameState, dt: number): void {
    let closestEnemy: Unit | null = null;
    let minDistance = Infinity;

    for (const other of state.units) {
      if (other.factionId !== unit.factionId && other.hp > 0) {
        const dx = other.x - unit.x;
        const dy = other.y - unit.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDistance) {
          minDistance = dist;
          closestEnemy = other;
        }
      }
    }

    if (closestEnemy) {
      unit.targetId = closestEnemy.id;
      const dx = closestEnemy.x - unit.x;
      const dy = closestEnemy.y - unit.y;

      if (minDistance > unit.range) {
        if (minDistance < unit.range * 1.8) {
          // Slow brace advance
          unit.x += (dx / minDistance) * (unit.speed * 0.4) * dt;
          unit.y += (dy / minDistance) * (unit.speed * 0.4) * dt;
          unit.statusText = 'Bracing defensive formation';
        } else {
          // Normal speed advance
          unit.x += (dx / minDistance) * unit.speed * dt;
          unit.y += (dy / minDistance) * unit.speed * dt;
          unit.statusText = 'Advancing in phalanx';
        }
      } else {
        // Lock shield and engage
        const damageApplied = unit.damage * dt;
        closestEnemy.hp = Math.max(0, closestEnemy.hp - damageApplied);
        unit.statusText = 'Phalanx locked; engaging';
      }
    } else {
      unit.targetId = undefined;
      unit.statusText = 'Holding high ground';
    }
  }
}

export class BehaviorRegistry {
  private strategies = new Map<string, BehaviorStrategy>();

  constructor() {
    this.register('aggressive_seek', new AggressiveSeekStrategy());
    this.register('phalanx_hold', new PhalanxHoldStrategy());
  }

  register(key: string, strategy: BehaviorStrategy) {
    this.strategies.set(key, strategy);
  }

  get(key: string): BehaviorStrategy {
    const s = this.strategies.get(key);
    if (!s) {
      // Fallback strategy if not found
      return this.strategies.get('aggressive_seek')!;
    }
    return s;
  }
}

export interface InterceptDetail {
  eventId: string;
  hook: DuoduoHook;
  resume: (result: { success: boolean }) => void;
}

// Fallback configuration matching original layout for backward compatibility
const DEFAULT_CONFIG: GameConfig = {
  gameId: 'default-battle',
  title: 'ZEN_MATRIX // CORE_SIM',
  viewport: { width: 800, height: 450, theme: 'cyber-grid' },
  factions: {
    red: { id: 'red', name: 'RED ALLIANCE', color: '#ef4444', spriteStyle: 'diamond' },
    blue: { id: 'blue', name: 'BLUE SENTINELS', color: '#3b82f6', spriteStyle: 'shield' }
  },
  entities: [
    {
      id: 'Red-Vanguard',
      faction: 'red',
      count: 5,
      layout: { type: 'vertical-line', startX: 150, startY: 100, spacing: 65 },
      stats: { hp: 100, damage: 25, speed: 70, range: 50 },
      behavior: 'aggressive_seek'
    },
    {
      id: 'Blue-Sentinel',
      faction: 'blue',
      count: 5,
      layout: { type: 'vertical-line', startX: 650, startY: 100, spacing: 65 },
      stats: { hp: 120, damage: 20, speed: 55, range: 50 },
      behavior: 'phalanx_hold'
    }
  ],
  timelineEvents: [
    {
      id: 'combat_midpoint_quiz',
      trigger: { type: 'faction_hp_percent', faction: 'blue', value: 50 },
      duoduoHook: {
        type: 'quiz_challenge',
        quizId: 'intro_history_01',
        onSuccess: { action: 'buff_faction', faction: 'red', stat: 'damage', multiplier: 1.5 },
        onFailure: { action: 'buff_faction', faction: 'blue', stat: 'speed', multiplier: 1.2 }
      }
    }
  ]
};

export class SimulationCore {
  private config: GameConfig;
  private state: GameState;
  private listeners: Set<(state: GameState) => void> = new Set();
  private intervalId: number | null = null;
  private lastUpdateTime: number = 0;
  private behaviorRegistry: BehaviorRegistry = new BehaviorRegistry();
  private interceptHandler?: (detail: InterceptDetail) => void;

  public getState(): GameState {
    return this.cloneState();
  }

  public getConfig(): GameConfig {
    return this.config;
  }

  constructor(config: GameConfig = DEFAULT_CONFIG) {
    this.config = config;
    this.state = {
      status: 'idle',
      units: [],
      simulationSpeed: 1,
      elapsedTime: 0,
      logs: [`Simulation initialized: ${config.title}`],
      firedEventIds: []
    };
    this.spawnUnits();
  }

  private spawnUnits() {
    const units: Unit[] = [];
    for (const group of this.config.entities) {
      const layoutFn = LayoutRegistry[group.layout.type] ?? LayoutRegistry['vertical-line'];
      for (let i = 0; i < group.count; i++) {
        const pos = layoutFn(group, i);
        units.push({
          id: `${group.id}-${i + 1}`,
          factionId: group.faction,
          x: pos.x,
          y: pos.y,
          hp: group.stats.hp,
          maxHp: group.stats.hp,
          damage: group.stats.damage,
          speed: group.stats.speed,
          range: group.stats.range,
          behavior: group.behavior,
          statusText: 'Standing ready'
        });
      }
    }
    this.state.units = units;
  }

  public subscribe(listener: (state: GameState) => void) {
    this.listeners.add(listener);
    listener(this.cloneState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const cloned = this.cloneState();
    this.listeners.forEach(listener => listener(cloned));
  }

  private cloneState(): GameState {
    return {
      status: this.state.status,
      units: this.state.units.map(u => ({ ...u })),
      simulationSpeed: this.state.simulationSpeed,
      elapsedTime: this.state.elapsedTime,
      logs: [...this.state.logs],
      firedEventIds: [...this.state.firedEventIds]
    };
  }

  public start() {
    if (this.state.status === 'running') return;
    this.state.status = 'running';
    this.addLog('Simulation started.');
    this.lastUpdateTime = performance.now();
    this.runLoop();
    this.notify();
  }

  public pause() {
    if (this.state.status !== 'running') return;
    this.state.status = 'paused';
    this.addLog('Simulation paused.');
    if (this.intervalId) {
      cancelAnimationFrame(this.intervalId);
      this.intervalId = null;
    }
    this.notify();
  }

  public reset() {
    this.pause();
    this.state.status = 'idle';
    this.state.elapsedTime = 0;
    this.state.logs = ['Simulation reset.'];
    this.state.firedEventIds = [];
    this.spawnUnits();
    this.notify();
  }

  public setSpeed(speed: number) {
    this.state.simulationSpeed = speed;
    this.addLog(`Simulation speed set to ${speed}x.`);
    this.notify();
  }

  public onIntercept(handler: (detail: InterceptDetail) => void) {
    this.interceptHandler = handler;
  }

  private triggerIntercept(eventId: string, hook: DuoduoHook) {
    this.state.status = 'awaiting-interaction';
    this.addLog(`[INTERCEPT] Halting for education: ${eventId}`);
    if (this.intervalId) {
      cancelAnimationFrame(this.intervalId);
      this.intervalId = null;
    }
    this.notify();

    // Trigger local callback for headless/direct support
    const callbackDetail: InterceptDetail = {
      eventId,
      hook,
      resume: (result) => {
        this.applyRewardOrPenalty(result, hook);
        this.addLog(`[INTERCEPT] Resuming simulation.`);
        this.state.status = 'running';
        this.lastUpdateTime = performance.now();
        this.runLoop();
      }
    };

    if (this.interceptHandler) {
      this.interceptHandler(callbackDetail);
    } else {
      // Fallback to window event for standard browser setup
      window.dispatchEvent(new CustomEvent('zen-game-intercept', {
        detail: callbackDetail
      }));
    }
  }

  private applyRewardOrPenalty(result: { success: boolean }, hook: DuoduoHook) {
    const outcome = result.success ? hook.onSuccess : hook.onFailure;
    if (!outcome) return;

    if (outcome.action === 'buff_faction') {
      this.state.units
        .filter(u => u.factionId === outcome.faction && u.hp > 0)
        .forEach(u => {
          if (outcome.stat === 'damage') {
            u.damage *= outcome.multiplier;
            this.addLog(`[BUFF] Faction ${outcome.faction} damage buffed by ${outcome.multiplier}x.`);
          }
          if (outcome.stat === 'speed') {
            u.speed *= outcome.multiplier;
            this.addLog(`[BUFF] Faction ${outcome.faction} speed buffed by ${outcome.multiplier}x.`);
          }
        });
    }
  }

  public triggerDiagnosticPulse() {
    this.addLog('[DIAGNOSTIC] Manual diagnostic pulse triggered. Re-aligning unit sensors.');
    for (const unit of this.state.units) {
      if (unit.hp > 0 && unit.hp < unit.maxHp) {
        unit.hp = Math.min(unit.maxHp, unit.hp + 10);
      }
    }
    this.notify();
  }

  public addLog(message: string) {
    this.state.logs.unshift(message);
    if (this.state.logs.length > 50) {
      this.state.logs.pop();
    }
  }

  private runLoop = () => {
    if (this.state.status !== 'running') return;
    
    const now = performance.now();
    const dt = (now - this.lastUpdateTime) / 1000;
    this.lastUpdateTime = now;

    const scaledDt = dt * this.state.simulationSpeed;
    this.tick(scaledDt);

    this.intervalId = requestAnimationFrame(this.runLoop);
  };

  public tick(dt: number) {
    if (dt <= 0) return;
    
    this.state.elapsedTime += dt;
    const units = this.state.units;

    // Process unit behaviors from registry
    for (const unit of units) {
      if (unit.hp <= 0) {
        unit.statusText = 'Fallen';
        continue;
      }
      const strategy = this.behaviorRegistry.get(unit.behavior);
      strategy.execute(unit, this.state, dt);
    }

    // Evaluate timeline trigger events
    this.evaluateTimelineEvents();

    // Check game over
    this.evaluateGameOver();

    this.notify();
  }

  private evaluateTimelineEvents() {
    for (const event of this.config.timelineEvents) {
      if (this.state.firedEventIds.includes(event.id)) continue;

      let shouldFire = false;
      if (event.trigger.type === 'time') {
        shouldFire = this.state.elapsedTime >= event.trigger.value;
      } else if (event.trigger.type === 'faction_hp_percent' && event.trigger.faction) {
        const factionUnits = this.state.units.filter(u => u.factionId === event.trigger.faction);
        const totalMaxHp = factionUnits.reduce((acc, u) => acc + u.maxHp, 0);
        const totalCurrentHp = factionUnits.reduce((acc, u) => acc + u.hp, 0);
        if (totalMaxHp > 0) {
          const percent = (totalCurrentHp / totalMaxHp) * 100;
          shouldFire = percent <= event.trigger.value;
        }
      }

      if (shouldFire) {
        this.state.firedEventIds.push(event.id);
        this.triggerIntercept(event.id, event.duoduoHook);
      }
    }
  }

  private evaluateGameOver() {
    const activeFactions = new Set<string>();
    for (const u of this.state.units) {
      if (u.hp > 0) {
        activeFactions.add(u.factionId);
      }
    }

    if (activeFactions.size === 0) {
      this.state.status = 'gameover';
      this.addLog('Simulation Over: All factions eliminated.');
      this.pause();
    } else if (activeFactions.size === 1) {
      const winner = Array.from(activeFactions)[0];
      const name = this.config.factions[winner]?.name || winner;
      this.state.status = 'gameover';
      this.addLog(`Simulation Over: ${name} Wins!`);
      this.pause();
    }
  }
}
