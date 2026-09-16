import { ENEMY_TYPES } from '../data/content.js';
import { getEnemySprite } from '../data/sprites.js';

const STUN_TINT_COLOR = '#69cfff';
const STUN_TINT_FILTER = 'brightness(0) saturate(100%) invert(81%) sepia(31%) saturate(1896%) hue-rotate(169deg) brightness(106%) contrast(101%)';
const STATIONARY_SPITTER_FRAME_TIME = 0.000001;

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

  ctx.fill();
  ctx.stroke();
  ctx.restore();
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

export function installEnemyStatusVisuals(GameClass) {
  if (!GameClass?.prototype || GameClass.prototype.enemyStatusVisualsInstalled) return;

  const inheritedDrawEnemies = GameClass.prototype.drawEnemies;
  if (typeof inheritedDrawEnemies !== 'function') return;

  GameClass.prototype.drawEnemies = function drawEnemiesWithStatusVisuals(ctx) {
    inheritedDrawEnemies.call(this, ctx);
    for (const enemy of this.entities?.enemies ?? []) {
      drawStunTint(this, ctx, enemy);
    }
  };

  Object.defineProperty(GameClass.prototype, 'enemyStatusVisualsInstalled', {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });
}
