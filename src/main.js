import { Game, UI } from './features/upgradeBonusDisplay.js';
import { Input } from './core/Input.js';
import { CAPTAINS, GAME_BALANCE } from './data/content.js';

const GAME_VERSION = 32;
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
  const captain = CAPTAINS[captainId] ?? Object.values(CAPTAINS)[0];
  game.selectedCaptainId = captain.id;
  GAME_BALANCE.player.startingSquad = [captain.unitType];
  return captain;
}

function markStartingCaptain(captain) {
  const startingUnit = game.player.squad[0];
  if (!startingUnit) return;

  startingUnit.captainId = captain.id;
  startingUnit.maxHp = captain.maxHp ?? startingUnit.maxHp;
  startingUnit.hp = startingUnit.maxHp;
  game.syncCaptainHealth();
}

function startRun(captainId, restart = false) {
  const captain = configureCaptain(captainId);
  if (restart) game.restart();
  else game.start();
  markStartingCaptain(captain);
}

ui.bindStart(() => startRun(ui.getSelectedCaptainId()));
ui.bindRestart(() => startRun(game.selectedCaptainId ?? ui.getSelectedCaptainId(), true));
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
