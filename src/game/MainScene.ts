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
    g.fillRect(-6, -6, 12, 12);
    g.fillStyle(0xffffff, 0.4);
    g.fillRect(-4, -4, 8, 4); // Visor details
    g.lineStyle(1.5, 0xffffff, 1);
    g.strokeRect(-6, -6, 12, 12);
  },
  shield: (g, color) => {
    g.fillStyle(color, 1);
    g.fillTriangle(0, -8, 8, 4, -8, 4);
    g.fillStyle(0xffffff, 0.4);
    g.fillTriangle(0, -5, 5, 3, -5, 3);
    g.lineStyle(1.5, 0xffffff, 1);
    g.strokeTriangle(0, -8, 8, 4, -8, 4);
  }
};

export class MainScene extends Phaser.Scene {
  private simulationCore!: SimulationCore;
  private sprites: Map<string, Phaser.GameObjects.Container> = new Map();
  private overlayGraphics!: Phaser.GameObjects.Graphics;
  private particleEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;

  // Dragging state
  private dragActive: boolean = false;
  private dragUnitId: string | null = null;
  private dragGhostX: number = 0;
  private dragGhostY: number = 0;

  constructor() {
    super({ key: 'MainScene' });
  }

  public init(data: MainSceneConfig): void {
    this.simulationCore = data.simulationCore;
  }

  public preload(): void {
    const config = this.simulationCore.getConfig();
    this.compileFactionTextures(config.factions);
  }

  public create(): void {
    const width = Number(this.game.config.width);
    const height = Number(this.game.config.height);

    // Dark cyberpunk arena background
    this.add.grid(
      width / 2,
      height / 2,
      width,
      height,
      40,
      40,
      0x0a0f1d,
      1,
      0x1e293b,
      0.15
    );

    // Dynamic overlay graphics
    this.overlayGraphics = this.add.graphics();

    // Setup simple circular particles
    const particleGraphic = this.make.graphics();
    particleGraphic.fillStyle(0xffffff, 1);
    particleGraphic.fillCircle(2, 2, 2);
    particleGraphic.generateTexture('particle-dot', 4, 4);

    this.particleEmitter = this.add.particles(0, 0, 'particle-dot', {
      lifespan: 300,
      speed: { min: 50, max: 150 },
      scale: { start: 1, end: 0 },
      blendMode: 'ADD',
      emitting: false
    });

    // Arena Title / Watermark
    this.add.text(15, 15, 'SENATE_ARENA // CONFLICT_NET', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#475569'
    }).setAlpha(0.6);

    // Drag events setup
    this.input.on('dragstart', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Container) => {
      const unitId = gameObject.getData('unitId');
      if (unitId && this.simulationCore.getState().status === 'planning') {
        this.dragActive = true;
        this.dragUnitId = unitId;
        gameObject.setAlpha(0.7);
        // Bring to front
        this.children.bringToTop(gameObject);
      }
    });

    this.input.on('drag', (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Container) => {
      if (this.dragActive) {
        gameObject.x = pointer.x;
        gameObject.y = pointer.y;

        // Update snap preview ghost coordinates
        this.dragGhostX = Math.floor((pointer.x - 240) / 40);
        
        const isBench = pointer.y >= 355 && pointer.y <= 415;
        if (isBench) {
          this.dragGhostY = 8; // represents Bench Y
        } else {
          this.dragGhostY = Math.floor((pointer.y - 40) / 40);
        }
      }
    });

    this.input.on('dragend', (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Container) => {
      if (this.dragActive && this.dragUnitId) {
        this.dragActive = false;
        gameObject.setAlpha(1.0);

        const targetX = Math.floor((pointer.x - 240) / 40);
        const isBenchY = pointer.y >= 355 && pointer.y <= 415;

        let targetY = 0;
        let isBench = false;

        if (isBenchY) {
          isBench = true;
        } else {
          targetY = Math.floor((pointer.y - 40) / 40);
        }

        // Validate board bounds (X: 0-7, Y: 4-7 for allied player board, Y: 0 for bench)
        const validX = targetX >= 0 && targetX <= 7;
        const validY = isBench || (targetY >= 4 && targetY <= 7);

        if (validX && validY) {
          this.simulationCore.moveUnit(this.dragUnitId, targetX, isBench ? 0 : targetY, isBench);
        } else {
          // Instantly forces update coordinates snap-back
          this.simulationCore.addLog('[GRID] Invalid drop coordinates! Placement aborted.');
        }

        this.dragUnitId = null;
      }
    });

    // Deselect click handlers
    this.input.on('pointerdown', (_pointer: Phaser.Input.Pointer, currentlyOver: any[]) => {
      if (currentlyOver.length === 0) {
        this.simulationCore.selectSlot(null);
      }
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
    const units = state.units;
    const activeIds = new Set<string>();

    this.overlayGraphics.clear();

    // 1. Draw Board & Bench Cells
    this.drawArenaGrid(state.status);

    // 2. Drag & Drop Previews
    if (this.dragActive && this.dragUnitId) {
      this.drawDragHighlights();
    }

    // 3. Selection Rings
    if (state.selectedSlotId) {
      const selected = units.find(u => u.id === state.selectedSlotId);
      if (selected) {
        this.overlayGraphics.lineStyle(2, 0x3b82f6, 0.8);
        this.overlayGraphics.strokeCircle(selected.x, selected.y, 20);
      }
    }

    // 4. Update / Sync Sprites
    for (const unit of units) {
      activeIds.add(unit.id);
      let container = this.sprites.get(unit.id);

      if (!container) {
        container = this.createUnitContainer(unit);
        this.sprites.set(unit.id, container);
      }

      // Sync position if not currently being dragged by pointer
      if (this.dragUnitId !== unit.id) {
        container.setPosition(unit.x, unit.y);
      }

      // Sync HP / visual state
      const sprite = container.getAt(0) as Phaser.GameObjects.Sprite;
      const shadow = container.getAt(1) as Phaser.GameObjects.Arc;
      const starLevelText = container.getAt(4) as Phaser.GameObjects.Text;
      const rangeIndicator = container.getAt(3) as Phaser.GameObjects.Arc;

      starLevelText.setText('★'.repeat(unit.starLevel));

      if (state.selectedSlotId === unit.id && !unit.isBench) {
        rangeIndicator.setVisible(true);
        rangeIndicator.setRadius(unit.range * 40); // 40px per grid cell range
      } else {
        rangeIndicator.setVisible(false);
      }

      if (unit.hp <= 0) {
        sprite.setAlpha(0.25);
        sprite.setAngle(90);
        shadow.setVisible(false);
        starLevelText.setVisible(false);
      } else {
        sprite.setAlpha(1.0);
        sprite.setAngle(0);
        shadow.setVisible(true);
        starLevelText.setVisible(true);

        this.drawCombatIndicators(unit, units);
      }
    }

    // Garbage collect removed unit containers
    for (const [id, container] of this.sprites.entries()) {
      if (!activeIds.has(id)) {
        container.destroy();
        this.sprites.delete(id);
      }
    }
  }

  private drawArenaGrid(status: string) {
    // A. Draw 8x8 Chess Battlefield
    // Rows 0-3: Enemy territory (red tint)
    // Rows 4-7: Player territory (blue tint)
    for (let x = 0; x < 8; x++) {
      for (let y = 0; y < 8; y++) {
        const px = 240 + x * 40;
        const py = 40 + y * 40;

        const isPlayerTerritory = y >= 4;
        
        // Soft grid lines
        this.overlayGraphics.lineStyle(1, 0x1e293b, 0.4);
        this.overlayGraphics.strokeRect(px, py, 40, 40);

        // Fill background colors
        if (isPlayerTerritory) {
          this.overlayGraphics.fillStyle(0x3b82f6, status === 'planning' ? 0.03 : 0.015);
        } else {
          this.overlayGraphics.fillStyle(0xef4444, 0.02);
        }
        this.overlayGraphics.fillRect(px, py, 40, 40);
      }
    }

    // Border surrounding Battlefield
    this.overlayGraphics.lineStyle(2, 0x334155, 0.5);
    this.overlayGraphics.strokeRect(240, 40, 320, 320);

    // Divider line between player and opponent territories
    this.overlayGraphics.lineStyle(2.5, 0xf43f5e, 0.35);
    this.overlayGraphics.lineBetween(240, 200, 560, 200);

    // B. Draw Bench cells (bottom row 1x8)
    for (let x = 0; x < 8; x++) {
      const px = 240 + x * 40;
      const py = 365;

      this.overlayGraphics.lineStyle(1.5, 0x475569, 0.35);
      this.overlayGraphics.strokeRect(px, py, 40, 40);

      this.overlayGraphics.fillStyle(0x475569, 0.05);
      this.overlayGraphics.fillRect(px, py, 40, 40);
    }
  }

  private drawDragHighlights() {
    const validX = this.dragGhostX >= 0 && this.dragGhostX <= 7;
    const validY = this.dragGhostY === 8 || (this.dragGhostY >= 4 && this.dragGhostY <= 7);

    const px = 240 + this.dragGhostX * 40;
    const py = this.dragGhostY === 8 ? 365 : 40 + this.dragGhostY * 40;

    if (validX && validY) {
      // Glow Green for valid positions
      this.overlayGraphics.fillStyle(0x10b981, 0.25);
      this.overlayGraphics.fillRect(px, py, 40, 40);
      this.overlayGraphics.lineStyle(2, 0x10b981, 0.85);
      this.overlayGraphics.strokeRect(px, py, 40, 40);
    } else {
      // Glow Red for invalid positions
      if (this.dragGhostX >= 0 && this.dragGhostX <= 7 && this.dragGhostY >= 0 && this.dragGhostY <= 7) {
        this.overlayGraphics.fillStyle(0xef4444, 0.25);
        this.overlayGraphics.fillRect(px, py, 40, 40);
        this.overlayGraphics.lineStyle(2, 0xef4444, 0.85);
        this.overlayGraphics.strokeRect(px, py, 40, 40);
      }
    }
  }

  private createUnitContainer(unit: Unit): Phaser.GameObjects.Container {
    const isMonster = unit.factionId === 'monsters';
    const textureKey = `${unit.factionId}-unit-tex`;

    // 1. Core Sprite
    const sprite = this.add.sprite(0, -6, this.textures.exists(textureKey) ? textureKey : 'plot-tex');
    sprite.setOrigin(0.5, 0.5);

    // 2. Oval shadow
    const shadow = this.add.circle(0, 4, 8, 0x000000, 0.45);
    shadow.setScale(1.2, 0.35);

    // 3. Name Tag
    const displayName = unit.id.split('-').pop() || '';
    const nameTag = this.add.text(0, -18, displayName, {
      fontFamily: 'monospace',
      fontSize: '7.5px',
      color: isMonster ? '#fca5a5' : '#93c5fd'
    }).setOrigin(0.5);

    // 4. Range ring (visible only when clicked/selected)
    const rangeIndicator = this.add.circle(0, 0, unit.range * 40, isMonster ? 0xef4444 : 0x3b82f6, 0.05);
    rangeIndicator.setStrokeStyle(1.0, isMonster ? 0xef4444 : 0x3b82f6, 0.2);
    rangeIndicator.setVisible(false);

    // 5. Star Level Indicator text
    const starLevelText = this.add.text(0, 10, '★'.repeat(unit.starLevel), {
      fontFamily: 'sans-serif',
      fontSize: '8px',
      color: '#f59e0b'
    }).setOrigin(0.5);

    const container = this.add.container(unit.x, unit.y, [sprite, shadow, nameTag, rangeIndicator, starLevelText]);
    container.setData('unitId', unit.id);

    // Add interactivity bounds
    container.setInteractive(new Phaser.Geom.Circle(0, 0, 18), Phaser.Geom.Circle.Contains);
    this.input.setDraggable(container);

    container.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pointer.event.stopPropagation();
      this.simulationCore.selectSlot(unit.id);
    });

    return container;
  }

  private drawCombatIndicators(unit: Unit, allUnits: Unit[]) {
    // Target attacking beams
    if (unit.targetId) {
      const target = allUnits.find(u => u.id === unit.targetId);
      if (target && target.hp > 0) {
        const isAlly = unit.factionId === 'towers';
        const beamColor = isAlly ? 0x60a5fa : 0xfca5a5;

        this.overlayGraphics.lineStyle(1.5, beamColor, 0.7);
        this.overlayGraphics.lineBetween(unit.x, unit.y - 6, target.x, target.y - 6);

        if (Math.random() < 0.15) {
          this.particleEmitter.emitParticle(
            1,
            target.x + (Math.random() - 0.5) * 6,
            target.y - 6 + (Math.random() - 0.5) * 6
          );
        }
      }
    }

    // Health Bar
    const barWidth = 24;
    const barHeight = 3;
    const barX = unit.x - barWidth / 2;
    const barY = unit.y - 25;

    this.overlayGraphics.fillStyle(0x1e293b, 1.0);
    this.overlayGraphics.fillRect(barX, barY, barWidth, barHeight);

    const pct = Math.max(0, unit.hp / unit.maxHp);
    const hpColor = pct > 0.5 ? 0x10b981 : pct > 0.25 ? 0xf59e0b : 0xef4444;
    this.overlayGraphics.fillStyle(hpColor, 1.0);
    this.overlayGraphics.fillRect(barX, barY, barWidth * pct, barHeight);
  }
}
