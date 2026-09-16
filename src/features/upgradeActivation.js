import { Game as PreviousGame, UI as PreviousUI } from './thirdCaptain.js';
import {
  PERMANENT_UPGRADES,
  canPurchasePermanentUpgrade,
  getPermanentProgressionState,
  isPermanentUpgradeActive,
  isPermanentUpgradeOwned,
  purchasePermanentUpgrade,
  setPermanentUpgradeActive,
} from '../data/metaUpgrades.js';
import { SUPREME_COMMANDER_ID } from '../data/supremeCommander.js';

function getRequirementNames(upgrade, predicate) {
  return (upgrade.requires ?? [])
    .filter((requiredId) => predicate(requiredId))
    .map((requiredId) => PERMANENT_UPGRADES[requiredId]?.name ?? requiredId);
}

export class Game extends PreviousGame {
  refreshDoctrineBonuses() {
    if (!isPermanentUpgradeActive('squad_doctrine')) {
      this.clearDoctrineFactors?.();
      this.activeDoctrineId = null;
      return;
    }
    super.refreshDoctrineBonuses();
  }

  activateCaptainCall(slot = 'primary') {
    if (!isPermanentUpgradeActive('captains_call')) return false;
    return super.activateCaptainCall(slot);
  }
}

export class UI extends PreviousUI {
  configurePermanentShopText() {
    super.configurePermanentShopText();
    const help = this.metaUpgradeScreen?.querySelector('.meta-upgrade-help');
    if (help) {
      help.textContent = 'Gold upgrades remain permanently owned after purchase. Click any owned upgrade to activate or deactivate it without refunding it.';
    }
  }

  renderPermanentShop() {
    const state = getPermanentProgressionState();
    if (this.metaUpgradePoints) this.metaUpgradePoints.textContent = String(state.gold);
    if (this.metaUpgradePointsDetail) {
      this.metaUpgradePointsDetail.textContent = `${state.ownedIds.length} owned • ${state.activeIds.length} active`;
    }
    if (this.metaUpgradeOpen) this.metaUpgradeOpen.textContent = `Gold Upgrades • ${state.gold} Gold`;
    if (!this.metaUpgradeBranches) return;

    this.metaUpgradeBranches.replaceChildren();
    for (const upgrade of Object.values(PERMANENT_UPGRADES)) {
      const owned = isPermanentUpgradeOwned(upgrade.id);
      const active = isPermanentUpgradeActive(upgrade.id);
      const affordable = state.gold >= upgrade.cost;
      const missingOwnedRequirements = getRequirementNames(
        upgrade,
        (requiredId) => !isPermanentUpgradeOwned(requiredId),
      );
      const inactiveRequirements = getRequirementNames(
        upgrade,
        (requiredId) => !isPermanentUpgradeActive(requiredId),
      );
      const canActivate = inactiveRequirements.length === 0;
      const purchasable = canPurchasePermanentUpgrade(upgrade.id);

      const section = document.createElement('section');
      section.className = 'meta-upgrade-branch';
      section.style.setProperty('--branch-color', upgrade.color);

      const button = document.createElement('button');
      button.type = 'button';
      button.className = `meta-upgrade-node${owned ? ' meta-upgrade-node--owned' : ''}${active ? ' meta-upgrade-node--active' : ''}`;
      button.disabled = owned
        ? (!active && !canActivate)
        : !purchasable;

      let status = '';
      if (active) {
        status = 'Owned • Click to deactivate';
      } else if (owned && !canActivate) {
        status = `Activate ${inactiveRequirements.join(' + ')} first`;
      } else if (owned) {
        status = 'Owned • Click to activate';
      } else if (missingOwnedRequirements.length > 0) {
        status = `Requires ${missingOwnedRequirements.join(' + ')}`;
      } else if (affordable) {
        status = 'Click to purchase';
      } else {
        status = `Need ${upgrade.cost - state.gold} more Gold`;
      }

      button.innerHTML = `
        <span class="meta-upgrade-node__topline">
          <span>${owned ? 'OWNED' : 'PERMANENT'}</span>
          <span>${owned ? (active ? 'ACTIVE' : 'INACTIVE') : `${upgrade.cost} GOLD`}</span>
        </span>
        <strong>${upgrade.name}</strong>
        <p>${upgrade.description}</p>
        <span class="meta-upgrade-node__status">${status}</span>
      `;

      button.addEventListener('click', () => {
        const changed = owned
          ? setPermanentUpgradeActive(upgrade.id, !active)
          : purchasePermanentUpgrade(upgrade.id);
        if (!changed) return;

        this.renderPermanentShop();
        this.renderRunConfiguration();
        this.renderCaptainCallHud(this.game);
        this.game?.refreshDoctrineBonuses?.();
      });

      section.append(button);
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
    if (!isPermanentUpgradeActive('captains_call')) {
      if (this.captainCallHud) this.captainCallHud.style.display = 'none';
      if (this.captainCallTertiary) this.captainCallTertiary.style.display = 'none';
      return;
    }
    super.renderCaptainCallHud(game);
  }
}
