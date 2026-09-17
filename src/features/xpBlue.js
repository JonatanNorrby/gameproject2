import { Game as PreviousGame, UI } from './dronePilotCooldownStat.js';

const XP_ORB_COLOR = '#4da3ff';
const XP_ORB_MIN_RADIUS = 3.25;
const XP_ORB_MAX_RADIUS = 4.75;

function getXpOrbRadius(value) {
  const xp = Math.max(0, Number(value) || 0);
  return Math.min(XP_ORB_MAX_RADIUS, XP_ORB_MIN_RADIUS + Math.sqrt(xp) * 0.35);
}

export class Game extends PreviousGame {
  drawGems(ctx) {
    for (const gem of this.entities.gems) {
      if (gem.dead) continue;
      const radius = Number.isFinite(gem.radius) ? gem.radius : getXpOrbRadius(gem.value);
      const pulse = 1 + Math.sin(this.animationClock * 4.2 + gem.id * 0.37) * 0.08;

      ctx.save();
      ctx.translate(gem.x, gem.y);
      ctx.scale(pulse, pulse);

      ctx.globalAlpha = 0.22;
      ctx.fillStyle = XP_ORB_COLOR;
      ctx.shadowBlur = 22;
      ctx.shadowColor = XP_ORB_COLOR;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 2.25, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 1;
      ctx.fillStyle = XP_ORB_COLOR;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,.82)';
      ctx.beginPath();
      ctx.arc(-radius * 0.28, -radius * 0.3, Math.max(0.9, radius * 0.24), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

export { UI };
