import { Game as PreviousGame, UI as PreviousUI } from './squadBuilderVisuals.js';
import { CAPTAINS, GAME_BALANCE, UNIT_CLASSES } from '../data/content.js';

const VALE_ID = 'vale';
const RIFLEMAN_TYPE = 'rifleman';
const ROCKETEER_TYPE = 'rocketeer';
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

  drawRiflemanProjectile(ctx, projectile) {
    const speed = Math.hypot(projectile.vx, projectile.vy) || 1;
    const dirX = projectile.vx / speed;
    const dirY = projectile.vy / speed;
    const halfLength = 5;
    const x1 = projectile.x - dirX * halfLength;
    const y1 = projectile.y - dirY * halfLength;
    const x2 = projectile.x + dirX * halfLength;
    const y2 = projectile.y + dirY * halfLength;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth = 5;
    ctx.shadowBlur = 14;
    ctx.shadowColor = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }

  drawRocketeerProjectile(ctx, projectile) {
    const angle = Math.atan2(projectile.vy, projectile.vx);

    ctx.save();
    ctx.translate(projectile.x, projectile.y);
    ctx.rotate(angle);

    ctx.shadowBlur = 20;
    ctx.shadowColor = projectile.color ?? '#ffb35c';
    ctx.fillStyle = projectile.color ?? '#ffb35c';
    ctx.strokeStyle = 'rgba(255,244,210,.95)';
    ctx.lineWidth = 1.5;

    // Compact arrow-like rocket: pointed nose, narrow body, small rear fins.
    ctx.beginPath();
    ctx.moveTo(11, 0);
    ctx.lineTo(1, -5);
    ctx.lineTo(-3, -3);
    ctx.lineTo(-7, -6);
    ctx.lineTo(-6, -1.5);
    ctx.lineTo(-9, 0);
    ctx.lineTo(-6, 1.5);
    ctx.lineTo(-7, 6);
    ctx.lineTo(-3, 3);
    ctx.lineTo(1, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Small bright exhaust flare behind the arrow body.
    ctx.strokeStyle = '#fff1b8';
    ctx.lineCap = 'round';
    ctx.lineWidth = 3;
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#ffd36a';
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.lineTo(-14, 0);
    ctx.stroke();
    ctx.restore();
  }

  drawDefaultProjectile(ctx, projectile) {
    ctx.save();
    ctx.fillStyle = projectile.color ?? '#bffcf0';
    ctx.shadowBlur = projectile.kind === 'rocket' ? 18 : 12;
    ctx.shadowColor = projectile.color ?? '#7ef9d4';

    if (projectile.kind === 'rocket') {
      const speed = Math.hypot(projectile.vx, projectile.vy) || 1;
      const tailX = projectile.x - (projectile.vx / speed) * 15;
      const tailY = projectile.y - (projectile.vy / speed) * 15;
      ctx.strokeStyle = '#ffe19d';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(projectile.x, projectile.y);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(projectile.x, projectile.y, projectile.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawProjectiles(ctx) {
    for (const projectile of this.entities.projectiles) {
      if (projectile.sourceType === RIFLEMAN_TYPE && projectile.kind === 'bullet') {
        this.drawRiflemanProjectile(ctx, projectile);
        continue;
      }

      if (projectile.sourceType === ROCKETEER_TYPE && projectile.kind === 'rocket') {
        this.drawRocketeerProjectile(ctx, projectile);
        continue;
      }

      this.drawDefaultProjectile(ctx, projectile);
    }
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
