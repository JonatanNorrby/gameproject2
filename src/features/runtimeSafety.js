import { Game as PreviousGame, UI as PreviousUI } from './supremeCommander.js';
import { CAPTAINS, UNIT_CLASSES } from '../data/content.js';
import { WARDEN_BOSS, BROODMOTHER_BOSS, CIPHER_BOSS } from '../data/bosses.js';
import { isCaptainUnlocked, unlock } from '../data/unlocks.js';
import { grantGold } from '../data/metaUpgrades.js';

const MAX_REPORTED_ERRORS = 20;
const DAMAGE_FEEDBACK_DURATION = 0.18;
const DEBUG_PIN = '6789';
const DEBUG_OP_ATTACK_SPEED_MULTIPLIER = 51;
const DEBUG_GOLD_GRANT = 25;
const DEBUG_UNIT_MAX = 99;

const DEBUG_BOSSES = Object.freeze([
  Object.freeze({ id: WARDEN_BOSS.id, label: WARDEN_BOSS.name }),
  Object.freeze({ id: BROODMOTHER_BOSS.id, label: BROODMOTHER_BOSS.name }),
  Object.freeze({ id: CIPHER_BOSS.id, label: CIPHER_BOSS.name }),
]);

function createDebugHeading(text) {
  const heading = document.createElement('div');
  heading.className = 'debug-drop-heading';
  heading.textContent = text;
  return heading;
}

function createDebugButton(title, detail = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'debug-control debug-control--button';
  const strong = document.createElement('strong');
  strong.textContent = title;
  button.append(strong);
  if (detail) {
    const small = document.createElement('small');
    small.textContent = detail;
    button.append(small);
  }
  return button;
}

export class Game extends PreviousGame {
  constructor(...args) {
    super(...args);
    this.runtimeErrors = [];
  }

  recordRuntimeError(stage, error) {
    const entry = {
      stage,
      time: Number(this.elapsed ?? 0),
      message: error instanceof Error ? error.message : String(error),
    };
    this.runtimeErrors.push(entry);
    if (this.runtimeErrors.length > MAX_REPORTED_ERRORS) this.runtimeErrors.shift();
    console.error(`[Nightfall Protocol] ${stage} failed`, error);
  }

  triggerDamageFeedback() {
    // Keep the screen flash/shake and per-unit hit flash, but remove the old
    // red square particle burst. Those particles were cosmetic only.
    this.damageFeedback = DAMAGE_FEEDBACK_DURATION;
  }

  getAttackSpeedMultiplier() {
    const base = super.getAttackSpeedMultiplier();
    return this.debug?.opMode
      ? base * DEBUG_OP_ATTACK_SPEED_MULTIPLIER
      : base;
  }

  debugMakeOp() {
    if (!this.debug) this.debug = {};
    this.debug.opMode = true;
    this.combatSystem?.fireCooldowns?.clear?.();
    return true;
  }

  debugGiveUnit(unitType, amount = 1) {
    if (!UNIT_CLASSES[unitType]) return 0;
    const count = Math.max(1, Math.min(DEBUG_UNIT_MAX, Math.floor(Number(amount) || 1)));
    this.addSquadUnits(unitType, count);
    return count;
  }

  debugClearBossEncounter() {
    if (this.getActiveCipher?.()?.puzzleActive) this.beginCipherSquadReturn?.();
    this.clearCipherHazards?.();

    this.wardenBoss = null;
    this.broodmotherBoss = null;
    this.cipherBoss = null;
    this.broodIntro = null;
    this.cipherIntro = null;
    this.broodSpawnLockActive = false;
    this.cipherSpawnLockActive = false;

    this.broodEggs = [];
    this.broodAcidBlobs = [];
    this.broodAcidPools = [];
    this.cipherBeams = [];
    this.cipherBarrageMarkers = [];
    this.cipherWalls = [];
    this.cipherWallProjectiles = [];
    this.cipherShockwaves = [];
    this.cipherSquadMotion?.clear?.();

    // Mark all normal milestone spawns as handled so debug-spawning one boss
    // cannot immediately cascade into another because of the player's level.
    this.wardenSpawned = true;
    this.broodmotherSpawned = true;
    this.cipherSpawned = true;

    if (this.entities?.projectiles) this.entities.projectiles.length = 0;
    if (this.entities?.enemies) this.entities.enemies.length = 0;
    if (this.spawnSystem) this.spawnSystem.cooldown = 1.25;
  }

  debugSpawnBoss(bossId) {
    if (!DEBUG_BOSSES.some((boss) => boss.id === bossId)) return false;
    this.debugClearBossEncounter();

    if (bossId === WARDEN_BOSS.id) {
      this.spawnWarden?.();
      return Boolean(this.getActiveWarden?.());
    }

    if (bossId === BROODMOTHER_BOSS.id) {
      this.spawnBroodmother?.();
      return Boolean(this.getActiveBroodmother?.());
    }

    if (bossId === CIPHER_BOSS.id) {
      this.spawnCipher?.();
      return Boolean(this.getActiveCipher?.());
    }

    return false;
  }

  getCaptainUnit() {
    return (this.player?.squad ?? []).find((unit) => (
      !unit.dead && Boolean(unit.captainId) && !unit.secondaryCaptain
    )) ?? null;
  }

  removeSquadUnitFromBuilder(unitId) {
    const result = super.removeSquadUnitFromBuilder(unitId);
    if (result?.ok) this.refreshDoctrineBonuses?.();
    return result;
  }

  withSecondaryCaptainIdsMasked(callback) {
    const secondaryCaptains = (this.player?.squad ?? [])
      .filter((unit) => !unit.dead && unit.secondaryCaptain && unit.captainId)
      .map((unit) => ({ unit, captainId: unit.captainId }));

    for (const entry of secondaryCaptains) entry.unit.captainId = null;
    try {
      return callback();
    } finally {
      for (const entry of secondaryCaptains) entry.unit.captainId = entry.captainId;
    }
  }

  beginCipherSquadRetreat(boss) {
    // Cipher's original implementation treats every captainId as the heroic
    // solo Captain. A purchased second Captain is intentionally a normal squad
    // member for this encounter, so temporarily mask that id while the retreat
    // list is created.
    return this.withSecondaryCaptainIdsMasked(() => super.beginCipherSquadRetreat(boss));
  }

  beginCipherSquadReturn() {
    return this.withSecondaryCaptainIdsMasked(() => super.beginCipherSquadReturn());
  }

  getWeaponPositions() {
    const soldiers = super.getWeaponPositions();
    if (!(this.cipherSquadMotion instanceof Map) || this.cipherSquadMotion.size === 0) {
      return soldiers;
    }

    return soldiers.filter((soldier) => !(
      soldier.unit.secondaryCaptain
      && this.cipherSquadMotion.has(soldier.unit.id)
    ));
  }

  getCipherCaptainSoldier() {
    return this.getSoldierPositions().find((soldier) => (
      Boolean(soldier.unit.captainId) && !soldier.unit.secondaryCaptain
    )) ?? null;
  }

  getCipherHazardTargets(soloOnly) {
    const soldiers = this.getSoldierPositions().filter((soldier) => !soldier.unit.dead);
    return soloOnly
      ? soldiers.filter((soldier) => (
        Boolean(soldier.unit.captainId) && !soldier.unit.secondaryCaptain
      ))
      : soldiers;
  }

  activateCaptainCall(slot = 'primary') {
    if (this.getActiveCipher?.()?.puzzleActive) return false;
    return super.activateCaptainCall(slot);
  }

  updateCaptainCalls() {
    if (this.getActiveCipher?.()?.puzzleActive) {
      // The Cipher puzzle is explicitly Captain-only. Cancel any formation-wide
      // call that was active when the puzzle began so retreating units cannot
      // keep contributing damage from off-screen.
      this.valeCallState = null;
      this.mercerCallState = null;
      this.thorneCallState = null;
      return;
    }
    super.updateCaptainCalls();
  }

  loop(timestamp) {
    const rawDt = (timestamp - this.lastTimestamp) / 1000;
    const dt = Math.min(0.033, Math.max(0, rawDt));
    this.lastTimestamp = timestamp;
    this.animationClock = timestamp / 1000;

    if (!this.paused) {
      try {
        this.update(dt);
      } catch (error) {
        this.recordRuntimeError('update', error);
      }
    }

    try {
      this.render();
    } catch (error) {
      this.recordRuntimeError('render', error);
    }

    try {
      this.ui.update(this);
    } catch (error) {
      this.recordRuntimeError('ui', error);
    }

    requestAnimationFrame((time) => this.loop(time));
  }
}

export class UI extends PreviousUI {
  constructor(...args) {
    super(...args);
    this.debugUnlocked = false;
    this.mainDebugPanel = null;
    this.mainDebugToggle = null;

    // Gold granting now lives exclusively in the PIN-protected main debug menu.
    this.metaUpgradeDebugPoint?.remove?.();
  }

  flashDebugDenied(button) {
    if (!button) return;
    const originalText = button.textContent;
    button.textContent = 'DENIED';
    window.setTimeout(() => {
      button.textContent = originalText;
    }, 900);
  }

  requestDebugUnlock(button) {
    if (this.debugUnlocked) return true;
    const entered = window.prompt('Enter debug PIN');
    if (entered !== DEBUG_PIN) {
      this.flashDebugDenied(button);
      return false;
    }
    this.debugUnlocked = true;
    return true;
  }

  setInGameDebugOpen(open) {
    this.debugPanel?.classList.toggle('debug-panel--visible', open);
    this.debugPanel?.setAttribute('aria-hidden', String(!open));
    this.debugToggle?.setAttribute('aria-expanded', String(open));
  }

  setMainDebugOpen(open) {
    this.mainDebugPanel?.classList.toggle('debug-panel--visible', open);
    this.mainDebugPanel?.setAttribute('aria-hidden', String(!open));
    this.mainDebugToggle?.setAttribute('aria-expanded', String(open));
  }

  bindDebug({ game, setInfiniteHp, levelUp }) {
    this.game = game ?? this.game;

    this.debugToggle.addEventListener('click', () => {
      if (!this.requestDebugUnlock(this.debugToggle)) return;
      this.setInGameDebugOpen(!this.debugPanel.classList.contains('debug-panel--visible'));
    });
    this.debugClose.addEventListener('click', () => this.setInGameDebugOpen(false));
    this.debugInfiniteHp.addEventListener('change', (event) => {
      if (!this.debugUnlocked) {
        event.currentTarget.checked = false;
        return;
      }
      setInfiniteHp(event.currentTarget.checked);
    });
    this.debugLevelUp.addEventListener('click', () => {
      if (this.debugUnlocked) levelUp();
    });

    this.installInGameDebugControls();
    this.installMainMenuDebug();
  }

  installInGameDebugControls() {
    if (!this.debugPanel || this.debugPanel.querySelector('#debug-boss-controls')) return;

    const groundDropHeading = this.debugPanel.querySelector('.debug-drop-heading');
    if (!groundDropHeading) return;

    const fragment = document.createDocumentFragment();

    const opButton = createDebugButton('Make OP', '+5000% attack rate for this run');
    opButton.id = 'debug-make-op';
    opButton.addEventListener('click', () => {
      if (!this.debugUnlocked || !this.game?.debugMakeOp?.()) return;
      opButton.disabled = true;
      opButton.querySelector('strong').textContent = 'OP MODE ENABLED';
      const detail = opButton.querySelector('small');
      if (detail) detail.textContent = '+5000% attack rate active';
    });
    fragment.append(opButton);

    const bossHeading = createDebugHeading('BOSSES');
    bossHeading.id = 'debug-boss-controls';
    fragment.append(bossHeading);

    for (const boss of DEBUG_BOSSES) {
      const button = createDebugButton(`Spawn ${boss.label}`, 'Replace the current boss encounter');
      button.dataset.debugBoss = boss.id;
      button.addEventListener('click', () => {
        if (!this.debugUnlocked) return;
        if (this.game?.debugSpawnBoss?.(boss.id)) this.setInGameDebugOpen(false);
      });
      fragment.append(button);
    }

    fragment.append(createDebugHeading('UNITS'));

    const countControl = document.createElement('label');
    countControl.className = 'debug-control';
    countControl.innerHTML = `
      <span>
        <strong>Unit Amount</strong>
        <small>Amount added by each unit button</small>
      </span>
      <input id="debug-unit-count" type="number" min="1" max="${DEBUG_UNIT_MAX}" step="1" value="1" aria-label="Debug unit amount" style="width:62px;height:34px;border:1px solid rgba(126,249,212,.25);border-radius:7px;padding:6px;background:rgba(255,255,255,.05);color:#f4f7fb;font-weight:900;" />
    `;
    fragment.append(countControl);

    const unitCountInput = countControl.querySelector('#debug-unit-count');
    const getUnitCount = () => Math.max(
      1,
      Math.min(DEBUG_UNIT_MAX, Math.floor(Number(unitCountInput?.value) || 1)),
    );

    for (const unitClass of Object.values(UNIT_CLASSES)
      .filter((unit) => unit?.id && unit?.label)
      .sort((left, right) => left.label.localeCompare(right.label))) {
      const button = createDebugButton(
        `Give ${unitClass.label}`,
        `Add the selected amount of ${unitClass.label}s`,
      );
      button.dataset.debugUnit = unitClass.id;
      button.addEventListener('click', () => {
        if (!this.debugUnlocked) return;
        const amount = getUnitCount();
        if (unitCountInput) unitCountInput.value = String(amount);
        this.game?.debugGiveUnit?.(unitClass.id, amount);
      });
      fragment.append(button);
    }

    groundDropHeading.before(fragment);
  }

  installMainMenuDebug() {
    if (this.mainDebugToggle || document.querySelector('#main-debug-toggle')) return;
    const startScreen = document.querySelector('#start-screen');
    const nav = startScreen?.querySelector('.main-menu__nav');
    if (!startScreen || !nav) return;

    const toggle = document.createElement('button');
    toggle.id = 'main-debug-toggle';
    toggle.type = 'button';
    toggle.className = 'captain-menu-button main-menu__action';
    toggle.textContent = 'DEBUG';
    toggle.setAttribute('aria-expanded', 'false');
    nav.append(toggle);
    this.mainDebugToggle = toggle;

    const panel = document.createElement('div');
    panel.id = 'main-debug-panel';
    panel.className = 'debug-panel';
    panel.setAttribute('aria-hidden', 'true');
    Object.assign(panel.style, {
      position: 'fixed',
      left: 'max(14px, env(safe-area-inset-left))',
      top: 'clamp(120px, 18vh, 190px)',
      zIndex: '90',
      maxHeight: 'min(68dvh, 620px)',
      overflowY: 'auto',
    });

    const header = document.createElement('div');
    header.className = 'debug-panel__header';
    header.innerHTML = '<strong>Main Debug</strong><button type="button" class="debug-panel__close" aria-label="Close main debug menu">×</button>';
    panel.append(header);

    const goldButton = createDebugButton(`Give ${DEBUG_GOLD_GRANT} Gold`, 'Add permanent-progression currency');
    goldButton.addEventListener('click', () => {
      if (!this.debugUnlocked) return;
      grantGold(DEBUG_GOLD_GRANT);
      this.renderPermanentShop?.();
      const strong = goldButton.querySelector('strong');
      if (strong) strong.textContent = `+${DEBUG_GOLD_GRANT} GOLD GRANTED`;
      window.setTimeout(() => {
        if (strong) strong.textContent = `Give ${DEBUG_GOLD_GRANT} Gold`;
      }, 850);
    });
    panel.append(goldButton);

    panel.append(createDebugHeading('CAPTAIN UNLOCKS'));
    const captainContainer = document.createElement('div');
    captainContainer.id = 'main-debug-captains';
    panel.append(captainContainer);

    const renderCaptainUnlocks = () => {
      captainContainer.replaceChildren();
      for (const captain of Object.values(CAPTAINS)) {
        const unlocked = isCaptainUnlocked(captain.id);
        const button = createDebugButton(
          unlocked ? `${captain.name} — UNLOCKED` : `Unlock ${captain.name}`,
          unlocked ? 'Already available' : 'Permanently unlock this Captain',
        );
        button.disabled = unlocked;
        button.addEventListener('click', () => {
          if (!this.debugUnlocked) return;
          const unlockedDefinition = unlock(`captain:${captain.id}`);
          if (!unlockedDefinition) return;
          this.handleUnlocksChanged?.([unlockedDefinition]);
          this.renderRunConfiguration?.();
          renderCaptainUnlocks();
        });
        captainContainer.append(button);
      }
    };
    renderCaptainUnlocks();

    startScreen.append(panel);
    this.mainDebugPanel = panel;

    toggle.addEventListener('click', () => {
      if (!this.requestDebugUnlock(toggle)) return;
      renderCaptainUnlocks();
      this.setMainDebugOpen(!panel.classList.contains('debug-panel--visible'));
    });
    header.querySelector('.debug-panel__close')?.addEventListener('click', () => {
      this.setMainDebugOpen(false);
    });
    document.querySelector('#start-button')?.addEventListener('click', () => {
      this.setMainDebugOpen(false);
    });
  }

  bindSquadBuilder(config) {
    super.bindSquadBuilder(config);

    // Native dragend is not guaranteed after a drop handler rerenders and
    // destroys the dragged card. If that happens the builder used to remain in
    // a permanent "dragging" state, causing every subsequent card click to be
    // ignored. Clear the transient state from window-level end conditions too.
    if (this.squadBuilderSafetyBound) return;
    this.squadBuilderSafetyBound = true;
    const clearDragState = () => this.clearSquadBuilderInteractionState();
    window.addEventListener('dragend', clearDragState, true);
    window.addEventListener('drop', clearDragState, true);
    window.addEventListener('blur', clearDragState);
  }

  clearSquadBuilderInteractionState() {
    this.squadBuilderDragging = false;
    this.squadBuilderGrid?.querySelectorAll('.squad-unit-card--dragging')
      .forEach((element) => element.classList.remove('squad-unit-card--dragging'));
    this.squadBuilderGrid?.querySelectorAll('.squad-formation-target--dragover')
      .forEach((element) => element.classList.remove('squad-formation-target--dragover'));
  }

  showSquadBuilder(...args) {
    this.clearSquadBuilderInteractionState();
    return super.showSquadBuilder(...args);
  }

  hideSquadBuilder(...args) {
    this.clearSquadBuilderInteractionState();
    return super.hideSquadBuilder(...args);
  }

  applyFormationAction(result, options = {}) {
    // Clear before rerendering so replacing the dragged element cannot leave
    // stale interaction state behind. This also makes Captain-to-Captain swaps
    // behave the same as every other formation move.
    this.clearSquadBuilderInteractionState();
    return super.applyFormationAction(result, options);
  }

  renderSelectedCaptainSummary(...args) {
    super.renderSelectedCaptainSummary(...args);

    const summary = this.selectedCaptainSummary ?? document.querySelector('#selected-captain-summary');
    const card = summary?.querySelector('.selected-captain-card');
    if (!card || card.classList.contains('selected-captain-card--empty')) return;

    // The center Captain presentation is the sole main-menu Captain selector.
    // Empty cards already receive this behavior in captainMenu.js.
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', 'Change Captain');
    card.title = 'Change Captain';
    card.addEventListener('click', () => this.showCaptainSelection?.());
    card.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      this.showCaptainSelection?.();
    });
  }

  renderPermanentShop(...args) {
    super.renderPermanentShop(...args);
    const button = this.metaUpgradeOpen ?? document.querySelector('#meta-upgrade-open');
    if (!button) return;

    const goldText = button.textContent.match(/(\d+)\s*Gold/i)?.[1];
    button.replaceChildren(document.createTextNode('Upgrades'));
    if (goldText) {
      button.append(document.createTextNode(' • '));
      const balance = document.createElement('span');
      balance.className = 'main-menu__gold-balance';
      balance.textContent = `${goldText} Gold`;
      button.append(balance);
    }
  }
}
