import { Game as PreviousGame, UI as PreviousUI } from './thirdCaptain.js';
import { CAPTAINS, UNIT_CLASSES } from '../data/content.js';
import {
  CAPTAIN_CALL_UPGRADE_IDS,
  PERMANENT_UPGRADES,
  SQUAD_DOCTRINES,
  canPurchasePermanentUpgrade,
  getPermanentProgressionState,
  getPermanentUpgradeNextCost,
  getPermanentUpgradeRank,
  getPermanentUpgradeRankDescription,
  getSelectedDoctrine,
  isPermanentUpgradeActive,
  isPermanentUpgradeOwned,
  purchasePermanentUpgrade,
  setPermanentUpgradeActive,
} from '../data/metaUpgrades.js';
import { getUnitModifiers } from '../data/unitModifiers.js';
import { SUPREME_COMMANDER_ID } from '../data/supremeCommander.js';
import { distanceSq } from '../utils/math.js';

const DOCTRINE_TUNING = Object.freeze([
  null,
  Object.freeze({
    combinedStep: 0.07,
    combinedCap: 0.35,
    specializationStep: 0.06,
    specializationCap: 0.40,
    shock: Object.freeze({ damage: 1.20, fireRate: 1.35, range: 1.30 }),
  }),
  Object.freeze({
    combinedStep: 0.10,
    combinedCap: 0.50,
    specializationStep: 0.09,
    specializationCap: 0.55,
    shock: Object.freeze({ damage: 1.30, fireRate: 1.50, range: 1.40 }),
  }),
  Object.freeze({
    combinedStep: 0.14,
    combinedCap: 0.70,
    specializationStep: 0.12,
    specializationCap: 0.70,
    shock: Object.freeze({ damage: 1.40, fireRate: 1.70, range: 1.50 }),
  }),
]);

const CAPTAIN_CALL_TUNING = Object.freeze({
  vale: Object.freeze([
    null,
    Object.freeze({ cooldown: 60, duration: 5.2, interval: 0.20, rangeMultiplier: 2.5 }),
    Object.freeze({ cooldown: 50, duration: 6.5, interval: 0.18, rangeMultiplier: 3.0 }),
    Object.freeze({ cooldown: 40, duration: 8.0, interval: 0.15, rangeMultiplier: 3.5 }),
  ]),
  mercer: Object.freeze([
    null,
    Object.freeze({ cooldown: 60, rockets: 24, interval: 0.12, rangeMultiplier: 3.0, aoeMultiplier: 2.2 }),
    Object.freeze({ cooldown: 50, rockets: 32, interval: 0.10, rangeMultiplier: 3.5, aoeMultiplier: 2.6 }),
    Object.freeze({ cooldown: 40, rockets: 40, interval: 0.08, rangeMultiplier: 4.0, aoeMultiplier: 3.0 }),
  ]),
  thorne: Object.freeze([
    null,
    Object.freeze({ cooldown: 60, duration: 6.5, interval: 0.28, range: 205, damageMultiplier: 0.60 }),
    Object.freeze({ cooldown: 50, duration: 8.0, interval: 0.24, range: 230, damageMultiplier: 0.75 }),
    Object.freeze({ cooldown: 40, duration: 10.0, interval: 0.20, range: 260, damageMultiplier: 0.90 }),
  ]),
});

function getLivingClassCounts(game) {
  const counts = new Map();
  for (const unit of game.player?.squad ?? []) {
    if (unit.dead) continue;
    counts.set(unit.type, (counts.get(unit.type) ?? 0) + 1);
  }
  return counts;
}

function isShockAssaultClass(unitType) {
  const weapon = UNIT_CLASSES[unitType]?.weapon;
  if (!weapon || weapon.kind === 'support') return false;
  return weapon.kind === 'melee' || (Number(weapon.range) || Infinity) <= 120;
}

function getCaptainCallUpgradeId(captainId) {
  return CAPTAIN_CALL_UPGRADE_IDS[captainId] ?? null;
}

function getCallTuning(captainId) {
  const upgradeId = getCaptainCallUpgradeId(captainId);
  const rank = upgradeId ? getPermanentUpgradeRank(upgradeId) : 0;
  const ranks = CAPTAIN_CALL_TUNING[captainId];
  return ranks?.[Math.max(1, Math.min(rank, ranks.length - 1))] ?? null;
}

function isCaptainCallEnabled(captainId) {
  const upgradeId = getCaptainCallUpgradeId(captainId);
  return Boolean(upgradeId && isPermanentUpgradeActive(upgradeId));
}

export class Game extends PreviousGame {
  refreshDoctrineBonuses() {
    if (!this.unitModifiers || !this.player) return;
    this.clearDoctrineFactors?.();

    if (!isPermanentUpgradeActive('squad_doctrine')) {
      this.activeDoctrineId = null;
      return;
    }

    const rank = Math.max(1, Math.min(3, getPermanentUpgradeRank('squad_doctrine')));
    const tuning = DOCTRINE_TUNING[rank];
    const doctrineId = this.activeDoctrineId ?? this.selectedDoctrineId ?? getSelectedDoctrine();
    if (!SQUAD_DOCTRINES[doctrineId] || !tuning) return;
    this.activeDoctrineId = doctrineId;

    const counts = getLivingClassCounts(this);
    if (counts.size === 0) return;

    if (doctrineId === 'combined_arms') {
      const bonus = Math.min(
        tuning.combinedCap,
        Math.max(0, counts.size - 1) * tuning.combinedStep,
      );
      const factor = 1 + bonus;
      for (const unitType of counts.keys()) {
        this.applyDoctrineFactors?.(unitType, { damage: factor, fireRate: factor, range: 1 });
      }
      return;
    }

    if (doctrineId === 'massed_infantry') {
      for (const [unitType, count] of counts.entries()) {
        const bonus = Math.min(
          tuning.specializationCap,
          Math.max(0, count - 1) * tuning.specializationStep,
        );
        const factor = 1 + bonus;
        this.applyDoctrineFactors?.(unitType, { damage: factor, fireRate: factor, range: 1 });
      }
      return;
    }

    if (doctrineId === 'shock_assault') {
      for (const unitType of counts.keys()) {
        this.applyDoctrineFactors?.(
          unitType,
          isShockAssaultClass(unitType)
            ? tuning.shock
            : { damage: 1, fireRate: 1, range: 1 },
        );
      }
    }
  }

  activateCaptainCall(slot = 'primary') {
    const soldier = this.getCaptainSoldierBySlot?.(slot) ?? null;
    if (!soldier) return false;

    if (this.isSupremeCommanderRun?.()) {
      if (slot === 'primary') {
        const allCallsEnabled = Object.keys(CAPTAIN_CALL_UPGRADE_IDS)
          .every((captainId) => isCaptainCallEnabled(captainId));
        if (!allCallsEnabled) return false;
      } else if (!isCaptainCallEnabled(soldier.unit?.captainId)) {
        return false;
      }
      return super.activateCaptainCall(slot);
    }

    const captainId = soldier.unit?.captainId;
    if (!isCaptainCallEnabled(captainId)) return false;

    const activated = super.activateCaptainCall(slot);
    if (!activated) return false;

    const tuning = getCallTuning(captainId);
    if (!tuning) return true;
    this.captainCallReadyAt?.set(soldier.unit.id, this.elapsed + tuning.cooldown);

    if (captainId === 'vale' && this.valeCallState) {
      this.valeCallState.until = this.elapsed + tuning.duration;
      this.valeCallState.nextVolleyAt = this.elapsed;
    } else if (captainId === 'mercer' && this.mercerCallState) {
      this.mercerCallState.rocketsRemaining = tuning.rockets;
      this.mercerCallState.nextRocketAt = this.elapsed;
    } else if (captainId === 'thorne' && this.thorneCallState) {
      this.thorneCallState.until = this.elapsed + tuning.duration;
      this.thorneCallState.nextPulseAt = this.elapsed;
    }
    return true;
  }

  updateValeCall() {
    const state = this.valeCallState;
    if (!state) return;
    const tuning = getCallTuning('vale') ?? CAPTAIN_CALL_TUNING.vale[1];
    if (this.elapsed >= state.until) {
      this.valeCallState = null;
      return;
    }
    if (this.elapsed < state.nextVolleyAt) return;

    const targets = this.getCaptainCallTargets()
      .sort((left, right) => (right.hp ?? 0) - (left.hp ?? 0));
    if (targets.length === 0) return;

    const riflemen = this.getWeaponPositions().filter((soldier) => (
      !soldier.unit.dead && soldier.unit.type === 'rifleman'
    ));
    if (riflemen.length === 0) return;

    for (let index = 0; index < riflemen.length; index += 1) {
      const soldier = riflemen[index];
      const target = targets[Math.min(index % Math.min(3, targets.length), targets.length - 1)];
      this.combatSystem.fireWeapon(
        soldier,
        UNIT_CLASSES.rifleman,
        target,
        {
          special: 'captain-call-vale',
          rangeMultiplier: tuning.rangeMultiplier,
          aoeMultiplier: 1,
          color: '#baffee',
        },
      );
      this.playUnitAnimation(soldier.unit, 'shooting', 0.22);
    }
    state.nextVolleyAt = this.elapsed + tuning.interval;
  }

  updateMercerCall() {
    const state = this.mercerCallState;
    if (!state) return;
    const tuning = getCallTuning('mercer') ?? CAPTAIN_CALL_TUNING.mercer[1];
    if (state.rocketsRemaining <= 0) {
      this.mercerCallState = null;
      return;
    }
    if (this.elapsed < state.nextRocketAt) return;

    const soldier = this.getSoldierPositions()
      .find((candidate) => candidate.unit.id === state.captainUnitId && !candidate.unit.dead);
    if (!soldier) {
      this.mercerCallState = null;
      return;
    }

    const targets = this.getCaptainCallTargets();
    if (targets.length === 0) return;

    const salvo = Math.min(3, state.rocketsRemaining);
    for (let index = 0; index < salvo; index += 1) {
      const target = targets[Math.floor(Math.random() * targets.length)];
      this.combatSystem.fireWeapon(
        soldier,
        UNIT_CLASSES.rocketeer,
        target,
        {
          special: 'captain-call-mercer',
          rangeMultiplier: tuning.rangeMultiplier,
          aoeMultiplier: tuning.aoeMultiplier,
          color: '#fff08a',
        },
      );
    }

    state.rocketsRemaining -= salvo;
    state.nextRocketAt = this.elapsed + tuning.interval;
    this.playUnitAnimation(soldier.unit, 'shooting', 0.3);
  }

  updateThorneCall() {
    const state = this.thorneCallState;
    if (!state) return;
    const tuning = getCallTuning('thorne') ?? CAPTAIN_CALL_TUNING.thorne[1];
    if (this.elapsed >= state.until) {
      this.thorneCallState = null;
      return;
    }
    if (this.elapsed < state.nextPulseAt) return;

    const targets = this.getCaptainCallTargets();
    if (targets.length === 0) return;

    for (const soldier of this.getSoldierPositions()) {
      if (soldier.unit.dead) continue;
      let bestTarget = null;
      let bestDistance = Infinity;
      for (const target of targets) {
        if (target.dead) continue;
        const effective = Math.max(
          0,
          Math.sqrt(distanceSq(soldier.x, soldier.y, target.x, target.y)) - (target.radius ?? 0),
        );
        if (effective > tuning.range || effective >= bestDistance) continue;
        bestDistance = effective;
        bestTarget = target;
      }
      if (!bestTarget) continue;

      const weapon = UNIT_CLASSES[soldier.unit.type]?.weapon;
      const modifiers = getUnitModifiers(this.unitModifiers, soldier.unit.type);
      const baseDamage = Math.max(20, Number(weapon?.damage) || 20);
      const damage = baseDamage * modifiers.damage * tuning.damageMultiplier;
      this.damageCaptainCallTarget(bestTarget, damage, soldier.x, soldier.y);
      this.playUnitAnimation(soldier.unit, 'shooting', 0.24);
      this.spawnExplosionEffect(bestTarget.x, bestTarget.y, 22, '#ff9adf');
    }

    state.nextPulseAt = this.elapsed + tuning.interval;
  }
}

export class UI extends PreviousUI {
  configurePermanentShopText() {
    super.configurePermanentShopText();
    const help = this.metaUpgradeScreen?.querySelector('.meta-upgrade-help');
    if (help) {
      help.textContent = 'Each upgrade has its own column. Ranks unlock downward in sequence — buy the next box to advance that upgrade. Owned upgrades can still be activated or deactivated without refunding Gold.';
    }
  }

  renderPermanentShop() {
    const state = getPermanentProgressionState();
    const upgrades = Object.values(PERMANENT_UPGRADES);
    const purchasedRanks = upgrades.reduce(
      (total, upgrade) => total + getPermanentUpgradeRank(upgrade.id),
      0,
    );
    const totalRanks = upgrades.reduce((total, upgrade) => total + upgrade.maxRank, 0);

    if (this.metaUpgradePoints) this.metaUpgradePoints.textContent = String(state.gold);
    if (this.metaUpgradePointsDetail) {
      this.metaUpgradePointsDetail.textContent = `${purchasedRanks} / ${totalRanks} ranks purchased • ${state.activeIds.length} active`;
    }
    if (this.metaUpgradeOpen) this.metaUpgradeOpen.textContent = `Gold Upgrades • ${state.gold} Gold`;
    if (!this.metaUpgradeBranches) return;

    this.metaUpgradeBranches.replaceChildren();

    for (const upgrade of upgrades) {
      const rank = getPermanentUpgradeRank(upgrade.id);
      const owned = rank > 0;
      const active = isPermanentUpgradeActive(upgrade.id);
      const maxed = rank >= upgrade.maxRank;
      const nextCost = getPermanentUpgradeNextCost(upgrade.id);
      const nextPurchasable = canPurchasePermanentUpgrade(upgrade.id);

      const section = document.createElement('section');
      section.className = `meta-upgrade-branch${active ? ' meta-upgrade-branch--active' : ''}`;
      section.style.setProperty('--branch-color', upgrade.color);
      section.dataset.upgradeId = upgrade.id;

      const header = document.createElement('div');
      header.className = 'meta-upgrade-branch__header';
      header.innerHTML = `
        <span class="meta-upgrade-branch__eyebrow">UPGRADE PATH</span>
        <strong>${upgrade.name}</strong>
        <p>${upgrade.description}</p>
        <span class="meta-upgrade-branch__progress">${rank} / ${upgrade.maxRank} RANKS</span>
      `;

      if (owned) {
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = `meta-upgrade-branch__toggle${active ? ' meta-upgrade-branch__toggle--active' : ''}`;
        toggle.textContent = active ? 'ACTIVE' : 'INACTIVE';
        toggle.addEventListener('click', () => {
          if (!setPermanentUpgradeActive(upgrade.id, !active)) return;
          this.renderPermanentShop();
          this.renderRunConfiguration();
          this.renderCaptainCallHud(this.game);
          this.game?.refreshDoctrineBonuses?.();
        });
        header.append(toggle);
      }

      const track = document.createElement('div');
      track.className = 'meta-upgrade-rank-track';

      for (let rankNumber = 1; rankNumber <= upgrade.maxRank; rankNumber += 1) {
        const rankOwned = rankNumber <= rank;
        const isNext = rankNumber === rank + 1;
        const futureRank = rankNumber > rank + 1;
        const cost = upgrade.costs[rankNumber - 1];
        const affordable = isNext && state.gold >= cost;
        const description = getPermanentUpgradeRankDescription(upgrade.id, rankNumber)
          || upgrade.rankDescriptions[rankNumber - 1]
          || upgrade.description;

        const card = document.createElement('button');
        card.type = 'button';
        card.className = [
          'meta-upgrade-rank',
          rankOwned ? 'meta-upgrade-rank--owned' : '',
          isNext ? 'meta-upgrade-rank--next' : '',
          isNext && affordable ? 'meta-upgrade-rank--affordable' : '',
          futureRank ? 'meta-upgrade-rank--locked' : '',
          rankOwned && active ? 'meta-upgrade-rank--active' : '',
        ].filter(Boolean).join(' ');
        card.disabled = !isNext || !affordable || maxed;
        card.dataset.rank = String(rankNumber);

        const stateLabel = rankOwned
          ? 'OWNED'
          : isNext
            ? affordable ? 'AVAILABLE' : 'NEXT RANK'
            : 'LOCKED';
        const footerText = rankOwned
          ? `Purchased for ${cost} Gold`
          : isNext
            ? affordable
              ? `${cost} Gold • Click to purchase`
              : `${cost} Gold • Need ${Math.max(0, cost - state.gold)} more`
            : `${cost} Gold • Requires Rank ${rankNumber - 1}`;

        card.innerHTML = `
          <span class="meta-upgrade-rank__topline">
            <span>RANK ${rankNumber}</span>
            <span>${stateLabel}</span>
          </span>
          <strong>${description}</strong>
          <span class="meta-upgrade-rank__footer">${footerText}</span>
        `;

        if (isNext && affordable && nextPurchasable && nextCost === cost) {
          card.addEventListener('click', () => {
            if (!purchasePermanentUpgrade(upgrade.id)) return;
            this.renderPermanentShop();
            this.renderRunConfiguration();
            this.renderCaptainCallHud(this.game);
            this.game?.refreshDoctrineBonuses?.();
          });
        }

        track.append(card);
      }

      section.append(header, track);
      this.metaUpgradeBranches.append(section);
    }
  }

  renderRunConfiguration(...args) {
    super.renderRunConfiguration(...args);
    if (!this.runConfigPanel) return;

    const primaryId = this.getSelectedCaptainId?.() ?? null;
    const supremeSelected = primaryId === SUPREME_COMMANDER_ID;
    const secondActive = isPermanentUpgradeActive('second_captain_slot');
    const thirdActive = secondActive && isPermanentUpgradeActive('third_captain_slot');
    const doctrineActive = isPermanentUpgradeActive('squad_doctrine');

    if (!secondActive || supremeSelected) {
      this.selectedSecondCaptainId = null;
      if (this.secondCaptainConfig) this.secondCaptainConfig.style.display = 'none';
    }

    if (!thirdActive || supremeSelected) {
      this.selectedThirdCaptainId = null;
      if (this.thirdCaptainConfig) this.thirdCaptainConfig.style.display = 'none';
    }

    if (!doctrineActive) {
      if (this.doctrineConfig) this.doctrineConfig.style.display = 'none';
    }
  }

  getSelectedSecondCaptainId() {
    if (!isPermanentUpgradeActive('second_captain_slot')) return null;
    return super.getSelectedSecondCaptainId();
  }

  getSelectedThirdCaptainId() {
    if (!isPermanentUpgradeActive('second_captain_slot')) return null;
    if (!isPermanentUpgradeActive('third_captain_slot')) return null;
    return super.getSelectedThirdCaptainId();
  }

  getSelectedDoctrineId() {
    if (!isPermanentUpgradeActive('squad_doctrine')) return null;
    return super.getSelectedDoctrineId();
  }

  renderCaptainCallHud(game) {
    super.renderCaptainCallHud(game);
  }
}
