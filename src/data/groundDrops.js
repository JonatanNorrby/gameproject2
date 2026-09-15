export const GROUND_DROP_CONFIG = {
  spawnChanceOnKill: 0.005,
  pickupRadius: 28,
  debugSpawnDistance: 76,
};

export const GROUND_DROPS = {
  magnet: {
    id: 'magnet',
    label: 'Magnet',
    symbol: 'M',
    color: '#70e8ff',
    description: 'Pull every XP gem currently on the battlefield into the squad.',
    kind: 'instant',
  },
  fury: {
    id: 'fury',
    label: 'Fury',
    symbol: 'F',
    color: '#ffcf5b',
    description: '+300% attack speed for all units.',
    kind: 'timed',
    duration: 10,
  },
};

export const GROUND_DROP_IDS = Object.keys(GROUND_DROPS);
