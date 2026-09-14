export const GAME_BALANCE = {
  player: {
    radius: 16,
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

export const UPGRADES = [
  {
    id: 'damage', name: 'Overcharged Rounds', tag: 'Weapon', maxRank: 8,
    description: '+20% projectile damage.',
    apply(game) { game.modifiers.damage *= 1.2; },
  },
  {
    id: 'fire-rate', name: 'Accelerated Cycling', tag: 'Weapon', maxRank: 8,
    description: '+15% attack speed.',
    apply(game) { game.modifiers.fireRate *= 1.15; },
  },
  {
    id: 'move-speed', name: 'Servo Boost', tag: 'Mobility', maxRank: 5,
    description: '+10% movement speed.',
    apply(game) { game.modifiers.moveSpeed *= 1.1; },
  },
  {
    id: 'max-hp', name: 'Reinforced Chassis', tag: 'Defense', maxRank: 5,
    description: '+20 maximum integrity and heal 20.',
    apply(game) {
      game.player.maxHp += 20;
      game.player.hp = Math.min(game.player.maxHp, game.player.hp + 20);
    },
  },
  {
    id: 'armor', name: 'Reactive Plating', tag: 'Defense', maxRank: 6,
    description: '-8% contact damage taken per rank.',
    apply(game) { game.player.armor = Math.min(0.48, game.player.armor + 0.08); },
  },
  {
    id: 'magnet', name: 'Salvage Magnet', tag: 'Utility', maxRank: 5,
    description: '+34 pickup radius.',
    apply(game) { game.player.magnetRadius += 34; },
  },
  {
    id: 'pierce', name: 'Penetrator Core', tag: 'Weapon', maxRank: 4,
    description: '+1 projectile pierce.',
    apply(game) { game.modifiers.pierce += 1; },
  },
  {
    id: 'projectile-speed', name: 'Rail Accelerator', tag: 'Weapon', maxRank: 5,
    description: '+18% projectile speed and range.',
    apply(game) {
      game.modifiers.projectileSpeed *= 1.18;
      game.modifiers.projectileLife *= 1.08;
    },
  },
];
