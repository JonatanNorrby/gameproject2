export const VALE_COORDINATED_FIRE = Object.freeze({
  description: 'Starts with an upgraded burst rifle and turns nearby Rifleman-class units into a disciplined focus-fire team.',
  passiveText: 'Vale plus adjacent Riflemen and Snipers build Focus by sustaining fire. At max Focus they gain +75% fire rate, a 12% chance for +1 pierce, and synchronized volleys. Vale fires 3 rounds one after another at the same target every time he attacks.',
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
  description: 'Starts with an upgraded fragmentation rocket launcher and empowers nearby Rocketeer-class units.',
  passiveText: 'Every third attack from an adjacent Rocketeer-class unit gains 3× area size. On Rocketeers, that third rocket also gains 75% more range. Drone Pilot explosive grenades gain the larger third blast but no range bonus.',
  effect: Object.freeze({
    // Deliberately not the legacy rocketeer-special-rocket id: #41 is handled
    // by the family-aware Captain layer so secondary/Supreme Mercer work too.
    type: 'rocketeer-class-third-area',
    mechanic: 'third-attack-area-surge',
    everyShots: 3,
    rangeMultiplier: 1.75,
    aoeMultiplier: 3,
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
