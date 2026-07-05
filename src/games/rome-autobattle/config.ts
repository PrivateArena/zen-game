import type { GameConfig } from '../../engine/types';

export const RomeAutobattleConfig: GameConfig = {
  gameId: 'rome-autobattle',
  title: 'ROME_AUTOBATTLE // SENATE_ARENA',
  viewport: { width: 800, height: 450, theme: 'cyber-grid' },
  factions: {
    towers: { id: 'towers', name: 'ROMAN ALLIES', color: '#3b82f6', spriteStyle: 'shield' },
    monsters: { id: 'monsters', name: 'MYTHIC HORDE', color: '#ef4444', spriteStyle: 'diamond' }
  },
  waypoints: [],
  initialGlobalStats: {
    gold: 15,
    lives: 20,
    level: 1,
    xp: 0,
    roundIndex: 1,
    streak: 0
  },
  entityTemplates: {
    // Gladiator trait units
    'Gladiator-Secutor': {
      tags: ['gladiator', 'soldier'],
      baseStats: { hp: 120, damage: 15, speed: 100, range: 1 },
      behavior: 'seek_and_destroy'
    },
    'Gladiator-Retiarius': {
      tags: ['gladiator', 'beast'],
      baseStats: { hp: 100, damage: 20, speed: 100, range: 2 },
      behavior: 'seek_and_destroy'
    },
    'Gladiator-Murmillo': {
      tags: ['gladiator', 'armored'],
      baseStats: { hp: 180, damage: 12, speed: 100, range: 1 },
      behavior: 'seek_and_destroy'
    },
    // Mythic trait units
    'Mythic-Harpy': {
      tags: ['mythic', 'fly'],
      baseStats: { hp: 80, damage: 14, speed: 100, range: 3 },
      behavior: 'seek_and_destroy'
    },
    'Mythic-Satyr': {
      tags: ['mythic', 'beast'],
      baseStats: { hp: 110, damage: 18, speed: 100, range: 1 },
      behavior: 'seek_and_destroy'
    },
    'Mythic-Minotaur': {
      tags: ['mythic', 'armored'],
      baseStats: { hp: 200, damage: 22, speed: 100, range: 1 },
      behavior: 'seek_and_destroy'
    },
    'Mythic-Centaur': {
      tags: ['mythic', 'beast'],
      baseStats: { hp: 160, damage: 16, speed: 100, range: 1 },
      behavior: 'seek_and_destroy'
    },
    // Soldier/Other units
    'Soldier-Legionary': {
      tags: ['soldier', 'armored'],
      baseStats: { hp: 140, damage: 14, speed: 100, range: 1 },
      behavior: 'seek_and_destroy'
    },
    'Soldier-Centurion': {
      tags: ['soldier', 'officer'],
      baseStats: { hp: 150, damage: 20, speed: 100, range: 2 },
      behavior: 'seek_and_destroy'
    }
  },
  initialEntities: [],
  timelineEvents: []
};
