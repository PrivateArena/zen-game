import 'phaser';
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
    // Generate simple pixel art textures dynamically for all factions in the configuration
    const config = this.simulationCore.getConfig();
    this.compileFactionTextures(config.factions);
  }

  public create(): void {
    const width = Number(this.game.config.width);
    const height = Number(this.game.config.height);

    // Create a cyber grid background
    this.add.grid(
      width / 2,
      height / 2,
      width,
      height,
      32,
      32,
      0x131722,
      1,
      0x1f293d,
      0.4
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
    this.add.text(15, 15, 'SIM_NET_V4.2 // READY', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#4e6185'
    }).setAlpha(0.7);
  }

  private compileFactionTextures(factions: Record<string, FactionConfig>) {
    for (const faction of Object.values(factions)) {
      const g = this.make.graphics();
      // Parse hex color string to number
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

    // Update or spawn sprites
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

      if (unit.hp <= 0) {
        sprite.setAlpha(0.3);
        sprite.setAngle(90);
        shadow.setVisible(false);
      } else {
        sprite.setAlpha(1);
        sprite.setAngle(0);
        shadow.setVisible(true);

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
    const textureKey = `${unit.factionId}-unit-tex`;
    const sprite = this.add.sprite(0, -8, textureKey);
    sprite.setOrigin(0.5, 0.5);

    // 2. Oval shadow
    const shadow = this.add.circle(0, 0, 6, 0x000000, 0.4);
    shadow.setScale(1.2, 0.4);

    // 3. Name Tag
    const nameTag = this.add.text(0, -22, unit.id.split('-').pop() || '', {
      fontFamily: 'monospace',
      fontSize: '8px',
      color: '#ffffff'
    }).setOrigin(0.5);

    return this.add.container(unit.x, unit.y, [sprite, shadow, nameTag]);
  }

  private drawUnitIndicators(unit: Unit, allUnits: Unit[], factions: Record<string, FactionConfig>) {
    // 1. Draw Target Line
    if (unit.targetId) {
      const target = allUnits.find(u => u.id === unit.targetId);
      if (target && target.hp > 0) {
        const faction = factions[unit.factionId];
        const hexColor = faction
          ? (faction.color.startsWith('#') ? parseInt(faction.color.slice(1), 16) : parseInt(faction.color, 16))
          : 0xffffff;

        const alpha = 0.5 + Math.random() * 0.4;
        
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

    // 2. Draw Health Bar
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
