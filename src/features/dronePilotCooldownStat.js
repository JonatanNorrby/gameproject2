import { Game, UI as PreviousUI } from './cipherScaleGlow.js';
import { getEffectiveUnitStats } from '../data/unitModifiers.js';

const DRONE_PILOT_TYPE = 'drone_pilot';

export class UI extends PreviousUI {
  renderSquadStats(counts) {
    super.renderSquadStats(counts);
    if (!counts?.[DRONE_PILOT_TYPE] || !this.squadBuilderSummary) return;

    const stats = getEffectiveUnitStats(DRONE_PILOT_TYPE, this.game?.unitModifiers);
    if (!stats) return;

    const summaryChildren = Array.from(this.squadBuilderSummary.children ?? []);
    const statGrid = summaryChildren.find((child) => (
      Array.from(child.children ?? []).some((card) => (
        card.querySelector?.('strong')?.textContent === stats.label
      ))
    ));
    if (!statGrid) return;

    const pilotCard = Array.from(statGrid.children ?? []).find((card) => (
      card.querySelector?.('strong')?.textContent === stats.label
    ));
    const statRow = pilotCard?.children?.[1];
    const rateCell = statRow?.children?.[1];
    if (!rateCell) return;

    const label = rateCell.querySelector?.('small');
    const value = rateCell.querySelector?.('b');
    if (label) label.textContent = 'COOLDOWN';
    if (value) value.textContent = `${this.formatCombatValue(stats.cooldown, 2)}s`;
  }
}

export { Game };
