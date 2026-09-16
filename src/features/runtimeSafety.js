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
