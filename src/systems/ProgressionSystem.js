import { GAME_BALANCE, RARITIES, UPGRADES } from '../data/content.js';
import { createUnitModifierState } from '../data/unitModifiers.js';

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
    this.game.pause('levelup');
    this.ui.showLevelUp(choices, (choice) => {
      const { upgrade, rarity } = choice;
      const rank = (this.ranks.get(upgrade.id) || 0) + 1;
      this.ranks.set(upgrade.id, rank);
      upgrade.apply(this.game, rarity);
      this.ui.hideLevelUp();
      this.game.resume('levelup');
      if (player.xp >= player.xpToNext) this.levelUp();
    }, this.ranks);
  }

  getChoices(count) {
    const ownedTypes = new Set(this.game.player.squad.map((unit) => unit.type));
    const pool = UPGRADES.filter((upgrade) => (
      ownedTypes.has(upgrade.unitType)
      && (this.ranks.get(upgrade.id) || 0) < upgrade.maxRank
    ));
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count).map((upgrade) => ({
      upgrade,
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
