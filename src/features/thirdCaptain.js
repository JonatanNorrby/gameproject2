import { Game as PreviousGame, UI as PreviousUI } from './prestigeSystem.js';
import { CAPTAINS } from '../data/content.js';
import { isCaptainUnlocked } from '../data/unlocks.js';
import {
  PERMANENT_UPGRADES,
  isPermanentUpgradeOwned,
} from '../data/metaUpgrades.js';
import { SUPREME_COMMANDER_ID } from '../data/supremeCommander.js';

const THIRD_CAPTAIN_UPGRADE_ID = 'third_captain_slot';
const SECOND_CAPTAIN_UPGRADE_ID = 'second_captain_slot';
const TERTIARY_SLOT = 'tertiary';
const SUPREME_BASE_WEAPON_TYPES = Object.freeze(['rocketeer', 'shockblade']);

export class Game extends PreviousGame {
  constructor(...args) {
    super(...args);
    this.thirdCaptainCallKeyHandler = (event) => {
      if (event.repeat || event.key?.toLowerCase() !== 'r') return;
      this.activateCaptainCall(TERTIARY_SLOT);
    };
    window.addEventListener('keydown', this.thirdCaptainCallKeyHandler);
  }

  start() {
    super.start();
    if (!this.isSupremeCommanderRun?.()) return;

    // The Commander body itself supplies Vale's Rifleman weapon. Add absorbed
    // Rocketeer and Shockblade systems immediately so all three Captain weapon
    // families and inherited bonuses are active from the first frame.
    const existingTypes = new Set((this.player?.squad ?? []).map((unit) => unit.type));
    for (const unitType of SUPREME_BASE_WEAPON_TYPES) {
      if (existingTypes.has(unitType)) continue;
      this.addSquadUnits(unitType, 1);
      existingTypes.add(unitType);
    }
  }

  getCaptainSoldierBySlot(slot) {
    if (slot !== TERTIARY_SLOT) return super.getCaptainSoldierBySlot(slot);
    if (this.isSupremeCommanderRun?.()) return null;

    return this.getSoldierPositions().find((soldier) => (
      !soldier.unit?.dead
      && Boolean(soldier.unit?.captainId)
      && Boolean(soldier.unit?.tertiaryCaptain)
    )) ?? null;
  }

  activateCaptainCall(slot = 'primary') {
    if (slot === TERTIARY_SLOT && this.isSupremeCommanderRun?.()) return false;
    return super.activateCaptainCall(slot);
  }

  killSquadUnit(soldier) {
    const tertiaryCaptain = Boolean(soldier?.unit?.tertiaryCaptain);
    const previousDeadCaptain = this.deadCaptain;
    super.killSquadUnit(soldier);

    if (tertiaryCaptain) {
      // Extra Captains are normal-survivability squad units. Losing the third
      // Captain removes their passive/call, but never ends the run.
      this.deadCaptain = previousDeadCaptain;
      this.syncCaptainHealth?.();
    }
  }
}

export class UI extends PreviousUI {
  constructor(...args) {
    super(...args);
    if (this.selectedThirdCaptainId === undefined) this.selectedThirdCaptainId = null;
    this.renderRunConfiguration?.();
  }

  createRunConfigurationControls() {
    super.createRunConfigurationControls();
    const wrapper = this.runConfigPanel ?? document.querySelector('#permanent-run-config');
    if (!wrapper) return;

    this.selectedThirdCaptainId ??= null;
    let config = wrapper.querySelector('#third-captain-config');
    if (!config) {
      config = document.createElement('label');
      config.id = 'third-captain-config';
      config.style.cssText = 'display:none;padding:11px 12px;border:1px solid rgba(193,124,255,.28);border-radius:10px;background:rgba(193,124,255,.06);';
      config.innerHTML = `
        <span style="display:block;color:#c17cff;font-size:10px;font-weight:1000;letter-spacing:.08em;margin-bottom:7px;">THIRD CAPTAIN</span>
        <select id="third-captain-select" style="width:100%;padding:9px;border:1px solid rgba(255,255,255,.14);border-radius:8px;background:#101722;color:#edf5ff;font-weight:800;"></select>
        <small id="third-captain-help" style="display:block;margin-top:6px;color:#8190a4;line-height:1.35;">The third Captain fights as a normal squad unit and provides their Captain bonus. Their Captain Call uses R.</small>
      `;
      if (this.secondCaptainConfig) this.secondCaptainConfig.after(config);
      else wrapper.prepend(config);
    }

    this.thirdCaptainConfig = config;
    this.thirdCaptainSelect = config.querySelector('#third-captain-select');
    this.thirdCaptainHelp = config.querySelector('#third-captain-help');

    if (this.thirdCaptainSelect && !this.thirdCaptainSelect.dataset.boundThirdCaptain) {
      this.thirdCaptainSelect.dataset.boundThirdCaptain = 'true';
      this.thirdCaptainSelect.addEventListener('change', () => {
        this.selectedThirdCaptainId = this.thirdCaptainSelect.value || null;
      });
    }

    if (this.secondCaptainSelect && !this.secondCaptainSelect.dataset.boundThirdRefresh) {
      this.secondCaptainSelect.dataset.boundThirdRefresh = 'true';
      this.secondCaptainSelect.addEventListener('change', () => this.renderRunConfiguration());
    }
  }

  renderRunConfiguration(...args) {
    super.renderRunConfiguration(...args);
    if (!this.runConfigPanel) return;

    const primaryId = this.getSelectedCaptainId?.() ?? null;
    const supremeSelected = primaryId === SUPREME_COMMANDER_ID;

    if (supremeSelected) {
      this.selectedSecondCaptainId = null;
      this.selectedThirdCaptainId = null;
      if (this.secondCaptainConfig) this.secondCaptainConfig.style.display = 'none';
      if (this.thirdCaptainConfig) this.thirdCaptainConfig.style.display = 'none';
      return;
    }

    const secondOwned = isPermanentUpgradeOwned(SECOND_CAPTAIN_UPGRADE_ID);
    const thirdOwned = isPermanentUpgradeOwned(THIRD_CAPTAIN_UPGRADE_ID);
    const thirdEnabled = secondOwned && thirdOwned;
    if (this.thirdCaptainConfig) this.thirdCaptainConfig.style.display = thirdEnabled ? 'block' : 'none';
    if (!thirdEnabled || !this.thirdCaptainSelect) {
      this.selectedThirdCaptainId = null;
      return;
    }

    const secondId = super.getSelectedSecondCaptainId?.() ?? this.selectedSecondCaptainId;
    const available = Object.values(CAPTAINS).filter((captain) => (
      captain.id !== SUPREME_COMMANDER_ID
      && captain.id !== primaryId
      && captain.id !== secondId
      && isCaptainUnlocked(captain.id)
    ));
    const previous = this.selectedThirdCaptainId;
    this.thirdCaptainSelect.replaceChildren();

    if (available.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Unlock another Captain first';
      this.thirdCaptainSelect.append(option);
      this.thirdCaptainSelect.disabled = true;
      this.selectedThirdCaptainId = null;
      return;
    }

    this.thirdCaptainSelect.disabled = false;
    for (const captain of available) {
      const option = document.createElement('option');
      option.value = captain.id;
      option.textContent = `${captain.name} — ${captain.role}`;
      this.thirdCaptainSelect.append(option);
    }
    const nextId = available.some((captain) => captain.id === previous)
      ? previous
      : available[0].id;
    this.thirdCaptainSelect.value = nextId;
    this.selectedThirdCaptainId = nextId;
  }

  getSelectedSecondCaptainId() {
    if ((this.getSelectedCaptainId?.() ?? null) === SUPREME_COMMANDER_ID) return null;
    return super.getSelectedSecondCaptainId();
  }

  getSelectedThirdCaptainId() {
    if ((this.getSelectedCaptainId?.() ?? null) === SUPREME_COMMANDER_ID) return null;
    if (!isPermanentUpgradeOwned(SECOND_CAPTAIN_UPGRADE_ID)) return null;
    if (!isPermanentUpgradeOwned(THIRD_CAPTAIN_UPGRADE_ID)) return null;

    const primaryId = this.getSelectedCaptainId?.() ?? null;
    const secondId = super.getSelectedSecondCaptainId?.() ?? null;
    const id = this.selectedThirdCaptainId;
    return id
      && id !== SUPREME_COMMANDER_ID
      && id !== primaryId
      && id !== secondId
      && isCaptainUnlocked(id)
      && CAPTAINS[id]
      ? id
      : null;
  }

  renderPermanentShop(...args) {
    super.renderPermanentShop(...args);
    if (!this.metaUpgradeBranches) return;

    const upgradeIds = Object.values(PERMANENT_UPGRADES).map((upgrade) => upgrade.id);
    const thirdIndex = upgradeIds.indexOf(THIRD_CAPTAIN_UPGRADE_ID);
    if (thirdIndex < 0) return;
    const button = this.metaUpgradeBranches.querySelectorAll('.meta-upgrade-node')[thirdIndex];
    if (!button || isPermanentUpgradeOwned(THIRD_CAPTAIN_UPGRADE_ID)) return;

    if (!isPermanentUpgradeOwned(SECOND_CAPTAIN_UPGRADE_ID)) {
      button.disabled = true;
      const status = button.querySelector('.meta-upgrade-node__status');
      if (status) status.textContent = 'Requires Second Captain Slot';
    }
  }

  createCaptainCallHud() {
    super.createCaptainCallHud();
    const hud = this.captainCallHud ?? document.querySelector('#captain-call-hud');
    if (!hud) return;

    let button = hud.querySelector('#captain-call-tertiary');
    if (!button) {
      button = document.createElement('button');
      button.id = 'captain-call-tertiary';
      button.type = 'button';
      button.style.cssText = 'padding:10px 12px;border:1px solid rgba(193,124,255,.4);border-radius:10px;background:rgba(8,16,24,.92);color:#f5eaff;font-weight:900;text-align:left;cursor:pointer;display:none;';
      hud.append(button);
      button.addEventListener('click', () => this.game?.activateCaptainCall?.(TERTIARY_SLOT));
    }
    this.captainCallTertiary = button;
  }

  renderCaptainCallHud(game) {
    super.renderCaptainCallHud(game);
    const button = this.captainCallTertiary;
    if (!button) return;

    const callsOwned = isPermanentUpgradeOwned('captains_call');
    const soldier = callsOwned && game?.running
      ? game.getCaptainSoldierBySlot?.(TERTIARY_SLOT)
      : null;
    if (!soldier) {
      button.style.display = 'none';
      return;
    }

    button.style.display = 'block';
    const captain = CAPTAINS[soldier.unit.captainId];
    const remaining = game.getCaptainCallCooldownRemaining?.(TERTIARY_SLOT) ?? Infinity;
    const ready = remaining <= 0.05 && !game.paused;
    button.disabled = !ready;
    button.style.opacity = ready ? '1' : '.62';
    button.textContent = ready
      ? `R • ${captain?.name ?? 'Captain'} — CALL READY`
      : `R • ${captain?.name ?? 'Captain'} — ${Number.isFinite(remaining) ? `${remaining.toFixed(1)}s` : 'N/A'}`;
  }

  resetMenuProgressState(...args) {
    const result = super.resetMenuProgressState?.(...args);
    this.selectedThirdCaptainId = null;
    this.renderRunConfiguration?.();
    return result;
  }

  update(game) {
    super.update(game);
    // Keep the third slot suppressed if a menu selection changes to Supreme
    // Commander without recreating the run-configuration controls.
    if ((this.getSelectedCaptainId?.() ?? null) === SUPREME_COMMANDER_ID) {
      if (this.thirdCaptainConfig) this.thirdCaptainConfig.style.display = 'none';
    }
  }
}
