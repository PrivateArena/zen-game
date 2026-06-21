import type { GameState, Unit, GameConfig, EntityConfig, DuoduoHook, Point2D } from '../types/game';

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
  },
  'fixed': (entity) => ({
    x: entity.layout.startX ?? 100,
    y: entity.layout.startY ?? 100,
  })
};

// Extensible Behavior Strategy pattern
export interface BehaviorStrategy {
  execute(unit: Unit, state: GameState, dt: number, waypoints?: Point2D[]): void;
}

export class AggressiveSeekStrategy implements BehaviorStrategy {
  execute(unit: Unit, state: GameState, dt: number): void {
    let closestEnemy: Unit | null = null;
    let minDistance = Infinity;

    for (const other of state.units) {
      if (other.factionId !== unit.factionId && other.hp > 0 && other.behavior !== 'empty_slot') {
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
        unit.x += (dx / minDistance) * unit.speed * dt;
        unit.y += (dy / minDistance) * unit.speed * dt;
        unit.statusText = `Moving to attack ${closestEnemy.id}`;
      } else {
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
      if (other.factionId !== unit.factionId && other.hp > 0 && other.behavior !== 'empty_slot') {
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
          unit.x += (dx / minDistance) * (unit.speed * 0.4) * dt;
          unit.y += (dy / minDistance) * (unit.speed * 0.4) * dt;
          unit.statusText = 'Bracing defensive formation';
        } else {
          unit.x += (dx / minDistance) * unit.speed * dt;
          unit.y += (dy / minDistance) * unit.speed * dt;
          unit.statusText = 'Advancing in phalanx';
        }
      } else {
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

// Tower Defense: Empty Slot Behavior
export class EmptySlotStrategy implements BehaviorStrategy {
  execute(unit: Unit): void {
    unit.statusText = 'Empty Slot';
    unit.targetId = undefined;
  }
}

// Tower Defense: Tower Attack Logic
export class TowerAttackStrategy implements BehaviorStrategy {
  execute(unit: Unit, state: GameState, dt: number): void {
    let closestEnemy: Unit | null = null;
    let minDistance = Infinity;

    for (const other of state.units) {
      if (other.factionId !== unit.factionId && other.hp > 0) {
        const isFly = other.id.includes('Harpy');
        
        // Ground and Bombard towers cannot target flyers
        if (unit.id.includes('Ground') && isFly) continue;
        if (unit.id.includes('Bombard') && isFly) continue;

        const dx = other.x - unit.x;
        const dy = other.y - unit.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < minDistance) {
          minDistance = dist;
          closestEnemy = other;
        }
      }
    }

    if (closestEnemy && minDistance <= unit.range) {
      unit.targetId = closestEnemy.id;

      let damageMultiplier = 1.0;
      const isArmor = closestEnemy.id.includes('Minotaur');

      if (unit.id.includes('AntiArmor') && isArmor) {
        damageMultiplier = 2.0;
      }
      if (unit.id.includes('Laser')) {
        damageMultiplier = 0.5; // Weaker generalist
      }
      if (unit.id.includes('Bombard')) {
        damageMultiplier = 0.5; // Weaker base damage, compensated by AOE
      }

      const damageApplied = unit.damage * damageMultiplier * dt;
      closestEnemy.hp = Math.max(0, closestEnemy.hp - damageApplied);
      unit.statusText = `Firing at ${closestEnemy.id.split('-').pop()}`;

      // Apply Slow aura effect
      if (unit.id.includes('Slow')) {
        closestEnemy.statusText = 'Chilled (Slowed)';
        (closestEnemy as any).isSlowed = true;
      }

      // Bombard splash damage to nearby ground enemies
      if (unit.id.includes('Bombard')) {
        const splashRadius = 80;
        for (const other of state.units) {
          if (other.factionId !== unit.factionId && other.hp > 0 && other.id !== closestEnemy.id) {
            const isOtherFly = other.id.includes('Harpy');
            if (isOtherFly) continue; // Splash doesn't hit flying units
            
            const sx = other.x - closestEnemy.x;
            const sy = other.y - closestEnemy.y;
            const sdist = Math.sqrt(sx * sx + sy * sy);
            if (sdist <= splashRadius) {
              other.hp = Math.max(0, other.hp - damageApplied * 0.5);
            }
          }
        }
      }

      if (closestEnemy.hp <= 0) {
        state.logs.unshift(`[COMBAT] Tower neutralized ${closestEnemy.id}!`);
      }
    } else {
      unit.targetId = undefined;
      unit.statusText = 'Scanning path...';
    }
  }
}

// Tower Defense: Enemy Path Advancement along Waypoints
export class EnemyPathStrategy implements BehaviorStrategy {
  execute(unit: Unit, state: GameState, dt: number, waypoints?: Point2D[]): void {
    if (!waypoints || waypoints.length === 0) return;

    const baseSpeed = unit.speed;
    let currentSpeed = baseSpeed;

    if ((unit as any).isSlowed) {
      currentSpeed = baseSpeed * 0.4;
      (unit as any).isSlowed = false; // Reset for next tick evaluation
    }

    if (unit.currentWaypointIndex === undefined) {
      unit.currentWaypointIndex = 0;
    }

    const targetNode = waypoints[unit.currentWaypointIndex];
    const dx = targetNode.x - unit.x;
    const dy = targetNode.y - unit.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const step = currentSpeed * dt;

    if (dist <= step) {
      unit.x = targetNode.x;
      unit.y = targetNode.y;

      if (unit.currentWaypointIndex < waypoints.length - 1) {
        unit.currentWaypointIndex++;
      } else {
        // Reached the Rome base! Leak lives
        unit.hp = 0;
        state.lives = Math.max(0, state.lives - 1);
        state.logs.unshift(`[BASE] Rome's defense breached by ${unit.id.split('-').pop()}!`);
      }
    } else {
      unit.x += (dx / dist) * step;
      unit.y += (dy / dist) * step;
      if (unit.statusText !== 'Chilled (Slowed)') {
        unit.statusText = 'Marching on Rome';
      }
    }
  }
}

export class BehaviorRegistry {
  private strategies = new Map<string, BehaviorStrategy>();

  constructor() {
    this.register('aggressive_seek', new AggressiveSeekStrategy());
    this.register('phalanx_hold', new PhalanxHoldStrategy());
    this.register('empty_slot', new EmptySlotStrategy());
    this.register('tower_attack', new TowerAttackStrategy());
    this.register('enemy_path', new EnemyPathStrategy());
  }

  register(key: string, strategy: BehaviorStrategy) {
    this.strategies.set(key, strategy);
  }

  get(key: string): BehaviorStrategy {
    const s = this.strategies.get(key);
    if (!s) {
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

// Mythic Roman Tower Defense config
const DEFAULT_CONFIG: GameConfig = {
  gameId: 'rome-aegis',
  title: 'ROME_AEGIS // MYTHIC_LIMES',
  viewport: { width: 800, height: 450, theme: 'cyber-grid' },
  factions: {
    towers: { id: 'towers', name: 'ROMAN DEFENDERS', color: '#3b82f6', spriteStyle: 'shield' },
    monsters: { id: 'monsters', name: 'MYTHIC HORDE', color: '#ef4444', spriteStyle: 'diamond' }
  },
  // S-Curve path for enemies to walk
  waypoints: [
    { x: 760, y: 225 },
    { x: 600, y: 100 },
    { x: 440, y: 350 },
    { x: 280, y: 100 },
    { x: 120, y: 350 },
    { x: 50,  y: 225 }
  ],
  entities: [
    // Pre-placed Built Towers (starting arsenal)
    {
      id: 'Ground-Castrum',
      faction: 'towers',
      count: 1,
      layout: { type: 'fixed', startX: 680, startY: 140 },
      stats: { hp: 500, damage: 65, speed: 0, range: 100 },
      behavior: 'tower_attack'
    },
    {
      id: 'Fly-Sagittarius',
      faction: 'towers',
      count: 1,
      layout: { type: 'fixed', startX: 420, startY: 180 },
      stats: { hp: 500, damage: 45, speed: 0, range: 150 },
      behavior: 'tower_attack'
    },
    // Empty Plot slots where player can build towers!
    {
      id: 'Slot-Plot-1',
      faction: 'towers',
      count: 1,
      layout: { type: 'fixed', startX: 600, startY: 220 },
      stats: { hp: 500, damage: 0, speed: 0, range: 0 },
      behavior: 'empty_slot'
    },
    {
      id: 'Slot-Plot-2',
      faction: 'towers',
      count: 1,
      layout: { type: 'fixed', startX: 500, startY: 100 },
      stats: { hp: 500, damage: 0, speed: 0, range: 0 },
      behavior: 'empty_slot'
    },
    {
      id: 'Slot-Plot-3',
      faction: 'towers',
      count: 1,
      layout: { type: 'fixed', startX: 340, startY: 280 },
      stats: { hp: 500, damage: 0, speed: 0, range: 0 },
      behavior: 'empty_slot'
    },
    {
      id: 'Slot-Plot-4',
      faction: 'towers',
      count: 1,
      layout: { type: 'fixed', startX: 200, startY: 200 },
      stats: { hp: 500, damage: 0, speed: 0, range: 0 },
      behavior: 'empty_slot'
    },
    {
      id: 'Slot-Plot-5',
      faction: 'towers',
      count: 1,
      layout: { type: 'fixed', startX: 100, startY: 100 },
      stats: { hp: 500, damage: 0, speed: 0, range: 0 },
      behavior: 'empty_slot'
    },

    // Invading Mythological Enemies
    {
      id: 'Satyr-Skirmisher',
      faction: 'monsters',
      count: 5,
      layout: { type: 'vertical-line', startX: 780, startY: 190, spacing: 25 },
      stats: { hp: 120, damage: 10, speed: 60, range: 0 },
      behavior: 'enemy_path',
      goldReward: 20
    },
    {
      id: 'Harpy-Scavenger',
      faction: 'monsters',
      count: 3,
      layout: { type: 'vertical-line', startX: 860, startY: 200, spacing: 25 },
      stats: { hp: 80, damage: 8, speed: 85, range: 0 },
      behavior: 'enemy_path',
      goldReward: 25
    },
    {
      id: 'Minotaur-Vanguard',
      faction: 'monsters',
      count: 2,
      layout: { type: 'vertical-line', startX: 920, startY: 210, spacing: 40 },
      stats: { hp: 200, damage: 25, speed: 38, range: 0 },
      behavior: 'enemy_path',
      goldReward: 45
    },
    {
      id: 'Cerberus-Pup',
      faction: 'monsters',
      count: 4,
      layout: { type: 'vertical-line', startX: 980, startY: 190, spacing: 20 },
      stats: { hp: 70, damage: 5, speed: 110, range: 0 },
      behavior: 'enemy_path',
      goldReward: 15
    },
    {
      id: 'Chimera-Boss',
      faction: 'monsters',
      count: 1,
      layout: { type: 'fixed', startX: 1060, startY: 225 },
      stats: { hp: 750, damage: 50, speed: 28, range: 0 },
      behavior: 'enemy_path',
      goldReward: 150
    }
  ],
  timelineEvents: [
    {
      id: 'defenses_midpoint_quiz',
      trigger: { type: 'faction_hp_percent', faction: 'monsters', value: 50 },
      duoduoHook: {
        type: 'quiz_challenge',
        quizId: 'marathon_tactics_01',
        onSuccess: { action: 'buff_faction', faction: 'towers', stat: 'damage', multiplier: 1.5 },
        onFailure: { action: 'buff_faction', faction: 'monsters', stat: 'speed', multiplier: 1.2 }
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
      logs: [`Limes Grid: ${config.title} online.`],
      firedEventIds: [],
      gold: 300, // Starting gold
      lives: 20, // Starting lives
      selectedSlotId: null
    };
    (window as any).simulationCore = this;
    this.spawnUnits();
  }

  private spawnUnits() {
    const units: Unit[] = [];
    for (const group of this.config.entities) {
      const layoutFn = LayoutRegistry[group.layout.type] ?? LayoutRegistry['fixed'];
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
          statusText: 'Standing ready',
          goldReward: group.goldReward,
          currentWaypointIndex: 0
        });
      }
    }
    this.state.units = units;
  }

  public selectSlot(slotId: string | null) {
    this.state.selectedSlotId = slotId;
    this.notify();
  }

  public purchaseTower(slotId: string, towerType: string, cost: number) {
    const unit = this.state.units.find(u => u.id === slotId);
    if (unit && unit.behavior === 'empty_slot' && this.state.gold >= cost) {
      this.state.gold -= cost;
      
      // Upgrade settings based on type
      let damage = 50;
      let range = 120;
      if (towerType === 'Ground') { damage = 65; range = 100; }
      else if (towerType === 'Fly') { damage = 45; range = 150; }
      else if (towerType === 'Laser') { damage = 35; range = 125; }
      else if (towerType === 'Bombard') { damage = 55; range = 140; }
      else if (towerType === 'AntiArmor') { damage = 60; range = 170; }
      else if (towerType === 'Slow') { damage = 5; range = 130; }

      // Mutate existing slot unit into a functioning tower
      unit.id = `${towerType}-${unit.id}`; // Add type to ID so rendering/behaviors recognize it
      unit.behavior = 'tower_attack';
      unit.damage = damage;
      unit.range = range;
      unit.statusText = `${towerType} Online`;

      this.state.selectedSlotId = null;
      this.addLog(`[ECONOMY] Built ${towerType} Tower for ${cost}g.`);
      this.notify();
      return true;
    }
    return false;
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
      firedEventIds: [...this.state.firedEventIds],
      gold: this.state.gold,
      lives: this.state.lives,
      selectedSlotId: this.state.selectedSlotId
    };
  }

  public start() {
    if (this.state.status === 'running') return;
    this.state.status = 'running';
    this.addLog('Defense network activated.');
    this.lastUpdateTime = performance.now();
    this.runLoop();
    this.notify();
  }

  public pause() {
    if (this.state.status !== 'running') return;
    this.state.status = 'paused';
    this.addLog('Defense network suspended.');
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
    this.state.logs = ['Defense system reset.'];
    this.state.firedEventIds = [];
    this.state.gold = 300;
    this.state.lives = 20;
    this.state.selectedSlotId = null;
    this.spawnUnits();
    this.notify();
  }

  public setSpeed(speed: number) {
    this.state.simulationSpeed = speed;
    this.addLog(`Time dilation set to ${speed}x.`);
    this.notify();
  }

  public onIntercept(handler: (detail: InterceptDetail) => void) {
    this.interceptHandler = handler;
  }

  private triggerIntercept(eventId: string, hook: DuoduoHook) {
    this.state.status = 'awaiting-interaction';
    this.addLog(`[INTERCEPT] Educational objective active: ${eventId}`);
    if (this.intervalId) {
      cancelAnimationFrame(this.intervalId);
      this.intervalId = null;
    }
    this.notify();

    const callbackDetail: InterceptDetail = {
      eventId,
      hook,
      resume: (result) => {
        this.applyRewardOrPenalty(result, hook);
        this.addLog(`[INTERCEPT] Gate sequence resolved.`);
        this.state.status = 'running';
        this.lastUpdateTime = performance.now();
        this.runLoop();
      }
    };

    if (this.interceptHandler) {
      this.interceptHandler(callbackDetail);
    } else {
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
            this.addLog(`[BUFF] ${outcome.faction} weapon damage boosted ${outcome.multiplier}x!`);
          }
          if (outcome.stat === 'speed') {
            u.speed *= outcome.multiplier;
            this.addLog(`[DEBUFF] ${outcome.faction} movement rate accelerated ${outcome.multiplier}x!`);
          }
        });
    }
  }

  public triggerDiagnosticPulse() {
    this.addLog('[DIAGNOSTIC] Vulcanite crystal discharge. Re-energizing static defenses.');
    for (const unit of this.state.units) {
      if (unit.factionId === 'towers' && unit.behavior !== 'empty_slot') {
        unit.range = Math.min(250, unit.range + 10);
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
        if (unit.goldReward && unit.goldReward > 0) {
          // Award gold once
          this.state.gold += unit.goldReward;
          this.addLog(`[ECONOMY] Earned +${unit.goldReward}g from defeating ${unit.id.split('-')[0]}`);
          unit.goldReward = 0; // prevent double claim
        }
        unit.statusText = 'Decommissioned';
        continue;
      }
      const strategy = this.behaviorRegistry.get(unit.behavior);
      strategy.execute(unit, this.state, dt, this.config.waypoints);
    }

    // Evaluate timeline triggers
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

    if (this.state.lives <= 0) {
      this.state.status = 'gameover';
      this.addLog('Simulation Terminated: Rome has fallen.');
      this.pause();
    } else if (!activeFactions.has('monsters')) {
      this.state.status = 'gameover';
      this.addLog('Simulation Terminated: Threat neutralized. ROME STANDS!');
      this.pause();
    }
  }
}
