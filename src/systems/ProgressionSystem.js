import { RARITIES, UPGRADES } from '../data/content.js';
import { createUnitModifierState } from '../data/unitModifiers.js';
import { getUnitClassFamily } from '../data/unitFamilies.js';

const REINFORCEMENT_CHOICE_WEIGHT = 0.3;
const STAT_CHOICE_WEIGHT = 1;
const XP_DROP_VALUE_MULTIPLIER = 1.33;
const LEVEL_UP_HEAL_FRACTION = 0.5;
const ACTIVE_RARITY_IDS = new Set(['uncommon', 'rare', 'epic']);
export const STARTING_REROLLS = 3;
export const REROLL_LEVEL_INTERVAL = 10;

// Levels 1-50 use a linear requirement so progression remains sustainable into
// endless mode after the level-50 final boss. Enemy XP drops are globally worth
// 33% more through addXp(), without changing the underlying enemy definitions.
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
    this.rerolls = STARTING_REROLLS;
    this.activeLevelUp = null;
  }

  reset() {
    this.ranks.clear();
    this.rerolls = STARTING_REROLLS;
    this.activeLevelUp = null;
    this.game.unitModifiers = createUnitModifierState();
    this.game.player.level = 1;
    this.game.player.xp = 0;
    this.game.player.xpToNext = getXpToNextForLevel(1);
  }

  addXp(amount) {
    const player = this.game.player;
    const baseAmount = Math.max(0, Number(amount) || 0);
    const gainedXp = baseAmount * XP_DROP_VALUE_MULTIPLIER;
    player.xp = Math.round((player.xp + gainedXp) * 100) / 100;
    if (player.xp >= player.xpToNext) this.levelUp();
  }

  debugLevelUp() {
    this.levelUp({ consumeXp: false });
  }

  grantRerollsForLevels(previousLevel, newLevel) {
    const previousMilestones = Math.floor(Math.max(0, previousLevel) / REROLL_LEVEL_INTERVAL);
    const newMilestones = Math.floor(Math.max(0, newLevel) / REROLL_LEVEL_INTERVAL);
    const gained = Math.max(0, newMilestones - previousMilestones);
    this.rerolls += gained;
    return gained;
  }

  debugSetLevel(targetLevel) {
    const player = this.game.player;
    const parsed = Math.floor(Number(targetLevel));
    if (!Number.isFinite(parsed)) return player.level;

    const target = Math.max(player.level, Math.max(1, parsed));
    if (target === player.level) return player.level;

    this.grantRerollsForLevels(player.level, target);
    player.level = target;
    player.xp = 0;
    player.xpToNext = getXpToNextForLevel(player.level);

    // This debug jump is for reaching test content quickly. It deliberately
    // does not generate one upgrade-choice screen for every skipped level.
    this.activeLevelUp = null;
    this.ui.hideLevelUp?.();
    this.game.resume('levelup');
    return player.level;
  }

  healSquadOnLevelUp() {
    this.game.healSquadHealthFraction?.(LEVEL_UP_HEAL_FRACTION);
  }

  levelUp({ consumeXp = true } = {}) {
    const player = this.game.player;
    if (consumeXp) {
      player.xp = Math.max(
        0,
        Math.round((player.xp - player.xpToNext) * 100) / 100,
      );
    }

    const previousLevel = player.level;
    player.level += 1;
    this.grantRerollsForLevels(previousLevel, player.level);
    player.xpToNext = getXpToNextForLevel(player.level);
    this.healSquadOnLevelUp();

    const choices = this.getChoices(3);
    if (choices.length === 0) return;

    const finishLevelUp = () => {
      this.activeLevelUp = null;
      this.ui.hideLevelUp();
      this.game.resume('levelup');
      if (player.xp >= player.xpToNext) this.levelUp();
    };

    const chooseUpgrade = (choice) => {
      const { upgrade, rarity } = choice;
      const rank = (this.ranks.get(upgrade.id) || 0) + 1;
      this.ranks.set(upgrade.id, rank);
      upgrade.apply(this.game, rarity);
      finishLevelUp();
    };

    const renderChoices = (nextChoices) => {
      this.ui.showLevelUp(nextChoices, chooseUpgrade, this.ranks, finishLevelUp);
    };

    this.activeLevelUp = { renderChoices };
    this.game.pause('levelup');
    renderChoices(choices);
  }

  rerollCurrentChoices() {
    if (!this.activeLevelUp || this.rerolls <= 0) return false;

    const choices = this.getChoices(3);
    if (choices.length === 0) return false;

    this.rerolls -= 1;
    this.activeLevelUp.renderChoices(choices);
    return true;
  }

  getChoiceWeight(upgrade) {
    return upgrade.kind === 'reinforcement'
      ? REINFORCEMENT_CHOICE_WEIGHT
      : STAT_CHOICE_WEIGHT;
  }

  getChoices(count) {
    const ownedTypes = new Set(this.game.player.squad.map((unit) => unit.type));
    const ownedFamilies = new Set([...ownedTypes].map((unitType) => getUnitClassFamily(unitType)));
    const candidates = UPGRADES.filter((upgrade) => (
      upgrade.kind === 'reinforcement'
      || ownedFamilies.has(getUnitClassFamily(upgrade.unitType))
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
    const activeRarities = RARITIES.filter((rarity) => ACTIVE_RARITY_IDS.has(rarity.id));
    const allowed = Array.isArray(allowedIds) && allowedIds.length > 0
      ? new Set(allowedIds)
      : null;
    const pool = allowed
      ? activeRarities.filter((rarity) => allowed.has(rarity.id))
      : activeRarities;
    const candidates = pool.length > 0 ? pool : activeRarities;
    const totalWeight = candidates.reduce((sum, rarity) => sum + rarity.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const rarity of candidates) {
      roll -= rarity.weight;
      if (roll < 0) return rarity;
    }
    return candidates[0];
  }
}
