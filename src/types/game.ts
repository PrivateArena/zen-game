export type GameStatus = 'idle' | 'running' | 'paused' | 'awaiting-interaction' | 'gameover';

export interface Unit {
  id: string;
  factionId: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  damage: number;
  speed: number;
  range: number;
  behavior: string; // Key in BehaviorRegistry
  targetId?: string;
  statusText?: string;
}

export interface FactionConfig {
  id: string;
  name: string;
  color: string; // Hex string (e.g. "#3388ff")
  spriteStyle: string; // "shield" | "diamond"
}

export interface LayoutConfig {
  type: 'vertical-line' | 'scatter' | string;
  startX?: number;
  startY?: number;
  spacing?: number;
  boundingBox?: { x: number; y: number; w: number; h: number };
}

export interface EntityConfig {
  id: string;
  faction: string;
  count: number;
  layout: LayoutConfig;
  stats: {
    hp: number;
    damage: number;
    speed: number;
    range: number;
  };
  behavior: string;
}

export interface TriggerConfig {
  type: 'time' | 'faction_hp_percent';
  value: number;
  faction?: string;
}

export interface DuoduoHook {
  type: 'info_popup' | 'quiz_challenge';
  markdown?: string;
  quizId?: string;
  onSuccess?: { action: string; faction: string; stat: string; multiplier: number };
  onFailure?: { action: string; faction: string; stat: string; multiplier: number };
}

export interface TimelineEvent {
  id: string;
  trigger: TriggerConfig;
  duoduoHook: DuoduoHook;
}

export interface GameConfig {
  gameId: string;
  title: string;
  viewport: { width: number; height: number; theme: string };
  factions: Record<string, FactionConfig>;
  entities: EntityConfig[];
  timelineEvents: TimelineEvent[];
}

export interface GameState {
  status: GameStatus;
  units: Unit[];
  simulationSpeed: number;
  elapsedTime: number;
  logs: string[];
  firedEventIds: string[];
}
