import { Game as PreviousGame, UI } from './cipherBoss.js';

const MAX_REPORTED_ERRORS = 20;
const DAMAGE_FEEDBACK_DURATION = 0.18;

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

export { UI };
