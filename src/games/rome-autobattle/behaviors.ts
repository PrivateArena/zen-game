import type { BehaviorStrategy, ActionHandler, ActionDefinition, Entity } from '../../engine/types';

// Convert grid coordinates to pixel positions
export function gridToPixel(boardX: number, boardY: number, isBench: boolean): { x: number; y: number } {
  if (isBench) {
    // Bench is placed at the bottom, centered horizontally
    return {
      x: 240 + boardX * 40 + 20,
      y: 385
    };
  } else {
    // Board is 8x8, rows 0-7, columns 0-7
    return {
      x: 240 + boardX * 40 + 20,
      y: 40 + boardY * 40 + 20
    };
  }
}

// Grid combat AI: Aggressive Seek with Manhattan distance metrics
export const SeekAndDestroyStrategy: BehaviorStrategy = (unit, context, dt) => {
  if (unit.hp <= 0) return;

  const unitBoardX = unit.components.boardX ?? 0;
  const unitBoardY = unit.components.boardY ?? 0;
  const isBench = unit.components.isBench ?? false;

  if (isBench) {
    unit.statusText = 'On Bench';
    return;
  }

  let closestEnemy: Entity | null = null;
  let minDistance = Infinity;

  // Find nearest enemy unit on the board
  for (const other of context.entities.values()) {
    if (other.factionId !== unit.factionId && other.hp > 0 && !other.components.isBench) {
      const otherX = other.components.boardX ?? 0;
      const otherY = other.components.boardY ?? 0;
      const dist = Math.abs(otherX - unitBoardX) + Math.abs(otherY - unitBoardY);
      
      if (dist < minDistance) {
        minDistance = dist;
        closestEnemy = other;
      }
    }
  }

  if (closestEnemy) {
    const enemyX = closestEnemy.components.boardX ?? 0;
    const enemyY = closestEnemy.components.boardY ?? 0;
    const range = unit.range || 1;

    if (minDistance <= range) {
      unit.targetId = closestEnemy.id;
      // Gladiator Attack Speed synergy buff
      const speedBuff = unit.components.attackSpeedMultiplier || 1.0;
      const damageApplied = unit.damage * speedBuff * dt;
      closestEnemy.hp = Math.max(0, closestEnemy.hp - damageApplied);
      unit.statusText = `Engaging ${closestEnemy.id.split('-').pop()}`;

      if (closestEnemy.hp <= 0) {
        context.logs.unshift(`[COMBAT] ${unit.id.split('-').pop()} defeated ${closestEnemy.id.split('-').pop()}!`);
        unit.targetId = undefined;
      }
    } else {
      // Seek movement cooldown accumulator
      unit.targetId = undefined;
      unit.components.moveCooldown = (unit.components.moveCooldown || 0) + dt;

      if (unit.components.moveCooldown >= 0.5) {
        unit.components.moveCooldown = 0;

        const dx = enemyX - unitBoardX;
        const dy = enemyY - unitBoardY;

        let stepX = 0;
        let stepY = 0;

        if (Math.abs(dx) >= Math.abs(dy)) {
          stepX = Math.sign(dx);
        } else {
          stepY = Math.sign(dy);
        }

        const nextX = Math.min(7, Math.max(0, unitBoardX + stepX));
        const nextY = Math.min(7, Math.max(0, unitBoardY + stepY));

        // Collision check
        let cellOccupied = false;
        for (const other of context.entities.values()) {
          if (other.hp > 0 && !other.components.isBench && other.id !== unit.id) {
            if (other.components.boardX === nextX && other.components.boardY === nextY) {
              cellOccupied = true;
              break;
            }
          }
        }

        let finalX = nextX;
        let finalY = nextY;

        if (cellOccupied) {
          // Alternative move direction
          if (stepX !== 0) {
            const altY = Math.min(7, Math.max(0, unitBoardY + Math.sign(dy || (Math.random() > 0.5 ? 1 : -1))));
            let altOccupied = false;
            for (const other of context.entities.values()) {
              if (other.hp > 0 && !other.components.isBench && other.id !== unit.id) {
                if (other.components.boardX === unitBoardX && other.components.boardY === altY) {
                  altOccupied = true;
                  break;
                }
              }
            }
            if (!altOccupied) {
              finalX = unitBoardX;
              finalY = altY;
              cellOccupied = false;
            }
          } else {
            const altX = Math.min(7, Math.max(0, unitBoardX + Math.sign(dx || (Math.random() > 0.5 ? 1 : -1))));
            let altOccupied = false;
            for (const other of context.entities.values()) {
              if (other.hp > 0 && !other.components.isBench && other.id !== unit.id) {
                if (other.components.boardX === altX && other.components.boardY === unitBoardY) {
                  altOccupied = true;
                  break;
                }
              }
            }
            if (!altOccupied) {
              finalX = altX;
              finalY = unitBoardY;
              cellOccupied = false;
            }
          }
        }

        if (!cellOccupied) {
          unit.components.boardX = finalX;
          unit.components.boardY = finalY;
          const pos = gridToPixel(finalX, finalY, false);
          unit.x = pos.x;
          unit.y = pos.y;
          unit.statusText = `Advancing to (${finalX}, ${finalY})`;
        } else {
          unit.statusText = 'Repositioning';
        }
      }
    }
  } else {
    unit.targetId = undefined;
    unit.statusText = 'Awaiting battle';
  }
};
