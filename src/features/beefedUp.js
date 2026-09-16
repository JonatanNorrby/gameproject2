import { Game as PreviousGame, UI } from './thirdCaptain.js';
import {
  BEEFED_UP_HP_BONUS,
  isPermanentUpgradeOwned,
} from '../data/metaUpgrades.js';

const BEEFED_UPGRADE_ID = 'beefed_up';

export function applyBeefedUpHealthBonus(unit) {
  if (!unit || unit.beefedUpApplied) return false;

  unit.maxHp = Math.max(1, Number(unit.maxHp) || 1) + BEEFED_UP_HP_BONUS;
  unit.hp = Math.min(
    unit.maxHp,
    Math.max(0, Number(unit.hp) || 0) + BEEFED_UP_HP_BONUS,
  );
  unit.beefedUpApplied = true;
  return true;
}

export class Game extends PreviousGame {
  addSquadUnits(type, amount = 1) {
    const previousIds = new Set((this.player?.squad ?? []).map((unit) => unit.id));
    super.addSquadUnits(type, amount);

    if (!isPermanentUpgradeOwned(BEEFED_UPGRADE_ID)) return;
    for (const unit of this.player?.squad ?? []) {
      if (previousIds.has(unit.id)) continue;
      applyBeefedUpHealthBonus(unit);
    }
  }
}

export { UI };
