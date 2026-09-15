import { GAME_BALANCE, RARITIES, UPGRADES } from '../data/content.js';
import { createUnitModifierState } from '../data/unitModifiers.js';

const REINFORCEMENT_CHOICE_WEIGHT = 0.35;
const STAT_CHOICE_WEIGHT = 1;

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
    this.game.player.xpToNext = GAME_BALANCE.progression.startingXpToNext;
  }

  addXp(amount) {
    const player = this.game.player;
    player.xp += amount;
    if (player.xp >= player.xpToNext) this.levelUp();
  }

  debugLevelUp() {
    this.levelUp({ consumeXp: false });
  }

  levelUp({ consumeXp = true } = {}) {
    const player = this.game.player;
    if (consumeXp) player.xp -= player.xpToNext;
    player.level += 1;
    player.xpToNext = Math.ceil(GAME_BALANCE.progression.startingXpToNext * Math.pow(GAME_BALANCE.progression.growth, player.level - 1));

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
      rarity: this.rollRarity(),
    }));
  }

  rollRarity() {
    const totalWeight = RARITIES.reduce((sum, rarity) => sum + rarity.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const rarity of RARITIES) {
      roll -= rarity.weight;
      if (roll < 0) return rarity;
    }
    return RARITIES[0];
  }
}
