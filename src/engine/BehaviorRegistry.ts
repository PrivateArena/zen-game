import type { BehaviorStrategy, ActionHandler, ActionDefinition } from './types';

export class BehaviorRegistry {
  private strategies = new Map<string, BehaviorStrategy>();
  private actions = new Map<string, { handler: ActionHandler; definition: ActionDefinition }>();

  public registerStrategy(key: string, strategy: BehaviorStrategy): void {
    this.strategies.set(key, strategy);
  }

  public getStrategy(key: string): BehaviorStrategy | undefined {
    return this.strategies.get(key);
  }

  public registerAction(
    type: string,
    handler: ActionHandler,
    definition: ActionDefinition
  ): void {
    this.actions.set(type, { handler, definition });
  }

  public getActionHandler(type: string): ActionHandler | undefined {
    return this.actions.get(type)?.handler;
  }

  public getAvailableActions(): ActionDefinition[] {
    return Array.from(this.actions.values()).map(a => a.definition);
  }
}
export const GlobalLayoutRegistry: Record<
  string,
  (layoutConfig: any, index: number) => { x: number; y: number }
> = {
  'vertical-line': (layout, i) => ({
    x: layout.startX ?? 150,
    y: (layout.startY ?? 100) + i * (layout.spacing ?? 65),
  }),
  'scatter': (layout) => {
    const box = layout.boundingBox ?? { x: 500, y: 100, w: 100, h: 300 };
    return {
      x: box.x + Math.random() * box.w,
      y: box.y + Math.random() * box.h,
    };
  },
  'fixed': (layout) => ({
    x: layout.startX ?? 100,
    y: layout.startY ?? 100,
  }),
};
