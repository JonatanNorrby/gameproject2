import { Game as PreviousGame, UI as PreviousUI } from './sniperClass.js';
import { CAPTAINS } from '../data/content.js';
import { evaluateUnlocks } from '../data/unlocks.js';
import {
  SUPREME_COMMANDER,
  SUPREME_COMMANDER_ID,
} from '../data/supremeCommander.js';

const INHERITED_CAPTAIN_IDS = Object.freeze(['vale', 'mercer', 'thorne']);
const INHERITED_CAPTAIN_SET = new Set(INHERITED_CAPTAIN_IDS);

function createSupremeCommanderCombatSystem(ParentCombatSystem) {
  const parentHasCaptainSoldier = typeof ParentCombatSystem.prototype.getCaptainSoldier === 'function';
  const parentHasAdjacencyCheck = typeof ParentCombatSystem.prototype.isAdjacentCaptainUnit === 'function';
  const parentHasThorneState = typeof ParentCombatSystem.prototype.isThorneActive === 'function';

  return class SupremeCommanderCombatSystem extends ParentCombatSystem {
    getCaptainSoldier(captainId, soldiers = this.game.getWeaponPositions()) {
      if (
        this.game.isSupremeCommanderRun?.()
        && INHERITED_CAPTAIN_SET.has(captainId)
      ) {
        const commander = soldiers.find((soldier) => (
          this.game.isSupremeCommanderUnit?.(soldier.unit)
        ));
        if (commander) return commander;
      }

      return parentHasCaptainSoldier
        ? super.getCaptainSoldier(captainId, soldiers)
        : null;
    }

    isAdjacentCaptainUnit(soldier, captainId, expectedType) {
      if (
        this.game.isSupremeCommanderRun?.()
        && INHERITED_CAPTAIN_SET.has(captainId)
        && soldier
        && !soldier.unit?.dead
        && soldier.unit?.type === expectedType
        && !this.game.isSupremeCommanderUnit?.(soldier.unit)
      ) {
        // All absorbed unit systems are treated as globally adjacent to every
        // inherited Captain passive while the Supreme Commander is active.
        return true;
      }

      return parentHasAdjacencyCheck
        ? super.isAdjacentCaptainUnit(soldier, captainId, expectedType)
        : false;
    }

    isThorneActive() {
      if (this.game.isSupremeCommanderRun?.()) return true;
      return parentHasThorneState ? super.isThorneActive() : false;
    }

    performShockbladeSlash(unit, attack) {
      if (
        this.game.isSupremeCommanderRun?.()
        && unit?.absorbedBySupremeCommander
      ) {
        // Several inherited melee/boss implementations locate the attacking
        // unit through getSoldierPositions(). Expose absorbed combat positions
        // only for the duration of the slash, never for enemy targeting.
        return this.game.withSupremeAbsorbedPositions(
          () => super.performShockbladeSlash(unit, attack),
        );
      }

      return super.performShockbladeSlash(unit, attack);
    }
  };
}

export class Game extends PreviousGame {
  constructor(...args) {
    super(...args);
    const SupremeCommanderCombatSystem = createSupremeCommanderCombatSystem(
      this.combatSystem.constructor,
    );
    this.combatSystem = new SupremeCommanderCombatSystem(this);
    this.combatSystem.reset();
  }

  resetState() {
    this.supremeExposeAbsorbedPositions = false;
    this.supremePrimaryCallReadyAt = 0;
    this.supremeSecondaryCallReadyAt = 0;
    super.resetState();
  }

  isSupremeCommanderRun() {
    return this.selectedCaptainId === SUPREME_COMMANDER_ID;
  }

  getSupremeCommanderUnit() {
    if (!this.isSupremeCommanderRun()) return null;
    return (this.player?.squad ?? []).find((unit) => (
      !unit.dead
      && !unit.absorbedBySupremeCommander
      && !unit.secondaryCaptain
    )) ?? null;
  }

  isSupremeCommanderUnit(unit) {
    const commander = this.getSupremeCommanderUnit();
    return Boolean(commander && unit && commander.id === unit.id);
  }

  getSupremeSecondaryCaptainUnit() {
    if (!this.isSupremeCommanderRun()) return null;
    return (this.player?.squad ?? []).find((unit) => (
      !unit.dead
      && unit.absorbedBySupremeCommander
      && unit.secondaryCaptain
      && Boolean(unit.captainId)
    )) ?? null;
  }

  addSquadUnits(type, amount = 1) {
    const commander = this.getSupremeCommanderUnit();
    if (!commander) {
      super.addSquadUnits(type, amount);
      return;
    }

    const previousIds = new Set(this.player.squad.map((unit) => unit.id));
    super.addSquadUnits(type, amount);

    for (const unit of this.player.squad) {
      if (previousIds.has(unit.id) || unit.id === commander.id) continue;
      unit.absorbedBySupremeCommander = true;
      unit.hp = unit.maxHp;
    }

    this.refreshDoctrineBonuses?.();
  }

  withSupremeAbsorbedPositions(callback) {
    const previous = this.supremeExposeAbsorbedPositions;
    this.supremeExposeAbsorbedPositions = true;
    try {
      return callback();
    } finally {
      this.supremeExposeAbsorbedPositions = previous;
    }
  }

  createSupremeSoldierPosition(unit, index, absorbed = false) {
    return {
      x: this.player.x + (unit.meleeOffsetX ?? 0),
      y: this.player.y + (unit.meleeOffsetY ?? 0),
      index,
      // Absorbed powers occupy a logical adjacent slot so inherited Captain
      // systems that still inspect hexes remain compatible.
      hex: absorbed
        ? { q: 1, r: 0, ring: 1 }
        : { q: 0, r: 0, ring: 0 },
      unit,
    };
  }

  getSoldierPositions() {
    if (!this.isSupremeCommanderRun()) return super.getSoldierPositions();

    const commander = this.getSupremeCommanderUnit();
    if (!commander) return [];

    const positions = [this.createSupremeSoldierPosition(commander, 0, false)];
    if (!this.supremeExposeAbsorbedPositions) return positions;

    const absorbed = (this.player?.squad ?? []).filter((unit) => (
      !unit.dead
      && unit.absorbedBySupremeCommander
    ));
    absorbed.forEach((unit, index) => {
      positions.push(this.createSupremeSoldierPosition(unit, index + 1, true));
    });
    return positions;
  }

  getWeaponPositions() {
    if (!this.isSupremeCommanderRun()) return super.getWeaponPositions();

    // The Cipher's memory puzzle must remain a true solo-Captain phase. The
    // absorbed arsenal is suspended until the puzzle ends.
    if (this.getActiveCipher?.()?.puzzleActive) return this.getSoldierPositions();

    return this.withSupremeAbsorbedPositions(() => this.getSoldierPositions());
  }

  getSquadBuilderUnits() {
    if (!this.isSupremeCommanderRun()) return this.player?.squad ?? [];
    const commander = this.getSupremeCommanderUnit();
    return commander ? [commander] : [];
  }

  playUnitAnimation(unit, state, duration = 0.2) {
    if (unit?.absorbedBySupremeCommander) {
      const commander = this.getSupremeCommanderUnit();
      if (commander) {
        super.playUnitAnimation(commander, state, duration);
        return;
      }
    }
    super.playUnitAnimation(unit, state, duration);
  }

  getAttackSpeedMultiplier() {
    const base = super.getAttackSpeedMultiplier();
    return this.isSupremeCommanderRun()
      ? base * (SUPREME_COMMANDER.effect.attackSpeedMultiplier ?? 2)
      : base;
  }

  damageMergedSquad(amount, x = this.player.x, y = this.player.y) {
    if (!this.isSupremeCommanderRun()) {
      super.damageMergedSquad(amount, x, y);
      return;
    }

    const commander = this.getSupremeCommanderUnit();
    if (!commander || amount <= 0) return;
    const effectiveDamage = amount / this.getTransformerStatMultiplier();
    commander.hitFlash = 0.18;
    commander.hp = Math.max(0, commander.hp - effectiveDamage);
    if (commander.hp <= 0) {
      this.killSquadUnit(this.createSupremeSoldierPosition(commander, 0, false));
    }
  }

  getCaptainSoldierBySlot(slot) {
    if (!this.isSupremeCommanderRun()) return super.getCaptainSoldierBySlot(slot);

    const commander = this.getSupremeCommanderUnit();
    if (!commander) return null;
    const position = this.createSupremeSoldierPosition(commander, 0, false);

    if (slot !== 'secondary') return position;
    const secondary = this.getSupremeSecondaryCaptainUnit();
    if (!secondary) return null;

    // Captain Call UI/logic needs the absorbed Captain identity but the active
    // ability must originate from the one physical Commander body.
    return {
      ...position,
      unit: {
        ...commander,
        captainId: secondary.captainId,
        secondaryCaptain: true,
      },
    };
  }

  getCaptainCallCooldownRemaining(slot) {
    if (!this.isSupremeCommanderRun()) {
      return super.getCaptainCallCooldownRemaining(slot);
    }

    if (!this.getCaptainSoldierBySlot(slot)) return Infinity;
    const readyAt = slot === 'secondary'
      ? this.supremeSecondaryCallReadyAt
      : this.supremePrimaryCallReadyAt;
    return Math.max(0, readyAt - this.elapsed);
  }

  activateSupremeInheritedCall(captainId) {
    const commander = this.getSupremeCommanderUnit();
    if (!commander || !INHERITED_CAPTAIN_SET.has(captainId)) {
      return { activated: false, readyAt: this.elapsed };
    }

    const originalCaptainId = commander.captainId;
    const previousReadyAt = this.captainCallReadyAt?.get(commander.id);
    commander.captainId = captainId;
    this.captainCallReadyAt?.set(commander.id, this.elapsed);

    let activated = false;
    let readyAt = this.elapsed;
    try {
      activated = super.activateCaptainCall('primary');
      readyAt = this.captainCallReadyAt?.get(commander.id) ?? this.elapsed;
    } finally {
      commander.captainId = originalCaptainId;
      if (previousReadyAt === undefined) this.captainCallReadyAt?.delete(commander.id);
      else this.captainCallReadyAt?.set(commander.id, previousReadyAt);
    }

    return { activated, readyAt };
  }

  activateCaptainCall(slot = 'primary') {
    if (!this.isSupremeCommanderRun()) return super.activateCaptainCall(slot);

    if (slot === 'secondary') {
      const secondary = this.getSupremeSecondaryCaptainUnit();
      if (!secondary?.captainId || this.elapsed < this.supremeSecondaryCallReadyAt) return false;
      const result = this.activateSupremeInheritedCall(secondary.captainId);
      if (!result.activated) return false;
      this.supremeSecondaryCallReadyAt = result.readyAt;
      return true;
    }

    if (this.elapsed < this.supremePrimaryCallReadyAt) return false;

    let activated = false;
    let readyAt = this.elapsed;
    for (const captainId of INHERITED_CAPTAIN_IDS) {
      const result = this.activateSupremeInheritedCall(captainId);
      if (!result.activated) continue;
      activated = true;
      readyAt = Math.max(readyAt, result.readyAt);
    }

    if (!activated) return false;
    this.supremePrimaryCallReadyAt = readyAt;
    this.ui?.showCaptainCallBanner?.('SUPREME COMMAND', SUPREME_COMMANDER.color);
    return true;
  }

  defeatCipher(boss) {
    const alreadyDefeated = Boolean(this.cipherDefeated);
    super.defeatCipher(boss);
    if (alreadyDefeated || !this.cipherDefeated) return;

    const newlyUnlocked = evaluateUnlocks({
      squad: this.player?.squad ?? [],
      defeatedBossIds: ['cipher'],
    });
    if (newlyUnlocked.length > 0) {
      this.ui?.handleUnlocksChanged?.(newlyUnlocked);
    }
  }
}

export class UI extends PreviousUI {
  bindSquadBuilder(config) {
    super.bindSquadBuilder({
      ...config,
      getSquad: () => {
        const squad = config.getSquad?.() ?? [];
        if (!this.game?.isSupremeCommanderRun?.()) return squad;
        return this.game.getSquadBuilderUnits?.() ?? squad.filter((unit) => !unit.absorbedBySupremeCommander);
      },
    });
  }

  renderRunConfiguration(...args) {
    super.renderRunConfiguration?.(...args);

    const primaryId = this.getSelectedCaptainId?.() ?? null;
    if (!this.secondCaptainSelect || primaryId === SUPREME_COMMANDER_ID) return;

    const supremeOption = [...this.secondCaptainSelect.options]
      .find((option) => option.value === SUPREME_COMMANDER_ID);
    supremeOption?.remove();

    if (this.selectedSecondCaptainId === SUPREME_COMMANDER_ID) {
      const replacement = this.secondCaptainSelect.options[0]?.value || null;
      this.secondCaptainSelect.value = replacement ?? '';
      this.selectedSecondCaptainId = replacement;
    }
  }

  getSelectedSecondCaptainId() {
    const id = super.getSelectedSecondCaptainId?.() ?? null;
    return id === SUPREME_COMMANDER_ID ? null : id;
  }

  renderCaptainOptions(...args) {
    super.renderCaptainOptions(...args);
    if (!this.captainOptions) return;
    this.captainOptions.style.gridTemplateColumns = window.innerWidth <= 760
      ? '1fr'
      : window.innerWidth <= 1180
        ? 'repeat(2, minmax(0, 1fr))'
        : 'repeat(4, minmax(0, 1fr))';
  }

  update(game) {
    super.update(game);
    if (game?.isSupremeCommanderRun?.() && this.squadText) {
      this.squadText.textContent = '1';
    }
  }
}
