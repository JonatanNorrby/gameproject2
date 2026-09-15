import { Game as PreviousGame, UI as PreviousUI } from './squadBuilderVisuals.js';
import { CAPTAINS, GAME_BALANCE, UNIT_CLASSES } from '../data/content.js';

const VALE_ID = 'vale';
const RIFLEMAN_TYPE = 'rifleman';
const FOCUS_EPSILON = 0.999;
const VALE_FOCUS_BUFF_DURATION = 5;
const RIFLEMAN_RANGE_MULTIPLIER = 1.5;

// Riflemen, including Captain Vale's rifle, now have 50% more base range.
UNIT_CLASSES.rifleman.weapon.range = 125 * RIFLEMAN_RANGE_MULTIPLIER;

if (CAPTAINS[VALE_ID]?.effect) {
  Object.assign(CAPTAINS[VALE_ID].effect, {
    moveDecayPerSecond: 0,
    focusBuffDuration: VALE_FOCUS_BUFF_DURATION,
  });
}

if (CAPTAINS[VALE_ID]) {
  CAPTAINS[VALE_ID].passiveText = 'Vale and adjacent Riflemen build Focus while firing, even while moving. Reaching full Focus activates the full bonus for 5 seconds: +75% fire rate, a 12% chance for +1 pierce, and synchronized volleys. Vale fires 3 rounds one after another at the same target on every attack.';
}

function loadSquadBuilderVisualFixes() {
  const href = new URL('../../styles/squad-builder-v43.css', import.meta.url).href;
  if (document.querySelector(`link[data-squad-builder-v43="${href}"]`)) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.squadBuilderV43 = href;
  document.head.append(link);
}

function createValeFocusCombatSystem(ParentCombatSystem) {
  return class ValeFocusCombatSystem extends ParentCombatSystem {
    getValeFocus(unitId) {
      const state = this.valeFocus?.get(unitId);
      if (!state) return 0;
      if ((state.buffUntil ?? 0) > this.game.elapsed) return 1;
      return Math.max(0, Math.min(1, state.focus ?? 0));
    }

    isValeFocusBuffActive(unitId) {
      const state = this.valeFocus?.get(unitId);
      return Boolean(state && (state.buffUntil ?? 0) > this.game.elapsed);
    }

    getValeFocusBuffRemaining(unitId) {
      const state = this.valeFocus?.get(unitId);
      return Math.max(0, (state?.buffUntil ?? 0) - this.game.elapsed);
    }

    updateValeFocusDecay(dt) {
      const effect = this.getValeEffect();
      const eligibleIds = new Set(
        this.getValeEligibleRiflemen().map((soldier) => soldier.unit.id),
      );
      const now = this.game.elapsed;

      for (const [unitId, state] of this.valeFocus.entries()) {
        if ((state.buffUntil ?? 0) > now) {
          state.focus = 1;
          continue;
        }

        // A completed Focus buff always lasts its full duration, then the unit
        // starts over from zero rather than extending the buff by firing.
        if ((state.buffUntil ?? 0) > 0) {
          state.buffUntil = 0;
          state.focus = 0;
          state.targetId = null;
          state.lastShotAt = now;
          continue;
        }

        let decay = 0;
        if (!eligibleIds.has(unitId)) {
          decay = effect.idleDecayPerSecond * 1.35;
        } else if (now - state.lastShotAt > effect.continuityGrace) {
          decay = effect.idleDecayPerSecond;
        }

        if (decay > 0) state.focus = Math.max(0, state.focus - decay * dt);
        if (state.focus <= 0 && now - state.lastShotAt > effect.continuityGrace * 2) {
          this.valeFocus.delete(unitId);
        }
      }
    }

    updateValeFocusFromShot(soldier, target) {
      if (!this.isAdjacentCaptainUnit(soldier, VALE_ID, RIFLEMAN_TYPE)) return null;

      const effect = this.getValeEffect();
      const now = this.game.elapsed;
      const state = this.valeFocus.get(soldier.unit.id) ?? {
        focus: 0,
        targetId: null,
        lastShotAt: -Infinity,
        buffUntil: 0,
      };

      // During the timed buff, shots can update the tracked target but never
      // refresh the five-second duration.
      if ((state.buffUntil ?? 0) > now) {
        state.focus = 1;
        state.targetId = target.id;
        state.lastShotAt = now;
        this.valeFocus.set(soldier.unit.id, state);
        if (soldier.unit.captainId === VALE_ID) this.valeCaptainFocusState = state;
        return state;
      }

      if ((state.buffUntil ?? 0) > 0) {
        state.buffUntil = 0;
        state.focus = 0;
        state.targetId = null;
      }

      if (state.targetId !== null && state.targetId !== target.id) {
        state.focus *= effect.targetChangeRetention;
      }

      state.targetId = target.id;
      state.lastShotAt = now;

      // Movement no longer penalizes Focus: moving shots build Focus normally.
      state.focus = Math.min(1, state.focus + effect.focusGainPerShot);

      if (state.focus >= FOCUS_EPSILON) {
        state.focus = 1;
        state.buffUntil = now + (effect.focusBuffDuration ?? VALE_FOCUS_BUFF_DURATION);
      }

      this.valeFocus.set(soldier.unit.id, state);
      if (soldier.unit.captainId === VALE_ID) this.valeCaptainFocusState = state;
      return state;
    }
  };
}

loadSquadBuilderVisualFixes();

export class UI extends PreviousUI {
  constructor(...args) {
    super(...args);
    document.querySelector('[data-debug-drop="nuke"]')?.remove();
  }
}

export class Game extends PreviousGame {
  constructor(...args) {
    super(...args);
    const ValeFocusCombatSystem = createValeFocusCombatSystem(this.combatSystem.constructor);
    this.combatSystem = new ValeFocusCombatSystem(this);
    this.combatSystem.reset();
  }

  startNukeWave() {
    this.nukeWave = null;
  }

  drawPlayer(ctx) {
    super.drawPlayer(ctx);

    const effect = CAPTAINS[VALE_ID]?.effect;
    if (effect?.type !== 'coordinated-fire') return;

    const color = effect.color ?? '#8fffe4';
    const clock = this.animationClock ?? this.elapsed;

    for (const soldier of this.getSoldierPositions()) {
      if (soldier.unit.dead || soldier.unit.type !== RIFLEMAN_TYPE) continue;
      if (!this.combatSystem.isValeFocusBuffActive?.(soldier.unit.id)) continue;

      const pulse = (Math.sin(clock * 11 + soldier.unit.id * 0.73) + 1) * 0.5;
      const radius = GAME_BALANCE.player.soldierRadius + 8 + pulse * 2;

      ctx.save();
      ctx.globalAlpha = 0.42 + pulse * 0.58;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5 + pulse * 2.5;
      ctx.shadowBlur = 10 + pulse * 20;
      ctx.shadowColor = color;
      ctx.beginPath();
      ctx.arc(soldier.x, soldier.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}
