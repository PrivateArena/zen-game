import type { GameConfig } from '../../engine/types';

export const RomeAegisConfig: GameConfig = {
  gameId: 'rome-aegis',
  title: 'ROME_AEGIS // MYTHIC_LIMES',
  viewport: { width: 800, height: 450, theme: 'cyber-grid' },
  factions: {
    towers: { id: 'towers', name: 'ROMAN DEFENDERS', color: '#3b82f6', spriteStyle: 'shield' },
    monsters: { id: 'monsters', name: 'MYTHIC HORDE', color: '#ef4444', spriteStyle: 'diamond' }
  },
  waypoints: [
    { x: 760, y: 225 },
    { x: 600, y: 100 },
    { x: 440, y: 350 },
    { x: 280, y: 100 },
    { x: 120, y: 350 },
    { x: 50,  y: 225 }
  ],
  initialGlobalStats: {
    gold: 300,
    lives: 20
  },
  entityTemplates: {
    // Towers
    'Ground-Castrum': {
      tags: ['defense', 'tower'],
      baseStats: { hp: 500, damage: 65, speed: 0, range: 100 },
      behavior: 'tower_attack'
    },
    'Fly-Sagittarius': {
      tags: ['defense', 'tower'],
      baseStats: { hp: 500, damage: 45, speed: 0, range: 150 },
      behavior: 'tower_attack'
    },
    'Slot-Plot': {
      tags: ['plot', 'build_site'],
      baseStats: { hp: 500, damage: 0, speed: 0, range: 0 },
      behavior: 'empty_slot'
    },
    // Invaders
    'Satyr-Skirmisher': {
      tags: ['enemy', 'creep'],
      baseStats: { hp: 120, damage: 10, speed: 60, range: 0, goldReward: 20 },
      behavior: 'enemy_path'
    },
    'Harpy-Scavenger': {
      tags: ['enemy', 'creep', 'flying'],
      baseStats: { hp: 80, damage: 8, speed: 85, range: 0, goldReward: 25 },
      behavior: 'enemy_path'
    },
    'Minotaur-Vanguard': {
      tags: ['enemy', 'creep', 'armored'],
      baseStats: { hp: 200, damage: 25, speed: 38, range: 0, goldReward: 45 },
      behavior: 'enemy_path'
    },
    'Cerberus-Pup': {
      tags: ['enemy', 'creep'],
      baseStats: { hp: 70, damage: 5, speed: 110, range: 0, goldReward: 15 },
      behavior: 'enemy_path'
    },
    'Chimera-Boss': {
      tags: ['enemy', 'creep', 'boss'],
      baseStats: { hp: 750, damage: 50, speed: 28, range: 0, goldReward: 150 },
      behavior: 'enemy_path'
    }
  },
  initialEntities: [
    {
      template: 'Ground-Castrum',
      count: 1,
      factionId: 'towers',
      layout: { type: 'fixed', startX: 680, startY: 140 },
      customIdPrefix: 'Ground-Castrum'
    },
    {
      template: 'Fly-Sagittarius',
      count: 1,
      factionId: 'towers',
      layout: { type: 'fixed', startX: 420, startY: 180 },
      customIdPrefix: 'Fly-Sagittarius'
    },
    {
      template: 'Slot-Plot',
      count: 1,
      factionId: 'towers',
      layout: { type: 'fixed', startX: 600, startY: 220 },
      customIdPrefix: 'Slot-Plot-1'
    },
    {
      template: 'Slot-Plot',
      count: 1,
      factionId: 'towers',
      layout: { type: 'fixed', startX: 500, startY: 100 },
      customIdPrefix: 'Slot-Plot-2'
    },
    {
      template: 'Slot-Plot',
      count: 1,
      factionId: 'towers',
      layout: { type: 'fixed', startX: 340, startY: 280 },
      customIdPrefix: 'Slot-Plot-3'
    },
    {
      template: 'Slot-Plot',
      count: 1,
      factionId: 'towers',
      layout: { type: 'fixed', startX: 200, startY: 200 },
      customIdPrefix: 'Slot-Plot-4'
    },
    {
      template: 'Slot-Plot',
      count: 1,
      factionId: 'towers',
      layout: { type: 'fixed', startX: 100, startY: 100 },
      customIdPrefix: 'Slot-Plot-5'
    },
    {
      template: 'Satyr-Skirmisher',
      count: 5,
      factionId: 'monsters',
      layout: { type: 'vertical-line', startX: 780, startY: 190, spacing: 25 },
      customIdPrefix: 'Satyr-Skirmisher'
    },
    {
      template: 'Harpy-Scavenger',
      count: 3,
      factionId: 'monsters',
      layout: { type: 'vertical-line', startX: 860, startY: 200, spacing: 25 },
      customIdPrefix: 'Harpy-Scavenger'
    },
    {
      template: 'Minotaur-Vanguard',
      count: 2,
      factionId: 'monsters',
      layout: { type: 'vertical-line', startX: 920, startY: 210, spacing: 40 },
      customIdPrefix: 'Minotaur-Vanguard'
    },
    {
      template: 'Cerberus-Pup',
      count: 4,
      factionId: 'monsters',
      layout: { type: 'vertical-line', startX: 980, startY: 190, spacing: 20 },
      customIdPrefix: 'Cerberus-Pup'
    },
    {
      template: 'Chimera-Boss',
      count: 1,
      factionId: 'monsters',
      layout: { type: 'fixed', startX: 1060, startY: 225 },
      customIdPrefix: 'Chimera-Boss'
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
