import Phaser from 'phaser';
import { SimulationCore } from './SimulationCore';
import type { Unit, FactionConfig } from '../types/game';

export interface MainSceneConfig {
  simulationCore: SimulationCore;
}

export type SpriteDrawFn = (g: Phaser.GameObjects.Graphics, color: number) => void;

export const SpriteStyleRegistry: Record<string, SpriteDrawFn> = {
  diamond: (g, color) => {
    g.fillStyle(color, 1);
    g.fillRect(2, 2, 12, 12);
    g.fillStyle(0xffffff, 0.4);
    g.fillRect(4, 4, 8, 4); // Visor details
    g.lineStyle(1.5, 0xffffff, 1);
    g.strokeRect(2, 2, 12, 12);
  },
  shield: (g, color) => {
    g.fillStyle(color, 1);
    g.fillTriangle(8, 0, 16, 12, 0, 12);
    g.fillStyle(0xffffff, 0.4);
    g.fillTriangle(8, 3, 13, 11, 3, 11);
    g.lineStyle(1.5, 0xffffff, 1);
    g.strokeTriangle(8, 0, 16, 12, 0, 12);
  },
  plot: (g) => {
    g.lineStyle(2, 0x4e6185, 0.6);
    g.strokeCircle(8, 8, 7);
    g.fillStyle(0x1f293d, 0.8);
    g.fillCircle(8, 8, 7);
    g.lineStyle(1.5, 0x4e6185, 0.9);
    g.lineBetween(8, 5, 8, 11);
    g.lineBetween(5, 8, 11, 8);
  }
};

export class MainScene extends Phaser.Scene {
  private simulationCore!: SimulationCore;
  private sprites: Map<string, Phaser.GameObjects.Container> = new Map();
  private overlayGraphics!: Phaser.GameObjects.Graphics;
  private particleEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor() {
    super({ key: 'MainScene' });
  }

  public init(data: MainSceneConfig): void {
    this.simulationCore = data.simulationCore;
  }

  public preload(): void {
    const config = this.simulationCore.getConfig();
    this.compileFactionTextures(config.factions);

    // Compile build plot texture
    const g = this.make.graphics();
    SpriteStyleRegistry.plot(g, 0);
    g.generateTexture('plot-tex', 16, 16);
  }

  public create(): void {
    const width = Number(this.game.config.width);
    const height = Number(this.game.config.height);

    // Cyber grid background
    this.add.grid(
      width / 2,
      height / 2,
      width,
      height,
      32,
      32,
      0x0f172a,
      1,
      0x1e293b,
      0.3
    );

    // Dynamic overlay graphics
    this.overlayGraphics = this.add.graphics();

    // Create simple circular particles
    const particleGraphic = this.make.graphics();
    particleGraphic.fillStyle(0xffffff, 1);
    particleGraphic.fillCircle(2, 2, 2);
    particleGraphic.generateTexture('particle-dot', 4, 4);

    // Set up particle emitter
    this.particleEmitter = this.add.particles(0, 0, 'particle-dot', {
      lifespan: 300,
      speed: { min: 50, max: 150 },
      scale: { start: 1, end: 0 },
      blendMode: 'ADD',
      emitting: false
    });

    // Watermark
    this.add.text(15, 15, 'LIMES_NET // ACTIVE', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#64748b'
    }).setAlpha(0.6);

    // Clicking empty space deselects build slots
    this.input.on('pointerdown', () => {
      this.simulationCore.selectSlot(null);
    });
  }

  private compileFactionTextures(factions: Record<string, FactionConfig>) {
    for (const faction of Object.values(factions)) {
      const g = this.make.graphics();
      const hexColor = faction.color.startsWith('#')
        ? parseInt(faction.color.slice(1), 16)
        : parseInt(faction.color, 16);

      const draw = SpriteStyleRegistry[faction.spriteStyle] ?? SpriteStyleRegistry.diamond;
      draw(g, hexColor);
      g.generateTexture(`${faction.id}-unit-tex`, 16, 16);
    }
  }

  public update(): void {
    if (!this.simulationCore) return;

    const state = this.simulationCore.getState();
    const config = this.simulationCore.getConfig();
    const units = state.units;
    const activeIds = new Set<string>();

    // Reset overlay drawing
    this.overlayGraphics.clear();

    // 1. Draw Road Path
    if (config.waypoints && config.waypoints.length > 0) {
      // Road path background
      this.overlayGraphics.lineStyle(28, 0x1e293b, 1.0); // Slate-800
      this.overlayGraphics.beginPath();
      this.overlayGraphics.moveTo(config.waypoints[0].x, config.waypoints[0].y);
      for (let i = 1; i < config.waypoints.length; i++) {
        this.overlayGraphics.lineTo(config.waypoints[i].x, config.waypoints[i].y);
      }
      this.overlayGraphics.strokePath();

      // Road path inner track
      this.overlayGraphics.lineStyle(24, 0x0f172a, 1.0); // Slate-900
      this.overlayGraphics.beginPath();
      this.overlayGraphics.moveTo(config.waypoints[0].x, config.waypoints[0].y);
      for (let i = 1; i < config.waypoints.length; i++) {
        this.overlayGraphics.lineTo(config.waypoints[i].x, config.waypoints[i].y);
      }
      this.overlayGraphics.strokePath();

      // Road centerline
      this.overlayGraphics.lineStyle(2, 0x334155, 0.4); // center guide
      this.overlayGraphics.beginPath();
      this.overlayGraphics.moveTo(config.waypoints[0].x, config.waypoints[0].y);
      for (let i = 1; i < config.waypoints.length; i++) {
        this.overlayGraphics.lineTo(config.waypoints[i].x, config.waypoints[i].y);
      }
      this.overlayGraphics.strokePath();
    }

    // 2. Draw Highlight Ring around selected build slot
    if (state.selectedSlotId) {
      const selectedSlot = units.find(u => u.id === state.selectedSlotId);
      if (selectedSlot) {
        this.overlayGraphics.lineStyle(2, 0x6366f1, 0.8); // Glowing indigo
        this.overlayGraphics.strokeCircle(selectedSlot.x, selectedSlot.y, 20);
      }
    }

    // 3. Update or spawn sprites
    for (const unit of units) {
      activeIds.add(unit.id);
      let container = this.sprites.get(unit.id);

      if (!container) {
        container = this.createUnitContainer(unit);
        this.sprites.set(unit.id, container);
      }

      // Update positions
      container.setPosition(unit.x, unit.y);

      // Extract parts
      const sprite = container.getAt(0) as Phaser.GameObjects.Sprite;
      const shadow = container.getAt(1) as Phaser.GameObjects.Arc;
      const rangeIndicator = container.getAt(3) as Phaser.GameObjects.Arc;

      // Handle selection highlights on range indicators
      if (state.selectedSlotId === unit.id && unit.behavior !== 'empty_slot') {
        rangeIndicator.setVisible(true);
      } else {
        rangeIndicator.setVisible(false);
      }

      if (unit.hp <= 0) {
        sprite.setAlpha(0.3);
        sprite.setAngle(90);
        shadow.setVisible(false);
      } else {
        sprite.setAlpha(1);
        sprite.setAngle(0);
        shadow.setVisible(unit.behavior !== 'empty_slot');

        // Draw indicators (e.g. targeting lines, health bars)
        this.drawUnitIndicators(unit, units, config.factions);
      }
    }

    // Clean up orphaned sprites (prevent leak)
    for (const [id, container] of this.sprites.entries()) {
      if (!activeIds.has(id)) {
        container.destroy();
        this.sprites.delete(id);
      }
    }
  }

  private createUnitContainer(unit: Unit): Phaser.GameObjects.Container {
    // 1. Sprite base texture lookup
    const isSlot = unit.behavior === 'empty_slot';
    const textureKey = isSlot ? 'plot-tex' : `${unit.factionId}-unit-tex`;
    
    // Fallback if dynamic texture compilation has not finished or doesn't exist
    const sprite = this.add.sprite(0, -8, this.textures.exists(textureKey) ? textureKey : 'plot-tex');
    sprite.setOrigin(0.5, 0.5);

    // 2. Oval shadow
    const shadow = this.add.circle(0, 0, 6, 0x000000, 0.4);
    shadow.setScale(1.2, 0.4);

    // 3. Name Tag
    const displayName = isSlot ? 'Plot' : (unit.id.split('-').pop() || '');
    const nameTag = this.add.text(0, -22, displayName, {
      fontFamily: 'monospace',
      fontSize: '8px',
      color: isSlot ? '#475569' : '#ffffff'
    }).setOrigin(0.5);

    // 4. Range ring (visible only when clicked/selected)
    const rangeIndicator = this.add.circle(0, 0, unit.range, 0x6366f1, 0.08);
    rangeIndicator.setStrokeStyle(1.5, 0x6366f1, 0.3);
    rangeIndicator.setVisible(false);

    const container = this.add.container(unit.x, unit.y, [sprite, shadow, nameTag, rangeIndicator]);
    
    // Make unit sprite interactive to ensure reliable hitbox capture in Phaser
    sprite.setInteractive({ useHandCursor: true });
    sprite.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pointer.event.stopPropagation();
      this.simulationCore.selectSlot(unit.id);
    });

    return container;
  }

  private drawUnitIndicators(unit: Unit, allUnits: Unit[], factions: Record<string, FactionConfig>) {
    if (unit.behavior === 'empty_slot') return;

    // 1. Draw Target Line
    if (unit.targetId) {
      const target = allUnits.find(u => u.id === unit.targetId);
      if (target && target.hp > 0) {
        const faction = factions[unit.factionId];
        const hexColor = faction
          ? (faction.color.startsWith('#') ? parseInt(faction.color.slice(1), 16) : parseInt(faction.color, 16))
          : 0xffffff;

        const alpha = 0.6 + Math.random() * 0.4;
        
        this.overlayGraphics.lineStyle(1.5, hexColor, alpha);
        this.overlayGraphics.lineBetween(unit.x, unit.y - 8, target.x, target.y - 8);

        if (this.simulationCore.getState().status === 'running' && Math.random() < 0.2) {
          this.particleEmitter.emitParticle(
            1,
            target.x + (Math.random() - 0.5) * 8,
            target.y - 8 + (Math.random() - 0.5) * 8
          );
        }
      }
    }

    // 2. Draw Health Bar (only for monsters, towers are static structures)
    if (unit.factionId === 'monsters') {
      const barWidth = 20;
      const barHeight = 3;
      const barX = unit.x - barWidth / 2;
      const barY = unit.y - 18;

      this.overlayGraphics.fillStyle(0x2d3748, 1);
      this.overlayGraphics.fillRect(barX, barY, barWidth, barHeight);

      const pct = unit.hp / unit.maxHp;
      const hpColor = pct > 0.5 ? 0x10b981 : pct > 0.25 ? 0xf59e0b : 0xef4444;
      this.overlayGraphics.fillStyle(hpColor, 1);
      this.overlayGraphics.fillRect(barX, barY, barWidth * pct, barHeight);
    }
  }
}
