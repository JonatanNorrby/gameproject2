import { RARITIES, UPGRADES } from '../data/content.js';
import { createUnitModifierState } from '../data/unitModifiers.js';

const REINFORCEMENT_CHOICE_WEIGHT = 0.3;
const STAT_CHOICE_WEIGHT = 1;

// Levels 1-50 are paced around ~25 minutes of active combat plus four boss
// fights at levels 10/20/30/40 before the level-50 final boss appears. A
// linear requirement also lets endless progression continue indefinitely
// without the old exponential curve becoming practically unreachable.
export const PROGRESSION_PACING = Object.freeze({
  startingXpToNext: 20,
  xpPerLevel: 36,
  targetLevel: 50,
  targetMinutes: 30,
});

export function getXpToNextForLevel(level) {
  const normalizedLevel = Math.max(1, Math.floor(Number(level) || 1));
  return Math.ceil(
    PROGRESSION_PACING.startingXpToNext
    + PROGRESSION_PACING.xpPerLevel * (normalizedLevel - 1),
  );
}

export class ProgressionSystem {
  constructor(game, ui) {
    this.game = game;
    this.ui = ui;
    this.ranks = new Map();
  }

  reset() {
    this.ranks.clear();
    this.game.unitModifiers = createUnitModifierState();
    this.game.player.level = 1;
    this.game.player.xp = 0;
    this.game.player.xpToNext = getXpToNextForLevel(1);
  }

  addXp(amount) {
    const player = this.game.player;
    player.xp += amount;
    if (player.xp >= player.xpToNext) this.levelUp();
  }

  debugLevelUp() {
    this.levelUp({ consumeXp: false });
  }

  debugSetLevel(targetLevel) {
    const player = this.game.player;
    const parsed = Math.floor(Number(targetLevel));
    if (!Number.isFinite(parsed)) return player.level;

    const target = Math.max(player.level, Math.max(1, parsed));
    if (target === player.level) return player.level;

    player.level = target;
    player.xp = 0;
    player.xpToNext = getXpToNextForLevel(player.level);

    // This debug jump is for reaching test content quickly. It deliberately
    // does not generate one upgrade-choice screen for every skipped level.
    this.ui.hideLevelUp?.();
    this.game.resume('levelup');
    return player.level;
  }

  levelUp({ consumeXp = true } = {}) {
    const player = this.game.player;
    if (consumeXp) player.xp -= player.xpToNext;
    player.level += 1;
    player.xpToNext = getXpToNextForLevel(player.level);

    const choices = this.getChoices(3);
    if (choices.length === 0) return;

    const finishLevelUp = () => {
      this.ui.hideLevelUp();
      this.game.resume('levelup');
      if (player.xp >= player.xpToNext) this.levelUp();
    };

    this.game.pause('levelup');
    this.ui.showLevelUp(choices, (choice) => {
      const { upgrade, rarity } = choice;
      const rank = (this.ranks.get(upgrade.id) || 0) + 1;
      this.ranks.set(upgrade.id, rank);
      upgrade.apply(this.game, rarity);
      finishLevelUp();
    }, this.ranks, finishLevelUp);
  }

  getChoiceWeight(upgrade) {
    return upgrade.kind === 'reinforcement'
      ? REINFORCEMENT_CHOICE_WEIGHT
      : STAT_CHOICE_WEIGHT;
  }

  getChoices(count) {
    const ownedTypes = new Set(this.game.player.squad.map((unit) => unit.type));
    const candidates = UPGRADES.filter((upgrade) => (
      upgrade.kind === 'reinforcement' || ownedTypes.has(upgrade.unitType)
    ));
    const selected = [];

    while (selected.length < count && candidates.length > 0) {
      const totalWeight = candidates.reduce((sum, upgrade) => sum + this.getChoiceWeight(upgrade), 0);
      let roll = Math.random() * totalWeight;
      let selectedIndex = candidates.length - 1;

      for (let index = 0; index < candidates.length; index += 1) {
        roll -= this.getChoiceWeight(candidates[index]);
        if (roll < 0) {
          selectedIndex = index;
          break;
        }
      }

      selected.push(candidates.splice(selectedIndex, 1)[0]);
    }

    return selected.map((upgrade) => ({
      upgrade: { ...upgrade, maxRank: '∞' },
      rarity: this.rollRarity(upgrade.rarityIds),
    }));
  }

  rollRarity(allowedIds = null) {
    const allowed = Array.isArray(allowedIds) && allowedIds.length > 0
      ? new Set(allowedIds)
      : null;
    const pool = allowed
      ? RARITIES.filter((rarity) => allowed.has(rarity.id))
      : RARITIES;
    const candidates = pool.length > 0 ? pool : RARITIES;
    const totalWeight = candidates.reduce((sum, rarity) => sum + rarity.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const rarity of candidates) {
      roll -= rarity.weight;
      if (roll < 0) return rarity;
    }
    return candidates[0];
  }
}
