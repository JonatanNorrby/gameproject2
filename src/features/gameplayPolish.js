import { Game as PreviousGame, UI as PreviousUI } from './rangedEnemies.js';
import { GAME_BALANCE } from '../data/content.js';
import { GROUND_DROPS } from '../data/groundDrops.js';
import { getUnitModifiers } from '../data/unitModifiers.js';
import { distanceSq } from '../utils/math.js';

const GROUND_POWERUP_RADIUS = 24;
const SQUAD_BUILDER_HEX_SCALE = 1.2;
const SHOCKBLADE_LUNGE_GAP = 30;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function easeOutCubic(value) {
  const t = clamp01(value);
  return 1 - Math.pow(1 - t, 3);
}

function getLivingSoldiers(game) {
  return (game.getSoldierPositions?.() ?? []).filter((soldier) => soldier?.unit && !soldier.unit.dead);
}

function getNearestSoldier(soldiers, x, y) {
  let nearest = null;
  let nearestDistance = Infinity;

  for (const soldier of soldiers) {
    const dist = distanceSq(x, y, soldier.x, soldier.y);
    if (dist >= nearestDistance) continue;
    nearestDistance = dist;
    nearest = soldier;
  }

  return nearest;
}

function createGameplayPolishCombatSystem(ParentCombatSystem) {
  return class GameplayPolishCombatSystem extends ParentCombatSystem {
    startShockbladeAttack(soldier, unitClass, target) {
      super.startShockbladeAttack(soldier, unitClass, target);

      const attack = this.meleeAttacks?.get(soldier.unit.id);
      if (!attack) return;

      const modifiers = getUnitModifiers(this.game.unitModifiers, soldier.unit.type);
      const statMultiplier = this.game.getTransformerStatMultiplier();
      const triggerRange = unitClass.weapon.range * modifiers.range * statMultiplier;
      const maximumLunge = Math.max(0, triggerRange - SHOCKBLADE_LUNGE_GAP);
      const targetDistance = Math.hypot(target.x - soldier.x, target.y - soldier.y);
      attack.lungeDistance = Math.max(
        0,
        Math.min(maximumLunge, targetDistance - SHOCKBLADE_LUNGE_GAP),
      );
    }

    updateGems(dt) {
      const game = this.game;
      const player = game.player;
      const soldiers = getLivingSoldiers(game);

      for (const gem of game.entities.gems) {
        if (gem.dead) continue;

        let collector = getNearestSoldier(soldiers, gem.x, gem.y);
        if (!collector) {
          collector = { x: player.x, y: player.y, unit: null };
        }

        if (gem.vacuumPull) {
          const pull = gem.vacuumPull;
          let vacuumTarget = soldiers.find((soldier) => soldier.unit.id === pull.targetUnitId) ?? null;
          if (!vacuumTarget) {
            vacuumTarget = getNearestSoldier(soldiers, gem.x, gem.y) ?? collector;
            pull.targetUnitId = vacuumTarget.unit?.id ?? null;
          }

          const progress = clamp01((game.elapsed - pull.startedAt) / pull.duration);
          const eased = easeOutCubic(progress);
          const dx = vacuumTarget.x - pull.startX;
          const dy = vacuumTarget.y - pull.startY;
          const distance = Math.hypot(dx, dy) || 1;
          const perpendicularX = -dy / distance;
          const perpendicularY = dx / distance;
          const spiral = Math.sin(progress * Math.PI * 5 + pull.phase)
            * Math.min(82, distance * 0.16)
            * (1 - progress);

          gem.vacuumPrevX = gem.x;
          gem.vacuumPrevY = gem.y;
          gem.x = pull.startX + dx * eased + perpendicularX * spiral;
          gem.y = pull.startY + dy * eased + perpendicularY * spiral;

          if (progress >= 0.97) {
            gem.x = vacuumTarget.x;
            gem.y = vacuumTarget.y;
          }
        } else {
          const distSq = distanceSq(collector.x, collector.y, gem.x, gem.y);
          const magnetSq = player.magnetRadius * player.magnetRadius;
          if (distSq <= magnetSq) {
            const dx = collector.x - gem.x;
            const dy = collector.y - gem.y;
            const distance = Math.hypot(dx, dy) || 1;
            const pull = 190 + Math.max(0, player.magnetRadius - distance) * 6;
            gem.x += (dx / distance) * pull * dt;
            gem.y += (dy / distance) * pull * dt;
          }
        }

        collector = getNearestSoldier(soldiers, gem.x, gem.y) ?? collector;
        const collectorRadius = collector.unit ? GAME_BALANCE.player.soldierRadius : player.radius;
        const collectRadius = collectorRadius + gem.radius + 4;
        if (distanceSq(collector.x, collector.y, gem.x, gem.y) <= collectRadius * collectRadius) {
          gem.dead = true;
          game.progression.addXp(gem.value);
        }
      }
    }
  };
}

export class Game extends PreviousGame {
  constructor(...args) {
    super(...args);
    const GameplayPolishCombatSystem = createGameplayPolishCombatSystem(this.combatSystem.constructor);
    this.combatSystem = new GameplayPolishCombatSystem(this);
    this.combatSystem.reset();
  }

  spawnGroundDrop(type, x = this.player.x, y = this.player.y) {
    const drop = super.spawnGroundDrop(type, x, y);
    if (drop) drop.radius = GROUND_POWERUP_RADIUS;
    return drop;
  }

  drawEnemies(ctx) {
    super.drawEnemies(ctx);
    this.drawGroundDropHighlights(ctx);
  }

  drawGroundDropHighlights(ctx) {
    for (const drop of this.entities.groundDrops) {
      if (drop.dead) continue;
      const definition = GROUND_DROPS[drop.type];
      if (!definition) continue;

      const bob = Math.sin(this.animationClock * 3.4 + drop.id * 0.71) * 3;
      const pulse = (Math.sin(this.animationClock * 5 + drop.id) + 1) * 0.5;
      const radius = (drop.radius ?? GROUND_POWERUP_RADIUS) + 7 + pulse * 4;

      ctx.save();
      ctx.translate(drop.x, drop.y + bob);
      ctx.globalAlpha = 0.72;
      ctx.strokeStyle = definition.color;
      ctx.shadowBlur = 24;
      ctx.shadowColor = definition.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalAlpha = 0.96;
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#ffffff';
      ctx.font = '1000 15px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(definition.symbol, 0, 0);
      ctx.restore();
    }
  }
}

export class UI extends PreviousUI {
  getSquadBuilderHexRadius(count, mobile) {
    return Math.round(super.getSquadBuilderHexRadius(count, mobile) * SQUAD_BUILDER_HEX_SCALE);
  }

  renderSquadBuilder() {
    const squad = this.squadBuilderHandlers?.getSquad?.() ?? [];
    const mobile = window.innerWidth <= 760;
    const originalRadius = super.getSquadBuilderHexRadius(squad.length, mobile);

    super.renderSquadBuilder();

    if (squad.length === 0 || originalRadius > 44) return;

    const veryDense = originalRadius <= 36;
    for (const card of this.squadBuilderGrid.querySelectorAll('.squad-unit-card')) {
      const slotLabel = card.querySelector('.squad-unit-card__slot');
      const icon = card.querySelector('.squad-unit-card__icon');
      const label = card.querySelector('strong');
      const health = card.querySelector('.squad-unit-card__health');
      const detail = card.querySelector('small');

      card.style.padding = '10px 7px';
      if (slotLabel) {
        slotLabel.style.top = '16%';
        slotLabel.style.left = '17%';
        slotLabel.style.fontSize = veryDense ? '7px' : '8px';
      }
      if (icon) {
        icon.style.width = veryDense ? '30px' : '34px';
        icon.style.height = veryDense ? '30px' : '34px';
        icon.style.fontSize = veryDense ? '8px' : '9px';
      }
      if (label) {
        label.style.fontSize = '10px';
        label.style.marginTop = '4px';
        if (veryDense) label.style.display = 'none';
      }
      if (health) {
        health.style.fontSize = veryDense ? '7px' : '8px';
        health.style.marginTop = '2px';
      }
      if (detail) detail.style.display = 'none';
    }
  }
}
