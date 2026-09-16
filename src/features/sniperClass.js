import { Game as PreviousGame, UI } from './cipherBoss.js';
import { UNIT_CLASSES, UPGRADES } from '../data/content.js';
import { FRAME_SPRITES, createStandardFrameSet } from '../data/sprites.js';
import { getUnitModifiers } from '../data/unitModifiers.js';
import { distanceSq } from '../utils/math.js';

export const SNIPER_TYPE = 'sniper';

// Sniper is registered here so it participates in the existing recruitment,
// formation, doctrine and modifier systems without introducing a parallel unit
// implementation. 75 HP matches the current normal-unit health baseline.
if (!UNIT_CLASSES[SNIPER_TYPE]) {
  UNIT_CLASSES[SNIPER_TYPE] = {
    id: SNIPER_TYPE,
    label: 'Sniper',
    shortLabel: 'SNP',
    maxHp: 75,
    fill: '#a7d8c7',
    core: '#1b3130',
    outline: '#e3fff4',
    weapon: {
      kind: 'bullet',
      damage: 180,
      cooldown: 3.2,
      projectileSpeed: 1200,
      projectileRadius: 4,
      projectileLife: 1.1,
      pierce: 1,
      range: 620,
      color: '#e7fff7',
    },
  };
}

if (!FRAME_SPRITES.units[SNIPER_TYPE]) {
  FRAME_SPRITES.units[SNIPER_TYPE] = createStandardFrameSet('sniper', {
    drawSize: 46,
    shootingFps: 5,
    shootingLoop: false,
  });
}

function addUpgrade(upgrade) {
  if (UPGRADES.some((candidate) => candidate.id === upgrade.id)) return;
  UPGRADES.push(upgrade);
}

function rarityPercent(rarity) {
  if (rarity?.id === 'epic') return 20;
  if (rarity?.id === 'rare') return 15;
  return 10;
}

addUpgrade({
  id: 'sniper-reinforcements',
  name: 'Sniper Reinforcement',
  tag: 'Sniper',
  kind: 'reinforcement',
  stat: 'unitCount',
  maxRank: 5,
  unitType: SNIPER_TYPE,
  rarityIds: ['rare', 'epic'],
  describe(rarity) {
    const amount = rarity.id === 'epic' ? 2 : 1;
    return `Recruit ${amount} Sniper${amount === 1 ? '' : 's'} into the squad.`;
  },
  apply(game, rarity) {
    game.addSquadUnits(SNIPER_TYPE, rarity.id === 'epic' ? 2 : 1);
  },
});

const STAT_UPGRADES = [
  { id: 'damage', name: 'Anti-Materiel Rounds', stat: 'damage', label: 'damage' },
  { id: 'fire-rate', name: 'Precision Cycling', stat: 'fireRate', label: 'fire rate' },
  { id: 'range', name: 'Long-Range Optics', stat: 'range', label: 'weapon range' },
  { id: 'projectile-speed', name: 'Hypervelocity Ammunition', stat: 'projectileSpeed', label: 'projectile speed' },
];

for (const definition of STAT_UPGRADES) {
  addUpgrade({
    id: `sniper-${definition.id}`,
    name: definition.name,
    tag: 'Sniper',
    kind: 'stat',
    stat: definition.stat,
    maxRank: '∞',
    unitType: SNIPER_TYPE,
    describe(rarity) {
      return `+${rarityPercent(rarity)}% Sniper ${definition.label}.`;
    },
    apply(game, rarity) {
      const modifiers = game.unitModifiers?.[SNIPER_TYPE];
      if (!modifiers || !(definition.stat in modifiers)) return;
      modifiers[definition.stat] *= 1 + rarityPercent(rarity) / 100;
    },
  });
}

function isLivingTarget(target) {
  return Boolean(
    target
    && !target.dead
    && Number.isFinite(Number(target.x))
    && Number.isFinite(Number(target.y))
    && (Number(target.hp) || 0) > 0
  );
}

function createSniperCombatSystem(ParentCombatSystem) {
  return class SniperCombatSystem extends ParentCombatSystem {
    getSniperCandidates() {
      const game = this.game;
      const candidates = game.entities.enemies.filter((enemy) => isLivingTarget(enemy));

      const warden = game.getActiveWarden?.();
      if (isLivingTarget(warden)) candidates.push(warden);

      const broodmother = game.getActiveBroodmother?.();
      if (isLivingTarget(broodmother) && broodmother.targetable !== false) {
        candidates.push(broodmother);
      }

      for (const egg of game.broodEggs ?? []) {
        if (isLivingTarget(egg)) candidates.push(egg);
      }

      const cipher = game.getActiveCipher?.();
      if (isLivingTarget(cipher) && cipher.targetable !== false) candidates.push(cipher);

      return candidates;
    }

    findHighestHealthSniperTarget(x, y, range) {
      let best = null;
      let bestHp = -Infinity;
      let bestDistance = Infinity;

      for (const target of this.getSniperCandidates()) {
        const effectiveDistance = Math.max(
          0,
          Math.sqrt(distanceSq(x, y, target.x, target.y)) - (target.radius ?? 0),
        );
        if (effectiveDistance > range) continue;

        const hp = Math.max(0, Number(target.hp) || 0);
        if (hp < bestHp) continue;
        if (hp === bestHp && effectiveDistance >= bestDistance) continue;

        best = target;
        bestHp = hp;
        bestDistance = effectiveDistance;
      }

      return best;
    }

    fireWeapon(soldier, unitClass, target, shotEffect = null) {
      if (soldier?.unit?.type === SNIPER_TYPE) {
        const weapon = UNIT_CLASSES[SNIPER_TYPE].weapon;
        const modifiers = getUnitModifiers(this.game.unitModifiers, SNIPER_TYPE);
        const statMultiplier = this.game.getTransformerStatMultiplier();
        const rangeMultiplier = shotEffect?.rangeMultiplier ?? 1;
        const range = weapon.range * modifiers.range * rangeMultiplier * statMultiplier;
        const highestHealthTarget = this.findHighestHealthSniperTarget(
          soldier.x,
          soldier.y,
          range,
        );

        // Every Sniper shot re-evaluates the battlefield at fire time. If the
        // original nearest target is still valid but a tougher target is now in
        // range, the Sniper immediately switches to the tougher target.
        if (highestHealthTarget) target = highestHealthTarget;
      }

      super.fireWeapon(soldier, unitClass, target, shotEffect);
    }
  };
}

export class Game extends PreviousGame {
  constructor(...args) {
    super(...args);
    const SniperCombatSystem = createSniperCombatSystem(this.combatSystem.constructor);
    this.combatSystem = new SniperCombatSystem(this);
    this.combatSystem.reset();
  }
}

export { UI };
