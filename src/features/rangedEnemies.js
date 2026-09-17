import { Game as PreviousGame, UI } from './upgradeBonusDisplay.js';
import { ENEMY_TYPES, GAME_BALANCE } from '../data/content.js';
import { FRAME_SPRITES, createStandardFrameSet } from '../data/sprites.js';
import { distanceSq, normalize } from '../utils/math.js';

const RANGED_DAMAGE_FEEDBACK_INTERVAL = 0.16;
const RANGED_HIT_INVULNERABILITY_DURATION = 0.1;
const BURST_SPITTER_TYPE = 'burst_spitter';
const STATIONARY_RUNNING_FRAME_TIME = 0.000001;
const ENEMY_PROJECTILE_COLOR = '#ff3b4f';

if (!FRAME_SPRITES.enemies.spitter) {
  FRAME_SPRITES.enemies.spitter = createStandardFrameSet('spitter', { drawSize: 38 });
}

if (!FRAME_SPRITES.enemies[BURST_SPITTER_TYPE]) {
  FRAME_SPRITES.enemies[BURST_SPITTER_TYPE] = createStandardFrameSet(BURST_SPITTER_TYPE, { drawSize: 72 });
} else {
  // #119: Burst Spitter artwork should match its doubled gameplay footprint.
  FRAME_SPRITES.enemies[BURST_SPITTER_TYPE].drawSize = 72;
}

// #146: shift the normal roster away from Crawlers and toward ranged pressure.
// Keep caps in place so Spitters are more common without flooding the arena.
Object.assign(ENEMY_TYPES.spitter, {
  weight: 0.75,
  maxActive: 5,
});

// #119: make the standard Spitter's acid shots substantially quicker without
// changing their damage, cooldown or collision size.
Object.assign(ENEMY_TYPES.spitter.ranged, {
  projectileSpeed: 130,
});

if (!ENEMY_TYPES[BURST_SPITTER_TYPE]) {
  ENEMY_TYPES[BURST_SPITTER_TYPE] = {
    label: 'Burst Spitter',
    radius: 26,
    speed: 50,
    hp: 52,
    damage: 0,
    xp: 4,
    fill: '#d463c7',
    outline: '#ffb5ef',
    unlockAt: 85,
    weight: 0.4,
    maxActive: 3,
    ranged: {
      range: 350,
      preferredRange: 295,
      retreatRange: 210,
      cooldown: 4.2,
      burstCount: 3,
      burstSpacing: 0.16,
      projectileSpeed: 150,
      projectileRadius: 14,
      projectileLife: 5,
      damage: 8,
      color: '#ff7ddd',
    },
  };
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

      // Movement is tracked explicitly so the Spitter renderer can freeze on
      // running_1 whenever the AI is standing still, including while firing.
      for (const enemy of enemies) {
        if (!enemy.dead) enemy.moving = false;
      }

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
        enemy.rangedBurstTimer = Math.max(0, (enemy.rangedBurstTimer ?? 0) - dt);

        const toPlayerX = player.x - enemy.x;
        const toPlayerY = player.y - enemy.y;
        const playerDistance = Math.hypot(toPlayerX, toPlayerY);
        const moveDirection = normalize(toPlayerX, toPlayerY);
        const preferredRange = ranged.preferredRange ?? ranged.range * 0.82;
        const retreatRange = ranged.retreatRange ?? preferredRange * 0.72;

        if (playerDistance > preferredRange + 24) {
          enemy.x += moveDirection.x * enemy.speed * dt;
          enemy.y += moveDirection.y * enemy.speed * dt;
          enemy.moving = true;
        } else if (playerDistance < retreatRange) {
          enemy.x -= moveDirection.x * enemy.speed * dt;
          enemy.y -= moveDirection.y * enemy.speed * dt;
          enemy.moving = true;
        }

        if ((enemy.rangedBurstRemaining ?? 0) > 0) {
          if (enemy.rangedBurstTimer > 0) continue;

          const burstTarget = this.getLockedBurstTarget(enemy, soldiers);
          if (!burstTarget) {
            this.finishEnemyBurst(enemy, ranged);
            continue;
          }

          this.fireEnemyProjectile(enemy, ranged, burstTarget);
          enemy.rangedBurstRemaining -= 1;
          if (enemy.rangedBurstRemaining > 0) {
            enemy.rangedBurstTimer = ranged.burstSpacing ?? 0.16;
          } else {
            this.finishEnemyBurst(enemy, ranged);
          }
          continue;
        }

        if (enemy.rangedCooldown > 0) continue;

        const target = transformerActive
          ? { x: player.x, y: player.y, targetsPlayer: true }
          : this.findNearestSoldierTarget(enemy.x, enemy.y, soldiers);
        if (!target) continue;

        const attackRange = ranged.range ?? 0;
        if (distanceSq(enemy.x, enemy.y, target.x, target.y) > attackRange * attackRange) continue;

        const burstCount = Math.max(1, Math.floor(ranged.burstCount ?? 1));
        this.fireEnemyProjectile(enemy, ranged, target);

        if (burstCount > 1) {
          enemy.rangedBurstRemaining = burstCount - 1;
          enemy.rangedBurstTimer = ranged.burstSpacing ?? 0.16;
          enemy.rangedBurstTargetUnitId = target.unit?.id ?? null;
          enemy.rangedBurstTargetsPlayer = Boolean(target.targetsPlayer);
        } else {
          this.finishEnemyBurst(enemy, ranged);
        }
      }
    }

    getLockedBurstTarget(enemy, soldiers) {
      if (enemy.rangedBurstTargetsPlayer) {
        return { x: this.game.player.x, y: this.game.player.y, targetsPlayer: true };
      }
      if (!Number.isFinite(enemy.rangedBurstTargetUnitId)) return null;
      return soldiers.find((soldier) => (
        !soldier.unit.dead && soldier.unit.id === enemy.rangedBurstTargetUnitId
      )) ?? null;
    }

    finishEnemyBurst(enemy, ranged) {
      enemy.rangedBurstRemaining = 0;
      enemy.rangedBurstTimer = 0;
      enemy.rangedBurstTargetUnitId = null;
      enemy.rangedBurstTargetsPlayer = false;
      enemy.rangedCooldown = ranged.cooldown * (0.9 + Math.random() * 0.2);
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
        color: ENEMY_PROJECTILE_COLOR,
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

  drawEnemies(ctx) {
    const allEnemies = this.entities.enemies;
    const spitters = [];
    const otherEnemies = [];

    for (const enemy of allEnemies) {
      if (enemy.type === 'spitter') spitters.push(enemy);
      else otherEnemies.push(enemy);
    }

    this.entities.enemies = otherEnemies;
    try {
      super.drawEnemies(ctx);
    } finally {
      this.entities.enemies = allEnemies;
    }

    for (const enemy of spitters) this.drawSpitterEnemy(ctx, enemy);
  }

  drawSpitterEnemy(ctx, enemy) {
    const type = ENEMY_TYPES.spitter;
    const sprite = FRAME_SPRITES.enemies.spitter;
    const moving = Boolean(enemy.moving);
    const spriteDrawn = this.animationRenderer.draw(
      ctx,
      sprite,
      'running',
      moving ? this.animationClock : STATIONARY_RUNNING_FRAME_TIME,
      enemy.x,
      enemy.y,
      { phase: moving ? enemy.id * 0.071 : 0 },
    );

    if (spriteDrawn) {
      if (enemy.hitFlash > 0) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, enemy.radius + 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      return;
    }

    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.fillStyle = enemy.hitFlash > 0 ? '#ffffff' : type.fill;
    ctx.strokeStyle = type.outline;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  drawProjectiles(ctx) {
    super.drawProjectiles(ctx);

    for (const projectile of this.entities.projectiles) {
      if (!projectile.hostile || projectile.dead || projectile.kind !== 'enemy-shot') continue;
      const speed = Math.hypot(projectile.vx, projectile.vy) || 1;
      const tailLength = 22;
      const tailX = projectile.x - (projectile.vx / speed) * tailLength;
      const tailY = projectile.y - (projectile.vy / speed) * tailLength;

      ctx.save();
      ctx.strokeStyle = ENEMY_PROJECTILE_COLOR;
      ctx.shadowColor = ENEMY_PROJECTILE_COLOR;
      ctx.shadowBlur = 22;
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(projectile.x, projectile.y);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();

      ctx.globalAlpha = 1;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, projectile.radius + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}

export { UI };
