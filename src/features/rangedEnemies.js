import { Game as PreviousGame, UI } from './upgradeBonusDisplay.js';
import { ENEMY_TYPES, GAME_BALANCE } from '../data/content.js';
import { FRAME_SPRITES, createStandardFrameSet } from '../data/sprites.js';
import { distanceSq, normalize } from '../utils/math.js';

const RANGED_DAMAGE_FEEDBACK_INTERVAL = 0.16;
const RANGED_HIT_INVULNERABILITY_DURATION = 0.1;

if (!FRAME_SPRITES.enemies.spitter) {
  FRAME_SPRITES.enemies.spitter = createStandardFrameSet('spitter', { drawSize: 38 });
}

function createRangedEnemyCombatSystem(ParentCombatSystem) {
  return class RangedEnemyCombatSystem extends ParentCombatSystem {
    updateEnemies(dt) {
      const allEnemies = this.game.entities.enemies;
      const standardEnemies = [];
      const rangedEnemies = [];

      for (const enemy of allEnemies) {
        if (ENEMY_TYPES[enemy.type]?.ranged) rangedEnemies.push(enemy);
        else standardEnemies.push(enemy);
      }

      this.game.entities.enemies = standardEnemies;
      super.updateEnemies(dt);
      this.game.entities.enemies = allEnemies;
      this.updateRangedEnemies(rangedEnemies, dt);
    }

    updateRangedEnemies(enemies, dt) {
      const game = this.game;
      const player = game.player;
      if (game.isDropEffectActive('mothership')) return;

      const transformerActive = game.isDropEffectActive('transformer');
      const soldiers = transformerActive
        ? []
        : game.getSoldierPositions().filter((soldier) => !soldier.unit.dead);

      for (const enemy of enemies) {
        if (enemy.dead) continue;
        const type = ENEMY_TYPES[enemy.type];
        const ranged = type?.ranged;
        if (!ranged) continue;

        enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
        enemy.rangedCooldown = Math.max(0, (enemy.rangedCooldown ?? 0) - dt);

        const toPlayerX = player.x - enemy.x;
        const toPlayerY = player.y - enemy.y;
        const playerDistance = Math.hypot(toPlayerX, toPlayerY);
        const moveDirection = normalize(toPlayerX, toPlayerY);
        const preferredRange = ranged.preferredRange ?? ranged.range * 0.82;
        const retreatRange = ranged.retreatRange ?? preferredRange * 0.72;

        if (playerDistance > preferredRange + 24) {
          enemy.x += moveDirection.x * enemy.speed * dt;
          enemy.y += moveDirection.y * enemy.speed * dt;
        } else if (playerDistance < retreatRange) {
          enemy.x -= moveDirection.x * enemy.speed * dt;
          enemy.y -= moveDirection.y * enemy.speed * dt;
        }

        if (enemy.rangedCooldown > 0) continue;

        const target = transformerActive
          ? { x: player.x, y: player.y }
          : this.findNearestSoldierTarget(enemy.x, enemy.y, soldiers);
        if (!target) continue;

        const attackRange = ranged.range ?? 0;
        if (distanceSq(enemy.x, enemy.y, target.x, target.y) > attackRange * attackRange) continue;

        this.fireEnemyProjectile(enemy, ranged, target);
        enemy.rangedCooldown = ranged.cooldown * (0.9 + Math.random() * 0.2);
      }
    }

    findNearestSoldierTarget(x, y, soldiers) {
      let target = null;
      let bestDistance = Infinity;
      for (const soldier of soldiers) {
        const dist = distanceSq(x, y, soldier.x, soldier.y);
        if (dist >= bestDistance) continue;
        bestDistance = dist;
        target = soldier;
      }
      return target;
    }

    fireEnemyProjectile(enemy, ranged, target) {
      const direction = normalize(target.x - enemy.x, target.y - enemy.y);
      const radius = ranged.projectileRadius ?? 9;
      const speed = ranged.projectileSpeed ?? 85;

      this.game.entities.projectiles.push({
        id: this.game.entities.createId(),
        kind: 'enemy-shot',
        hostile: true,
        sourceType: enemy.type,
        x: enemy.x + direction.x * (enemy.radius + radius + 3),
        y: enemy.y + direction.y * (enemy.radius + radius + 3),
        vx: direction.x * speed,
        vy: direction.y * speed,
        radius,
        damage: enemy.rangedDamage ?? ranged.damage ?? 10,
        life: ranged.projectileLife ?? 5.4,
        color: ranged.color ?? '#a8ff72',
        dead: false,
      });
    }

    updateProjectiles(dt) {
      const allProjectiles = this.game.entities.projectiles;
      const friendly = [];
      const hostile = [];

      for (const projectile of allProjectiles) {
        if (projectile.hostile) hostile.push(projectile);
        else friendly.push(projectile);
      }

      this.game.entities.projectiles = friendly;
      super.updateProjectiles(dt);
      const updatedFriendly = this.game.entities.projectiles;
      this.game.entities.projectiles = [...updatedFriendly, ...hostile];
      this.updateEnemyProjectiles(hostile, dt);
    }

    updateEnemyProjectiles(projectiles, dt) {
      const game = this.game;
      const player = game.player;
      const mothershipActive = game.isDropEffectActive('mothership');
      const transformerActive = game.isDropEffectActive('transformer');

      for (const projectile of projectiles) {
        if (projectile.dead) continue;

        projectile.x += projectile.vx * dt;
        projectile.y += projectile.vy * dt;
        projectile.life -= dt;
        if (projectile.life <= 0) {
          projectile.dead = true;
          continue;
        }

        if (mothershipActive) continue;

        if (transformerActive) {
          const hitRadius = projectile.radius + GAME_BALANCE.player.soldierRadius * 2.4;
          if (distanceSq(projectile.x, projectile.y, player.x, player.y) > hitRadius * hitRadius) continue;

          projectile.dead = true;
          if (this.damageInvulnerability.has('transformer')) continue;

          const damage = projectile.damage * (1 - player.armor);
          if (!game.debug?.infiniteHp) game.damageMergedSquad(damage, player.x, player.y);
          this.damageInvulnerability.set('transformer', RANGED_HIT_INVULNERABILITY_DURATION);
          this.triggerRangedDamageFeedback(player.x, player.y);
          continue;
        }

        const soldiers = game.getSoldierPositions();
        for (const soldier of soldiers) {
          if (soldier.unit.dead) continue;
          const hitRadius = projectile.radius + GAME_BALANCE.player.soldierRadius;
          if (distanceSq(projectile.x, projectile.y, soldier.x, soldier.y) > hitRadius * hitRadius) continue;

          projectile.dead = true;
          const unit = soldier.unit;
          if (this.damageInvulnerability.has(unit.id)) break;

          unit.hitFlash = RANGED_DAMAGE_FEEDBACK_INTERVAL;
          if (!game.debug?.infiniteHp) {
            unit.hp = Math.max(0, unit.hp - projectile.damage * (1 - player.armor));
          }
          this.damageInvulnerability.set(unit.id, RANGED_HIT_INVULNERABILITY_DURATION);
          this.triggerRangedDamageFeedback(soldier.x, soldier.y);

          if (!game.debug?.infiniteHp && unit.hp <= 0) game.killSquadUnit(soldier);
          break;
        }
      }
    }

    triggerRangedDamageFeedback(x, y) {
      if (this.damageFeedbackCooldown > 0) return;
      this.game.triggerDamageFeedback(x, y);
      this.damageFeedbackCooldown = RANGED_DAMAGE_FEEDBACK_INTERVAL;
    }
  };
}

export class Game extends PreviousGame {
  constructor(...args) {
    super(...args);
    const RangedEnemyCombatSystem = createRangedEnemyCombatSystem(this.combatSystem.constructor);
    this.combatSystem = new RangedEnemyCombatSystem(this);
    this.combatSystem.reset();
  }

  drawProjectiles(ctx) {
    super.drawProjectiles(ctx);

    for (const projectile of this.entities.projectiles) {
      if (!projectile.hostile || projectile.dead) continue;
      const speed = Math.hypot(projectile.vx, projectile.vy) || 1;
      const tailLength = 22;
      const tailX = projectile.x - (projectile.vx / speed) * tailLength;
      const tailY = projectile.y - (projectile.vy / speed) * tailLength;

      ctx.save();
      ctx.strokeStyle = projectile.color ?? '#a8ff72';
      ctx.globalAlpha = 0.72;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(projectile.x, projectile.y);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();

      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, projectile.radius + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}

export { UI };
