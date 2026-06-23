export interface Point2D {
  x: number;
  y: number;
}

export interface Entity {
  id: string;
  type: string;
  factionId: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  damage: number;
  speed: number;
  range: number;
  behavior: string;
  statusText?: string;
  targetId?: string;
  tags: string[];
  stats: Record<string, number>;
  components: Record<string, any>;
}

export interface GameAction {
  type: string;
  payload: Record<string, any>;
  timestamp: number;
}

export interface ActionDefinition {
  type: string;
  description: string;
  schema: Record<string, string>;
}

export interface GameStatus {
  status: 'idle' | 'running' | 'paused' | 'awaiting-interaction' | 'gameover';
}

export interface GameState {
  status: 'idle' | 'running' | 'paused' | 'awaiting-interaction' | 'gameover';
  entities: Entity[];
  simulationSpeed: number;
  elapsedTime: number;
  logs: string[];
  firedEventIds: string[];
  globalStats: Record<string, number>; // Replacement for hardcoded gold, lives, etc.
  selectedSlotId: string | null;
}

export interface TriggerConfig {
  type: 'time' | 'faction_hp_percent' | 'global_stat_threshold';
  value: number;
  faction?: string;
  statKey?: string;
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

export interface EntityTemplate {
  tags: string[];
  baseStats: {
    hp: number;
    damage: number;
    speed: number;
    range: number;
    [key: string]: number; // Extensible attributes
  };
  behavior: string;
  components?: Record<string, any>;
}

export interface FactionConfig {
  id: string;
  name: string;
  color: string;
  spriteStyle: string;
}

export interface GameConfig {
  gameId: string;
  title: string;
  viewport: { width: number; height: number; theme: string };
  factions: Record<string, FactionConfig>;
  waypoints: Point2D[];
  entityTemplates: Record<string, EntityTemplate>;
  initialEntities: Array<{
    template: string;
    count: number;
    layout: {
      type: string;
      startX?: number;
      startY?: number;
      spacing?: number;
      boundingBox?: { x: number; y: number; w: number; h: number };
    };
    customIdPrefix?: string;
    factionId: string;
  }>;
  initialGlobalStats: Record<string, number>;
  timelineEvents: TimelineEvent[];
}

export interface EngineContext {
  entities: Map<string, Entity>;
  globalStats: Record<string, number>;
  currentTick: number;
  elapsedTime: number;
  status: 'idle' | 'running' | 'paused' | 'awaiting-interaction' | 'gameover';
  logs: string[];
  firedEventIds: string[];
  config: GameConfig;
}

export type BehaviorStrategy = (entity: Entity, context: EngineContext, dt: number) => void;
export type ActionHandler = (payload: Record<string, any>, context: EngineContext) => boolean;
