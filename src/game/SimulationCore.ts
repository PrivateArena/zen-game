import type { GameState, GameConfig } from '../types/game';
import { CoreEngine } from '../engine/CoreEngine';
import { BehaviorRegistry } from '../engine/BehaviorRegistry';
import { RomeAegisConfig } from '../games/rome-aegis/config';
import {
  TowerAttackStrategy,
  EnemyPathStrategy,
  EmptySlotStrategy,
  BuildTowerAction,
  BUILD_TOWER_DEFINITION,
} from '../games/rome-aegis/behaviors';

export interface InterceptDetail {
  eventId: string;
  hook: any;
  resume: (result: { success: boolean }) => void;
}

export class SimulationCore {
  private engine: CoreEngine;
  private interceptHandler?: (detail: InterceptDetail) => void;

  constructor() {
    const registry = new BehaviorRegistry();
    registry.registerStrategy('tower_attack', TowerAttackStrategy);
    registry.registerStrategy('enemy_path', EnemyPathStrategy);
    registry.registerStrategy('empty_slot', EmptySlotStrategy);
    
    registry.registerAction('BUILD_TOWER', BuildTowerAction, BUILD_TOWER_DEFINITION);

    this.engine = new CoreEngine(RomeAegisConfig, registry);

    // Binds to both local and parent window context
    (window as any).simulationCore = this;
    (window as any).coreEngine = this.engine;
    if (window.parent) {
      (window.parent as any).simulationCore = this;
      (window.parent as any).coreEngine = this.engine;
    }

    // Screenshot function
    const captureFrame = async (): Promise<string> => {
      const canvases = document.querySelectorAll('canvas');
      if (canvases.length === 0) {
        throw new Error('No game canvas found.');
      }
      return canvases[0].toDataURL('image/png');
    };
    (window as any).captureGameFrame = captureFrame;
    if (window.parent) {
      (window.parent as any).captureGameFrame = captureFrame;
    }

    // 🚀 ZERO-FRICTION DOM-BASED AGENT EVENT BUS
    // Resolves all extension scripting and scope isolation issues completely
    document.addEventListener('zen-agent-request', async (e: any) => {
      const { action, payload } = e.detail || {};
      try {
        if (action === 'start') {
          this.start();
          document.dispatchEvent(new CustomEvent('zen-agent-response', { detail: { success: true, action } }));
        } else if (action === 'pause') {
          this.pause();
          document.dispatchEvent(new CustomEvent('zen-agent-response', { detail: { success: true, action } }));
        } else if (action === 'reset') {
          this.reset();
          document.dispatchEvent(new CustomEvent('zen-agent-response', { detail: { success: true, action } }));
        } else if (action === 'build') {
          const success = this.purchaseTower(payload.slotId, payload.type, payload.cost ?? 100);
          document.dispatchEvent(new CustomEvent('zen-agent-response', { detail: { success, action } }));
        } else if (action === 'get-state') {
          document.dispatchEvent(new CustomEvent('zen-agent-response', { detail: { success: true, action, state: this.getState() } }));
        } else if (action === 'screenshot') {
          const img = await captureFrame();
          document.dispatchEvent(new CustomEvent('zen-agent-response', { detail: { success: true, action, screenshot: img } }));
        }
      } catch (err: any) {
        document.dispatchEvent(new CustomEvent('zen-agent-response', { detail: { success: false, action, error: err.message } }));
      }
    });

    window.addEventListener('zen-game-intercept', (e: any) => {
      if (this.interceptHandler) {
        this.interceptHandler(e.detail);
      }
    });
  }

  public getState(): GameState {
    const s = this.engine.getState();
    const units = s.entities.map(e => ({
      id: e.id,
      factionId: e.factionId,
      x: e.x,
      y: e.y,
      hp: e.hp,
      maxHp: e.maxHp,
      damage: e.damage,
      speed: e.speed,
      range: e.range,
      behavior: e.behavior,
      targetId: e.targetId,
      statusText: e.statusText,
      currentWaypointIndex: e.components.currentWaypointIndex,
      goldReward: e.stats.goldReward ?? e.components.goldReward
    }));

    return {
      status: s.status,
      units,
      simulationSpeed: s.simulationSpeed,
      elapsedTime: s.elapsedTime,
      logs: s.logs,
      firedEventIds: s.firedEventIds,
      gold: s.globalStats.gold ?? 0,
      lives: s.globalStats.lives ?? 0,
      selectedSlotId: s.selectedSlotId
    };
  }

  public getConfig(): GameConfig {
    const cfg = this.engine.getContext().config;
    const entities = cfg.initialEntities.map(g => {
      const template = cfg.entityTemplates[g.template];
      return {
        id: g.customIdPrefix || g.template,
        faction: g.factionId,
        count: g.count,
        layout: {
          type: g.layout.type,
          startX: g.layout.startX,
          startY: g.layout.startY,
          spacing: g.layout.spacing,
          boundingBox: g.layout.boundingBox
        },
        stats: {
          hp: template.baseStats.hp,
          damage: template.baseStats.damage,
          speed: template.baseStats.speed,
          range: template.baseStats.range
        },
        behavior: template.behavior
      };
    });

    return {
      gameId: cfg.gameId,
      title: cfg.title,
      viewport: cfg.viewport,
      factions: cfg.factions,
      waypoints: cfg.waypoints,
      timelineEvents: cfg.timelineEvents,
      entities
    };
  }

  public selectSlot(slotId: string | null) {
    this.engine.selectSlot(slotId);
  }

  public purchaseTower(slotId: string, towerType: string, cost: number): boolean {
    return this.engine.dispatchAction({
      type: 'BUILD_TOWER',
      payload: { slotId, towerType, cost },
      timestamp: Date.now()
    });
  }

  public subscribe(listener: (state: GameState) => void) {
    return this.engine.subscribe(() => {
      listener(this.getState());
    });
  }

  public start() {
    this.engine.start();
  }

  public pause() {
    this.engine.pause();
  }

  public reset() {
    this.engine.reset();
  }

  public setSpeed(speed: number) {
    this.engine.setSpeed(speed);
  }

  public onIntercept(handler: (detail: InterceptDetail) => void) {
    this.interceptHandler = handler;
  }

  public triggerDiagnosticPulse() {
    this.engine.addLog('[DIAGNOSTIC] Vulcanite crystal discharge. Re-energizing static defenses.');
    const state = this.engine.getContext();
    for (const unit of state.entities.values()) {
      if (unit.factionId === 'towers' && unit.behavior !== 'empty_slot') {
        unit.range = Math.min(250, unit.range + 10);
      }
    }
    this.engine.notify();
  }

  public addLog(message: string) {
    this.engine.addLog(message);
    this.engine.notify();
  }

  public tick(dt: number) {
    this.engine.tick(dt);
  }
}
