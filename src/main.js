import { Game, UI } from './features/handbook.js';
import { Input } from './core/Input.js';
import { CAPTAINS, GAME_BALANCE } from './data/content.js';
import {
  BEEFED_UP_HP_BONUS,
  isPermanentUpgradeOwned,
} from './data/metaUpgrades.js';
import { getSpritePortraitSources } from './data/sprites.js';

const GAME_VERSION = 90;
const BOOT_ASSET_TIMEOUT_MS = 4500;
const BOOT_MINIMUM_VISIBLE_MS = 420;

const canvas = document.querySelector('#game-canvas');
const touchStick = document.querySelector('#touch-stick');
const ui = new UI();
ui.versionText.textContent = `v${GAME_VERSION}`;
const mainMenuBuild = document.querySelector('.main-menu__build');
if (mainMenuBuild) mainMenuBuild.textContent = `SYSTEM ONLINE • v${GAME_VERSION}`;
const input = new Input(canvas, touchStick);
const game = new Game(canvas, input, ui);

game.debug = {
  infiniteHp: false,
  opMode: false,
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
  startingUnit.primaryCaptain = true;
  startingUnit.secondaryCaptain = false;
  startingUnit.tertiaryCaptain = false;
  startingUnit.captainSlot = 'primary';

  const beefedUpBonus = isPermanentUpgradeOwned('beefed_up')
    ? BEEFED_UP_HP_BONUS
    : 0;
  const configuredCaptainHp = Number(captain.maxHp);
  if (Number.isFinite(configuredCaptainHp) && configuredCaptainHp > 0) {
    startingUnit.maxHp = configuredCaptainHp + beefedUpBonus;
  } else if (beefedUpBonus > 0 && !startingUnit.beefedUpApplied) {
    startingUnit.maxHp += beefedUpBonus;
    startingUnit.beefedUpApplied = true;
  }
  startingUnit.hp = startingUnit.maxHp;
  startingUnit.armor = captain.armor ?? 0;
  game.syncCaptainHealth();
}

function addAdditionalCaptain(captainId, excludedCaptainIds, slot) {
  if (!captainId || excludedCaptainIds.has(captainId)) return null;
  const captain = CAPTAINS[captainId];
  if (!captain) return null;

  const previousIds = new Set(game.player.squad.map((unit) => unit.id));
  game.addSquadUnits(captain.unitType, 1);
  const unit = game.player.squad.find((candidate) => !previousIds.has(candidate.id));
  if (!unit) return null;

  // Additional Captains deliberately keep normal unit health/armor. Their
  // captainId activates passives while slot flags keep their death non-fatal.
  unit.captainId = captain.id;
  unit.primaryCaptain = false;
  unit.secondaryCaptain = slot === 'secondary';
  unit.tertiaryCaptain = slot === 'tertiary';
  unit.captainSlot = slot;
  game.refreshDoctrineBonuses?.();
  return unit;
}

function startRun(captainId, secondCaptainId = null, thirdCaptainId = null, doctrineId = null) {
  const captain = configureCaptain(captainId);
  if (!captain) return false;

  game.selectedDoctrineId = doctrineId;
  game.start();
  markStartingCaptain(captain);

  const usedCaptainIds = new Set([captain.id]);
  const second = addAdditionalCaptain(secondCaptainId, usedCaptainIds, 'secondary');
  if (second?.captainId) usedCaptainIds.add(second.captainId);
  addAdditionalCaptain(thirdCaptainId, usedCaptainIds, 'tertiary');
  return true;
}

ui.bindStart(() => {
  const captainId = ui.getSelectedCaptainId();
  if (!captainId || !CAPTAINS[captainId]) {
    ui.requireCaptainSelection?.();
    return;
  }

  const secondCaptainId = ui.getSelectedSecondCaptainId?.() ?? null;
  const thirdCaptainId = ui.getSelectedThirdCaptainId?.() ?? null;
  const doctrineId = ui.getSelectedDoctrineId?.() ?? null;
  startRun(captainId, secondCaptainId, thirdCaptainId, doctrineId);
});
ui.bindRestart(() => window.location.reload());
ui.bindDebug({
  game,
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

function preloadImage(source) {
  return new Promise((resolve) => {
    if (!source) {
      resolve();
      return;
    }

    const image = new Image();
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      resolve();
    };
    const timeoutId = window.setTimeout(finish, BOOT_ASSET_TIMEOUT_MS);
    image.addEventListener('load', finish, { once: true });
    image.addEventListener('error', finish, { once: true });
    image.src = source;
    if (image.complete) window.queueMicrotask(finish);
  });
}

function getBootCaptainSources() {
  return [...new Set(
    Object.keys(CAPTAINS)
      .flatMap((captainId) => getSpritePortraitSources({ captainId }))
      .filter(Boolean),
  )];
}

async function finishBootSequence() {
  const bootScreen = document.querySelector('#boot-screen');
  const bootStatus = document.querySelector('#boot-status');
  const bootVersion = document.querySelector('#boot-version');
  const app = document.querySelector('#app');
  const startedAt = performance.now();

  if (bootVersion) bootVersion.textContent = `BUILD v${GAME_VERSION}`;
  const sources = getBootCaptainSources();
  let completedAssets = 0;

  if (bootStatus) {
    bootStatus.textContent = sources.length > 0
      ? `Loading Captain assets • 0/${sources.length}`
      : 'Finalizing command interface';
  }

  const portraitLoad = Promise.all(sources.map(async (source) => {
    await preloadImage(source);
    completedAssets += 1;
    if (bootStatus) {
      bootStatus.textContent = `Loading Captain assets • ${completedAssets}/${sources.length}`;
    }
  }));

  const fontLoad = document.fonts?.ready
    ? document.fonts.ready.catch(() => undefined)
    : Promise.resolve();

  await Promise.all([portraitLoad, fontLoad]);

  const remainingMinimum = Math.max(
    0,
    BOOT_MINIMUM_VISIBLE_MS - (performance.now() - startedAt),
  );
  if (remainingMinimum > 0) {
    await new Promise((resolve) => window.setTimeout(resolve, remainingMinimum));
  }

  if (bootStatus) bootStatus.textContent = 'Command interface ready';

  app?.classList.remove('app-shell--booting');
  app?.removeAttribute('aria-hidden');
  document.body.classList.remove('is-booting');

  await new Promise((resolve) => window.requestAnimationFrame(() => {
    window.requestAnimationFrame(resolve);
  }));

  bootScreen?.classList.add('boot-screen--hidden');
  window.setTimeout(() => bootScreen?.remove(), 520);
}

window.game = game;

finishBootSequence().catch((error) => {
  console.error('[Nightfall Protocol] Boot presentation failed', error);
  const app = document.querySelector('#app');
  const bootScreen = document.querySelector('#boot-screen');
  app?.classList.remove('app-shell--booting');
  app?.removeAttribute('aria-hidden');
  document.body.classList.remove('is-booting');
  bootScreen?.classList.add('boot-screen--hidden');
  window.setTimeout(() => bootScreen?.remove(), 520);
});
