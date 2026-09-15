import { Game, UI } from './features/wardenRewards.js';
import { Input } from './core/Input.js';
import { CAPTAINS, GAME_BALANCE } from './data/content.js';
import { resetUnlockProgress } from './data/unlocks.js';
import { resetMetaUpgradeProgress } from './data/metaUpgrades.js';

const GAME_VERSION = 59;
const canvas = document.querySelector('#game-canvas');
const touchStick = document.querySelector('#touch-stick');
const ui = new UI();
ui.versionText.textContent = `v${GAME_VERSION}`;
const input = new Input(canvas, touchStick);
const game = new Game(canvas, input, ui);

game.debug = {
  infiniteHp: false,
};

function configureCaptain(captainId) {
  const captain = CAPTAINS[captainId];
  if (!captain) return null;

  game.selectedCaptainId = captain.id;
  GAME_BALANCE.player.startingSquad = [captain.unitType];
  return captain;
}

function markStartingCaptain(captain) {
  const startingUnit = game.player.squad[0];
  if (!startingUnit || !captain) return;

  startingUnit.captainId = captain.id;
  startingUnit.maxHp = captain.maxHp ?? startingUnit.maxHp;
  startingUnit.hp = startingUnit.maxHp;
  startingUnit.armor = captain.armor ?? 0;
  game.syncCaptainHealth();
}

function startRun(captainId) {
  const captain = configureCaptain(captainId);
  if (!captain) return false;

  game.start();
  markStartingCaptain(captain);
  return true;
}

ui.bindStart(() => {
  const captainId = ui.getSelectedCaptainId();
  if (!captainId || !CAPTAINS[captainId]) {
    ui.requireCaptainSelection?.();
    return;
  }
  startRun(captainId);
});
ui.bindRestart(() => window.location.reload());
ui.bindDebug({
  setInfiniteHp(enabled) {
    game.debug.infiniteHp = enabled;
    if (enabled) game.healAllUnits();
  },
  levelUp() {
    game.progression.debugLevelUp();
  },
});

const resetProgressButton = document.querySelector('#reset-progress-button');
resetProgressButton?.addEventListener('click', () => {
  const confirmed = window.confirm(
    'Reset all progress? Captain unlocks and permanent Upgrade Tree progress will be erased. Captain Vale will remain available.',
  );
  if (!confirmed) return;

  resetUnlockProgress();
  resetMetaUpgradeProgress();

  ui.selectedCaptainId = null;
  ui.captainSelectionRequired = false;
  ui.renderCaptainOptions?.();
  ui.renderSelectedCaptainSummary?.();
  ui.renderMetaUpgradeTree?.();

  resetProgressButton.textContent = 'Progress Reset';
  window.setTimeout(() => {
    resetProgressButton.textContent = 'Reset Progress';
  }, 1600);
});

for (const button of document.querySelectorAll('[data-debug-drop]')) {
  button.addEventListener('click', () => game.spawnDebugGroundDrop(button.dataset.debugDrop));
}

window.game = game;
