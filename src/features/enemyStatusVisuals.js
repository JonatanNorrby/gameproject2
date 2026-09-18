import { ENEMY_TYPES, GAME_BALANCE } from '../data/content.js';
import { getEnemySprite } from '../data/sprites.js';

const STUN_TINT_COLOR = '#69cfff';
const STUN_TINT_FILTER = 'brightness(0) saturate(100%) invert(81%) sepia(31%) saturate(1896%) hue-rotate(169deg) brightness(106%) contrast(101%)';
const STATIONARY_SPITTER_FRAME_TIME = 0.000001;
const RANGED_ATTACK_FRAME_DURATION = 0.28;
const CHARGER_TYPE = 'charger';
const MAX_ACTIVE_PARTICLES = 220;
const DAMAGE_GLOW_COLOR = '#ff334d';

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

function drawDamageGlow(ctx, enemy) {
  // #147: cheap translucent fills sit behind the sprite instead of using
  // Canvas filters/shadowBlur, avoiding the old multi-hit render spikes.
  const radius = enemy.radius + 4;
  ctx.save();
  ctx.fillStyle = DAMAGE_GLOW_COLOR;
  ctx.globalAlpha = 0.07;
  ctx.beginPath();
  ctx.arc(enemy.x, enemy.y, radius * 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.12;
  ctx.beginPath();
  ctx.arc(enemy.x, enemy.y, radius * 1.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.2;
  ctx.beginPath();
  ctx.arc(enemy.x, enemy.y, radius * 1.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawFallbackEnemy(ctx, enemy, type) {
  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  ctx.fillStyle = type.fill;
  ctx.strokeStyle = type.outline;
  ctx.lineWidth = 2;
  ctx.beginPath();
  drawEnemyShape(ctx, enemy);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawEnemyFrame(game, ctx, enemy, attacking) {
  const type = ENEMY_TYPES[enemy.type];
  if (!type || enemy.dead) return;

  const takingDamage = (enemy.hitFlash ?? 0) > 0;
  const sprite = getEnemySprite(enemy.type);
  if (takingDamage) drawDamageGlow(ctx, enemy);

  const animationName = attacking ? 'shooting' : 'running';
  const animationTime = attacking ? 0 : game.animationClock;
  const spriteDrawn = game.animationRenderer.draw(
    ctx,
    sprite,
    animationName,
    animationTime,
    enemy.x,
    enemy.y,
    { phase: attacking ? 0 : enemy.id * 0.071 },
  );

  if (!spriteDrawn) drawFallbackEnemy(ctx, enemy, type);

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

function installBossDamageGlow(GameClass, methodName) {
  const inheritedDrawBoss = GameClass.prototype[methodName];
  if (typeof inheritedDrawBoss !== 'function') return;

  GameClass.prototype[methodName] = function drawBossWithMobDamageGlow(ctx, boss, ...args) {
    const hitFlash = Math.max(0, Number(boss?.hitFlash) || 0);
    if (hitFlash <= 0) return inheritedDrawBoss.call(this, ctx, boss, ...args);

    // Bosses use the exact same lightweight red damage halo as normal mobs.
    // Temporarily suppress the legacy boss hitFlash renderers so their white
    // circles/body flashes do not draw over the shared damage graphic.
    drawDamageGlow(ctx, boss);
    boss.hitFlash = 0;
    try {
      return inheritedDrawBoss.call(this, ctx, boss, ...args);
    } finally {
      boss.hitFlash = hitFlash;
    }
  };
}

export function installEnemyStatusVisuals(GameClass) {
  if (!GameClass?.prototype || GameClass.prototype.enemyStatusVisualsInstalled) return;

  const inheritedUpdate = GameClass.prototype.update;
  const inheritedDrawEnemies = GameClass.prototype.drawEnemies;
  const inheritedCreateParticle = GameClass.prototype.createParticle;
  if (typeof inheritedDrawEnemies !== 'function') return;

  // #143: multi-hit attacks can otherwise create hundreds of short-lived
  // cosmetic particles in one frame. Bound that work without changing damage,
  // hit detection, drops or any other gameplay result.
  if (typeof inheritedCreateParticle === 'function') {
    GameClass.prototype.createParticle = function createParticleWithBudget(...args) {
      if ((this.entities?.particles?.length ?? 0) >= MAX_ACTIVE_PARTICLES) return null;
      return inheritedCreateParticle.apply(this, args);
    };
  }

  if (typeof inheritedUpdate === 'function') {
    GameClass.prototype.update = function updateWithEnemyAttackTracking(dt) {
      installEnemyAttackTracking(this);
      return inheritedUpdate.call(this, dt);
    };
  }

  for (const methodName of ['drawWarden', 'drawBroodmother', 'drawCipher']) {
    installBossDamageGlow(GameClass, methodName);
  }

  GameClass.prototype.drawEnemies = function drawEnemiesWithStatusVisuals(ctx) {
    installEnemyAttackTracking(this);

    const allEnemies = this.entities?.enemies ?? [];
    const meleeTargets = getMeleeTargets(this);

    // #143: older enemy hit-flash rendering applies an expensive Canvas filter
    // and shadow blur to every damaged sprite. AoE/piercing hits can make many
    // enemies flash simultaneously, producing a large render spike. Hide normal
    // enemies from that inherited pass so it still renders bosses/encounter
    // entities, then render normal mobs once with a lightweight red halo behind
    // damaged sprites. The halo uses only simple fills: no filter or shadow blur.
    this.entities.enemies = [];
    try {
      inheritedDrawEnemies.call(this, ctx);
    } finally {
      this.entities.enemies = allEnemies;
    }

    for (const enemy of allEnemies) {
      drawEnemyFrame(this, ctx, enemy, isEnemyAttacking(this, enemy, meleeTargets));
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
