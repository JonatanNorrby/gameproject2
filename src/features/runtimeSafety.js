import { Game as PreviousGame, UI as PreviousUI } from './supremeCommander.js';

const MAX_REPORTED_ERRORS = 20;
const DAMAGE_FEEDBACK_DURATION = 0.18;
const DEBUG_PIN = '6789';

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
  bindDebug({ setInfiniteHp, levelUp }) {
    this.debugUnlocked = false;

    const setOpen = (open) => {
      this.debugPanel.classList.toggle('debug-panel--visible', open);
      this.debugPanel.setAttribute('aria-hidden', String(!open));
      this.debugToggle.setAttribute('aria-expanded', String(open));
    };

    const unlockDebug = () => {
      if (this.debugUnlocked) return true;
      const entered = window.prompt('Enter debug PIN');
      if (entered !== DEBUG_PIN) {
        const originalText = this.debugToggle.textContent;
        this.debugToggle.textContent = 'DENIED';
        window.setTimeout(() => {
          this.debugToggle.textContent = originalText;
        }, 900);
        return false;
      }
      this.debugUnlocked = true;
      return true;
    };

    this.debugToggle.addEventListener('click', () => {
      if (!unlockDebug()) return;
      setOpen(!this.debugPanel.classList.contains('debug-panel--visible'));
    });
    this.debugClose.addEventListener('click', () => setOpen(false));
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
