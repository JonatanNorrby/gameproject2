import { Game as PreviousGame, UI as PreviousUI } from './wardenBoss.js';
import { WARDEN_BOSS } from '../data/bosses.js';

// Warden body artwork stays independent from its detached armor, exposed-core
// feedback and attack telegraphs. Missing art intentionally falls back to the
// original procedural body renderer in wardenBoss.js.
const WARDEN_SPRITE = Object.freeze({
  basePath: './assets/warden',
  drawWidth: 144,
  drawHeight: 144,
  preserveAspect: true,
  smoothing: true,
  animations: {
    idle: { frames: ['idle_1.png'], fps: 1, loop: false },
  },
});

const SOURCE_FORWARD_ANGLE = Math.PI / 2;

function drawWardenEnrageAlert(ctx, boss, animationClock) {
  if (!boss?.enraged) return;

  const flashOn = Math.sin(animationClock * 14) > -0.15;
  const bob = Math.sin(animationClock * 7) * 3;
  const x = boss.x;
  const y = boss.y - boss.radius - 46 + bob;

  ctx.save();
  ctx.globalAlpha = flashOn ? 1 : 0.18;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 50px Rajdhani, Arial Narrow, sans-serif';
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(255,255,255,.92)';
  ctx.fillStyle = '#ff425f';
  ctx.shadowColor = '#ff425f';
  ctx.shadowBlur = flashOn ? 24 : 8;
  ctx.strokeText('!', x, y);
  ctx.fillText('!', x, y);
  ctx.restore();
}

export class Game extends PreviousGame {
  drawWarden(ctx, boss) {
    const drawn = this.animationRenderer.draw(
      ctx,
      WARDEN_SPRITE,
      'idle',
      0,
      boss.x,
      boss.y,
      { rotation: boss.facingAngle - SOURCE_FORWARD_ANGLE },
    );

    if (!drawn) {
      // The procedural fallback still contains the legacy enrage ring. Hide
      // only that draw-time state, then restore it immediately so gameplay
      // continues to treat the Warden as enraged.
      const wasEnraged = boss.enraged;
      if (wasEnraged) boss.enraged = false;
      try {
        super.drawWarden(ctx, boss);
      } finally {
        boss.enraged = wasEnraged;
      }
      drawWardenEnrageAlert(ctx, boss, this.animationClock);
      return;
    }

    const colors = WARDEN_BOSS.colors;
    const coreExposed = boss.coreExposedUntil > this.elapsed;
    const pulse = (Math.sin(this.animationClock * (boss.enraged ? 9 : 5)) + 1) * 0.5;

    // Damage feedback is supplied by the shared enemy-status visual layer so
    // bosses use the same faded red halo as normal mobs instead of a white ring.

    // Core exposure remains a runtime mechanic rather than artwork so a missed
    // Charge still has an unmistakable punish window with any future sprite.
    if (coreExposed) {
      ctx.save();
      ctx.translate(boss.x, boss.y);
      ctx.shadowColor = colors.coreHot;
      ctx.shadowBlur = 24 + pulse * 12;
      ctx.fillStyle = colors.coreHot;
      ctx.globalAlpha = 0.58 + pulse * 0.32;
      ctx.beginPath();
      ctx.arc(0, 0, 15 + pulse * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = colors.core;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.82;
      ctx.beginPath();
      ctx.arc(0, 0, 23 + pulse * 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // #85: use a flashing overhead warning instead of the old red enrage ring.
    drawWardenEnrageAlert(ctx, boss, this.animationClock);
  }
}

export class UI extends PreviousUI {}
