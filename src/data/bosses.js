export const WARDEN_BOSS = Object.freeze({
  id: 'warden',
  name: 'The Warden',
  spawnLevel: 15,
  radius: 64,
  maxHp: 6600,
  xpReward: 0,
  permanentUpgradePoints: 1,
  speed: 52,
  enragedSpeed: 82,
  colors: Object.freeze({
    shell: '#68516f',
    shellEdge: '#b895c2',
    flesh: '#b84c72',
    core: '#ff5d8f',
    coreHot: '#ffd0df',
    telegraph: '#ff425f',
    summon: '#c47dff',
  }),
  armor: Object.freeze({
    shellHp: 2000,
    exposedCoreDamageMultiplier: 1.65,
    // Compatibility only; individual breakable plates are no longer used.
    plateHp: 0,
    frontDamageMultiplier: 1,
    sideDamageMultiplier: 1,
    rearDamageMultiplier: 1,
    brokenPlateDamageMultiplier: 1,
  }),
  // Individual plate targeting/breaking has been removed. The Warden now uses
  // one shared 360-degree armor shell rendered independently from its artwork.
  plates: Object.freeze([]),
  charge: Object.freeze({
    telegraphDuration: 1.2,
    enragedTelegraphDuration: 0.78,
    speed: 560,
    enragedSpeed: 690,
    duration: 0.95,
    damage: 30,
    knockback: 36,
    crashRecovery: 3,
    hitRecovery: 1.05,
  }),
  slam: Object.freeze({
    triggerRange: 200,
    telegraphDuration: 0.86,
    radius: 200,
    damage: 24,
  }),
  barrage: Object.freeze({
    telegraphDuration: 1.55,
    markerRadius: 48,
    markerCount: 6,
    damage: 21,
  }),
  // Kept as inert compatibility data for the existing boss state machine.
  // Call the Swarm is disabled.
  swarm: Object.freeze({
    firstThreshold: -1,
    secondThreshold: -1,
    duration: 0,
    firstCount: 0,
    secondCount: 0,
    spawnInterval: 1,
  }),
  enrageThreshold: 0.4,
});
