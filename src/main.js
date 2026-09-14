import { Game } from './core/Game.js';
import { Input } from './core/Input.js';
import { UI } from './core/UI.js';
import { CAPTAINS, GAME_BALANCE } from './data/content.js';

const GAME_VERSION = 8;
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
  if (startingUnit) startingUnit.captainId = captain.id;
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
    if (enabled) game.player.hp = game.player.maxHp;
  },
  levelUp() {
    game.progression.debugLevelUp();
  },
});

window.game = game;
