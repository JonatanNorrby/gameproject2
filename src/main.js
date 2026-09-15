import { Game, UI } from './features/performanceAndVisualFixes.js';
import { Input } from './core/Input.js';
import { CAPTAINS, GAME_BALANCE } from './data/content.js';

const GAME_VERSION = 51;
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

for (const button of document.querySelectorAll('[data-debug-drop]')) {
  button.addEventListener('click', () => game.spawnDebugGroundDrop(button.dataset.debugDrop));
}

window.game = game;
