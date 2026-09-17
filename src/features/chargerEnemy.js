import { Game as PreviousGame, UI } from './runtimeSafety.js';
import { ENEMY_TYPES, GAME_BALANCE } from '../data/content.js';
import { getEnemySprite } from '../data/sprites.js';
import { isUnitInClassFamily } from '../data/unitFamilies.js';
import { distanceSq, normalize } from '../utils/math.js';

const CHARGER_TYPE = 'charger';
const CONTACT_INVULNERABILITY = 0.1;
const DAMAGE_FEEDBACK_INTERVAL = 0.16;
const ENEMY_DAMAGE_FILTER = 'brightness(.72) saturate(7) sepia(1) hue-rotate(305deg) contrast(1.18)';
const INHERITED_CAPTAIN_IDS = new Set(['vale', 'mercer', 'thorne']);

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
    hp: 350,
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
      distance: 190,
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
    // The Supreme Commander makes absorbed units globally adjacent to inherited
    // Captain passives. Preserve that rule after #41's class-family expansion:
    // Sniper=Rifleman, Drone Pilot=Rocketeer, Stormlancer=Shockblade.
    isAdjacentCaptainUnit(soldier, captainId, expectedType) {
      if (
        this.game.isSupremeCommanderRun?.()
        && INHERITED_CAPTAIN_IDS.has(captainId)
        && soldier
        && !soldier.unit?.dead
        && !this.game.isSupremeCommanderUnit?.(soldier.unit)
        && isUnitInClassFamily(soldier.unit.type, expectedType)
      ) return true;

      return super.isAdjacentCaptainUnit?.(soldier, captainId, expectedType) ?? false;
    }

    // The lower Shockblade wrapper temporarily sets this override to false on
    // non-third attacks. Respect it before Supreme Commander's inherited-Thorne
    // shortcut so the passive cannot become an every-attack 360° sweep.
    isThorneActive() {
      if (typeof this.thornePassiveOverride === 'boolean') {
        return this.thornePassiveOverride;
      }
      return super.isThorneActive?.() ?? false;
    }

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
      enemy.chargeEndpoint = null;
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
          enemy.chargeTimer = config.distance / config.speed;
          enemy.chargeHitIds.clear();
        }
        return;
      }

      if (enemy.chargeState === 'charging') {
        const endpoint = enemy.chargeEndpoint ?? {
          x: enemy.x + enemy.chargeDirection.x * config.distance,
          y: enemy.y + enemy.chargeDirection.y * config.distance,
        };
        enemy.chargeEndpoint = endpoint;

        const dx = endpoint.x - enemy.x;
        const dy = endpoint.y - enemy.y;
        const remaining = Math.hypot(dx, dy);
        if (remaining <= 0.001) {
          enemy.x = endpoint.x;
          enemy.y = endpoint.y;
          enemy.chargeState = 'recovery';
          enemy.chargeTimer = config.recovery;
          return;
        }

        const step = Math.min(config.speed * dt, remaining);
        enemy.x += (dx / remaining) * step;
        enemy.y += (dy / remaining) * step;
        enemy.chargeTimer = Math.max(0, enemy.chargeTimer - dt);
        this.damageSquadFromCharger(enemy, config.damage, true);

        if (step >= remaining - 0.001) {
          enemy.x = endpoint.x;
          enemy.y = endpoint.y;
          enemy.chargeState = 'recovery';
          enemy.chargeTimer = config.recovery;
        }
        return;
      }

      if (enemy.chargeState === 'recovery') {
        enemy.chargeTimer -= dt;
        if (enemy.chargeTimer <= 0) {
          enemy.chargeState = 'approach';
          enemy.chargeEndpoint = null;
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
        enemy.chargeEndpoint = {
          x: enemy.x + enemy.chargeDirection.x * config.distance,
          y: enemy.y + enemy.chargeDirection.y * config.distance,
        };
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

  // #38: the existing hitFlash timer now recolors the actual monster artwork
  // red instead of merely drawing a white ring around sprite-based enemies.
  drawEnemies(ctx) {
    for (const enemy of this.entities.enemies) {
      if (enemy.dead) continue;
      const type = ENEMY_TYPES[enemy.type];
      if (!type) continue;
      const takingDamage = (enemy.hitFlash ?? 0) > 0;
      const sprite = getEnemySprite(enemy.type);

      ctx.save();
      if (takingDamage) {
        ctx.filter = ENEMY_DAMAGE_FILTER;
        ctx.shadowBlur = 18;
        ctx.shadowColor = '#ff263f';
      }
      const spriteDrawn = this.animationRenderer.draw(
        ctx,
        sprite,
        'running',
        this.animationClock,
        enemy.x,
        enemy.y,
        { phase: enemy.id * 0.071 },
      );
      ctx.restore();

      if (!spriteDrawn) {
        ctx.save();
        ctx.translate(enemy.x, enemy.y);
        ctx.fillStyle = takingDamage ? '#ff314b' : type.fill;
        ctx.strokeStyle = takingDamage ? '#ffc0c8' : type.outline;
        ctx.shadowBlur = takingDamage ? 18 : 0;
        ctx.shadowColor = takingDamage ? '#ff263f' : 'transparent';
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (enemy.type === 'runner') {
          ctx.moveTo(0, -enemy.radius);
          ctx.lineTo(enemy.radius, enemy.radius);
          ctx.lineTo(-enemy.radius, enemy.radius);
          ctx.closePath();
        } else if (enemy.type === 'brute') {
          const r = enemy.radius;
          ctx.rect(-r, -r, r * 2, r * 2);
        } else {
          ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      if (enemy.type === CHARGER_TYPE) this.drawChargerTelegraph(ctx, enemy);
    }
  }

  drawChargerTelegraph(ctx, enemy) {
    const state = enemy.chargeState;
    if (state !== 'windup' && state !== 'charging') return;
    const config = ENEMY_TYPES[CHARGER_TYPE].charge;
    const alpha = state === 'windup'
      ? 0.45 + 0.45 * (1 - Math.max(0, enemy.chargeTimer) / config.windup)
      : 0.7;
    const direction = enemy.chargeDirection ?? { x: 0, y: 0 };
    const endpoint = enemy.chargeEndpoint ?? {
      x: enemy.x + direction.x * config.distance,
      y: enemy.y + direction.y * config.distance,
    };

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = state === 'windup' ? '#ffb08f' : '#ff634f';
    ctx.lineWidth = state === 'windup' ? 3 : 5;
    ctx.shadowBlur = 16;
    ctx.shadowColor = '#ff634f';
    ctx.beginPath();
    ctx.moveTo(enemy.x, enemy.y);
    ctx.lineTo(endpoint.x, endpoint.y);
    ctx.stroke();
    ctx.restore();
  }
}

export { UI };
