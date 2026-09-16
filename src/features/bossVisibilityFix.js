import { Game as PreviousGame, UI as PreviousUI } from './captainSlotCompatibility.js';

function syncOpModeButton(button, enabled) {
  if (!button) return;
  button.disabled = false;
  button.setAttribute('aria-pressed', String(enabled));
  button.dataset.opModeActive = String(enabled);

  const title = button.querySelector('strong');
  if (title) title.textContent = enabled ? 'Disable OP Mode' : 'Enable OP Mode';

  const detail = button.querySelector('small');
  if (detail) {
    detail.textContent = enabled
      ? '+5000% attack rate active'
      : '+5000% attack rate';
  }
}

// #70: the monster hit-flash layer owns drawEnemies() so it can recolor normal
// mob sprites. That override intentionally does not call super.drawEnemies(),
// because doing so would draw every normal enemy twice. Boss bodies and
// Broodmother eggs used to be appended by older drawEnemies() layers, though,
// so restore only those inherited encounter renderers here at the final layer.
export class Game extends PreviousGame {
  // #51: OP mode used to be one-way. Keep the original debug flag as the single
  // source of truth, but expose an explicit setter so the debug UI can turn the
  // attack-speed multiplier both on and off during the same session.
  debugSetOpMode(enabled) {
    if (!this.debug) this.debug = {};
    this.debug.opMode = Boolean(enabled);
    this.combatSystem?.fireCooldowns?.clear?.();
    return this.debug.opMode;
  }

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

export class UI extends PreviousUI {
  installInGameDebugControls() {
    super.installInGameDebugControls();

    const opButton = this.debugPanel?.querySelector('#debug-make-op');
    if (!opButton || opButton.dataset.opToggleBound === 'true') return;
    opButton.dataset.opToggleBound = 'true';

    // runtimeSafety installed the original one-way click listener first. A
    // capture listener runs before it and stops that legacy handler, letting the
    // same button act as a reversible toggle without duplicating debug controls.
    opButton.addEventListener('click', (event) => {
      event.stopImmediatePropagation();
      if (!this.debugUnlocked) return;

      const nextEnabled = !Boolean(this.game?.debug?.opMode);
      this.game?.debugSetOpMode?.(nextEnabled);
      syncOpModeButton(opButton, Boolean(this.game?.debug?.opMode));
    }, { capture: true });

    syncOpModeButton(opButton, Boolean(this.game?.debug?.opMode));
  }

  update(game) {
    super.update(game);
    const opButton = this.debugPanel?.querySelector('#debug-make-op');
    syncOpModeButton(opButton, Boolean(game?.debug?.opMode));
  }
}
