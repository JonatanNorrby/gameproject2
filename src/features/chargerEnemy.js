import { Game as PreviousGame, UI } from './runtimeSafety.js';
import { ENEMY_TYPES, GAME_BALANCE } from '../data/content.js';
import { distanceSq, normalize } from '../utils/math.js';

const CHARGER_TYPE = 'charger';
const CONTACT_INVULNERABILITY = 0.1;
const DAMAGE_FEEDBACK_INTERVAL = 0.16;

// #31: Brutes remain the slow tank enemy, but are now an occasional pressure
// piece rather than a large fraction of every later spawn burst.
if (ENEMY_TYPES.brute) {
  ENEMY_TYPES.brute.weight = 0.65;
  ENEMY_TYPES.brute.maxActive = 3;
}

// #32: a separate slow heavy enemy whose threat comes from a telegraphed,
// locked-direction charge rather than raw spawn density.
if (!ENEMY_TYPES[CHARGER_TYPE]) {
  ENEMY_TYPES[CHARGER_TYPE] = {
    label: 'Charger',
    radius: 27,
    speed: 36,
    hp: 175,
    damage: 12,
    xp: 5,
    fill: '#b85b50',
    outline: '#ffad91',
    unlockAt: 58,
    weight: 0.55,
    maxActive: 2,
    charge: {
      triggerRange: 520,
      windup: 0.82,
      duration: 0.72,
      speed: 470,
      damage: 30,
      recovery: 1.15,
      cooldownMin: 3.8,
      cooldownMax: 5.8,
    },
  };
}

function createChargerCombatSystem(ParentCombatSystem) {
  return class ChargerCombatSystem extends ParentCombatSystem {
    updateEnemies(dt) {
      const allEnemies = this.game.entities.enemies;
      const chargers = allEnemies.filter((enemy) => (
        !enemy.dead && enemy.type === CHARGER_TYPE
      ));

      if (chargers.length === 0) {
        super.updateEnemies(dt);
        return;
      }

      // Let the existing enemy stack process every other archetype unchanged.
      // Charger movement is then resolved exactly once below.
      const nonChargers = allEnemies.filter((enemy) => enemy.type !== CHARGER_TYPE || enemy.dead);
      this.game.entities.enemies = nonChargers;
      try {
        super.updateEnemies(dt);
      } finally {
        this.game.entities.enemies = allEnemies;
      }

      for (const enemy of chargers) this.updateCharger(enemy, dt);
    }

    ensureChargerState(enemy) {
      if (enemy.chargeState) return;
      const config = ENEMY_TYPES[CHARGER_TYPE].charge;
      enemy.chargeState = 'approach';
      enemy.chargeTimer = 0;
      enemy.chargeCooldown = config.cooldownMin
        + Math.random() * (config.cooldownMax - config.cooldownMin);
      enemy.chargeDirection = { x: 0, y: 0 };
      enemy.chargeHitIds = new Set();
    }

    updateCharger(enemy, dt) {
      const game = this.game;
      const config = ENEMY_TYPES[CHARGER_TYPE].charge;
      this.ensureChargerState(enemy);
      enemy.hitFlash = Math.max(0, (enemy.hitFlash ?? 0) - dt);
      enemy.chargeCooldown = Math.max(0, (enemy.chargeCooldown ?? 0) - dt);

      if (game.isDropEffectActive('mothership')) return;

      if (enemy.chargeState === 'windup') {
        enemy.chargeTimer -= dt;
        if (enemy.chargeTimer <= 0) {
          enemy.chargeState = 'charging';
          enemy.chargeTimer = config.duration;
          enemy.chargeHitIds.clear();
        }
        return;
      }

      if (enemy.chargeState === 'charging') {
        enemy.x += enemy.chargeDirection.x * config.speed * dt;
        enemy.y += enemy.chargeDirection.y * config.speed * dt;
        enemy.chargeTimer -= dt;
        this.damageSquadFromCharger(enemy, config.damage, true);
        if (enemy.chargeTimer <= 0) {
          enemy.chargeState = 'recovery';
          enemy.chargeTimer = config.recovery;
        }
        return;
      }

      if (enemy.chargeState === 'recovery') {
        enemy.chargeTimer -= dt;
        if (enemy.chargeTimer <= 0) {
          enemy.chargeState = 'approach';
          enemy.chargeCooldown = config.cooldownMin
            + Math.random() * (config.cooldownMax - config.cooldownMin);
        }
        return;
      }

      const dx = game.player.x - enemy.x;
      const dy = game.player.y - enemy.y;
      const distance = Math.hypot(dx, dy) || 1;
      const direction = { x: dx / distance, y: dy / distance };
      enemy.facingAngle = Math.atan2(dy, dx);

      if (enemy.chargeCooldown <= 0 && distance <= config.triggerRange) {
        enemy.chargeDirection = normalize(dx, dy);
        enemy.chargeState = 'windup';
        enemy.chargeTimer = config.windup;
        return;
      }

      enemy.x += direction.x * enemy.speed * dt;
      enemy.y += direction.y * enemy.speed * dt;
      this.damageSquadFromCharger(enemy, enemy.damage * CONTACT_INVULNERABILITY, false);
    }

    damageSquadFromCharger(enemy, rawDamage, charging) {
      const game = this.game;
      const hitRadius = enemy.radius + GAME_BALANCE.player.soldierRadius + (charging ? 5 : 0);

      if (game.isDropEffectActive('transformer')) {
        if (distanceSq(game.player.x, game.player.y, enemy.x, enemy.y) > hitRadius * hitRadius) return;
        const key = 'charger-transformer';
        if (this.damageInvulnerability.has(key)) return;
        const damage = rawDamage * (1 - Math.max(0, Math.min(0.9, game.player.armor ?? 0)));
        if (!game.debug?.infiniteHp) game.damageMergedSquad(damage, game.player.x, game.player.y);
        this.damageInvulnerability.set(key, CONTACT_INVULNERABILITY);
        game.triggerDamageFeedback(game.player.x, game.player.y);
        return;
      }

      for (const soldier of game.getSoldierPositions()) {
        const unit = soldier.unit;
        if (!unit || unit.dead) continue;
        if (charging && enemy.chargeHitIds.has(unit.id)) continue;
        if (distanceSq(soldier.x, soldier.y, enemy.x, enemy.y) > hitRadius * hitRadius) continue;
        if (!charging && this.damageInvulnerability.has(unit.id)) continue;

        const armor = this.getUnitArmor?.(unit) ?? unit.armor ?? game.player.armor ?? 0;
        const damage = rawDamage * (1 - Math.max(0, Math.min(0.9, armor)));
        unit.hitFlash = DAMAGE_FEEDBACK_INTERVAL;
        if (!game.debug?.infiniteHp) unit.hp = Math.max(0, unit.hp - damage);
        this.damageInvulnerability.set(unit.id, CONTACT_INVULNERABILITY);
        if (charging) enemy.chargeHitIds.add(unit.id);
        game.triggerDamageFeedback(soldier.x, soldier.y);
        if (!game.debug?.infiniteHp && unit.hp <= 0) game.killSquadUnit(soldier);
      }
    }
  };
}

export class Game extends PreviousGame {
  constructor(...args) {
    super(...args);
    const ChargerCombatSystem = createChargerCombatSystem(this.combatSystem.constructor);
    this.combatSystem = new ChargerCombatSystem(this);
    this.combatSystem.reset();
  }

  // #33: once enraged, any close-range slam decision is redirected into the
  // same fast Charge used at range. Barrage is already disabled while enraged.
  beginWardenSlam(boss) {
    if (boss?.enraged) {
      this.beginWardenCharge(boss);
      return;
    }
    super.beginWardenSlam(boss);
  }

  drawEnemies(ctx) {
    super.drawEnemies(ctx);
    for (const enemy of this.entities.enemies) {
      if (enemy.dead || enemy.type !== CHARGER_TYPE) continue;
      this.drawChargerTelegraph(ctx, enemy);
    }
  }

  drawChargerTelegraph(ctx, enemy) {
    const state = enemy.chargeState;
    if (state !== 'windup' && state !== 'charging') return;
    const config = ENEMY_TYPES[CHARGER_TYPE].charge;
    const alpha = state === 'windup'
      ? 0.45 + 0.45 * (1 - Math.max(0, enemy.chargeTimer) / config.windup)
      : 0.7;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = state === 'windup' ? '#ffb08f' : '#ff634f';
    ctx.lineWidth = state === 'windup' ? 3 : 5;
    ctx.shadowBlur = 16;
    ctx.shadowColor = '#ff634f';
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, enemy.radius + 8, 0, Math.PI * 2);
    ctx.stroke();

    const direction = enemy.chargeDirection ?? { x: 0, y: 0 };
    ctx.beginPath();
    ctx.moveTo(enemy.x, enemy.y);
    ctx.lineTo(
      enemy.x + direction.x * (state === 'windup' ? 190 : 90),
      enemy.y + direction.y * (state === 'windup' ? 190 : 90),
    );
    ctx.stroke();
    ctx.restore();
  }
}

export { UI };
