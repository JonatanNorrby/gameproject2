import { Game, UI } from './features/stormlancerClass.js';
import { Input } from './core/Input.js';
import { CAPTAINS, GAME_BALANCE } from './data/content.js';
import { resetUnlockProgress } from './data/unlocks.js';
import { resetMetaUpgradeProgress } from './data/metaUpgrades.js';

const GAME_VERSION = 65;
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

function installDebugLevelTarget() {
  const debugPanel = document.querySelector('#debug-panel');
  const groundDropHeading = debugPanel?.querySelector('.debug-drop-heading');
  if (!debugPanel || !groundDropHeading || document.querySelector('#debug-level-target')) return;

  const control = document.createElement('div');
  control.className = 'debug-control';
  control.style.display = 'grid';
  control.style.gridTemplateColumns = '1fr auto';
  control.style.alignItems = 'center';
  control.innerHTML = `
    <span>
      <strong>Level Up to X</strong>
      <small>Jump directly to a target level without upgrade screens</small>
    </span>
    <span style="display:flex;flex-direction:row;align-items:center;gap:6px;">
      <input id="debug-level-target" type="number" min="1" step="1" value="10" aria-label="Target level" style="width:64px;border:1px solid rgba(126,249,212,.25);border-radius:7px;padding:7px;background:rgba(255,255,255,.05);color:#f4f7fb;font-weight:900;" />
      <button id="debug-level-target-apply" type="button" style="border:1px solid rgba(126,249,212,.35);border-radius:7px;padding:7px 9px;background:rgba(126,249,212,.08);color:#7ef9d4;font-weight:950;cursor:pointer;">GO</button>
    </span>
  `;
  groundDropHeading.before(control);

  const targetInput = control.querySelector('#debug-level-target');
  const applyButton = control.querySelector('#debug-level-target-apply');
  const applyTargetLevel = () => {
    const level = game.progression.debugSetLevel(targetInput.value);
    targetInput.value = String(level);
  };

  applyButton.addEventListener('click', applyTargetLevel);
  targetInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') applyTargetLevel();
  });
}

installDebugLevelTarget();

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
