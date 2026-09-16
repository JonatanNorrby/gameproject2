import { Game, UI as CaptainMenuUI } from './captainMenu.js';

export { Game };

export class UI extends CaptainMenuUI {
  constructor() {
    super();
    this.skipUpgradeButton = document.querySelector('#skip-upgrade-button');
    this.rerollUpgradeButton = document.querySelector('#reroll-upgrade-button');
  }

  showLevelUp(choices, onChoose, ranks, onSkip) {
    super.showLevelUp(choices, onChoose, ranks);

    const skipButton = this.skipUpgradeButton ?? document.querySelector('#skip-upgrade-button');
    if (skipButton) {
      this.skipUpgradeButton = skipButton;
      skipButton.disabled = false;
      skipButton.onclick = () => {
        skipButton.disabled = true;
        onSkip?.();
      };
    }

    const rerollButton = this.rerollUpgradeButton ?? document.querySelector('#reroll-upgrade-button');
    if (!rerollButton) return;

    this.rerollUpgradeButton = rerollButton;
    const progression = this.game?.progression;
    const remaining = Math.max(0, Number(progression?.rerolls) || 0);
    rerollButton.textContent = `Reroll (${remaining})`;
    rerollButton.disabled = remaining <= 0 || !progression?.rerollCurrentChoices;
    rerollButton.onclick = () => {
      if (rerollButton.disabled) return;
      rerollButton.disabled = true;
      const rerolled = progression.rerollCurrentChoices();
      if (!rerolled) {
        const current = Math.max(0, Number(progression?.rerolls) || 0);
        rerollButton.textContent = `Reroll (${current})`;
        rerollButton.disabled = current <= 0;
      }
    };
  }

  hideLevelUp() {
    if (this.skipUpgradeButton) {
      this.skipUpgradeButton.disabled = false;
      this.skipUpgradeButton.onclick = null;
    }
    if (this.rerollUpgradeButton) {
      this.rerollUpgradeButton.disabled = false;
      this.rerollUpgradeButton.onclick = null;
    }
    super.hideLevelUp();
  }
}
