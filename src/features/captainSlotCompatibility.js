import { Game as PreviousGame, UI as PreviousUI } from './handbook.js';
import { CAPTAINS, UNIT_CLASSES } from '../data/content.js';
import { getUnitModifiers } from '../data/unitModifiers.js';
import {
  isAdditionalCaptainUnit,
  isPrimaryCaptainSlotUnit,
} from '../data/captainSlots.js';
import {
  PERMANENT_UPGRADES,
  isPermanentUpgradeOwned,
} from '../data/metaUpgrades.js';
import { SUPREME_COMMANDER_ID } from '../data/supremeCommander.js';
import { distanceSq } from '../utils/math.js';

const THORNE_ID = 'thorne';
const SHOCKBLADE_TYPE = 'shockblade';
const THIRD_CAPTAIN_UPGRADE_ID = 'third_captain_slot';

function withTertiaryAsSecondary(unit, callback) {
  if (!unit?.tertiaryCaptain) return callback();
  const previous = Boolean(unit.secondaryCaptain);
  unit.secondaryCaptain = true;
  try {
    return callback();
  } finally {
    unit.secondaryCaptain = previous;
  }
}

function createCaptainSlotCombatSystem(ParentCombatSystem) {
  return class CaptainSlotCombatSystem extends ParentCombatSystem {
    constructor(game) {
      super(game);
      this.qaThorneAttackCounts = new Map();
    }

    reset() {
      super.reset();
      this.qaThorneAttackCounts?.clear();
    }

    withTertiaryCaptainsAsSecondary(callback) {
      const tertiary = (this.game.player?.squad ?? []).filter((unit) => unit.tertiaryCaptain);
      const previous = tertiary.map((unit) => [unit, Boolean(unit.secondaryCaptain)]);
      for (const [unit] of previous) unit.secondaryCaptain = true;
      try {
        return callback();
      } finally {
        for (const [unit, wasSecondary] of previous) unit.secondaryCaptain = wasSecondary;
      }
    }

    updateSquadWeapons(dt) {
      // Older Captain weapon layers predate a third slot and use
      // `!secondaryCaptain` as shorthand for "primary". Present tertiary
      // Captains to those layers exactly like secondary Captains.
      return this.withTertiaryCaptainsAsSecondary(() => super.updateSquadWeapons(dt));
    }

    getUnitArmor(unit) {
      return withTertiaryAsSecondary(unit, () => super.getUnitArmor(unit));
    }

    getMeleeWeapon(unit) {
      return withTertiaryAsSecondary(unit, () => super.getMeleeWeapon(unit));
    }

    fireWeapon(soldier, ...args) {
      return withTertiaryAsSecondary(
        soldier?.unit,
        () => super.fireWeapon(soldier, ...args),
      );
    }

    startShockbladeAttack(soldier, ...args) {
      return withTertiaryAsSecondary(
        soldier?.unit,
        () => super.startShockbladeAttack(soldier, ...args),
      );
    }

    performShockbladeSlash(unit, attack) {
      if (!unit || unit.type !== SHOCKBLADE_TYPE) {
        return super.performShockbladeSlash(unit, attack);
      }

      const primaryThorne = isPrimaryCaptainSlotUnit(unit, THORNE_ID);
      const thorneActive = Boolean(
        this.game.isSupremeCommanderRun?.()
        || (this.game.player?.squad ?? []).some((candidate) => (
          !candidate.dead && candidate.captainId === THORNE_ID
        ))
      );
      const interval = Math.max(1, Number(CAPTAINS[THORNE_ID]?.effect?.everyAttacks) || 3);

      let attackCount = this.qaThorneAttackCounts.get(unit.id) ?? 0;
      if (!primaryThorne && thorneActive) {
        attackCount += 1;
        this.qaThorneAttackCounts.set(unit.id, attackCount);
      } else if (!thorneActive) {
        this.qaThorneAttackCounts.delete(unit.id);
      }

      const fullCircle = primaryThorne || (
        !primaryThorne
        && thorneActive
        && attackCount > 0
        && attackCount % interval === 0
      );

      const weapon = withTertiaryAsSecondary(unit, () => this.getMeleeWeapon(unit));
      const modifiers = getUnitModifiers(this.game.unitModifiers, unit.type);
      const statMultiplier = this.game.getTransformerStatMultiplier();
      const soldier = this.game.getSoldierPositions()
        .find((candidate) => candidate.unit.id === unit.id);

      const previousContext = this.game.qaShockbladeResolution;
      this.game.qaShockbladeResolution = soldier && weapon ? {
        unit,
        soldier,
        attack,
        weapon,
        fullCircle,
        damage: weapon.damage * modifiers.damage * statMultiplier,
        radius: (weapon.aoeRadius ?? weapon.range)
          * modifiers.blastRadius
          * statMultiplier,
        wardenDamageAttempted: false,
        broodDamageAttempted: false,
        cipherDamageAttempted: false,
      } : null;

      try {
        return withTertiaryAsSecondary(unit, () => super.performShockbladeSlash(unit, attack));
      } finally {
        const context = this.game.qaShockbladeResolution;
        if (context) this.game.resolveMissingFullCircleBossHits?.(context);
        this.game.qaShockbladeResolution = previousContext;
      }
    }
  };
}

export class Game extends PreviousGame {
  constructor(...args) {
    super(...args);
    this.qaShockbladeResolution = null;
    const CaptainSlotCombatSystem = createCaptainSlotCombatSystem(this.combatSystem.constructor);
    this.combatSystem = new CaptainSlotCombatSystem(this);
    this.combatSystem.reset();
  }

  getCaptainUnit() {
    return (this.player?.squad ?? []).find((unit) => isPrimaryCaptainSlotUnit(unit)) ?? null;
  }

  getCaptainSoldierBySlot(slot = 'primary') {
    if (this.isSupremeCommanderRun?.()) return super.getCaptainSoldierBySlot(slot);
    const soldiers = this.getSoldierPositions();
    return soldiers.find((soldier) => {
      const unit = soldier.unit;
      if (!unit?.captainId || unit.dead) return false;
      if (slot === 'secondary') return Boolean(unit.secondaryCaptain);
      if (slot === 'tertiary') return Boolean(unit.tertiaryCaptain);
      return isPrimaryCaptainSlotUnit(unit);
    }) ?? null;
  }

  withAdditionalCaptainIdsMasked(callback) {
    const additional = (this.player?.squad ?? [])
      .filter((unit) => !unit.dead && isAdditionalCaptainUnit(unit) && unit.captainId)
      .map((unit) => ({ unit, captainId: unit.captainId }));

    for (const entry of additional) entry.unit.captainId = null;
    try {
      return callback();
    } finally {
      for (const entry of additional) entry.unit.captainId = entry.captainId;
    }
  }

  beginCipherSquadRetreat(boss) {
    return this.withAdditionalCaptainIdsMasked(() => super.beginCipherSquadRetreat(boss));
  }

  beginCipherSquadReturn() {
    return this.withAdditionalCaptainIdsMasked(() => super.beginCipherSquadReturn());
  }

  getWeaponPositions() {
    const soldiers = super.getWeaponPositions();
    if (!(this.cipherSquadMotion instanceof Map) || this.cipherSquadMotion.size === 0) {
      return soldiers;
    }
    return soldiers.filter((soldier) => !(
      isAdditionalCaptainUnit(soldier.unit)
      && this.cipherSquadMotion.has(soldier.unit.id)
    ));
  }

  getCipherCaptainSoldier() {
    return this.getSoldierPositions().find((soldier) => (
      isPrimaryCaptainSlotUnit(soldier.unit)
    )) ?? null;
  }

  getCipherHazardTargets(soloOnly) {
    const soldiers = this.getSoldierPositions().filter((soldier) => !soldier.unit.dead);
    return soloOnly
      ? soldiers.filter((soldier) => isPrimaryCaptainSlotUnit(soldier.unit))
      : soldiers;
  }

  isShockbladeBossHitAllowed(boss, context = this.qaShockbladeResolution) {
    if (!boss || !context?.soldier || !context?.weapon || !context?.attack) return true;
    const { soldier, attack, weapon, radius, fullCircle } = context;
    const dx = boss.x - soldier.x;
    const dy = boss.y - soldier.y;
    const distance = Math.hypot(dx, dy);
    if (distance > radius + (boss.radius ?? 0)) return false;
    if (fullCircle || distance <= 0.001) return true;

    const direction = attack.direction ?? { x: 1, y: 0 };
    const halfArc = (weapon.arcRadians ?? Math.PI) / 2;
    const facingDot = (dx * direction.x + dy * direction.y) / distance;
    return facingDot >= Math.cos(halfArc);
  }

  applyWardenDamage(amount, hitX, hitY, options = {}) {
    const context = this.qaShockbladeResolution;
    if (context && options?.melee && !options.qaCompatibilityBypass) {
      context.wardenDamageAttempted = true;
      if (!this.isShockbladeBossHitAllowed(this.getActiveWarden?.(), context)) return null;
    }
    return super.applyWardenDamage(amount, hitX, hitY, options);
  }

  damageBroodmother(amount, hitX, hitY) {
    const context = this.qaShockbladeResolution;
    if (context) {
      context.broodDamageAttempted = true;
      if (!this.isShockbladeBossHitAllowed(this.getActiveBroodmother?.(), context)) return null;
    }
    return super.damageBroodmother(amount, hitX, hitY);
  }

  damageCipher(amount, hitX, hitY, options = {}) {
    const context = this.qaShockbladeResolution;
    if (context && options?.melee && !options.qaCompatibilityBypass) {
      context.cipherDamageAttempted = true;
      if (!this.isShockbladeBossHitAllowed(this.getActiveCipher?.(), context)) return null;
    }
    return super.damageCipher(amount, hitX, hitY, options);
  }

  resolveMissingFullCircleBossHits(context) {
    if (!context?.fullCircle || !context?.soldier || !context?.unit) return;
    const { damage, soldier, unit } = context;

    const warden = this.getActiveWarden?.();
    if (
      warden
      && !context.wardenDamageAttempted
      && this.isShockbladeBossHitAllowed(warden, context)
    ) {
      super.applyWardenDamage(
        damage,
        soldier.x,
        soldier.y,
        { sourceType: unit.type, melee: true, qaCompatibilityBypass: true },
      );
    }

    const cipher = this.getActiveCipher?.();
    if (
      cipher?.targetable
      && !context.cipherDamageAttempted
      && this.isShockbladeBossHitAllowed(cipher, context)
    ) {
      super.damageCipher(
        damage,
        cipher.x,
        cipher.y,
        { sourceType: unit.type, melee: true, qaCompatibilityBypass: true },
      );
    }
  }
}

export class UI extends PreviousUI {
  renderPermanentShop(...args) {
    super.renderPermanentShop(...args);
    if (
      this.getSelectedCaptainId?.() !== SUPREME_COMMANDER_ID
      || isPermanentUpgradeOwned(THIRD_CAPTAIN_UPGRADE_ID)
      || !this.metaUpgradeBranches
    ) return;

    const upgradeIds = Object.values(PERMANENT_UPGRADES).map((upgrade) => upgrade.id);
    const index = upgradeIds.indexOf(THIRD_CAPTAIN_UPGRADE_ID);
    if (index < 0) return;
    const button = this.metaUpgradeBranches.querySelectorAll('.meta-upgrade-node')[index];
    if (!button) return;
    button.disabled = true;
    const status = button.querySelector('.meta-upgrade-node__status');
    if (status) status.textContent = 'Unavailable with Supreme Commander';
  }
}
