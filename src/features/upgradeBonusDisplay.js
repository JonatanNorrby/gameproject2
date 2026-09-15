import { Game, UI as PreviousUI } from './shockbladeClass.js';
import { UNIT_CLASSES } from '../data/content.js';

export { Game };

const STAT_LABELS = Object.freeze({
  damage: 'Damage',
  fireRate: 'Fire Rate',
  range: 'Range',
  projectileSpeed: 'Projectile Speed',
  pierce: 'Pierce',
  blastRadius: 'Blast Radius',
});

function formatPercent(value) {
  const rounded = Math.round((Number(value) || 0) * 10) / 10;
  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
}

function getStatLabel(upgrade) {
  if (upgrade?.unitType === 'shockblade' && upgrade?.stat === 'fireRate') return 'Attack Rate';
  if (upgrade?.unitType === 'shockblade' && upgrade?.stat === 'blastRadius') return 'Slash Radius';
  return STAT_LABELS[upgrade?.stat] ?? 'Stat';
}

function getTotalBonusPercent(game, upgrade) {
  const modifiers = game?.unitModifiers?.[upgrade?.unitType];
  if (!modifiers) return 0;

  if (upgrade.stat === 'pierce') {
    const basePierce = UNIT_CLASSES[upgrade.unitType]?.weapon?.pierce ?? 1;
    return basePierce > 0 ? ((Number(modifiers.pierce) || 0) / basePierce) * 100 : 0;
  }

  const multiplier = Number(modifiers[upgrade.stat]);
  if (!Number.isFinite(multiplier)) return 0;
  return (multiplier - 1) * 100;
}

function getUpgradeProgressText(game, upgrade) {
  if (upgrade?.kind === 'reinforcement') {
    const count = (game?.player?.squad ?? []).filter((unit) => !unit.dead && unit.type === upgrade.unitType).length;
    return `${upgrade.tag} units owned: ${count}`;
  }

  const totalBonus = getTotalBonusPercent(game, upgrade);
  return `${upgrade.tag} ${getStatLabel(upgrade)} bonus: +${formatPercent(totalBonus)}% total`;
}

export class UI extends PreviousUI {
  showLevelUp(choices, onChoose, ranks, onSkip) {
    super.showLevelUp(choices, onChoose, ranks, onSkip);

    const cards = [...this.upgradeOptions.children];
    cards.forEach((card, index) => {
      const upgrade = choices[index]?.upgrade;
      if (!upgrade) return;
      const progress = card.querySelector('small');
      if (progress) progress.textContent = getUpgradeProgressText(this.game, upgrade);
    });
  }
}
