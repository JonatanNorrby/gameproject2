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
}

export { UI };
