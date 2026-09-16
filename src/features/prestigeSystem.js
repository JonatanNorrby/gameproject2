import { Game as PreviousGame, UI as PreviousUI } from './chargerEnemy.js';
import { CAPTAINS } from '../data/content.js';
import { FRAME_SPRITES } from '../data/sprites.js';
import { resetUnlockProgress } from '../data/unlocks.js';
import { resetPermanentProgression } from '../data/metaUpgrades.js';
import {
  applyPrestige,
  getPrestigeAttackRateMultiplier,
  getPrestigePreview,
  getPrestigeState,
  recordHighestRunLevel,
  resetPrestigeProgress,
} from '../data/prestige.js';

const SECRET_CAPTAIN_ID = 'supreme_commander';

function createDebugButton(title, detail = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'debug-control debug-control--button';
  const strong = document.createElement('strong');
  strong.textContent = title;
  button.append(strong);
  if (detail) {
    const small = document.createElement('small');
    small.textContent = detail;
    button.append(small);
  }
  return button;
}

export class Game extends PreviousGame {
  start() {
    super.start();
    recordHighestRunLevel(this.player?.level ?? 1);
  }

  update(dt) {
    super.update(dt);
    if (this.running) recordHighestRunLevel(this.player?.level ?? 1);
  }

  getAttackSpeedMultiplier() {
    return super.getAttackSpeedMultiplier() * getPrestigeAttackRateMultiplier();
  }

  // #37: Supreme Commander artwork is authored facing south. Never rotate the
  // sprite with movement direction; movement/firing logic still behaves normally.
  getUnitSpriteRotation(sprite, animationName) {
    if (sprite === FRAME_SPRITES.captains[SECRET_CAPTAIN_ID]) return 0;
    return super.getUnitSpriteRotation(sprite, animationName);
  }

  drawPlayer(ctx) {
    if (
      this.isSupremeCommanderRun?.()
      && this.getSupremeCommanderUnit?.()
      && !this.isDropEffectActive('mothership')
      && !this.isDropEffectActive('transformer')
    ) {
      this.drawSupremeCommanderGlow(ctx);
    }
    super.drawPlayer(ctx);
  }

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

    ctx.globalAlpha = 0.42 + pulse * 0.28;
    ctx.strokeStyle = '#f7d774';
    ctx.lineWidth = 2;
    ctx.shadowBlur = 22;
    ctx.shadowColor = '#f7d774';
    ctx.beginPath();
    ctx.arc(this.player.x, this.player.y + 4, 28 + pulse * 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

export class UI extends PreviousUI {
  constructor(...args) {
    super(...args);
    this.prestigeButton = document.querySelector('#reset-progress-button');
    if (this.prestigeButton) {
      // Rename before main.js queries the old reset id. This intentionally
      // prevents the legacy reset handler from binding to the Prestige button.
      this.prestigeButton.id = 'prestige-button';
      this.prestigeButton.addEventListener('click', () => this.handlePrestige());
      this.renderPrestigeButton();
    }
  }

  getPrestigePreview() {
    return getPrestigePreview();
  }

  renderPrestigeButton() {
    if (!this.prestigeButton) return;
    const state = getPrestigeState();
    this.prestigeButton.textContent = state.attackRateBonus > 0
      ? `Prestige • +${state.attackRateBonus}% ATK`
      : 'Prestige';
    this.prestigeButton.title = `Highest level this prestige: ${state.highestRunLevel}`;
  }

  resetMenuProgressState() {
    this.selectedCaptainId = null;
    this.selectedSecondCaptainId = null;
    this.captainSelectionRequired = false;
    this.renderCaptainOptions?.();
    this.renderSelectedCaptainSummary?.();
    this.renderPermanentShop?.();
    this.renderRunConfiguration?.();
    this.renderPrestigeButton();
  }

  handlePrestige() {
    const preview = getPrestigePreview();
    if (preview.gain <= 0) {
      window.alert('Complete a run and gain levels before prestiging.');
      return;
    }

    const confirmed = window.confirm(
      `Prestige will reset Captain unlocks, Gold and permanent upgrades.\n\n`
      + `Current prestige attack rate: +${preview.current}%\n`
      + `Highest level this prestige: ${preview.highestRunLevel}\n`
      + `Attack rate gained now: +${preview.gain}%\n`
      + `Total after prestige: +${preview.total}%\n\n`
      + 'Prestige now?',
    );
    if (!confirmed) return;

    applyPrestige();
    resetUnlockProgress();
    resetPermanentProgression();
    this.resetMenuProgressState();

    this.prestigeButton.textContent = `PRESTIGED • +${getPrestigeState().attackRateBonus}% ATK`;
    window.setTimeout(() => this.renderPrestigeButton(), 1500);
  }

  resetEverythingFromDebug() {
    resetUnlockProgress();
    resetPermanentProgression();
    resetPrestigeProgress();
    this.resetMenuProgressState();
    this.setMainDebugOpen?.(false);
  }

  bindDebug(config) {
    super.bindDebug(config);
    this.installFullResetDebugControl();
  }

  installFullResetDebugControl() {
    const panel = this.mainDebugPanel ?? document.querySelector('#main-debug-panel');
    if (!panel || panel.querySelector('#debug-reset-all-progress')) return;

    const heading = document.createElement('div');
    heading.className = 'debug-drop-heading';
    heading.textContent = 'SYSTEM';
    panel.append(heading);

    const resetButton = createDebugButton(
      'Reset ALL Progress',
      'Erase Captains, Gold, upgrades and all Prestige attack rate',
    );
    resetButton.id = 'debug-reset-all-progress';
    resetButton.addEventListener('click', () => {
      if (!this.debugUnlocked) return;
      const confirmed = window.confirm(
        'Completely reset ALL progress, including Prestige attack rate? This cannot be undone.',
      );
      if (!confirmed) return;
      this.resetEverythingFromDebug();
    });
    panel.append(resetButton);
  }

  renderSelectedCaptainSummary(...args) {
    super.renderSelectedCaptainSummary(...args);
    const summary = this.selectedCaptainSummary ?? document.querySelector('#selected-captain-summary');
    if (!summary) return;
    summary.classList.toggle(
      'selected-captain-summary--supreme',
      this.getSelectedCaptainId?.() === SECRET_CAPTAIN_ID,
    );
  }

  renderCaptainOptions(...args) {
    super.renderCaptainOptions(...args);
    const options = this.captainOptions ?? document.querySelector('#captain-options');
    if (!options) return;

    options.classList.add('captain-select-grid--revamped');
    options.style.gridTemplateColumns = '';

    const captains = Object.values(CAPTAINS);
    const cards = [...options.querySelectorAll('.captain-select-card')];
    cards.forEach((card, index) => {
      const captain = captains[index];
      if (!captain) return;
      const unlocked = !card.disabled;
      const selected = card.getAttribute('aria-pressed') === 'true';
      card.dataset.captainId = captain.id;
      card.classList.toggle('captain-select-card--locked', !unlocked);
      card.classList.toggle('captain-select-card--active', selected);

      if (captain.id !== SECRET_CAPTAIN_ID || unlocked) return;

      // #35: the final Captain is deliberately a mystery until unlocked. Do
      // not expose the name, role, portrait, description or requirement text.
      card.classList.add('captain-select-card--secret');
      card.style.removeProperty('--rarity-color');
      card.setAttribute('aria-label', 'Secret Captain, locked');
      card.innerHTML = `
        <span class="captain-secret__lock">CLASSIFIED</span>
        <span class="captain-secret__question" aria-hidden="true">?</span>
        <strong>???</strong>
        <small>SECRET CAPTAIN</small>
      `;
    });
  }
}
