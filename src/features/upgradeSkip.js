import { Game, UI as CaptainMenuUI } from './captainMenu.js';

export { Game };

const BUILD_VERSION = 78;

export class UI extends CaptainMenuUI {
  constructor() {
    super();
    this.skipUpgradeButton = document.querySelector('#skip-upgrade-button');
    this.rerollUpgradeButton = document.querySelector('#reroll-upgrade-button');
    this.ensureUpgradeChoiceControls();

    // Keep the visible build label in sync without coupling the reroll feature
    // to the application's boot logic. main.js may set its legacy value during
    // the same module turn, so apply this after initialization finishes.
    window.queueMicrotask(() => {
      if (this.versionText) this.versionText.textContent = `v${BUILD_VERSION}`;
      const bootVersion = document.querySelector('#boot-version');
      const mainMenuBuild = document.querySelector('.main-menu__build');
      if (bootVersion) bootVersion.textContent = `BUILD v${BUILD_VERSION}`;
      if (mainMenuBuild) mainMenuBuild.textContent = `SYSTEM ONLINE • v${BUILD_VERSION}`;
    });
  }

  ensureUpgradeChoiceControls() {
    const skipButton = this.skipUpgradeButton ?? document.querySelector('#skip-upgrade-button');
    if (!skipButton) return;
    this.skipUpgradeButton = skipButton;

    let controls = document.querySelector('#upgrade-choice-controls');
    if (!controls) {
      controls = document.createElement('div');
      controls.id = 'upgrade-choice-controls';
      Object.assign(controls.style, {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '10px',
        flexWrap: 'wrap',
        margin: '18px auto 0',
      });
      skipButton.before(controls);
      controls.append(skipButton);
      skipButton.style.margin = '0';
    }

    let rerollButton = this.rerollUpgradeButton ?? document.querySelector('#reroll-upgrade-button');
    if (!rerollButton) {
      rerollButton = document.createElement('button');
      rerollButton.id = 'reroll-upgrade-button';
      rerollButton.type = 'button';
      rerollButton.className = 'captain-menu-button';
      rerollButton.textContent = 'Reroll (3)';
      rerollButton.style.margin = '0';
      controls.prepend(rerollButton);
    }
    this.rerollUpgradeButton = rerollButton;
  }

  showLevelUp(choices, onChoose, ranks, onSkip) {
    super.showLevelUp(choices, onChoose, ranks);
    this.ensureUpgradeChoiceControls();

    const skipButton = this.skipUpgradeButton;
    if (skipButton) {
      skipButton.disabled = false;
      skipButton.onclick = () => {
        skipButton.disabled = true;
        onSkip?.();
      };
    }

    const rerollButton = this.rerollUpgradeButton;
    if (!rerollButton) return;

    const progression = this.game?.progression;
    const remaining = Math.max(0, Number(progression?.rerolls) || 0);
    rerollButton.textContent = `Reroll (${remaining})`;
    rerollButton.disabled = remaining <= 0 || !progression?.rerollCurrentChoices;
    rerollButton.title = remaining > 0
      ? 'Replace all current upgrade choices. Gain +1 reroll every 10 levels.'
      : 'No rerolls remaining. Gain +1 every 10 levels.';
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
