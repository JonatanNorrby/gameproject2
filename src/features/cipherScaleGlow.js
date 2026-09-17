import { Game as PreviousGame, UI } from './runConfigurationPopups.js';
import { CIPHER_BOSS } from '../data/bosses.js';
import { withBossAttackAnimations } from './bossAttackAnimations.js';

const CIPHER_VISUAL_SCALE = 1.5;
const TWO_PI = Math.PI * 2;
const CIPHER_SEQUENCE_WARNING_DURATION = CIPHER_BOSS.puzzle.sequenceWarningDuration ?? 2;
const CIPHER_SPRITE = Object.freeze({
  basePath: './assets/cipher',
  drawWidth: 142 * CIPHER_VISUAL_SCALE,
  drawHeight: 142 * CIPHER_VISUAL_SCALE,
  preserveAspect: true,
  smoothing: true,
  animations: {
    idle: { frames: ['idle_1.png'], fps: 1, loop: false },
  },
});

class CipherScaleGlowGame extends PreviousGame {
  spawnCipher(...args) {
    const result = super.spawnCipher(...args);
    if (this.cipherBoss && !this.cipherBoss.dead) {
      this.cipherBoss.radius = CIPHER_BOSS.radius * CIPHER_VISUAL_SCALE;
    }
    return result;
  }

  beginCipherPuzzle(boss, tier) {
    const result = super.beginCipherPuzzle(boss, tier);
    if (boss?.puzzleActive && boss.state === 'puzzle_reveal') {
      this.startCipherSequenceWarning(boss);
    }
    return result;
  }

  startCipherSequenceWarning(boss) {
    if (!boss || boss.dead) return;
    boss.sequenceWarningStartedAt = this.elapsed;
    boss.sequenceWarningUntil = this.elapsed + CIPHER_SEQUENCE_WARNING_DURATION;
  }

  isCipherSequenceWarning(boss) {
    return Boolean(
      boss?.puzzleActive
      && boss.state === 'puzzle_reveal'
      && Number.isFinite(boss.sequenceWarningUntil)
      && this.elapsed < boss.sequenceWarningUntil
    );
  }

  updateCipherPuzzle(boss, dt) {
    // #86: the warning is real encounter time, not part of the symbol reveal
    // clock. Pausing revealElapsed here extends every sequence by exactly two
    // seconds while attacks continue on their normal schedule.
    if (this.isCipherSequenceWarning(boss)) return;
    return super.updateCipherPuzzle(boss, dt);
  }

  restartCipherSequence(boss, bannerText = 'NEW SEQUENCE') {
    if (!boss || boss.dead || !boss.puzzleActive) return;
    boss.sequence = this.generateCipherSequence();
    boss.revealElapsed = 0;
    boss.puzzleProgress = 0;
    boss.puzzleDeadline = Infinity;
    boss.glyphs = [];
    boss.glyphInsideIds = new Set();
    boss.state = 'puzzle_reveal';
    this.startCipherSequenceWarning(boss);
    this.setCipherBanner(bannerText, 1.05);
  }

  activateCipherGlyph(boss, glyph) {
    const expected = boss?.sequence?.[boss.puzzleProgress];
    if (!boss || !glyph || glyph.symbolId === expected) {
      return super.activateCipherGlyph(boss, glyph);
    }

    // #86: a wrong glyph is an immediate, guaranteed punishment and starts a
    // completely fresh sequence rather than merely clearing current progress.
    const captain = this.getCipherCaptainSoldier();
    if (captain) {
      this.damageSquadUnitFromBoss(captain, CIPHER_BOSS.puzzle.wrongAnswerDamage);
      this.spawnExplosionEffect(
        captain.x,
        captain.y,
        52,
        CIPHER_BOSS.colors.wrong,
      );
    }

    boss.wrongFlashUntil = this.elapsed + 0.55;
    this.restartCipherSequence(boss, 'WRONG • NEW SEQUENCE');
    return undefined;
  }

  failCipherPuzzleByTimeout(boss) {
    const result = super.failCipherPuzzleByTimeout(boss);
    if (boss?.puzzleActive && boss.state === 'puzzle_reveal') {
      this.startCipherSequenceWarning(boss);
    }
    return result;
  }

  drawCipherGlow(ctx, boss, pulse) {
    const glowRadius = boss.radius * (1.72 + pulse * 0.12);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    if (typeof ctx.createRadialGradient === 'function') {
      const gradient = ctx.createRadialGradient(
        boss.x,
        boss.y,
        boss.radius * 0.18,
        boss.x,
        boss.y,
        glowRadius,
      );
      gradient.addColorStop(0, `rgba(157,140,255,${0.34 + pulse * 0.10})`);
      gradient.addColorStop(0.42, `rgba(139,88,255,${0.22 + pulse * 0.07})`);
      gradient.addColorStop(0.72, `rgba(111,55,218,${0.11 + pulse * 0.04})`);
      gradient.addColorStop(1, 'rgba(89,38,180,0)');
      ctx.fillStyle = gradient;
    } else {
      ctx.fillStyle = 'rgba(139,88,255,.2)';
    }

    ctx.shadowColor = '#9d8cff';
    ctx.shadowBlur = 28 + pulse * 20;
    ctx.beginPath();
    ctx.arc(boss.x, boss.y, glowRadius, 0, TWO_PI);
    ctx.fill();
    ctx.restore();
  }

  drawCipherSequenceWarning(ctx, boss) {
    const flash = (Math.sin(this.animationClock * 11) + 1) * 0.5;
    ctx.save();
    ctx.translate(boss.x, boss.y - boss.radius - 92);
    ctx.globalAlpha = 0.42 + flash * 0.58;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 64px Rajdhani, sans-serif';
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(8,12,22,.92)';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 18 + flash * 16;
    ctx.strokeText('!', 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('!', 0, 0);
    ctx.restore();
  }

  drawCipher(ctx, boss) {
    const colors = CIPHER_BOSS.colors;
    const pulse = (Math.sin(this.animationClock * (boss.finalPhase ? 9 : 5)) + 1) * 0.5;

    this.drawCipherGlow(ctx, boss, pulse);

    const drawn = this.animationRenderer.draw(
      ctx,
      CIPHER_SPRITE,
      'idle',
      0,
      boss.x,
      boss.y,
    );

    if (!drawn) {
      const shellOuterRadius = boss.radius * 0.97;
      const shellInnerRadius = boss.radius * 0.79;
      ctx.save();
      ctx.translate(boss.x, boss.y);
      ctx.rotate(this.animationClock * 0.18);
      ctx.shadowBlur = boss.hitFlash > 0 ? 34 : 24;
      ctx.shadowColor = boss.hitFlash > 0 ? '#ffffff' : colors.core;
      ctx.fillStyle = boss.hitFlash > 0 ? '#ffffff' : colors.shell;
      ctx.strokeStyle = colors.shellEdge;
      ctx.lineWidth = 5;
      ctx.beginPath();
      for (let index = 0; index < 8; index += 1) {
        const angle = (TWO_PI * index) / 8 - Math.PI / 2;
        const radius = index % 2 === 0 ? shellOuterRadius : shellInnerRadius;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.rotate(-this.animationClock * 0.36);
      ctx.shadowBlur = 28 + pulse * 14;
      ctx.shadowColor = colors.core;
      ctx.fillStyle = colors.core;
      ctx.beginPath();
      ctx.arc(0, 0, boss.radius * 0.21 + pulse * 4.5, 0, TWO_PI);
      ctx.fill();
      ctx.restore();
    }

    if (boss.shielded && !boss.shieldPermanentBroken) {
      ctx.save();
      ctx.translate(boss.x, boss.y);
      ctx.rotate(this.animationClock * 0.22);
      ctx.strokeStyle = colors.shield;
      ctx.shadowColor = colors.shield;
      ctx.shadowBlur = 22;
      ctx.globalAlpha = 0.55 + pulse * 0.35;
      ctx.lineWidth = 5;
      ctx.setLineDash([30, 10]);
      ctx.beginPath();
      ctx.arc(0, 0, boss.radius + 28, 0, TWO_PI);
      ctx.stroke();
      ctx.rotate(-this.animationClock * 0.5);
      ctx.strokeStyle = colors.shieldHot;
      ctx.lineWidth = 2;
      ctx.setLineDash([12, 16]);
      ctx.beginPath();
      ctx.arc(0, 0, boss.radius + 38, 0, TWO_PI);
      ctx.stroke();
      ctx.restore();
    }

    if (this.isCipherSequenceWarning(boss)) {
      this.drawCipherSequenceWarning(ctx, boss);
    }

    const visibleSymbol = this.getCipherVisibleSymbol(boss);
    if (visibleSymbol) {
      ctx.save();
      ctx.translate(boss.x, boss.y - boss.radius - 82);
      const size = 34 + pulse * 3;
      ctx.fillStyle = 'rgba(7,14,25,.88)';
      ctx.strokeStyle = colors.glyph;
      ctx.lineWidth = 3;
      ctx.shadowBlur = 18;
      ctx.shadowColor = colors.glyph;
      ctx.beginPath();
      ctx.arc(0, 0, 48, 0, TWO_PI);
      ctx.fill();
      ctx.stroke();
      this.drawCipherSymbol(ctx, visibleSymbol, 0, 0, size, colors.glyph, 4);
      ctx.restore();
    }
  }
}

export const Game = withBossAttackAnimations(CipherScaleGlowGame);
export { UI };
