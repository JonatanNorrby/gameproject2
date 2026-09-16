import { Game as PreviousGame, UI } from './captainSlotCompatibility.js';

// #70: the monster hit-flash layer owns drawEnemies() so it can recolor normal
// mob sprites. That override intentionally does not call super.drawEnemies(),
// because doing so would draw every normal enemy twice. Boss bodies and
// Broodmother eggs used to be appended by older drawEnemies() layers, though,
// so restore only those inherited encounter renderers here at the final layer.
export class Game extends PreviousGame {
  drawEnemies(ctx) {
    super.drawEnemies(ctx);
    this.drawBossEncounterEntities(ctx);
  }

  drawBossEncounterEntities(ctx) {
    // Broodmother eggs are encounter entities rather than ENEMY_TYPES mobs and
    // were also skipped when the normal-enemy renderer was replaced.
    this.drawBroodEggs?.(ctx);

    const warden = this.getActiveWarden?.();
    if (warden) this.drawWarden?.(ctx, warden);

    const broodmother = this.getActiveBroodmother?.();
    if (broodmother) this.drawBroodmother?.(ctx, broodmother);

    const cipher = this.getActiveCipher?.();
    if (cipher) this.drawCipher?.(ctx, cipher);
  }

  // #50: keep the Supreme Commander's soft animated glow, but remove the
  // distinct circular platform/ring underneath the unit.
  drawSupremeCommanderGlow(ctx) {
    const commander = this.getSupremeCommanderUnit?.();
    if (!commander) return;

    const pulse = 0.5 + 0.5 * Math.sin(this.animationClock * 2.8);
    const radius = 48 + pulse * 10;
    const gradient = ctx.createRadialGradient(
      this.player.x,
      this.player.y,
      8,
      this.player.x,
      this.player.y,
      radius,
    );
    gradient.addColorStop(0, `rgba(247, 215, 116, ${0.22 + pulse * 0.08})`);
    gradient.addColorStop(0.45, `rgba(126, 249, 212, ${0.12 + pulse * 0.06})`);
    gradient.addColorStop(1, 'rgba(126, 249, 212, 0)');

    ctx.save();
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(this.player.x, this.player.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export { UI };
