export const VALE_COORDINATED_FIRE = Object.freeze({
  description: 'Starts with an assault rifle and turns nearby Riflemen into a disciplined focus-fire team.',
  passiveText: 'Adjacent Riflemen build Focus by sustaining fire on the same target. At max Focus they gain +75% fire rate, a 12% chance for +1 pierce, and synchronized volleys. Moving or changing targets drains Focus.',
  effect: Object.freeze({
    type: 'coordinated-fire',
    focusGainPerShot: 0.16,
    targetChangeRetention: 0.55,
    moveDecayPerSecond: 0.5,
    idleDecayPerSecond: 0.18,
    continuityGrace: 0.9,
    maxFireRateMultiplier: 1.75,
    bonusPierceChance: 0.12,
    volleyInterval: 3,
    minVolleyRiflemen: 2,
    color: '#8fffe4',
  }),
});

export const MERCER_CHAIN_REACTION = Object.freeze({
  description: 'Starts with a rocket launcher and turns nearby Rocketeers into a cascading demolition team.',
  passiveText: 'Adjacent Rocketeer explosions mark enemies. Every third rocket is a Heavy Warhead that detonates marks and chains explosions through other marked enemies.',
  effect: Object.freeze({
    // Keep the legacy special-shot type so the existing per-Rocketeer every-third-shot
    // counter remains authoritative. Range/AoE multipliers are neutralized: the new
    // payoff is mark detonation and cascading explosions instead.
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
