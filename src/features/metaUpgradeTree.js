import { Game as PreviousGame, UI as PreviousUI } from './performanceAndVisualFixes.js';
import {
  META_UPGRADE_BRANCHES,
  META_UPGRADES,
  activateMetaUpgrade,
  canActivateMetaUpgrade,
  getMetaUpgradeDefinition,
  getMetaUpgradeState,
  grantMetaUpgradePoints,
  isMetaUpgradeActive,
  refundMetaUpgrade,
} from '../data/metaUpgrades.js';

const REINFORCEMENT_BONUS_AMOUNT = 1;
const EMERGENCY_BARRIER_INVULNERABILITY = 1.5;
const KILL_REACTOR_INTERVAL = 25;
const KILL_REACTOR_FURY_DURATION = 3;
const RALLY_PULSE_FURY_DURATION = 4;

function createMetaUpgradeCombatSystem(ParentCombatSystem) {
  return class MetaUpgradeCombatSystem extends ParentCombatSystem {
    killEnemy(enemy, options = {}) {
      const wasAlive = Boolean(enemy && !enemy.dead);
      super.killEnemy(enemy, options);
      if (!wasAlive || !enemy?.dead) return;
      if (!isMetaUpgradeActive('kill_reactor')) return;
      if (this.game.kills <= 0 || this.game.kills % KILL_REACTOR_INTERVAL !== 0) return;

      this.game.activateTimedDropEffect('fury', KILL_REACTOR_FURY_DURATION);
      this.game.spawnExplosionEffect(
        this.game.player.x,
        this.game.player.y,
        54,
        '#ffb35c',
      );

      if (isMetaUpgradeActive('vacuum_surge')) {
        this.game.collectAllXp();
      }
    }
  };
}

export class Game extends PreviousGame {
  constructor(...args) {
    super(...args);
    const MetaUpgradeCombatSystem = createMetaUpgradeCombatSystem(this.combatSystem.constructor);
    this.combatSystem = new MetaUpgradeCombatSystem(this);
    this.combatSystem.reset();
  }

  resetState() {
    this.metaRunState = {
      reinforcementBonusesUsed: 0,
      emergencyBarrierUsed: false,
    };
    super.resetState();
  }

  addSquadUnits(type, amount = 1) {
    let finalAmount = amount;
    const isRunReinforcement = Boolean(
      this.metaRunState
      && this.pauseReasons?.has('levelup')
      && (this.player?.level ?? 1) > 1
      && amount > 0
    );

    if (isRunReinforcement && isMetaUpgradeActive('reserve_drop')) {
      const bonusUses = isMetaUpgradeActive('deep_reserves') ? 2 : 1;
      if (this.metaRunState.reinforcementBonusesUsed < bonusUses) {
        finalAmount += REINFORCEMENT_BONUS_AMOUNT;
        this.metaRunState.reinforcementBonusesUsed += 1;
      }
    }

    super.addSquadUnits(type, finalAmount);
  }

  killSquadUnit(soldier) {
    const unit = soldier?.unit;
    const barrierAvailable = Boolean(
      unit
      && !unit.dead
      && !unit.captainId
      && isMetaUpgradeActive('emergency_barrier')
      && !this.metaRunState?.emergencyBarrierUsed
    );

    if (!barrierAvailable) {
      super.killSquadUnit(soldier);
      return;
    }

    this.metaRunState.emergencyBarrierUsed = true;
    unit.dead = false;
    unit.hp = 1;
    unit.hitFlash = 0.22;
    this.combatSystem?.damageInvulnerability?.set(
      unit.id,
      EMERGENCY_BARRIER_INVULNERABILITY,
    );

    this.spawnExplosionEffect(soldier.x, soldier.y, 48, '#7ef9d4');

    if (isMetaUpgradeActive('rally_pulse')) {
      this.activateTimedDropEffect('fury', RALLY_PULSE_FURY_DURATION);
      this.spawnExplosionEffect(this.player.x, this.player.y, 68, '#f7c94b');
    }
  }
}

export class UI extends PreviousUI {
  constructor(...args) {
    super(...args);

    this.metaUpgradeScreen = document.querySelector('#meta-upgrade-screen');
    this.metaUpgradeOpen = document.querySelector('#meta-upgrade-open');
    this.metaUpgradeClose = document.querySelector('#meta-upgrade-close');
    this.metaUpgradeBack = document.querySelector('#meta-upgrade-back');
    this.metaUpgradePoints = document.querySelector('#meta-upgrade-points');
    this.metaUpgradePointsDetail = document.querySelector('#meta-upgrade-points-detail');
    this.metaUpgradeBranches = document.querySelector('#meta-upgrade-branches');
    this.metaUpgradeDebugPoint = document.querySelector('#meta-upgrade-debug-point');

    this.bindMetaUpgradeTree();
    this.renderMetaUpgradeTree();
  }

  bindMetaUpgradeTree() {
    const open = () => this.showMetaUpgradeTree();
    const close = () => this.hideMetaUpgradeTree();

    this.metaUpgradeOpen?.addEventListener('click', open);
    this.metaUpgradeClose?.addEventListener('click', close);
    this.metaUpgradeBack?.addEventListener('click', close);
    this.metaUpgradeDebugPoint?.addEventListener('click', () => {
      grantMetaUpgradePoints(1);
      this.renderMetaUpgradeTree();
    });

    window.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (!this.metaUpgradeScreen?.classList.contains('overlay--visible')) return;
      close();
    });
  }

  showMetaUpgradeTree() {
    if (!this.metaUpgradeScreen) return;
    this.renderMetaUpgradeTree();
    this.metaUpgradeScreen.classList.add('overlay--visible');
    this.metaUpgradeScreen.setAttribute('aria-hidden', 'false');
  }

  hideMetaUpgradeTree() {
    if (!this.metaUpgradeScreen) return;
    this.metaUpgradeScreen.classList.remove('overlay--visible');
    this.metaUpgradeScreen.setAttribute('aria-hidden', 'true');
  }

  renderMetaUpgradeTree() {
    const state = getMetaUpgradeState();

    if (this.metaUpgradePoints) {
      this.metaUpgradePoints.textContent = String(state.availablePoints);
    }
    if (this.metaUpgradePointsDetail) {
      this.metaUpgradePointsDetail.textContent = `${state.spentPoints} allocated / ${state.totalPoints} earned`;
    }
    if (this.metaUpgradeOpen) {
      this.metaUpgradeOpen.textContent = state.availablePoints > 0
        ? `Upgrade Tree • ${state.availablePoints} Point${state.availablePoints === 1 ? '' : 's'}`
        : 'Upgrade Tree';
    }
    if (!this.metaUpgradeBranches) return;

    this.metaUpgradeBranches.replaceChildren();

    for (const branch of META_UPGRADE_BRANCHES) {
      const branchElement = document.createElement('section');
      branchElement.className = 'meta-upgrade-branch';
      branchElement.style.setProperty('--branch-color', branch.color);
      branchElement.innerHTML = `
        <header class="meta-upgrade-branch__header">
          <span class="meta-upgrade-branch__eyebrow">${branch.label}</span>
          <p>${branch.description}</p>
        </header>
      `;

      const nodes = Object.values(META_UPGRADES)
        .filter((upgrade) => upgrade.branch === branch.id)
        .sort((a, b) => a.tier - b.tier);

      for (const upgrade of nodes) {
        const active = isMetaUpgradeActive(upgrade.id);
        const requirementsMet = upgrade.requirements.every((id) => isMetaUpgradeActive(id));
        const affordable = state.availablePoints >= upgrade.cost;
        const canActivate = canActivateMetaUpgrade(upgrade.id);
        const requirementNames = upgrade.requirements
          .map((id) => getMetaUpgradeDefinition(id)?.name)
          .filter(Boolean);

        if (upgrade.tier > 1) {
          const connector = document.createElement('div');
          connector.className = `meta-upgrade-connector${requirementsMet ? ' meta-upgrade-connector--active' : ''}`;
          branchElement.append(connector);
        }

        const node = document.createElement('button');
        node.type = 'button';
        node.className = [
          'meta-upgrade-node',
          active ? 'meta-upgrade-node--active' : '',
          !active && !requirementsMet ? 'meta-upgrade-node--locked' : '',
        ].filter(Boolean).join(' ');
        node.disabled = !active && !canActivate;
        node.innerHTML = `
          <span class="meta-upgrade-node__topline">
            <span>TIER ${upgrade.tier}</span>
            <span>${active ? 'ACTIVE' : `${upgrade.cost} POINT${upgrade.cost === 1 ? '' : 'S'}`}</span>
          </span>
          <strong>${upgrade.name}</strong>
          <p>${upgrade.description}</p>
          <span class="meta-upgrade-node__status">
            ${active
              ? 'Click to refund'
              : !requirementsMet
                ? `Requires ${requirementNames.join(' + ')}`
                : affordable
                  ? 'Click to activate'
                  : 'Need more upgrade points'}
          </span>
        `;

        node.addEventListener('click', () => {
          if (active) refundMetaUpgrade(upgrade.id);
          else activateMetaUpgrade(upgrade.id);
          this.renderMetaUpgradeTree();
        });

        branchElement.append(node);
      }

      this.metaUpgradeBranches.append(branchElement);
    }
  }
}
