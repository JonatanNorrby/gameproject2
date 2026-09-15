import { Game as PreviousGame, UI as PreviousUI } from './captainThorne.js';
import { UPGRADES } from '../data/content.js';
import { getUnitModifiers } from '../data/unitModifiers.js';

const PROJECTILE_FADE_MIN_DISTANCE = 24;
const PROJECTILE_FADE_MAX_DISTANCE = 50;
const PROJECTILE_FADE_RANGE_RATIO = 0.25;

const PIERCE_BONUS_BY_RARITY = Object.freeze({
  common: 1,
  uncommon: 1,
  rare: 2,
  epic: 3,
});

const riflemanPierceUpgrade = UPGRADES.find((upgrade) => (
  upgrade.unitType === 'rifleman' && upgrade.stat === 'pierce'
));

if (riflemanPierceUpgrade) {
  riflemanPierceUpgrade.describe = (rarity) => {
    const amount = PIERCE_BONUS_BY_RARITY[rarity.id] ?? 1;
    return `+${amount} Rifleman projectile pierce.`;
  };
  riflemanPierceUpgrade.apply = (game, rarity) => {
    const amount = PIERCE_BONUS_BY_RARITY[rarity.id] ?? 1;
    if (!game.unitModifiers?.rifleman) return;
    game.unitModifiers.rifleman.pierce += amount;
  };
}

function createProjectileBehaviorCombatSystem(ParentCombatSystem) {
  return class ProjectileBehaviorCombatSystem extends ParentCombatSystem {
    fireWeapon(soldier, unitClass, target, shotEffect = null) {
      const projectiles = this.game.entities.projectiles;
      const beforeCount = projectiles.length;
      super.fireWeapon(soldier, unitClass, target, shotEffect);
      if (projectiles.length <= beforeCount) return;

      const projectile = projectiles[projectiles.length - 1];
      if (!projectile || projectile.hostile || projectile.dead) return;

      const weapon = unitClass.weapon;
      const modifiers = getUnitModifiers(this.game.unitModifiers, soldier.unit.type);
      const statMultiplier = this.game.getTransformerStatMultiplier();
      const rangeMultiplier = shotEffect?.rangeMultiplier ?? 1;
      const effectiveRange = weapon.range * modifiers.range * rangeMultiplier * statMultiplier;
      const muzzleOffset = Math.hypot(projectile.x - soldier.x, projectile.y - soldier.y);
      const fadeStartDistance = Math.max(0, effectiveRange - muzzleOffset);
      const fadeDistance = Math.max(
        PROJECTILE_FADE_MIN_DISTANCE,
        Math.min(PROJECTILE_FADE_MAX_DISTANCE, effectiveRange * PROJECTILE_FADE_RANGE_RATIO),
      );

      projectile.travelledDistance = 0;
      projectile.fadeStartDistance = fadeStartDistance;
      projectile.fadeEndDistance = fadeStartDistance + fadeDistance;
      projectile.rangeOpacity = 1;

      const speed = Math.hypot(projectile.vx, projectile.vy);
      if (speed > 0) {
        projectile.life = Math.max(projectile.life, projectile.fadeEndDistance / speed + 0.25);
      }
    }

    updateProjectiles(dt) {
      for (const projectile of this.game.entities.projectiles) {
        if (
          projectile.dead
          || projectile.hostile
          || !Number.isFinite(projectile.fadeStartDistance)
          || !Number.isFinite(projectile.fadeEndDistance)
        ) continue;

        const stepDistance = Math.hypot(projectile.vx, projectile.vy) * dt;
        projectile.travelledDistance = (projectile.travelledDistance ?? 0) + stepDistance;

        if (projectile.travelledDistance >= projectile.fadeEndDistance) {
          projectile.rangeOpacity = 0;
          projectile.dead = true;
          continue;
        }

        if (projectile.travelledDistance > projectile.fadeStartDistance) {
          const fadeLength = Math.max(1, projectile.fadeEndDistance - projectile.fadeStartDistance);
          projectile.rangeOpacity = Math.max(
            0,
            1 - (projectile.travelledDistance - projectile.fadeStartDistance) / fadeLength,
          );
        } else {
          projectile.rangeOpacity = 1;
        }
      }

      super.updateProjectiles(dt);
    }
  };
}

function withProjectileOpacity(ctx, projectile, draw) {
  ctx.save();
  ctx.globalAlpha *= projectile.rangeOpacity ?? 1;
  const result = draw();
  ctx.restore();
  return result;
}

export class Game extends PreviousGame {
  constructor(...args) {
    super(...args);
    const ProjectileBehaviorCombatSystem = createProjectileBehaviorCombatSystem(this.combatSystem.constructor);
    this.combatSystem = new ProjectileBehaviorCombatSystem(this);
    this.combatSystem.reset();
  }

  drawProjectileImage(ctx, projectile) {
    return withProjectileOpacity(
      ctx,
      projectile,
      () => super.drawProjectileImage(ctx, projectile),
    );
  }

  drawProceduralProjectile(ctx, projectile) {
    return withProjectileOpacity(
      ctx,
      projectile,
      () => super.drawProceduralProjectile(ctx, projectile),
    );
  }
}

function formatPierce(value) {
  const number = Number(value) || 0;
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

export class UI extends PreviousUI {
  showLevelUp(choices, onChoose, ranks, onSkip) {
    super.showLevelUp(choices, onChoose, ranks, onSkip);

    const cards = [...this.upgradeOptions.children];
    cards.forEach((card, index) => {
      const upgrade = choices[index]?.upgrade;
      if (upgrade?.unitType !== 'rifleman' || upgrade?.stat !== 'pierce') return;
      const progress = card.querySelector('small');
      const totalBonus = this.game?.unitModifiers?.rifleman?.pierce ?? 0;
      if (progress) progress.textContent = `Rifleman Pierce bonus: +${formatPierce(totalBonus)} total`;
    });
  }
}
