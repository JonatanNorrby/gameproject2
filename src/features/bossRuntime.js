import { Game as PreviousGame, UI as PreviousUI } from './broodmotherBoss.js';

export class Game extends PreviousGame {
  update(dt) {
    super.update(dt);

    // Stable per-frame phase values for egg pulses. Eggs are created dynamically,
    // so assign a deterministic index before the render pass.
    for (let index = 0; index < (this.broodEggs?.length ?? 0); index += 1) {
      this.broodEggs[index].index = index;
    }
  }
}

export class UI extends PreviousUI {
  update(game) {
    super.update(game);

    // The shared boss HUD is reused by encounters. Restore the first boss label
    // after later boss layers have occupied it.
    if (game.getActiveWarden?.() && !game.getActiveBroodmother?.() && this.wardenHud) {
      const name = this.wardenHud.querySelector('.boss-hud__name');
      if (name) name.textContent = 'THE WARDEN';
    }

    // All boss intros share the same arrival element. Always collapse it after
    // whichever intro is active finishes, instead of leaving cleanup to a
    // boss-specific UI layer.
    const anyBossIntroActive = Boolean(
      game.wardenIntro?.active
      || game.broodIntro?.active
      || game.cipherIntro?.active
    );
    if (!anyBossIntroActive && this.bossArrivalNotice) {
      this.bossArrivalNotice.style.opacity = '0';
      this.bossArrivalNotice.style.transform = 'scale(.9)';
    }
  }
}
