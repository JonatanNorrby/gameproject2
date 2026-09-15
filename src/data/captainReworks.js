export const VALE_COORDINATED_FIRE = Object.freeze({
  description: 'Starts with an upgraded burst rifle and turns nearby Riflemen into a disciplined focus-fire team.',
  passiveText: 'Vale and adjacent Riflemen build Focus by sustaining fire on the same target. Focus fades slowly, and at max Focus they gain +75% fire rate, a 12% chance for +1 pierce, and synchronized volleys. Vale fires 3 rounds one after another at the same target every time he attacks.',
  effect: Object.freeze({
    type: 'coordinated-fire',
    focusGainPerShot: 0.16,
    targetChangeRetention: 0.55,
    moveDecayPerSecond: 0.12,
    idleDecayPerSecond: 0.04,
    continuityGrace: 2,
    maxFireRateMultiplier: 1.75,
    bonusPierceChance: 0.12,
    volleyInterval: 3,
    minVolleyRiflemen: 2,
    color: '#8fffe4',
  }),
});

export const MERCER_CHAIN_REACTION = Object.freeze({
  description: 'Starts with an upgraded fragmentation rocket launcher and turns nearby Rocketeers into a cascading demolition team.',
  passiveText: 'Mercer and adjacent Rocketeer explosions mark enemies. Every third rocket is a Heavy Warhead that detonates marks into chain reactions. Mercer rockets scatter light burst rounds after exploding.',
  effect: Object.freeze({
    type: 'rocketeer-special-rocket',
    mechanic: 'chain-reaction',
    everyShots: 3,
    rangeMultiplier: 1,
    aoeMultiplier: 1,
    markDuration: 8,
    maxMarks: 3,
    cascadeRadius: 70,
    cascadeDamageMultiplier: 0.45,
    color: '#ffe780',
    markColor: '#ff9f43',
  }),
});

export const CAPTAIN_WEAPON_TUNING = Object.freeze({
  riflemanBaseCooldown: 1.15,
  valeBurstCount: 3,
  valeBurstShotInterval: 0.13,
  mercerBurstCount: 6,
  mercerBurstDamageMultiplier: 0.18,
  mercerBurstSpeed: 260,
  mercerBurstLife: 0.42,
  mercerBurstRadius: 3,
  mercerBurstColor: '#ffd36a',
});
