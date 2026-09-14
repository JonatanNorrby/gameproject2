import { Game, UI as CaptainMenuUI } from './captainMenu.js';

export { Game };

export class UI extends CaptainMenuUI {
  constructor() {
    super();
    this.skipUpgradeButton = document.querySelector('#skip-upgrade-button');
  }

  showLevelUp(choices, onChoose, ranks, onSkip) {
    super.showLevelUp(choices, onChoose, ranks);

    const button = this.skipUpgradeButton ?? document.querySelector('#skip-upgrade-button');
    if (!button) return;

    this.skipUpgradeButton = button;
    button.disabled = false;
    button.onclick = () => {
      button.disabled = true;
      onSkip?.();
    };
  }

  hideLevelUp() {
    if (this.skipUpgradeButton) {
      this.skipUpgradeButton.disabled = false;
      this.skipUpgradeButton.onclick = null;
    }
    super.hideLevelUp();
  }
}
