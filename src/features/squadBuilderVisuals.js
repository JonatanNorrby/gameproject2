import { Game as PreviousGame, UI as PreviousUI } from './supportUnits.js';
import { CAPTAINS } from '../data/content.js';
import '../data/stormlancer.js';

const BUILDER_UNIT_COLORS = Object.freeze({
  rifleman: '#4fa3ff',
  rocketeer: '#ff9f43',
  shockblade: '#a86cff',
  stormlancer: '#72e9ff',
  drone_pilot: '#ffd84d',
});

const CAPTAIN_GOLD = '#f7c94b';
const MERCER_ID = 'mercer';
const ROCKETEER_CLASS = 'rocketeer';

export function getMercerRocketeerTargetRangeMultiplier(combatSystem, soldier) {
  const unit = soldier?.unit;
  if (
    !unit
    || unit.dead
    || unit.captainId
    || unit.type !== ROCKETEER_CLASS
    || !combatSystem?.isAdjacentCaptainUnit?.(soldier, MERCER_ID, ROCKETEER_CLASS)
  ) return 1;

  const effect = CAPTAINS[MERCER_ID]?.effect;
  if (effect?.type !== 'rocketeer-class-third-area') return 1;

  const interval = Math.max(1, Number(effect.everyShots) || 3);
  const currentCount = combatSystem.mercerClassAttackCounts?.get(unit.id) ?? 0;
  const nextCount = currentCount + 1;
  if (nextCount % interval !== 0) return 1;

  return Math.max(1, Number(effect.rangeMultiplier) || 1);
}

function createIssue41TargetingCombatSystem(ParentCombatSystem) {
  const parentHasRangeHook = typeof ParentCombatSystem.prototype.getPreFireRangeMultiplier === 'function';

  return class Issue41TargetingCombatSystem extends ParentCombatSystem {
    getPreFireRangeMultiplier(soldier, unitClass) {
      const inheritedMultiplier = parentHasRangeHook
        ? super.getPreFireRangeMultiplier(soldier, unitClass)
        : 1;
      return inheritedMultiplier
        * getMercerRocketeerTargetRangeMultiplier(this, soldier);
    }
  };
}

export class Game extends PreviousGame {
  constructor(...args) {
    super(...args);
    const Issue41TargetingCombatSystem = createIssue41TargetingCombatSystem(
      this.combatSystem.constructor,
    );
    this.combatSystem = new Issue41TargetingCombatSystem(this);
    this.combatSystem.reset();
  }
}

export class UI extends PreviousUI {
  renderSquadBuilder() {
    super.renderSquadBuilder();

    const squad = this.squadBuilderHandlers?.getSquad?.() ?? [];
    for (const unit of squad) {
      const card = this.squadBuilderGrid.querySelector(`[data-unit-id="${unit.id}"]`);
      if (!card) continue;

      const isCaptain = Boolean(unit.captainId);
      const color = isCaptain
        ? CAPTAIN_GOLD
        : (BUILDER_UNIT_COLORS[unit.type] ?? card.style.getPropertyValue('--unit-color'));
      card.style.setProperty('--unit-color', color);
      card.style.setProperty('--health-border-color', color);
      card.dataset.healthState = 'shared';
      card.classList.toggle('squad-unit-card--captain', isCaptain);
    }
  }
}
