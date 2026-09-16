import { ENEMY_TYPES, GAME_BALANCE } from '../data/content.js';
import { getEnemySprite } from '../data/sprites.js';

const STUN_TINT_COLOR = '#69cfff';
const STUN_TINT_FILTER = 'brightness(0) saturate(100%) invert(81%) sepia(31%) saturate(1896%) hue-rotate(169deg) brightness(106%) contrast(101%)';
const ENEMY_DAMAGE_FILTER = 'brightness(.72) saturate(7) sepia(1) hue-rotate(305deg) contrast(1.18)';
const STATIONARY_SPITTER_FRAME_TIME = 0.000001;
const RANGED_ATTACK_FRAME_DURATION = 0.28;
const CHARGER_TYPE = 'charger';

function drawEnemyShape(ctx, enemy) {
  if (enemy.type === 'runner') {
    ctx.moveTo(0, -enemy.radius);
    ctx.lineTo(enemy.radius, enemy.radius);
    ctx.lineTo(-enemy.radius, enemy.radius);
    ctx.closePath();
  } else if (enemy.type === 'brute') {
    const radius = enemy.radius;
    ctx.rect(-radius, -radius, radius * 2, radius * 2);
  } else {
    ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2);
  }
}

function drawFallbackTint(ctx, enemy) {
  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  ctx.globalAlpha = 0.46;
  ctx.fillStyle = STUN_TINT_COLOR;
  ctx.strokeStyle = '#b9f3ff';
  ctx.lineWidth = 2;
  ctx.shadowBlur = 16;
  ctx.shadowColor = STUN_TINT_COLOR;
  ctx.beginPath();
  drawEnemyShape(ctx, enemy);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawFallbackEnemy(ctx, enemy, type, takingDamage) {
  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  ctx.fillStyle = takingDamage ? '#ff314b' : type.fill;
  ctx.strokeStyle = takingDamage ? '#ffc0c8' : type.outline;
  ctx.shadowBlur = takingDamage ? 18 : 0;
  ctx.shadowColor = takingDamage ? '#ff263f' : 'transparent';
  ctx.lineWidth = 2;
  ctx.beginPath();
  drawEnemyShape(ctx, enemy);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawEnemyAttackFrame(game, ctx, enemy) {
  const type = ENEMY_TYPES[enemy.type];
  if (!type || enemy.dead) return;

  const takingDamage = (enemy.hitFlash ?? 0) > 0;
  const sprite = getEnemySprite(enemy.type);

  ctx.save();
  if (takingDamage) {
    ctx.filter = ENEMY_DAMAGE_FILTER;
    ctx.shadowBlur = 18;
    ctx.shadowColor = '#ff263f';
  }
  const spriteDrawn = game.animationRenderer.draw(
    ctx,
    sprite,
    'shooting',
    0,
    enemy.x,
    enemy.y,
  );
  ctx.restore();

  if (!spriteDrawn) drawFallbackEnemy(ctx, enemy, type, takingDamage);

  // The inherited final normal-enemy renderer also owns this telegraph. Since
  // attacking enemies are temporarily removed from that pass, restore it here.
  if (enemy.type === CHARGER_TYPE) game.drawChargerTelegraph?.(ctx, enemy);
}

function drawStunTint(game, ctx, enemy) {
  if (
    enemy.dead
    || !ENEMY_TYPES[enemy.type]
    || (enemy.stunnedUntil ?? 0) <= game.elapsed
    || (enemy.hitFlash ?? 0) > 0
  ) return;

  const sprite = getEnemySprite(enemy.type);
  const stationarySpitter = enemy.type === 'spitter' && !enemy.moving;

  ctx.save();
  ctx.globalAlpha = 0.46;
  ctx.filter = STUN_TINT_FILTER;
  ctx.shadowBlur = 16;
  ctx.shadowColor = STUN_TINT_COLOR;
  const spriteDrawn = game.animationRenderer.draw(
    ctx,
    sprite,
    'running',
    stationarySpitter ? STATIONARY_SPITTER_FRAME_TIME : game.animationClock,
    enemy.x,
    enemy.y,
    { phase: stationarySpitter ? 0 : enemy.id * 0.071 },
  );
  ctx.restore();

  if (!spriteDrawn) drawFallbackTint(ctx, enemy);
}

function markRangedEnemyAttack(game, enemy) {
  if (!enemy || enemy.dead) return;
  enemy.attackAnimationUntil = Math.max(
    Number(enemy.attackAnimationUntil) || 0,
    game.elapsed + RANGED_ATTACK_FRAME_DURATION,
  );
}

function installEnemyAttackTracking(game) {
  const combatSystem = game.combatSystem;
  if (!combatSystem || game.enemyAttackTrackingCombatSystem === combatSystem) return;

  game.enemyAttackTrackingCombatSystem = combatSystem;
  const inheritedFireEnemyProjectile = combatSystem.fireEnemyProjectile;
  if (typeof inheritedFireEnemyProjectile !== 'function') return;

  combatSystem.fireEnemyProjectile = function fireEnemyProjectileWithAnimation(enemy, ...args) {
    const result = inheritedFireEnemyProjectile.call(this, enemy, ...args);
    markRangedEnemyAttack(game, enemy);
    return result;
  };
}

function getMeleeTargets(game) {
  if (game.isDropEffectActive?.('transformer')) {
    return [{
      x: game.player.x,
      y: game.player.y,
      radius: GAME_BALANCE.player.soldierRadius * 2.4,
    }];
  }

  return (game.getSoldierPositions?.() ?? [])
    .filter((soldier) => soldier?.unit && !soldier.unit.dead)
    .map((soldier) => ({
      x: soldier.x,
      y: soldier.y,
      radius: GAME_BALANCE.player.soldierRadius,
    }));
}

function isEnemyAttacking(game, enemy, meleeTargets) {
  if (!enemy || enemy.dead) return false;
  if (game.isDropEffectActive?.('mothership')) return false;
  if ((enemy.stunnedUntil ?? 0) > game.elapsed) return false;

  if ((enemy.attackAnimationUntil ?? 0) > game.elapsed) return true;

  const type = ENEMY_TYPES[enemy.type];
  if (!type || type.ranged) return false;
  if (enemy.type === CHARGER_TYPE && enemy.chargeState === 'charging') return true;

  const extraRadius = enemy.type === CHARGER_TYPE && enemy.chargeState === 'charging' ? 5 : 0;
  for (const target of meleeTargets) {
    const radius = enemy.radius + target.radius + extraRadius;
    const dx = target.x - enemy.x;
    const dy = target.y - enemy.y;
    if (dx * dx + dy * dy <= radius * radius) return true;
  }
  return false;
}

export function installEnemyStatusVisuals(GameClass) {
  if (!GameClass?.prototype || GameClass.prototype.enemyStatusVisualsInstalled) return;

  const inheritedUpdate = GameClass.prototype.update;
  const inheritedDrawEnemies = GameClass.prototype.drawEnemies;
  if (typeof inheritedDrawEnemies !== 'function') return;

  if (typeof inheritedUpdate === 'function') {
    GameClass.prototype.update = function updateWithEnemyAttackTracking(dt) {
      installEnemyAttackTracking(this);
      return inheritedUpdate.call(this, dt);
    };
  }

  GameClass.prototype.drawEnemies = function drawEnemiesWithStatusVisuals(ctx) {
    installEnemyAttackTracking(this);

    const allEnemies = this.entities?.enemies ?? [];
    const meleeTargets = getMeleeTargets(this);
    const attackingEnemies = allEnemies.filter((enemy) => (
      isEnemyAttacking(this, enemy, meleeTargets)
    ));

    if (attackingEnemies.length === 0) {
      inheritedDrawEnemies.call(this, ctx);
    } else {
      const attackingIds = new Set(attackingEnemies.map((enemy) => enemy.id));
      this.entities.enemies = allEnemies.filter((enemy) => !attackingIds.has(enemy.id));
      try {
        inheritedDrawEnemies.call(this, ctx);
      } finally {
        this.entities.enemies = allEnemies;
      }

      for (const enemy of attackingEnemies) drawEnemyAttackFrame(this, ctx, enemy);
    }

    for (const enemy of allEnemies) drawStunTint(this, ctx, enemy);
  };

  Object.defineProperty(GameClass.prototype, 'enemyStatusVisualsInstalled', {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });
}
