import { Game as PreviousGame, UI } from './projectileBehavior.js';
import { CAPTAINS } from '../data/content.js';
import { THORNE_CAPTAIN } from '../data/captainThorne.js';

const THORNE_ID = THORNE_CAPTAIN.id;
const SHOCKBLADE_TYPE = 'shockblade';
const DEFAULT_SWEEP_INTERVAL = 5;

function createThorneEveryFifthCombatSystem(ParentCombatSystem) {
  return class ThorneEveryFifthCombatSystem extends ParentCombatSystem {
    constructor(game) {
      super(game);
      this.thorneShockbladeAttackCounts = new Map();
      this.thornePassiveOverride = null;
    }

    reset() {
      super.reset();
      this.thorneShockbladeAttackCounts?.clear();
      this.thornePassiveOverride = null;
    }

    isThorneActive() {
      if (typeof this.thornePassiveOverride === 'boolean') {
        return this.thornePassiveOverride;
      }
      return super.isThorneActive();
    }

    performShockbladeSlash(unit, attack) {
      const thorneActive = super.isThorneActive();
      const buffedShockblade = Boolean(
        thorneActive
        && unit?.type === SHOCKBLADE_TYPE
        && unit.captainId !== THORNE_ID
      );

      if (!buffedShockblade) {
        super.performShockbladeSlash(unit, attack);
        return;
      }

      const interval = Math.max(
        1,
        CAPTAINS[THORNE_ID]?.effect?.everyAttacks
          ?? THORNE_CAPTAIN.effect?.everyAttacks
          ?? DEFAULT_SWEEP_INTERVAL,
      );
      const attackCount = (this.thorneShockbladeAttackCounts.get(unit.id) ?? 0) + 1;
      this.thorneShockbladeAttackCounts.set(unit.id, attackCount);

      const previousOverride = this.thornePassiveOverride;
      this.thornePassiveOverride = attackCount % interval === 0;
      try {
        super.performShockbladeSlash(unit, attack);
      } finally {
        this.thornePassiveOverride = previousOverride;
      }
    }

    updateSquadWeapons(dt) {
      super.updateSquadWeapons(dt);

      const livingShockblades = new Set(
        this.game.player.squad
          .filter((unit) => !unit.dead && unit.type === SHOCKBLADE_TYPE && unit.captainId !== THORNE_ID)
          .map((unit) => unit.id),
      );
      for (const unitId of this.thorneShockbladeAttackCounts.keys()) {
        if (!livingShockblades.has(unitId)) this.thorneShockbladeAttackCounts.delete(unitId);
      }
    }
  };
}

export class Game extends PreviousGame {
  constructor(...args) {
    super(...args);
    const ThorneEveryFifthCombatSystem = createThorneEveryFifthCombatSystem(this.combatSystem.constructor);
    this.combatSystem = new ThorneEveryFifthCombatSystem(this);
    this.combatSystem.reset();
  }
}

export { UI };
