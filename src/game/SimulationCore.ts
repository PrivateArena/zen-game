import type { GameState, GameConfig, ShopCard, Unit, GameStatus } from '../types/game';
import { CoreEngine } from '../engine/CoreEngine';
import { BehaviorRegistry } from '../engine/BehaviorRegistry';
import { RomeAutobattleConfig } from '../games/rome-autobattle/config';
import { SeekAndDestroyStrategy, gridToPixel } from '../games/rome-autobattle/behaviors';

export interface InterceptDetail {
  eventId: string;
  hook: any;
  resume: (result: { success: boolean }) => void;
}

const UNIT_POOL = [
  { name: 'Gladiator-Secutor', type: 'Gladiator-Secutor', cost: 1, traits: ['Gladiator', 'Soldier'] },
  { name: 'Gladiator-Retiarius', type: 'Gladiator-Retiarius', cost: 2, traits: ['Gladiator', 'Beast'] },
  { name: 'Gladiator-Murmillo', type: 'Gladiator-Murmillo', cost: 3, traits: ['Gladiator', 'Armored'] },
  { name: 'Mythic-Harpy', type: 'Mythic-Harpy', cost: 1, traits: ['Mythic', 'Fly'] },
  { name: 'Mythic-Satyr', type: 'Mythic-Satyr', cost: 2, traits: ['Mythic', 'Beast'] },
  { name: 'Mythic-Minotaur', type: 'Mythic-Minotaur', cost: 3, traits: ['Mythic', 'Armored'] },
  { name: 'Mythic-Centaur', type: 'Mythic-Centaur', cost: 4, traits: ['Mythic', 'Beast'] },
  { name: 'Soldier-Legionary', type: 'Soldier-Legionary', cost: 1, traits: ['Soldier', 'Armored'] },
  { name: 'Soldier-Centurion', type: 'Soldier-Centurion', cost: 3, traits: ['Soldier', 'Officer'] }
];

export class SimulationCore {
  private engine: CoreEngine;
  private interceptHandler?: (detail: InterceptDetail) => void;

  // Auto-Battler states
  private phase: GameStatus = 'planning';
  private roundIndex: number = 1;
  private level: number = 1;
  private xp: number = 0;
  private streak: number = 0;
  private gold: number = 15;
  private lives: number = 20;
  private shopCards: (ShopCard | null)[] = [];
  private planningTimer: number = 30; // 30s planning phase
  private combatTimer: number = 0;
  private lastRoundWon: boolean | null = null;

  // Saved board layout positions before combat starts
  private savedPositions: Map<string, { boardX: number; boardY: number }> = new Map();

  constructor() {
    const registry = new BehaviorRegistry();
    registry.registerStrategy('seek_and_destroy', SeekAndDestroyStrategy);
    
    this.engine = new CoreEngine(RomeAutobattleConfig, registry);

    // Initial Shop Roll
    this.rerollShop(true);

    // Binds to window contexts
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

    // Agent Event Bus
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
    const units: Unit[] = s.entities.map(e => ({
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
      boardX: e.components.boardX ?? 0,
      boardY: e.components.boardY ?? 0,
      isBench: e.components.isBench ?? false,
      starLevel: e.components.starLevel ?? 1,
      traits: e.components.traits ?? []
    }));

    return {
      status: this.phase,
      units,
      simulationSpeed: s.simulationSpeed,
      elapsedTime: this.planningTimer, // Expose timer in elapsedTime
      logs: s.logs,
      firedEventIds: s.firedEventIds,
      gold: this.gold,
      lives: this.lives,
      selectedSlotId: s.selectedSlotId,
      roundIndex: this.roundIndex,
      level: this.level,
      xp: this.xp,
      shopCards: this.shopCards.filter((c): c is ShopCard => c !== null),
      streak: this.streak
    };
  }

  public getConfig(): GameConfig {
    const cfg = this.engine.getContext().config;
    return {
      gameId: cfg.gameId,
      title: cfg.title,
      viewport: cfg.viewport,
      factions: cfg.factions,
      waypoints: cfg.waypoints,
      timelineEvents: cfg.timelineEvents,
      entities: []
    };
  }

  public start() {
    this.engine.start();
  }

  public pause() {
    this.engine.pause();
  }

  public reset() {
    this.phase = 'planning';
    this.roundIndex = 1;
    this.level = 1;
    this.xp = 0;
    this.streak = 0;
    this.gold = 15;
    this.lives = 20;
    this.planningTimer = 30;
    this.combatTimer = 0;
    this.lastRoundWon = null;
    this.engine.reset();
    // Clear entities map directly
    this.engine.getContext().entities.clear();
    this.rerollShop(true);
    this.addLog('Auto-Battler Arena reset. Good luck Commander!');
  }

  public setSpeed(speed: number) {
    this.engine.setSpeed(speed);
  }

  public onIntercept(handler: (detail: InterceptDetail) => void) {
    this.interceptHandler = handler;
  }

  public triggerDiagnosticPulse() {
    this.addLog('[DIAGNOSTIC] Gladiator morale boosted! Gladiators roar.');
    const ctx = this.engine.getContext();
    for (const unit of ctx.entities.values()) {
      if (unit.factionId === 'towers' && unit.components.traits?.includes('Gladiator')) {
        unit.hp = Math.min(unit.maxHp, unit.hp + 50);
      }
    }
    this.engine.notify();
  }

  public addLog(message: string) {
    this.engine.addLog(message);
    this.engine.notify();
  }

  // Shop and Economy Mechanics
  public rerollShop(free: boolean = false) {
    if (!free && this.gold < 2) {
      this.addLog('[ECONOMY] Not enough gold to reroll shop.');
      return;
    }
    if (!free) this.gold -= 2;

    this.shopCards = [];
    for (let i = 0; i < 5; i++) {
      const item = UNIT_POOL[Math.floor(Math.random() * UNIT_POOL.length)];
      this.shopCards.push({
        id: `card-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 4)}`,
        name: item.name.split('-')[1],
        type: item.type,
        cost: item.cost,
        traits: item.traits
      });
    }
    this.engine.notify();
  }

  public buyXp() {
    if (this.gold < 4) {
      this.addLog('[ECONOMY] Not enough gold to buy XP.');
      return;
    }
    this.gold -= 4;
    this.xp += 4;
    
    // Check level up (e.g. Lvl 1->2: 2XP, 2->3: 6XP, 3->4: 10XP, 4->5: 18XP, 5->6: 30XP)
    const xpRequirements = [0, 0, 2, 6, 10, 18, 30, 46, 68, 100];
    while (this.level < 9 && this.xp >= xpRequirements[this.level + 1]) {
      this.xp -= xpRequirements[this.level + 1];
      this.level++;
      this.addLog(`[SYSTEM] Level Up! You are now Level ${this.level}. Max units increased.`);
    }
    this.engine.notify();
  }

  public buyUnit(cardId: string): boolean {
    const cardIndex = this.shopCards.findIndex(c => c && c.id === cardId);
    if (cardIndex === -1) return false;
    const card = this.shopCards[cardIndex]!;

    if (this.gold < card.cost) {
      this.addLog('[ECONOMY] Not enough gold to buy unit.');
      return false;
    }

    // Find empty slot on bench (0 to 7)
    const ctx = this.engine.getContext();
    const benchSlots = new Array(8).fill(false);
    for (const unit of ctx.entities.values()) {
      if (unit.factionId === 'towers' && unit.components.isBench) {
        benchSlots[unit.components.boardX] = true;
      }
    }

    const emptySlotIndex = benchSlots.findIndex(occupied => !occupied);
    if (emptySlotIndex === -1) {
      this.addLog('[GRID] Bench is full! Sell a unit first.');
      return false;
    }

    // Deduct gold & consume card
    this.gold -= card.cost;
    this.shopCards[cardIndex] = null;

    // Spawn unit
    const template = RomeAutobattleConfig.entityTemplates[card.type];
    const unitId = `${card.type}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    const pos = gridToPixel(emptySlotIndex, 0, true);

    ctx.entities.set(unitId, {
      id: unitId,
      type: card.type,
      factionId: 'towers',
      x: pos.x,
      y: pos.y,
      hp: template.baseStats.hp,
      maxHp: template.baseStats.hp,
      damage: template.baseStats.damage,
      speed: template.baseStats.speed,
      range: template.baseStats.range,
      behavior: 'seek_and_destroy',
      statusText: 'Standing ready',
      tags: [...template.tags],
      stats: { ...template.baseStats },
      components: {
        boardX: emptySlotIndex,
        boardY: 0,
        isBench: true,
        starLevel: 1,
        traits: [...card.traits]
      }
    });

    this.addLog(`[SHOP] Purchased ${card.name} for ${card.cost}g.`);
    
    // Check merges
    this.checkMerges(card.type, 1);
    this.engine.notify();
    return true;
  }

  private checkMerges(unitType: string, starLevel: number) {
    if (starLevel >= 3) return;

    const ctx = this.engine.getContext();
    const matches: Entity[] = [];
    for (const unit of ctx.entities.values()) {
      if (unit.factionId === 'towers' && unit.type === unitType && unit.components.starLevel === starLevel) {
        matches.push(unit);
      }
    }

    if (matches.length >= 3) {
      // Keep the first one, delete the other two
      const survivor = matches[0];
      const toRemove = matches.slice(1);

      for (const unit of toRemove) {
        ctx.entities.delete(unit.id);
      }

      // Upgrade stats
      const nextStar = starLevel + 1;
      survivor.components.starLevel = nextStar;

      const template = RomeAutobattleConfig.entityTemplates[unitType];
      if (nextStar === 2) {
        survivor.maxHp = template.baseStats.hp * 2;
        survivor.damage = template.baseStats.damage * 1.5;
      } else if (nextStar === 3) {
        survivor.maxHp = template.baseStats.hp * 4;
        survivor.damage = template.baseStats.damage * 2.5;
      }
      survivor.hp = survivor.maxHp;

      this.addLog(`[UPGRADE] Combined three ${starLevel}★ units into a ${nextStar}★ ${unitType.split('-').pop()}!`);

      // Recurse for higher star levels
      this.checkMerges(unitType, nextStar);
    }
  }

  public sellUnit(unitId: string) {
    const ctx = this.engine.getContext();
    const unit = ctx.entities.get(unitId);
    if (!unit || unit.factionId !== 'towers') return;

    const refund = unit.components.starLevel === 1 ? 1 : unit.components.starLevel === 2 ? 3 : 5;
    this.gold += refund;
    ctx.entities.delete(unitId);
    this.addLog(`[SHOP] Sold unit for ${refund}g.`);
    this.engine.notify();
  }

  public moveUnit(unitId: string, targetX: number, targetY: number, targetIsBench: boolean) {
    if (this.phase !== 'planning') {
      this.addLog('[GRID] Can only move units during Planning Phase.');
      return;
    }

    const ctx = this.engine.getContext();
    const unit = ctx.entities.get(unitId);
    if (!unit || unit.factionId !== 'towers') return;

    // Check level limits on battlefield placement
    if (!targetIsBench) {
      let currentBoardCount = 0;
      for (const u of ctx.entities.values()) {
        if (u.factionId === 'towers' && !u.components.isBench && u.id !== unitId) {
          currentBoardCount++;
        }
      }
      if (currentBoardCount >= this.level) {
        this.addLog(`[GRID] Max deployed units is limited by your Level (${this.level}).`);
        return;
      }
    }

    // Check swap/collision
    let swapUnit: Entity | null = null;
    for (const other of ctx.entities.values()) {
      if (other.factionId === 'towers' && other.id !== unitId) {
        if (other.components.isBench === targetIsBench && other.components.boardX === targetX && other.components.boardY === targetY) {
          swapUnit = other;
          break;
        }
      }
    }

    if (swapUnit) {
      // Swap coordinates
      swapUnit.components.boardX = unit.components.boardX;
      swapUnit.components.boardY = unit.components.boardY;
      swapUnit.components.isBench = unit.components.isBench;
      const swapPos = gridToPixel(swapUnit.components.boardX, swapUnit.components.boardY, swapUnit.components.isBench);
      swapUnit.x = swapPos.x;
      swapUnit.y = swapPos.y;
    }

    // Set new coordinates for dragged unit
    unit.components.boardX = targetX;
    unit.components.boardY = targetY;
    unit.components.isBench = targetIsBench;
    const pos = gridToPixel(targetX, targetY, targetIsBench);
    unit.x = pos.x;
    unit.y = pos.y;

    this.engine.notify();
  }

  public selectSlot(slotId: string | null) {
    this.engine.selectSlot(slotId);
  }

  public subscribe(listener: (state: GameState) => void) {
    return this.engine.subscribe(() => {
      listener(this.getState());
    });
  }

  // State Machine Phase Controllers
  public startRound() {
    if (this.phase !== 'planning') return;
    this.startCombat();
  }

  private startCombat() {
    this.phase = 'combat';
    this.combatTimer = 45; // Max 45 seconds combat
    this.addLog(`[COMBAT] Round ${this.roundIndex} Arena Battle Commencing!`);

    const ctx = this.engine.getContext();

    // 1. Calculate active synergies/traits & apply buffs
    const activeTraits = new Map<string, number>();
    const boardUnitNames = new Set<string>(); // unique units

    for (const u of ctx.entities.values()) {
      if (u.factionId === 'towers' && !u.components.isBench) {
        boardUnitNames.add(u.type);
      }
    }

    for (const type of boardUnitNames) {
      const template = RomeAutobattleConfig.entityTemplates[type];
      for (const tag of template.tags) {
        const key = tag.charAt(0).toUpperCase() + tag.slice(1);
        activeTraits.set(key, (activeTraits.get(key) || 0) + 1);
      }
    }

    // Logs synergies
    activeTraits.forEach((count, trait) => {
      if (trait === 'Gladiator' && count >= 3) {
        this.addLog(`[SYNERGY] Gladiator (3) Activated! +20% Attack Speed.`);
      }
      if (trait === 'Mythic' && count >= 2) {
        this.addLog(`[SYNERGY] Mythic (2) Activated! +100 HP.`);
      }
      if (trait === 'Soldier' && count >= 2) {
        this.addLog(`[SYNERGY] Soldier (2) Activated! +10 Damage.`);
      }
    });

    // Save positions, reset HP, and apply buffs
    this.savedPositions.clear();
    for (const u of ctx.entities.values()) {
      if (u.factionId === 'towers') {
        if (!u.components.isBench) {
          this.savedPositions.set(u.id, { boardX: u.components.boardX, boardY: u.components.boardY });
          
          // Re-apply buffs based on traits
          let hpBuff = 0;
          let dmgBuff = 0;
          let speedBuff = 1.0;

          if (activeTraits.get('Gladiator')! >= 3 && u.components.traits.includes('Gladiator')) {
            speedBuff = 1.2;
          }
          if (activeTraits.get('Mythic')! >= 2 && u.components.traits.includes('Mythic')) {
            hpBuff = 100;
          }
          if (activeTraits.get('Soldier')! >= 2 && u.components.traits.includes('Soldier')) {
            dmgBuff = 10;
          }

          u.maxHp = (RomeAutobattleConfig.entityTemplates[u.type].baseStats.hp * (u.components.starLevel === 1 ? 1 : u.components.starLevel === 2 ? 2 : 4)) + hpBuff;
          u.damage = (RomeAutobattleConfig.entityTemplates[u.type].baseStats.damage * (u.components.starLevel === 1 ? 1 : u.components.starLevel === 2 ? 1.5 : 2.5)) + dmgBuff;
          u.components.attackSpeedMultiplier = speedBuff;
          u.hp = u.maxHp;
        } else {
          u.hp = u.maxHp;
        }
      }
    }

    // 2. Spawn opposing mirror AI team
    for (const u of ctx.entities.values()) {
      if (u.factionId === 'towers' && !u.components.isBench) {
        const mirrorId = `mirror-${u.id}`;
        const mirrorX = u.components.boardX;
        const mirrorY = 7 - u.components.boardY; // invert board y coordinate
        const pos = gridToPixel(mirrorX, mirrorY, false);

        ctx.entities.set(mirrorId, {
          id: mirrorId,
          type: u.type,
          factionId: 'monsters',
          x: pos.x,
          y: pos.y,
          hp: u.maxHp,
          maxHp: u.maxHp,
          damage: u.damage,
          speed: u.speed,
          range: u.range,
          behavior: 'seek_and_destroy',
          statusText: 'Engaging enemies',
          tags: [...u.tags],
          stats: { ...u.stats },
          components: {
            boardX: mirrorX,
            boardY: mirrorY,
            isBench: false,
            starLevel: u.components.starLevel,
            traits: [...u.components.traits]
          }
        });
      }
    }

    // Start simulation ticks
    this.engine.start();
    this.engine.notify();
  }

  private resolveRound() {
    this.phase = 'resolve';
    this.engine.pause();

    const ctx = this.engine.getContext();
    
    // Count alive entities on board
    let playerAlive = 0;
    let enemyAlive = 0;

    for (const u of ctx.entities.values()) {
      if (u.hp > 0 && !u.components.isBench) {
        if (u.factionId === 'towers') playerAlive++;
        if (u.factionId === 'monsters') enemyAlive++;
      }
    }

    // Calculate win/loss
    const playerWon = playerAlive > 0 && enemyAlive === 0;
    this.lastRoundWon = playerWon;

    if (playerWon) {
      this.streak = this.streak >= 0 ? this.streak + 1 : 1;
      this.addLog(`[ARENA] VICTORY! Streak: ${this.streak}`);
    } else {
      // Calculate direct player damage
      const baseDamage = 2;
      const damageTaken = enemyAlive + baseDamage;
      this.lives = Math.max(0, this.lives - damageTaken);
      this.streak = this.streak <= 0 ? this.streak - 1 : -1;
      this.addLog(`[ARENA] DEFEATED! Lost ${damageTaken} lives. Remaining lives: ${this.lives}`);
    }

    // Check Game Over
    if (this.lives <= 0) {
      this.phase = 'gameover';
      this.addLog('[ARENA] Game Over. Your army was defeated by the Senate.');
      this.engine.notify();
      return;
    }

    // Give gold rewards
    const baseGold = 5;
    const interestGold = Math.min(5, Math.floor(this.gold / 10));
    let streakGold = 0;
    if (Math.abs(this.streak) >= 5) streakGold = 3;
    else if (Math.abs(this.streak) >= 3) streakGold = 2;
    else if (Math.abs(this.streak) >= 2) streakGold = 1;

    const goldEarned = baseGold + interestGold + streakGold;
    this.gold += goldEarned;

    this.addLog(`[ECONOMY] +${goldEarned}g (Base: 5, Interest: ${interestGold}, Streak: ${streakGold})`);

    // Clean up combat entities
    // Remove monsters
    for (const [id, u] of ctx.entities.entries()) {
      if (u.factionId === 'monsters') {
        ctx.entities.delete(id);
      }
    }

    // Restore player board positions & full HP
    for (const u of ctx.entities.values()) {
      if (u.factionId === 'towers') {
        u.hp = u.maxHp;
        u.targetId = undefined;
        if (!u.components.isBench) {
          const original = this.savedPositions.get(u.id);
          if (original) {
            u.components.boardX = original.boardX;
            u.components.boardY = original.boardY;
          }
          const pos = gridToPixel(u.components.boardX, u.components.boardY, false);
          u.x = pos.x;
          u.y = pos.y;
        }
      }
    }

    // Increment round, refresh shop, transition back to planning
    this.roundIndex++;
    this.rerollShop(true);
    this.planningTimer = 30;
    this.phase = 'planning';
    this.engine.notify();
  }

  public tick(dt: number) {
    if (this.phase === 'gameover') return;

    if (this.phase === 'planning') {
      this.planningTimer -= dt * this.engine.getSpeed();
      if (this.planningTimer <= 0) {
        this.startCombat();
      }
      this.engine.notify();
    } else if (this.phase === 'combat') {
      // Tick combat logic inside core engine
      this.engine.tick(dt);
      
      this.combatTimer -= dt * this.engine.getSpeed();

      // Check if combat has completed (one side wiped or timer finished)
      const ctx = this.engine.getContext();
      let playerAlive = 0;
      let enemyAlive = 0;

      for (const u of ctx.entities.values()) {
        if (u.hp > 0 && !u.components.isBench) {
          if (u.factionId === 'towers') playerAlive++;
          if (u.factionId === 'monsters') enemyAlive++;
        }
      }

      if (playerAlive === 0 || enemyAlive === 0 || this.combatTimer <= 0) {
        this.resolveRound();
      }
    }
  }
}
