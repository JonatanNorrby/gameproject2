import { Game as PreviousGame, UI as PreviousUI } from './supportUnits.js';
import '../data/stormlancer.js';

const BUILDER_UNIT_COLORS = Object.freeze({
  rifleman: '#4fa3ff',
  rocketeer: '#ff9f43',
  shockblade: '#a86cff',
  stormlancer: '#72e9ff',
  drone_pilot: '#ffd84d',
});

const CAPTAIN_GOLD = '#f7c94b';

export class Game extends PreviousGame {}

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
      card.classList.toggle('squad-unit-card--captain', isCaptain);
    }
  }
}
