import type { BehaviorStrategy, ActionHandler, ActionDefinition, Entity } from '../../engine/types';

// Tower Attack Logic
export const TowerAttackStrategy: BehaviorStrategy = (unit, context, dt) => {
  let closestEnemy: Entity | null = null;
  let minDistance = Infinity;

  for (const other of context.entities.values()) {
    if (other.factionId !== unit.factionId && other.hp > 0) {
      const isFly = other.id.includes('Harpy');
      
      // Ground and Bombard towers cannot target flyers
      if (unit.id.includes('Ground') && isFly) continue;
      if (unit.id.includes('Bombard') && isFly) continue;

      const dx = other.x - unit.x;
      const dy = other.y - unit.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < minDistance) {
        minDistance = dist;
        closestEnemy = other;
      }
    }
  }

  if (closestEnemy && minDistance <= unit.range) {
    unit.targetId = closestEnemy.id;

    let damageMultiplier = 1.0;
    const isArmor = closestEnemy.id.includes('Minotaur');

    if (unit.id.includes('AntiArmor') && isArmor) {
      damageMultiplier = 2.0;
    }
    if (unit.id.includes('Laser')) {
      damageMultiplier = 0.5; // Weaker generalist
    }
    if (unit.id.includes('Bombard')) {
      damageMultiplier = 0.5; // Weaker base damage, compensated by AOE
    }

    const damageApplied = unit.damage * damageMultiplier * dt;
    closestEnemy.hp = Math.max(0, closestEnemy.hp - damageApplied);
    unit.statusText = `Firing at ${closestEnemy.id.split('-').pop()}`;

    // Apply Slow effect
    if (unit.id.includes('Slow')) {
      closestEnemy.statusText = 'Chilled (Slowed)';
      closestEnemy.components.isSlowed = true;
    }

    // Bombard splash damage to nearby ground enemies
    if (unit.id.includes('Bombard')) {
      const splashRadius = 80;
      for (const other of context.entities.values()) {
        if (other.factionId !== unit.factionId && other.hp > 0 && other.id !== closestEnemy.id) {
          const isOtherFly = other.id.includes('Harpy');
          if (isOtherFly) continue; // Splash doesn't hit flying units
          
          const sx = other.x - closestEnemy.x;
          const sy = other.y - closestEnemy.y;
          const sdist = Math.sqrt(sx * sx + sy * sy);
          if (sdist <= splashRadius) {
            other.hp = Math.max(0, other.hp - damageApplied * 0.5);
          }
        }
      }
    }

    if (closestEnemy.hp <= 0) {
      context.logs.unshift(`[COMBAT] Tower neutralized ${closestEnemy.id}!`);
      // Award gold immediately upon enemy defeat
      const goldReward = closestEnemy.stats.goldReward ?? closestEnemy.components.goldReward ?? 0;
      if (goldReward > 0) {
        context.globalStats.gold = (context.globalStats.gold ?? 0) + goldReward;
        context.logs.unshift(`[ECONOMY] Earned +${goldReward}g from defeating ${closestEnemy.id.split('-')[0]}`);
        closestEnemy.stats.goldReward = 0;
        closestEnemy.components.goldReward = 0;
      }
    }
  } else {
    unit.targetId = undefined;
    unit.statusText = 'Scanning path...';
  }
};

// Enemy pathing behavior
export const EnemyPathStrategy: BehaviorStrategy = (unit, context, dt) => {
  const waypoints = context.config.waypoints;
  if (!waypoints || waypoints.length === 0) return;

  const baseSpeed = unit.speed;
  let currentSpeed = baseSpeed;

  if (unit.components.isSlowed) {
    currentSpeed = baseSpeed * 0.4;
    unit.components.isSlowed = false; // Reset for next frame
  }

  if (unit.components.currentWaypointIndex === undefined) {
    unit.components.currentWaypointIndex = 0;
  }

  const targetNode = waypoints[unit.components.currentWaypointIndex];
  const dx = targetNode.x - unit.x;
  const dy = targetNode.y - unit.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  const step = currentSpeed * dt;

  if (dist <= step) {
    unit.x = targetNode.x;
    unit.y = targetNode.y;

    if (unit.components.currentWaypointIndex < waypoints.length - 1) {
      unit.components.currentWaypointIndex++;
    } else {
      // Reached base! Leak lives
      unit.hp = 0;
      context.globalStats.lives = Math.max(0, (context.globalStats.lives ?? 20) - 1);
      context.logs.unshift(`[BASE] Rome's defense breached by ${unit.id.split('-').pop()}!`);
    }
  } else {
    unit.x += (dx / dist) * step;
    unit.y += (dy / dist) * step;
    if (unit.statusText !== 'Chilled (Slowed)') {
      unit.statusText = 'Marching on Rome';
    }
  }
};

// Empty slot behavior
export const EmptySlotStrategy: BehaviorStrategy = (unit) => {
  unit.statusText = 'Empty Slot';
  unit.targetId = undefined;
};

// Action definition and handler for building a tower
export const BUILD_TOWER_DEFINITION: ActionDefinition = {
  type: 'BUILD_TOWER',
  description: 'Constructs a tower on a designated empty plot.',
  schema: {
    slotId: 'string',
    towerType: 'string',
    cost: 'number'
  }
};

export const BuildTowerAction: ActionHandler = (payload, context) => {
  const { slotId, towerType, cost } = payload;
  const unit = context.entities.get(slotId);

  const currentGold = context.globalStats.gold ?? 0;

  if (unit && unit.behavior === 'empty_slot' && currentGold >= cost) {
    context.globalStats.gold = currentGold - cost;

    // Determine stats based on type
    let damage = 50;
    let range = 120;
    if (towerType === 'Ground') { damage = 65; range = 100; }
    else if (towerType === 'Fly') { damage = 45; range = 150; }
    else if (towerType === 'Laser') { damage = 35; range = 125; }
    else if (towerType === 'Bombard') { damage = 55; range = 140; }
    else if (towerType === 'AntiArmor') { damage = 60; range = 170; }
    else if (towerType === 'Slow') { damage = 5; range = 130; }

    // Mutate existing entity
    const oldId = unit.id;
    const newId = `${towerType}-${oldId}`;
    unit.id = newId;
    unit.behavior = 'tower_attack';
    unit.damage = damage;
    unit.range = range;
    unit.statusText = `${towerType} Online`;

    // Swap key in entities Map to maintain pointer
    context.entities.delete(oldId);
    context.entities.set(newId, unit);

    context.logs.unshift(`[ECONOMY] Built ${towerType} Tower for ${cost}g.`);
    return true;
  }
  return false;
};
