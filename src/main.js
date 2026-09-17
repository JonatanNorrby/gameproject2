import { Game, UI } from './features/loadingScreenPolish.js';
// loadingScreenPolish.js composes cipherScaleGlow.js over ./features/bossVisibilityFix.js.
import { installEnemyStatusVisuals } from './features/enemyStatusVisuals.js';
import { Input } from './core/Input.js';
import { CAPTAINS, GAME_BALANCE } from './data/content.js';
import { getBeefedUpHpBonus } from './data/metaUpgrades.js';
import { getSpritePortraitSources } from './data/sprites.js';

const GAME_VERSION = 125;
const BOOT_ASSET_TIMEOUT_MS = 4500;
const BOOT_MINIMUM_VISIBLE_MS = 420;

installEnemyStatusVisuals(Game);

const canvas = document.querySelector('#game-canvas');
const touchStick = document.querySelector('#touch-stick');
const ui = new UI();
ui.versionText.textContent = `v${GAME_VERSION}`;
ui.setGameVersion?.(GAME_VERSION);
const mainMenuBuild = document.querySelector('.main-menu__build');
if (mainMenuBuild) mainMenuBuild.textContent = 'SYSTEM ONLINE';

// #79: keep the Squad Builder control physically beside the Level / XP HUD.
// Reparenting the existing control preserves all UI bindings while letting the
// bottom HUD use normal responsive flex layout rather than absolute offsets.
const hudBottom = document.querySelector('.hud__bottom');
const squadMenu = document.querySelector('.squad-menu');
if (hudBottom && squadMenu) hudBottom.append(squadMenu);

const input = new Input(canvas, touchStick);
const game = new Game(canvas, input, ui);

// #140: Reset All Progress belongs in main-menu Settings, not the main menu.
// Clone the legacy button to discard its older listener, move the live control
// into Settings, and route the destructive action through the comprehensive
// reset path that also clears Prestige and Handbook progression.
const legacyResetProgressButton = document.querySelector('#reset-progress-button');
const settingsScreen = ui.settingsScreen ?? document.querySelector('#settings-screen');
const settingsFooter = settingsScreen?.querySelector('.settings-footer');
if (legacyResetProgressButton && settingsScreen && settingsFooter) {
  const resetProgressButton = legacyResetProgressButton.cloneNode(true);
  legacyResetProgressButton.replaceWith(resetProgressButton);
  resetProgressButton.textContent = 'Reset All Progress';
  resetProgressButton.className = 'settings-reset-progress-button';
  resetProgressButton.title = 'Completely erase all progression without receiving a Prestige bonus';
  resetProgressButton.setAttribute(
    'aria-label',
    'Reset all progress. This completely erases progression and grants no Prestige bonus.',
  );

  let resetSection = settingsScreen.querySelector('.settings-reset-progress-section');
  if (!resetSection) {
    resetSection = document.createElement('section');
    resetSection.className = 'settings-section settings-reset-progress-section';
    resetSection.innerHTML = `
      <div class="settings-section__heading">
        <h3>Reset All Progress</h3>
        <p>Permanent destructive reset</p>
      </div>
      <div class="settings-reset-progress-warning">
        <strong>This completely resets all progression.</strong>
        <span>Captain unlocks, Gold, Gold Upgrades, Prestige progress/bonuses, and Handbook discoveries will be erased.</span>
        <span>Unlike Prestige, resetting gives no permanent bonus or reward.</span>
      </div>
      <div class="settings-reset-progress-actions"></div>
    `;
    settingsFooter.before(resetSection);
  }

  const resetActions = resetSection.querySelector('.settings-reset-progress-actions');
  resetActions?.append(resetProgressButton);

  let confirmation = resetSection.querySelector('#reset-all-progress-confirmation');
  if (!confirmation) {
    confirmation = document.createElement('div');
    confirmation.id = 'reset-all-progress-confirmation';
    confirmation.className = 'settings-reset-progress-confirmation';
    confirmation.hidden = true;
    confirmation.setAttribute('aria-hidden', 'true');
    confirmation.innerHTML = `
      <p>This cannot be undone. Reset everything without receiving any Prestige bonus?</p>
      <div class="settings-reset-progress-confirmation__actions">
        <button id="reset-all-progress-cancel" type="button">Cancel</button>
        <button id="reset-all-progress-confirm" type="button">Permanently Reset</button>
      </div>
    `;
    resetSection.append(confirmation);
  }

  if (!document.querySelector('#issue-140-reset-progress-style')) {
    const style = document.createElement('style');
    style.id = 'issue-140-reset-progress-style';
    style.textContent = `
      .settings-reset-progress-section[hidden],
      .settings-reset-progress-confirmation[hidden] { display: none !important; }
      .settings-reset-progress-warning,
      .settings-reset-progress-confirmation {
        display: grid;
        gap: 7px;
        padding: 12px 14px;
        border: 1px solid rgba(255,95,121,.24);
        border-radius: 11px;
        background: rgba(255,95,121,.05);
        color: #aebfc6;
        font-size: 11px;
        line-height: 1.5;
      }
      .settings-reset-progress-warning strong,
      .settings-reset-progress-confirmation strong { color: #ffe8ed; }
      .settings-reset-progress-actions { display: grid; gap: 8px; }
      .settings-reset-progress-button,
      .settings-reset-progress-confirmation__actions button {
        min-height: 42px;
        border: 1px solid rgba(255,95,121,.62);
        border-radius: 10px;
        padding: 9px 12px;
        background: linear-gradient(180deg, rgba(139,28,47,.96), rgba(80,13,27,.96));
        color: #ffe7ec;
        font: inherit;
        font-size: 10px;
        font-weight: 1000;
        letter-spacing: .08em;
        text-transform: uppercase;
        cursor: pointer;
      }
      .settings-reset-progress-confirmation__actions {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }
      #reset-all-progress-cancel {
        border-color: rgba(126,249,212,.28);
        background: rgba(126,249,212,.06);
        color: #d9fff4;
      }
      @media (max-width: 560px) {
        .settings-reset-progress-confirmation__actions { grid-template-columns: 1fr; }
      }
    `;
    document.head?.append(style);
  }

  const cancelResetButton = confirmation.querySelector('#reset-all-progress-cancel');
  const confirmResetButton = confirmation.querySelector('#reset-all-progress-confirm');
  const setResetConfirmationVisible = (visible) => {
    const isVisible = Boolean(visible);
    confirmation.hidden = !isVisible;
    confirmation.setAttribute('aria-hidden', String(!isVisible));
    resetProgressButton.disabled = isVisible;
    if (isVisible) confirmResetButton?.focus?.();
  };

  resetProgressButton.addEventListener('click', () => setResetConfirmationVisible(true));
  cancelResetButton?.addEventListener('click', () => {
    setResetConfirmationVisible(false);
    resetProgressButton.focus?.();
  });
  confirmResetButton?.addEventListener('click', () => {
    setResetConfirmationVisible(false);
    ui.resetEverythingFromDebug?.();
  });

  const syncResetSectionVisibility = () => {
    const visible = !ui.settingsOpenedInGame;
    resetSection.hidden = !visible;
    resetSection.setAttribute('aria-hidden', String(!visible));
    if (!visible) setResetConfirmationVisible(false);
  };

  const previousShowSettingsForReset = ui.showSettings.bind(ui);
  ui.showSettings = (...args) => {
    const result = previousShowSettingsForReset(...args);
    syncResetSectionVisibility();
    return result;
  };

  const previousHideSettingsForReset = ui.hideSettings.bind(ui);
  ui.hideSettings = (...args) => {
    setResetConfirmationVisible(false);
    return previousHideSettingsForReset(...args);
  };

  resetSection.hidden = true;
  resetSection.setAttribute('aria-hidden', 'true');
}

// #139: replace the legacy End Run listener with an in-game confirmation card.
// Cloning removes the old window.confirm listener installed lower in the UI
// stack while preserving the live button reference used by visibility updates.
if (ui.endRunButton?.parentNode) {
  const actions = ui.endRunButton.parentNode;
  const endRunButton = ui.endRunButton.cloneNode(true);
  ui.endRunButton.replaceWith(endRunButton);
  ui.endRunButton = endRunButton;

  let confirmation = actions.querySelector('#end-run-confirmation');
  if (!confirmation) {
    confirmation = document.createElement('div');
    confirmation.id = 'end-run-confirmation';
    confirmation.className = 'end-run-confirmation';
    confirmation.hidden = true;
    confirmation.setAttribute('aria-hidden', 'true');
    confirmation.innerHTML = `
      <p>End this run now? Permanent Gold, unlocks and other progress earned so far will be kept.</p>
      <div class="end-run-confirmation__actions">
        <button id="end-run-cancel" class="end-run-confirmation__button end-run-confirmation__button--cancel" type="button">Cancel</button>
        <button id="end-run-confirm" class="end-run-confirmation__button end-run-confirmation__button--confirm" type="button">Confirm End Run</button>
      </div>
    `;
    actions.append(confirmation);
  }

  const cancelEndRunButton = confirmation.querySelector('#end-run-cancel');
  const confirmEndRunButton = confirmation.querySelector('#end-run-confirm');

  const setEndRunConfirmationVisible = (visible) => {
    const isVisible = Boolean(visible);
    confirmation.hidden = !isVisible;
    confirmation.setAttribute('aria-hidden', String(!isVisible));
    endRunButton.classList.toggle('end-run-button--confirming', isVisible);
    endRunButton.disabled = isVisible;
    endRunButton.tabIndex = isVisible ? -1 : 0;
    if (isVisible) confirmEndRunButton?.focus?.();
  };

  endRunButton.addEventListener('click', () => {
    if (!game.running || game.pauseReasons?.has('gameover')) return;
    setEndRunConfirmationVisible(true);
  });

  cancelEndRunButton?.addEventListener('click', () => {
    setEndRunConfirmationVisible(false);
    endRunButton.focus?.();
  });

  confirmEndRunButton?.addEventListener('click', () => {
    if (!game.running || game.pauseReasons?.has('gameover')) {
      setEndRunConfirmationVisible(false);
      return;
    }

    setEndRunConfirmationVisible(false);
    ui.hideSettings();
    game.endRun?.();
  });

  const previousHideSettings = ui.hideSettings.bind(ui);
  ui.hideSettings = (...args) => {
    setEndRunConfirmationVisible(false);
    return previousHideSettings(...args);
  };
}

// #129: runGoldCollected is maintained by the permanent-Gold and treasure-chest
// systems, so expose that existing run total alongside the other end-run stats.
const previousShowGameOver = ui.showGameOver.bind(ui);
ui.showGameOver = (currentGame, ...args) => {
  const result = previousShowGameOver(currentGame, ...args);
  const resultGold = document.querySelector('#result-gold');
  if (resultGold) {
    resultGold.textContent = String(Math.max(
      0,
      Math.floor(Number(currentGame?.runGoldCollected) || 0),
    ));
  }
  return result;
};

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

  const beefedUpBonus = getBeefedUpHpBonus();
  const configuredCaptainHp = Number(captain.maxHp);
  if (Number.isFinite(configuredCaptainHp) && configuredCaptainHp > 0) {
    startingUnit.maxHp = configuredCaptainHp + beefedUpBonus;
    if (beefedUpBonus > 0) {
      startingUnit.beefedUpApplied = true;
      startingUnit.beefedUpBonus = beefedUpBonus;
    }
  } else if (beefedUpBonus > 0 && !startingUnit.beefedUpApplied) {
    startingUnit.maxHp += beefedUpBonus;
    startingUnit.beefedUpApplied = true;
    startingUnit.beefedUpBonus = beefedUpBonus;
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

  // Additional Captains contribute to the shared Squad Health multiplier.
  // Their captainId activates passives while slot flags identify their slot.
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
  const bootVersion = document.querySelector('#boot-version');
  const app = document.querySelector('#app');
  const startedAt = performance.now();

  if (bootVersion) bootVersion.textContent = `BUILD v${GAME_VERSION}`;
  const sources = getBootCaptainSources();

  const portraitLoad = Promise.all(sources.map((source) => preloadImage(source)));

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