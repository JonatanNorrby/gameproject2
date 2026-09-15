import { Game as PreviousGame, UI as PreviousUI } from './supportUnits.js';

const BUILDER_UNIT_COLORS = Object.freeze({
  rifleman: '#4fa3ff',
  rocketeer: '#ff9f43',
  shockblade: '#a86cff',
  anti_air: '#ff5f68',
  drone_pilot: '#ffd84d',
});

const CAPTAIN_GOLD = '#f7c94b';
const ANTI_AIR_TYPE = 'anti_air';

function addAntiAirHexGraphics(card) {
  if (card.querySelector('.squad-unit-card__anti-air-hex')) return;

  const leftHex = document.createElement('span');
  leftHex.className = 'squad-unit-card__anti-air-hex squad-unit-card__anti-air-hex--left';
  leftHex.setAttribute('aria-hidden', 'true');

  const rightHex = document.createElement('span');
  rightHex.className = 'squad-unit-card__anti-air-hex squad-unit-card__anti-air-hex--right';
  rightHex.setAttribute('aria-hidden', 'true');

  card.prepend(rightHex);
  card.prepend(leftHex);
}

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

      if (unit.type !== ANTI_AIR_TYPE) continue;

      card.classList.add('squad-unit-card--anti-air');

      // supportUnits.js deliberately stretches Anti Air to 1.8x after the base
      // builder render. Recover the normal hex width, then display the unit as
      // two full-size neighboring hexes centered over its two-slot footprint.
      const stretchedWidth = Number.parseFloat(card.style.width)
        || card.getBoundingClientRect().width
        || 144;
      const normalHexWidth = stretchedWidth / 1.8;
      card.style.width = `${normalHexWidth * 2}px`;
      card.style.marginLeft = `${normalHexWidth / 2}px`;

      addAntiAirHexGraphics(card);
    }
  }
}
