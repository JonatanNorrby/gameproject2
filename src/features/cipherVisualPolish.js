import { Game as PreviousGame, UI } from './xpBlue.js';
import { CIPHER_BOSS } from '../data/bosses.js';

const TWO_PI = Math.PI * 2;
const CIPHER_SYMBOL_IDS = Object.freeze([
  'circle',
  'triangle',
  'cross',
  'diamond',
  'three_lines',
  'spiral',
  'T',
]);
const WALL_PURPLE = '#4c2384';
const WALL_PURPLE_GLOW = '#7c43c7';
const BARRAGE_RADIUS_SCALE = 1.4;
const WALL_ORB_SCALE = 1.45;

function shuffle(values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export class Game extends PreviousGame {
  generateCipherSequence() {
    return shuffle(CIPHER_SYMBOL_IDS)
      .slice(0, CIPHER_BOSS.puzzle.sequenceLength);
  }

  startCipherTargetedBarrage(boss, soloOnly) {
    const startIndex = this.cipherBarrageMarkers.length;
    super.startCipherTargetedBarrage(boss, soloOnly);
    for (let index = startIndex; index < this.cipherBarrageMarkers.length; index += 1) {
      const marker = this.cipherBarrageMarkers[index];
      marker.radius *= BARRAGE_RADIUS_SCALE;
    }
  }

  updateCipherBarrage(dt) {
    const landingMarkers = this.cipherBarrageMarkers
      .filter((marker) => !marker.exploded && marker.remaining <= dt)
      .map((marker) => ({ x: marker.x, y: marker.y, radius: marker.radius }));

    super.updateCipherBarrage(dt);

    for (const marker of landingMarkers) {
      this.spawnExplosionEffect(
        marker.x,
        marker.y,
        marker.radius * 1.65,
        '#ff6b86',
      );
    }
  }

  updateCipherWalls(dt) {
    super.updateCipherWalls(dt);
    for (const projectile of this.cipherWallProjectiles) {
      if (projectile.issue96Scaled) continue;
      projectile.issue96Scaled = true;
      projectile.radius *= WALL_ORB_SCALE;
    }
  }

  drawCipher(ctx, boss) {
    const customShield = Boolean(boss.shielded && !boss.shieldPermanentBroken);
    const originalShielded = boss.shielded;

    if (customShield) boss.shielded = false;
    try {
      super.drawCipher(ctx, boss);
    } finally {
      boss.shielded = originalShielded;
    }

    if (!customShield) return;

    const pulse = (Math.sin(this.animationClock * (boss.finalPhase ? 9 : 5)) + 1) * 0.5;
    const color = CIPHER_BOSS.colors.shield;
    ctx.save();
    ctx.translate(boss.x, boss.y);
    ctx.rotate(this.animationClock * 0.22);
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 28 + pulse * 8;
    ctx.globalAlpha = 0.68 + pulse * 0.28;
    ctx.lineWidth = 9;
    ctx.setLineDash([32, 9]);
    ctx.beginPath();
    ctx.arc(0, 0, boss.radius + 28, 0, TWO_PI);
    ctx.stroke();

    ctx.rotate(-this.animationClock * 0.5);
    ctx.globalAlpha = 0.5 + pulse * 0.28;
    ctx.lineWidth = 6;
    ctx.setLineDash([14, 15]);
    ctx.beginPath();
    ctx.arc(0, 0, boss.radius + 40, 0, TWO_PI);
    ctx.stroke();
    ctx.restore();
  }

  drawCipherHazards(ctx) {
    super.drawCipherHazards(ctx);

    const boss = this.getActiveCipher();
    const beamConfig = CIPHER_BOSS.attacks.beam;

    if (boss) {
      for (const beam of this.cipherBeams) {
        const warning = beam.phase === 'warning';
        ctx.save();
        ctx.translate(boss.x, boss.y);
        ctx.rotate(beam.angle);
        ctx.strokeStyle = warning ? 'rgba(255,72,96,.72)' : 'rgba(255,48,76,.96)';
        ctx.shadowColor = '#ff304c';
        ctx.shadowBlur = warning ? 22 : 42;
        ctx.globalAlpha = warning ? 0.78 : 0.92;
        ctx.lineWidth = warning ? 4 : 12;
        if (warning) ctx.setLineDash([18, 12]);
        ctx.beginPath();
        ctx.moveTo(boss.radius + 8, 0);
        ctx.lineTo(beamConfig.range, 0);
        ctx.stroke();
        ctx.restore();
      }
    }

    const wallConfig = CIPHER_BOSS.attacks.wall;
    for (const wall of this.cipherWalls) {
      ctx.save();
      ctx.strokeStyle = WALL_PURPLE;
      ctx.shadowColor = WALL_PURPLE_GLOW;
      ctx.shadowBlur = 24;
      ctx.lineWidth = 7;
      ctx.setLineDash([16, 9]);
      const startOffset = wallConfig.halfSpan + 90;
      if (wall.verticalLine) {
        const x = wall.centerX - wall.direction * startOffset;
        ctx.beginPath();
        ctx.moveTo(x, wall.centerY - wallConfig.halfSpan);
        ctx.lineTo(x, wall.centerY + wallConfig.halfSpan);
        ctx.stroke();
      } else {
        const y = wall.centerY - wall.direction * startOffset;
        ctx.beginPath();
        ctx.moveTo(wall.centerX - wallConfig.halfSpan, y);
        ctx.lineTo(wall.centerX + wallConfig.halfSpan, y);
        ctx.stroke();
      }
      ctx.restore();
    }

    for (const projectile of this.cipherWallProjectiles) {
      ctx.save();
      ctx.fillStyle = WALL_PURPLE;
      ctx.shadowColor = WALL_PURPLE_GLOW;
      ctx.shadowBlur = 30;
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, projectile.radius, 0, TWO_PI);
      ctx.fill();

      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#9b65e3';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, projectile.radius * 0.42, 0, TWO_PI);
      ctx.fill();
      ctx.restore();
    }
  }

  drawCipherSymbol(ctx, symbolId, x, y, size, color, lineWidth = 3) {
    if (symbolId !== 'T') {
      super.drawCipherSymbol(ctx, symbolId, x, y, size, color, lineWidth);
      return;
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-size * 0.62, -size * 0.62);
    ctx.lineTo(size * 0.62, -size * 0.62);
    ctx.moveTo(0, -size * 0.62);
    ctx.lineTo(0, size * 0.7);
    ctx.stroke();
    ctx.restore();
  }
}

export { UI };
