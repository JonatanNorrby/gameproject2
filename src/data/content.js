export const GAME_BALANCE = {
  player: {
    radius: 16,
    soldierRadius: 10,
    formationSpacing: 28,
    startingSoldiers: 1,
    speed: 235,
    maxHp: 100,
    armor: 0,
    magnetRadius: 92,
  },
  weapon: {
    damage: 20,
    cooldown: 0.55,
    projectileSpeed: 620,
    projectileRadius: 5,
    projectileLife: 1.25,
    pierce: 1,
    range: 780,
  },
  progression: {
    startingXpToNext: 8,
    growth: 1.34,
  },
};

export const ENEMY_TYPES = {
  crawler: {
    label: 'Crawler', radius: 13, speed: 78, hp: 30, damage: 8, xp: 1,
    fill: '#db5c83', outline: '#ff9db9', unlockAt: 0, weight: 9,
  },
  runner: {
    label: 'Runner', radius: 10, speed: 128, hp: 19, damage: 6, xp: 1,
    fill: '#e5b84e', outline: '#ffe197', unlockAt: 18, weight: 5,
  },
  brute: {
    label: 'Brute', radius: 23, speed: 48, hp: 110, damage: 18, xp: 4,
    fill: '#8f62d8', outline: '#c3a5ff', unlockAt: 34, weight: 2,
  },
};

export const RARITIES = [
  { id: 'common', label: 'Common', weight: 64, color: '#b8c0cc' },
  { id: 'uncommon', label: 'Uncommon', weight: 25, color: '#70dc8b' },
  { id: 'rare', label: 'Rare', weight: 9, color: '#67a7ff' },
  { id: 'epic', label: 'Epic', weight: 2, color: '#c17cff' },
];

function rarityValue(rarity, values) {
  return values[rarity.id] ?? values.common;
}

function percentageUpgrade({ id, name, tag, maxRank, values, target, suffix = '' }) {
  return {
    id, name, tag, maxRank,
    describe(rarity) {
      const value = rarityValue(rarity, values);
      return `+${value}% ${suffix}`;
    },
    apply(game, rarity) {
      game.modifiers[target] *= 1 + rarityValue(rarity, values) / 100;
    },
  };
}

export const UPGRADES = [
  {
    id: 'soldiers', name: 'Squad Reinforcements', tag: 'Squad', maxRank: 7,
    values: { common: 1, uncommon: 1, rare: 2, epic: 3 },
    describe(rarity) {
      const amount = rarityValue(rarity, this.values);
      return `+${amount} soldier${amount === 1 ? '' : 's'}. Every soldier fires in each volley.`;
    },
    apply(game, rarity) {
      game.player.soldiers += rarityValue(rarity, this.values);
    },
  },
  percentageUpgrade({
    id: 'damage', name: 'Overcharged Rounds', tag: 'Weapon', maxRank: 8,
    values: { common: 20, uncommon: 28, rare: 40, epic: 60 },
    target: 'damage', suffix: 'projectile damage.',
  }),
  percentageUpgrade({
    id: 'fire-rate', name: 'Accelerated Cycling', tag: 'Weapon', maxRank: 8,
    values: { common: 15, uncommon: 21, rare: 30, epic: 45 },
    target: 'fireRate', suffix: 'attack speed.',
  }),
  percentageUpgrade({
    id: 'move-speed', name: 'Servo Boost', tag: 'Mobility', maxRank: 5,
    values: { common: 10, uncommon: 14, rare: 20, epic: 30 },
    target: 'moveSpeed', suffix: 'movement speed.',
  }),
  {
    id: 'max-hp', name: 'Reinforced Chassis', tag: 'Defense', maxRank: 5,
    values: { common: 20, uncommon: 30, rare: 45, epic: 70 },
    describe(rarity) {
      const amount = rarityValue(rarity, this.values);
      return `+${amount} maximum integrity and heal ${amount}.`;
    },
    apply(game, rarity) {
      const amount = rarityValue(rarity, this.values);
      game.player.maxHp += amount;
      game.player.hp = Math.min(game.player.maxHp, game.player.hp + amount);
    },
  },
  {
    id: 'armor', name: 'Reactive Plating', tag: 'Defense', maxRank: 6,
    values: { common: 6, uncommon: 8, rare: 11, epic: 15 },
    describe(rarity) {
      return `-${rarityValue(rarity, this.values)}% contact damage taken.`;
    },
    apply(game, rarity) {
      game.player.armor = Math.min(0.6, game.player.armor + rarityValue(rarity, this.values) / 100);
    },
  },
  {
    id: 'magnet', name: 'Salvage Magnet', tag: 'Utility', maxRank: 5,
    values: { common: 34, uncommon: 48, rare: 70, epic: 105 },
    describe(rarity) {
      return `+${rarityValue(rarity, this.values)} pickup radius.`;
    },
    apply(game, rarity) {
      game.player.magnetRadius += rarityValue(rarity, this.values);
    },
  },
  {
    id: 'pierce', name: 'Penetrator Core', tag: 'Weapon', maxRank: 4,
    values: { common: 1, uncommon: 1, rare: 2, epic: 3 },
    describe(rarity) {
      return `+${rarityValue(rarity, this.values)} projectile pierce.`;
    },
    apply(game, rarity) {
      game.modifiers.pierce += rarityValue(rarity, this.values);
    },
  },
  {
    id: 'projectile-speed', name: 'Rail Accelerator', tag: 'Weapon', maxRank: 5,
    speedValues: { common: 18, uncommon: 25, rare: 36, epic: 52 },
    lifeValues: { common: 8, uncommon: 11, rare: 16, epic: 24 },
    describe(rarity) {
      return `+${rarityValue(rarity, this.speedValues)}% projectile speed and +${rarityValue(rarity, this.lifeValues)}% range.`;
    },
    apply(game, rarity) {
      game.modifiers.projectileSpeed *= 1 + rarityValue(rarity, this.speedValues) / 100;
      game.modifiers.projectileLife *= 1 + rarityValue(rarity, this.lifeValues) / 100;
    },
  },
];
