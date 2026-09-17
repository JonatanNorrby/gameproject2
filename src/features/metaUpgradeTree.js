import { Game as PreviousGame, UI as PreviousUI } from './performanceAndVisualFixes.js';
import { CAPTAINS, GAME_BALANCE, UNIT_CLASSES } from '../data/content.js';
import { getUnitModifiers } from '../data/unitModifiers.js';
import { isCaptainUnlocked } from '../data/unlocks.js';
import {
  PERMANENT_UPGRADES,
  SQUAD_DOCTRINES,
  canPurchasePermanentUpgrade,
  getPermanentProgressionState,
  getSelectedDoctrine,
  grantGold,
  isPermanentUpgradeOwned,
  purchasePermanentUpgrade,
  setSelectedDoctrine,
} from '../data/metaUpgrades.js';
import { distanceSq, normalize } from '../utils/math.js';

const GOLD_DROP_CHANCE = 0.02;
const GOLD_DROP_VALUE = 1;
const GOLD_DROP_RADIUS = 10;
const GOLD_MAGNET_RADIUS = 120;
const GOLD_PICKUP_RADIUS = 26;
const GOLD_PULL_SPEED = 285;

const CAPTAIN_CALL_COOLDOWN = 60;
const VALE_CALL_DURATION = 5.2;
const VALE_VOLLEY_INTERVAL = 0.2;
const VALE_RANGE_MULTIPLIER = 2.5;
const MERCER_BARRAGE_ROCKETS = 24;
const MERCER_BARRAGE_INTERVAL = 0.12;
const MERCER_BARRAGE_RANGE_MULTIPLIER = 3;
const MERCER_BARRAGE_AOE_MULTIPLIER = 2.2;
const THORNE_FRENZY_DURATION = 6.5;
const THORNE_FRENZY_INTERVAL = 0.28;
const THORNE_FRENZY_RANGE = 205;
const THORNE_FRENZY_DAMAGE_MULTIPLIER = 0.6;

const DOCTRINE_STATS = Object.freeze(['damage', 'fireRate', 'range']);

function createPermanentProgressionCombatSystem(ParentCombatSystem) {
  return class PermanentProgressionCombatSystem extends ParentCombatSystem {
    killEnemy(enemy, options = {}) {
      const wasAlive = Boolean(enemy && !enemy.dead);
      super.killEnemy(enemy, options);
      if (!wasAlive || !enemy?.dead || options.allowDrop === false) return;
      if (Math.random() >= GOLD_DROP_CHANCE) return;
      this.game.spawnGoldDrop(enemy.x, enemy.y, GOLD_DROP_VALUE);
    }
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

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

export class Game extends PreviousGame {
  constructor(...args) {
    super(...args);

    const PermanentProgressionCombatSystem = createPermanentProgressionCombatSystem(
      this.combatSystem.constructor,
    );
    this.combatSystem = new PermanentProgressionCombatSystem(this);
    this.combatSystem.reset();

    this.captainCallKeyHandler = (event) => {
      if (event.repeat) return;
      const key = event.key?.toLowerCase();
      if (key === 'q') this.activateCaptainCall('primary');
      else if (key === 'e') this.activateCaptainCall('secondary');
    };
    window.addEventListener('keydown', this.captainCallKeyHandler);
  }

  resetState() {
    this.goldDrops = [];
    this.runGoldCollected = 0;
    this.doctrineAppliedFactors = new Map();
    this.activeDoctrineId = null;
    this.captainCallReadyAt = new Map();
    this.valeCallState = null;
    this.mercerCallState = null;
    this.thorneCallState = null;
    super.resetState();

    this.activeDoctrineId = isPermanentUpgradeOwned('squad_doctrine')
      ? (this.selectedDoctrineId ?? getSelectedDoctrine())
      : null;
    this.refreshDoctrineBonuses();
  }

  update(dt) {
    super.update(dt);
    if (this.pauseReasons.has('gameover')) return;
    this.updateGoldDrops(dt);
    this.updateCaptainCalls();
  }

  spawnGoldDrop(x, y, value = GOLD_DROP_VALUE) {
    this.goldDrops.push({
      id: `gold-${this.entities.createId()}`,
      x,
      y,
      value: Math.max(1, Math.floor(Number(value) || 1)),
      radius: GOLD_DROP_RADIUS,
      dead: false,
      pulseOffset: Math.random() * Math.PI * 2,
    });
  }

  updateGoldDrops(dt) {
    const player = this.player;
    const magnetRadiusSq = GOLD_MAGNET_RADIUS * GOLD_MAGNET_RADIUS;
    for (const drop of this.goldDrops) {
      if (drop.dead) continue;
      const distSq = distanceSq(player.x, player.y, drop.x, drop.y);
      if (distSq <= magnetRadiusSq) {
        const direction = normalize(player.x - drop.x, player.y - drop.y);
        const distance = Math.sqrt(distSq);
        const pull = GOLD_PULL_SPEED + Math.max(0, GOLD_MAGNET_RADIUS - distance) * 4;
        drop.x += direction.x * pull * dt;
        drop.y += direction.y * pull * dt;
      }

      const pickupRadius = player.radius + drop.radius + GOLD_PICKUP_RADIUS;
      if (distanceSq(player.x, player.y, drop.x, drop.y) > pickupRadius * pickupRadius) continue;
      drop.dead = true;
      this.runGoldCollected += drop.value;
      grantGold(drop.value);
      this.spawnExplosionEffect(drop.x, drop.y, 24, '#f7c94b');
      this.ui?.renderPermanentShop?.();
    }
    this.goldDrops = this.goldDrops.filter((drop) => !drop.dead);
  }

  drawGroundDrops(ctx) {
    super.drawGroundDrops(ctx);
    for (const drop of this.goldDrops ?? []) {
      if (drop.dead) continue;
      const pulse = 1 + Math.sin(this.animationClock * 6 + drop.pulseOffset) * 0.1;
      ctx.save();
      ctx.translate(drop.x, drop.y);
      ctx.scale(pulse, pulse);
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#f7c94b';
      ctx.fillStyle = '#f7c94b';
      ctx.strokeStyle = '#fff0a6';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, drop.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#463800';
      ctx.font = '1000 11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('G', 0, 0);
      ctx.restore();
    }
  }

  setSelectedDoctrineForRun(doctrineId) {
    this.selectedDoctrineId = SQUAD_DOCTRINES[doctrineId] ? doctrineId : null;
  }

  clearDoctrineFactors() {
    if (!this.unitModifiers || !this.doctrineAppliedFactors) return;
    for (const [unitType, factors] of this.doctrineAppliedFactors.entries()) {
      const modifiers = this.unitModifiers[unitType];
      if (!modifiers) continue;
      for (const stat of DOCTRINE_STATS) {
        const factor = Number(factors[stat]) || 1;
        if (factor !== 0 && stat in modifiers) modifiers[stat] /= factor;
      }
    }
    this.doctrineAppliedFactors.clear();
  }

  applyDoctrineFactors(unitType, factors) {
    const modifiers = this.unitModifiers?.[unitType];
    if (!modifiers) return;
    const normalized = {
      damage: Number(factors.damage) || 1,
      fireRate: Number(factors.fireRate) || 1,
      range: Number(factors.range) || 1,
    };
    for (const stat of DOCTRINE_STATS) {
      if (stat in modifiers) modifiers[stat] *= normalized[stat];
    }
    this.doctrineAppliedFactors.set(unitType, normalized);
  }

  refreshDoctrineBonuses() {
    if (!this.unitModifiers || !this.player) return;
    this.clearDoctrineFactors();
    if (!isPermanentUpgradeOwned('squad_doctrine')) return;

    const doctrineId = this.activeDoctrineId ?? this.selectedDoctrineId ?? getSelectedDoctrine();
    if (!SQUAD_DOCTRINES[doctrineId]) return;
    this.activeDoctrineId = doctrineId;

    const counts = getLivingClassCounts(this);
    if (counts.size === 0) return;

    if (doctrineId === 'combined_arms') {
      const bonus = Math.min(0.35, Math.max(0, counts.size - 1) * 0.07);
      const factor = 1 + bonus;
      for (const unitType of counts.keys()) {
        this.applyDoctrineFactors(unitType, { damage: factor, fireRate: factor, range: 1 });
      }
      return;
    }

    if (doctrineId === 'massed_infantry') {
      for (const [unitType, count] of counts.entries()) {
        const bonus = Math.min(0.40, Math.max(0, count - 1) * 0.06);
        const factor = 1 + bonus;
        this.applyDoctrineFactors(unitType, { damage: factor, fireRate: factor, range: 1 });
      }
      return;
    }

    if (doctrineId === 'shock_assault') {
      for (const unitType of counts.keys()) {
        const eligible = isShockAssaultClass(unitType);
        this.applyDoctrineFactors(unitType, eligible
          ? { damage: 1.20, fireRate: 1.35, range: 1.30 }
          : { damage: 1, fireRate: 1, range: 1 });
      }
    }
  }

  addSquadUnits(type, amount = 1) {
    super.addSquadUnits(type, amount);
    this.refreshDoctrineBonuses?.();
  }

  killSquadUnit(soldier) {
    const secondaryCaptain = Boolean(soldier?.unit?.secondaryCaptain);
    const previousDeadCaptain = this.deadCaptain;
    super.killSquadUnit(soldier);

    if (secondaryCaptain) {
      // A secondary Captain is deliberately a normal squad member for survival
      // rules. Their passive disappears when they die, but the run continues.
      this.deadCaptain = previousDeadCaptain;
      this.syncCaptainHealth();
    }
    this.refreshDoctrineBonuses();
  }

  getCaptainSoldierBySlot(slot) {
    const soldiers = this.getSoldierPositions();
    return soldiers.find((soldier) => {
      if (!soldier.unit?.captainId || soldier.unit.dead) return false;
      return slot === 'secondary'
        ? Boolean(soldier.unit.secondaryCaptain)
        : !soldier.unit.secondaryCaptain;
    }) ?? null;
  }

  getCaptainCallCooldownRemaining(slot) {
    const soldier = this.getCaptainSoldierBySlot(slot);
    if (!soldier) return Infinity;
    const readyAt = this.captainCallReadyAt.get(soldier.unit.id) ?? 0;
    return Math.max(0, readyAt - this.elapsed);
  }

  activateCaptainCall(slot = 'primary') {
    if (!isPermanentUpgradeOwned('captains_call')) return false;
    if (!this.running || this.paused) return false;

    const soldier = this.getCaptainSoldierBySlot(slot);
    if (!soldier) return false;
    const readyAt = this.captainCallReadyAt.get(soldier.unit.id) ?? 0;
    if (this.elapsed < readyAt) return false;

    const captainId = soldier.unit.captainId;
    this.captainCallReadyAt.set(soldier.unit.id, this.elapsed + CAPTAIN_CALL_COOLDOWN);

    if (captainId === 'vale') {
      this.valeCallState = {
        captainUnitId: soldier.unit.id,
        until: this.elapsed + VALE_CALL_DURATION,
        nextVolleyAt: this.elapsed,
      };
      this.ui?.showCaptainCallBanner?.('FULL VOLLEY', CAPTAINS.vale?.color ?? '#7ef9d4');
    } else if (captainId === 'mercer') {
      this.mercerCallState = {
        captainUnitId: soldier.unit.id,
        rocketsRemaining: MERCER_BARRAGE_ROCKETS,
        nextRocketAt: this.elapsed,
      };
      this.ui?.showCaptainCallBanner?.('MISSILE BARRAGE', CAPTAINS.mercer?.color ?? '#ffd36a');
    } else if (captainId === 'thorne') {
      this.thorneCallState = {
        captainUnitId: soldier.unit.id,
        until: this.elapsed + THORNE_FRENZY_DURATION,
        nextPulseAt: this.elapsed,
      };
      this.ui?.showCaptainCallBanner?.('FRENZY', CAPTAINS.thorne?.color ?? '#ff9adf');
    } else {
      this.captainCallReadyAt.set(soldier.unit.id, this.elapsed);
      return false;
    }

    this.spawnExplosionEffect(soldier.x, soldier.y, 72, CAPTAINS[captainId]?.color ?? '#ffffff');
    return true;
  }

  getCaptainCallTargets() {
    const targets = this.entities.enemies.filter((enemy) => !enemy.dead && (enemy.hp ?? 0) > 0);

    const warden = this.getActiveWarden?.();
    if (warden && !warden.dead) targets.push(warden);

    const broodmother = this.getActiveBroodmother?.();
    if (broodmother && broodmother.targetable !== false) targets.push(broodmother);
    for (const egg of this.broodEggs ?? []) {
      if (!egg.dead && (egg.hp ?? 0) > 0) targets.push(egg);
    }

    const cipher = this.getActiveCipher?.();
    if (cipher?.targetable) targets.push(cipher);

    return targets;
  }

  updateCaptainCalls() {
    this.updateValeCall();
    this.updateMercerCall();
    this.updateThorneCall();
  }

  updateValeCall() {
    const state = this.valeCallState;
    if (!state) return;
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
          rangeMultiplier: VALE_RANGE_MULTIPLIER,
          aoeMultiplier: 1,
          color: '#baffee',
        },
      );
      this.playUnitAnimation(soldier.unit, 'shooting', 0.22);
    }

    state.nextVolleyAt = this.elapsed + VALE_VOLLEY_INTERVAL;
  }

  updateMercerCall() {
    const state = this.mercerCallState;
    if (!state) return;
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
          rangeMultiplier: MERCER_BARRAGE_RANGE_MULTIPLIER,
          aoeMultiplier: MERCER_BARRAGE_AOE_MULTIPLIER,
          color: '#fff08a',
        },
      );
    }

    state.rocketsRemaining -= salvo;
    state.nextRocketAt = this.elapsed + MERCER_BARRAGE_INTERVAL;
    this.playUnitAnimation(soldier.unit, 'shooting', 0.3);
  }

  updateThorneCall() {
    const state = this.thorneCallState;
    if (!state) return;
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
        if (effective > THORNE_FRENZY_RANGE || effective >= bestDistance) continue;
        bestDistance = effective;
        bestTarget = target;
      }
      if (!bestTarget) continue;

      const weapon = UNIT_CLASSES[soldier.unit.type]?.weapon;
      const modifiers = getUnitModifiers(this.unitModifiers, soldier.unit.type);
      const baseDamage = Math.max(20, Number(weapon?.damage) || 20);
      const damage = baseDamage * modifiers.damage * THORNE_FRENZY_DAMAGE_MULTIPLIER;
      this.damageCaptainCallTarget(bestTarget, damage, soldier.x, soldier.y);
      this.playUnitAnimation(soldier.unit, 'shooting', 0.24);
      this.spawnExplosionEffect(bestTarget.x, bestTarget.y, 22, '#ff9adf');
    }

    state.nextPulseAt = this.elapsed + THORNE_FRENZY_INTERVAL;
  }

  damageCaptainCallTarget(target, damage, sourceX, sourceY) {
    if (!target || target.dead || !Number.isFinite(damage) || damage <= 0) return;

    if (this.entities.enemies.includes(target)) {
      target.hp = Math.max(0, target.hp - damage);
      target.hitFlash = 0.1;
      this.spawnHitParticles(target.x, target.y);
      if (target.hp <= 0) this.combatSystem.killEnemy(target);
      return;
    }

    const warden = this.getActiveWarden?.();
    if (target === warden) {
      const ringRadius = warden.armorRingRadius ?? warden.radius + 30;
      const direction = normalize(sourceX - warden.x, sourceY - warden.y);
      const hitX = warden.x + direction.x * ringRadius;
      const hitY = warden.y + direction.y * ringRadius;
      this.applyWardenDamage?.(damage, hitX, hitY, {
        sourceType: 'captain-call-thorne',
        melee: true,
        projectilePassedArmor: false,
      });
      return;
    }

    const broodmother = this.getActiveBroodmother?.();
    if (target === broodmother) {
      this.damageBroodmother?.(damage, target.x, target.y);
      return;
    }

    if ((this.broodEggs ?? []).includes(target)) {
      this.damageBroodEgg?.(target, damage, target.x, target.y);
      return;
    }

    const cipher = this.getActiveCipher?.();
    if (target === cipher) {
      this.damageCipher?.(damage, target.x, target.y);
    }
  }
}

export class UI extends PreviousUI {
  constructor(...args) {
    super(...args);

    this.selectedSecondCaptainId = null;
    this.lastPrimaryCaptainForRunConfig = null;

    this.metaUpgradeScreen = document.querySelector('#meta-upgrade-screen');
    this.metaUpgradeOpen = document.querySelector('#meta-upgrade-open');
    this.metaUpgradeClose = document.querySelector('#meta-upgrade-close');
    this.metaUpgradeBack = document.querySelector('#meta-upgrade-back');
    this.metaUpgradePoints = document.querySelector('#meta-upgrade-points');
    this.metaUpgradePointsDetail = document.querySelector('#meta-upgrade-points-detail');
    this.metaUpgradeBranches = document.querySelector('#meta-upgrade-branches');
    this.metaUpgradeDebugPoint = document.querySelector('#meta-upgrade-debug-point');

    this.configurePermanentShopText();
    this.bindPermanentShop();
    this.createRunConfigurationControls();
    this.createGoldHud();
    this.createCaptainCallHud();
    this.createCaptainCallBanner();
    this.renderPermanentShop();
    this.renderRunConfiguration();
  }

  configurePermanentShopText() {
    const title = this.metaUpgradeScreen?.querySelector('h2');
    if (title) title.textContent = 'Gold Upgrades';
    const eyebrow = this.metaUpgradeScreen?.querySelector('.eyebrow');
    if (eyebrow) eyebrow.textContent = 'PERMANENT PROGRESSION';
    const label = this.metaUpgradeScreen?.querySelector('.meta-upgrade-summary__points span');
    if (label) label.textContent = 'Gold';
    const help = this.metaUpgradeScreen?.querySelector('.meta-upgrade-help');
    if (help) {
      help.textContent = 'Gold can drop from any defeated enemy. Spend it on permanent upgrades in any order — there is no tree and no prerequisite path.';
    }
    if (this.metaUpgradeDebugPoint) this.metaUpgradeDebugPoint.textContent = 'DEBUG: +25 Gold';
  }

  bindPermanentShop() {
    const open = () => this.showPermanentShop();
    const close = () => this.hidePermanentShop();
    this.metaUpgradeOpen?.addEventListener('click', open);
    this.metaUpgradeClose?.addEventListener('click', close);
    this.metaUpgradeBack?.addEventListener('click', close);
    this.metaUpgradeDebugPoint?.addEventListener('click', () => {
      grantGold(25);
      this.renderPermanentShop();
    });

    window.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (!this.metaUpgradeScreen?.classList.contains('overlay--visible')) return;
      close();
    });
  }

  showPermanentShop() {
    if (!this.metaUpgradeScreen) return;
    this.renderPermanentShop();
    this.metaUpgradeScreen.classList.add('overlay--visible');
    this.metaUpgradeScreen.setAttribute('aria-hidden', 'false');
  }

  hidePermanentShop() {
    if (!this.metaUpgradeScreen) return;
    this.metaUpgradeScreen.classList.remove('overlay--visible');
    this.metaUpgradeScreen.setAttribute('aria-hidden', 'true');
    this.renderRunConfiguration();
  }

  renderPermanentShop() {
    const state = getPermanentProgressionState();
    if (this.metaUpgradePoints) this.metaUpgradePoints.textContent = String(state.gold);
    if (this.metaUpgradePointsDetail) {
      this.metaUpgradePointsDetail.textContent = `${state.ownedIds.length} / ${Object.keys(PERMANENT_UPGRADES).length} permanent upgrades owned`;
    }
    if (this.metaUpgradeOpen) this.metaUpgradeOpen.textContent = `Gold Upgrades • ${state.gold} Gold`;
    if (!this.metaUpgradeBranches) return;

    this.metaUpgradeBranches.replaceChildren();
    for (const upgrade of Object.values(PERMANENT_UPGRADES)) {
      const owned = isPermanentUpgradeOwned(upgrade.id);
      const affordable = state.gold >= upgrade.cost;
      const section = document.createElement('section');
      section.className = 'meta-upgrade-branch';
      section.style.setProperty('--branch-color', upgrade.color);

      const button = document.createElement('button');
      button.type = 'button';
      button.className = `meta-upgrade-node${owned ? ' meta-upgrade-node--active' : ''}`;
      button.disabled = owned || !affordable;
      button.innerHTML = `
        <span class="meta-upgrade-node__topline">
          <span>PERMANENT</span>
          <span>${owned ? 'OWNED' : `${upgrade.cost} GOLD`}</span>
        </span>
        <strong>${upgrade.name}</strong>
        <p>${upgrade.description}</p>
        <span class="meta-upgrade-node__status">
          ${owned ? 'Unlocked permanently' : affordable ? 'Click to purchase' : `Need ${upgrade.cost - state.gold} more Gold`}
        </span>
      `;
      button.addEventListener('click', () => {
        if (!purchasePermanentUpgrade(upgrade.id)) return;
        this.renderPermanentShop();
        this.renderRunConfiguration();
        this.renderCaptainCallHud(this.game);
      });
      section.append(button);
      this.metaUpgradeBranches.append(section);
    }
  }

  createRunConfigurationControls() {
    const panel = document.querySelector('#start-screen .panel--intro');
    const startButton = document.querySelector('#start-button');
    if (!panel || !startButton || document.querySelector('#permanent-run-config')) return;

    const wrapper = document.createElement('div');
    wrapper.id = 'permanent-run-config';
    Object.assign(wrapper.style, {
      display: 'grid',
      gap: '10px',
      margin: '12px 0 14px',
      textAlign: 'left',
    });
    wrapper.innerHTML = `
      <label id="second-captain-config" style="display:none;padding:11px 12px;border:1px solid rgba(116,201,255,.24);border-radius:10px;background:rgba(116,201,255,.05);">
        <span style="display:block;color:#74c9ff;font-size:10px;font-weight:1000;letter-spacing:.08em;margin-bottom:7px;">SECOND CAPTAIN</span>
        <select id="second-captain-select" style="width:100%;padding:9px;border:1px solid rgba(255,255,255,.14);border-radius:8px;background:#101722;color:#edf5ff;font-weight:800;"></select>
        <small id="second-captain-help" style="display:block;margin-top:6px;color:#8190a4;line-height:1.35;">The second Captain fights as a normal squad unit but provides their Captain bonus.</small>
      </label>
      <label id="doctrine-config" style="display:none;padding:11px 12px;border:1px solid rgba(126,249,212,.24);border-radius:10px;background:rgba(126,249,212,.05);">
        <span style="display:block;color:#7ef9d4;font-size:10px;font-weight:1000;letter-spacing:.08em;margin-bottom:7px;">SQUAD DOCTRINE</span>
        <select id="doctrine-select" style="width:100%;padding:9px;border:1px solid rgba(255,255,255,.14);border-radius:8px;background:#101722;color:#edf5ff;font-weight:800;"></select>
        <small id="doctrine-help" style="display:block;margin-top:6px;color:#8190a4;line-height:1.35;"></small>
      </label>
    `;
    startButton.before(wrapper);

    this.runConfigPanel = wrapper;
    this.secondCaptainConfig = wrapper.querySelector('#second-captain-config');
    this.secondCaptainSelect = wrapper.querySelector('#second-captain-select');
    this.secondCaptainHelp = wrapper.querySelector('#second-captain-help');
    this.doctrineConfig = wrapper.querySelector('#doctrine-config');
    this.doctrineSelect = wrapper.querySelector('#doctrine-select');
    this.doctrineHelp = wrapper.querySelector('#doctrine-help');

    this.secondCaptainSelect?.addEventListener('change', () => {
      this.selectedSecondCaptainId = this.secondCaptainSelect.value || null;
    });
    this.doctrineSelect?.addEventListener('change', () => {
      const id = this.doctrineSelect.value;
      if (setSelectedDoctrine(id)) {
        this.updateDoctrineHelp();
      }
    });
  }

  renderRunConfiguration() {
    if (!this.runConfigPanel) return;
    const primaryId = this.getSelectedCaptainId?.() ?? null;
    this.lastPrimaryCaptainForRunConfig = primaryId;

    const secondOwned = isPermanentUpgradeOwned('second_captain_slot');
    if (this.secondCaptainConfig) this.secondCaptainConfig.style.display = secondOwned ? 'block' : 'none';
    if (secondOwned && this.secondCaptainSelect) {
      const available = Object.values(CAPTAINS).filter((captain) => (
        isCaptainUnlocked(captain.id) && captain.id !== primaryId
      ));
      const previous = this.selectedSecondCaptainId;
      this.secondCaptainSelect.replaceChildren();

      if (available.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = primaryId ? 'Unlock another Captain first' : 'Select the primary Captain first';
        this.secondCaptainSelect.append(option);
        this.selectedSecondCaptainId = null;
        this.secondCaptainSelect.disabled = true;
      } else {
        this.secondCaptainSelect.disabled = false;
        for (const captain of available) {
          const option = document.createElement('option');
          option.value = captain.id;
          option.textContent = `${captain.name} — ${captain.role}`;
          this.secondCaptainSelect.append(option);
        }
        const nextId = available.some((captain) => captain.id === previous)
          ? previous
          : available[0].id;
        this.secondCaptainSelect.value = nextId;
        this.selectedSecondCaptainId = nextId;
      }
    }

    const doctrineOwned = isPermanentUpgradeOwned('squad_doctrine');
    if (this.doctrineConfig) this.doctrineConfig.style.display = doctrineOwned ? 'block' : 'none';
    if (doctrineOwned && this.doctrineSelect) {
      const selected = getSelectedDoctrine() ?? 'combined_arms';
      this.doctrineSelect.replaceChildren();
      for (const doctrine of Object.values(SQUAD_DOCTRINES)) {
        const option = document.createElement('option');
        option.value = doctrine.id;
        option.textContent = doctrine.name;
        this.doctrineSelect.append(option);
      }
      this.doctrineSelect.value = SQUAD_DOCTRINES[selected] ? selected : 'combined_arms';
      this.updateDoctrineHelp();
    }
  }

  updateDoctrineHelp() {
    if (!this.doctrineHelp || !this.doctrineSelect) return;
    const doctrine = SQUAD_DOCTRINES[this.doctrineSelect.value];
    this.doctrineHelp.textContent = doctrine?.description ?? '';
  }

  getSelectedSecondCaptainId() {
    if (!isPermanentUpgradeOwned('second_captain_slot')) return null;
    const primaryId = this.getSelectedCaptainId?.() ?? null;
    const id = this.selectedSecondCaptainId;
    return id && id !== primaryId && isCaptainUnlocked(id) && CAPTAINS[id] ? id : null;
  }

  getSelectedDoctrineId() {
    if (!isPermanentUpgradeOwned('squad_doctrine')) return null;
    const id = this.doctrineSelect?.value ?? getSelectedDoctrine();
    return SQUAD_DOCTRINES[id] ? id : null;
  }

  renderCaptainOptions(...args) {
    super.renderCaptainOptions(...args);
    this.renderRunConfiguration?.();
  }

  createGoldHud() {
    if (document.querySelector('#gold-hud-card')) return;
    const hudTop = document.querySelector('.hud__top');
    if (!hudTop) return;
    const card = document.createElement('div');
    card.id = 'gold-hud-card';
    card.className = 'hud-card';
    card.innerHTML = '<span class="hud-label">Gold</span><strong id="gold-text">0</strong>';
    hudTop.append(card);
    this.goldText = card.querySelector('#gold-text');
  }

  createCaptainCallHud() {
    if (document.querySelector('#captain-call-hud')) return;
    const hud = document.createElement('div');
    hud.id = 'captain-call-hud';
    Object.assign(hud.style, {
      position: 'fixed',
      right: '18px',
      bottom: '18px',
      zIndex: '14',
      display: 'none',
      gap: '8px',
      flexDirection: 'column',
      width: 'min(260px, calc(100vw - 36px))',
      pointerEvents: 'auto',
    });
    hud.innerHTML = `
      <button id="captain-call-primary" type="button" style="padding:10px 12px;border:1px solid rgba(126,249,212,.4);border-radius:10px;background:rgba(8,16,24,.92);color:#eafff8;font-weight:900;text-align:left;cursor:pointer;"></button>
      <button id="captain-call-secondary" type="button" style="padding:10px 12px;border:1px solid rgba(116,201,255,.4);border-radius:10px;background:rgba(8,16,24,.92);color:#eaf6ff;font-weight:900;text-align:left;cursor:pointer;display:none;"></button>
    `;
    document.body.append(hud);
    this.captainCallHud = hud;
    this.captainCallPrimary = hud.querySelector('#captain-call-primary');
    this.captainCallSecondary = hud.querySelector('#captain-call-secondary');
    this.captainCallPrimary?.addEventListener('click', () => this.game?.activateCaptainCall?.('primary'));
    this.captainCallSecondary?.addEventListener('click', () => this.game?.activateCaptainCall?.('secondary'));
  }

  createCaptainCallBanner() {
    if (document.querySelector('#captain-call-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'captain-call-banner';
    Object.assign(banner.style, {
      position: 'fixed',
      left: '50%',
      top: '112px',
      transform: 'translate(-50%, -8px)',
      zIndex: '22',
      opacity: '0',
      padding: '10px 18px',
      borderRadius: '10px',
      background: 'rgba(8,12,20,.94)',
      fontSize: '18px',
      fontWeight: '1000',
      letterSpacing: '.12em',
      pointerEvents: 'none',
      transition: 'opacity 140ms ease, transform 140ms ease',
    });
    document.body.append(banner);
    this.captainCallBanner = banner;
    this.captainCallBannerTimer = null;
  }

  showCaptainCallBanner(text, color = '#7ef9d4') {
    if (!this.captainCallBanner) return;
    this.captainCallBanner.textContent = text;
    this.captainCallBanner.style.color = color;
    this.captainCallBanner.style.border = `1px solid ${color}88`;
    this.captainCallBanner.style.boxShadow = `0 0 26px ${color}33`;
    this.captainCallBanner.style.opacity = '1';
    this.captainCallBanner.style.transform = 'translate(-50%, 0)';
    window.clearTimeout(this.captainCallBannerTimer);
    this.captainCallBannerTimer = window.setTimeout(() => {
      this.captainCallBanner.style.opacity = '0';
      this.captainCallBanner.style.transform = 'translate(-50%, -8px)';
    }, 1600);
  }

  renderCaptainCallHud(game) {
    if (!this.captainCallHud) return;
    const owned = isPermanentUpgradeOwned('captains_call');
    this.captainCallHud.style.display = owned && game?.running ? 'flex' : 'none';
    if (!owned || !game) return;

    const renderButton = (button, slot, key) => {
      if (!button) return;
      const soldier = game.getCaptainSoldierBySlot?.(slot);
      if (!soldier) {
        button.style.display = slot === 'secondary' ? 'none' : 'block';
        button.disabled = true;
        button.textContent = `${key} • Captain Call unavailable`;
        return;
      }
      button.style.display = 'block';
      const captain = CAPTAINS[soldier.unit.captainId];
      const remaining = game.getCaptainCallCooldownRemaining?.(slot) ?? Infinity;
      const ready = remaining <= 0.05 && !game.paused;
      button.disabled = !ready;
      button.style.opacity = ready ? '1' : '.62';
      button.textContent = ready
        ? `${key} • ${captain?.name ?? 'Captain'} — CALL READY`
        : `${key} • ${captain?.name ?? 'Captain'} — ${Number.isFinite(remaining) ? `${remaining.toFixed(1)}s` : 'N/A'}`;
    };

    renderButton(this.captainCallPrimary, 'primary', 'Q');
    renderButton(this.captainCallSecondary, 'secondary', 'E');
  }

  update(game) {
    super.update(game);
    const state = getPermanentProgressionState();
    if (this.goldText) this.goldText.textContent = String(state.gold);
    if (this.lastPrimaryCaptainForRunConfig !== (this.getSelectedCaptainId?.() ?? null)) {
      this.renderRunConfiguration();
    }
    this.renderCaptainCallHud(game);
  }
}
