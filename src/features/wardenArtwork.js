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
      super.drawWarden(ctx, boss);
      return;
    }

    const colors = WARDEN_BOSS.colors;
    const coreExposed = boss.coreExposedUntil > this.elapsed;
    const pulse = (Math.sin(this.animationClock * (boss.enraged ? 9 : 5)) + 1) * 0.5;

    // Preserve readable damage feedback even though the PNG itself is not
    // recolored by the shared frame renderer.
    if (boss.hitFlash > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,.95)';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 20;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(boss.x, boss.y, boss.radius + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

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

    // Keep the existing enrage state visible outside the replaceable body art.
    if (boss.enraged) {
      ctx.save();
      ctx.strokeStyle = `rgba(255,66,95,${0.45 + pulse * 0.35})`;
      ctx.shadowColor = colors.telegraph;
      ctx.shadowBlur = 15 + pulse * 10;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(boss.x, boss.y, boss.radius + 12 + pulse * 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}

export class UI extends PreviousUI {}
