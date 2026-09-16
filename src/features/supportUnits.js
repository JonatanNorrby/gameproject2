import { Game as PreviousGame, UI as PreviousUI } from './captainWeaponsAndDamageFlash.js';
import '../data/supportUnits.js';
import { CAPTAINS, UNIT_CLASSES } from '../data/content.js';
import { getEffectiveUnitStats, getUnitModifiers } from '../data/unitModifiers.js';
import { distanceSq, normalize } from '../utils/math.js';

const DRONE_PILOT_TYPE = 'drone_pilot';
const ROCKETEER_CLASS = 'rocketeer';
const MERCER_ID = 'mercer';
const DAMAGE_FLASH_DURATION = 0.16;
export const DRONE_STUN_EXPLOSION_COLOR = '#69cfff';

export function emitDroneStunExplosion(game, x, y, radius) {
  if (!game?.spawnExplosionEffect) return false;
  game.spawnExplosionEffect(x, y, radius, DRONE_STUN_EXPLOSION_COLOR);
  return true;
}

const DRONE_SPRITE = Object.freeze({
  basePath: './assets/drone_pilot',
  drawSize: 34,
  preserveAspect: true,
  smoothing: true,
  animations: {
    idle: { frames: ['drone.png'], fps: 1, loop: false },
  },
});

function createSupportCombatSystem(ParentCombatSystem) {
  return class SupportCombatSystem extends ParentCombatSystem {
    reset() {
      super.reset();
      if (this.game) this.game.supportDrones = [];
    }

    update(dt) {
      this.syncSupportDrones();
      this.updateSupportDrones(dt);
      super.update(dt);
    }

    syncSupportDrones() {
      const game = this.game;
      if (!Array.isArray(game.supportDrones)) game.supportDrones = [];
      const soldiers = game.getWeaponPositions();
      const pilots = soldiers.filter((soldier) => (
        !soldier.unit.dead && soldier.unit.type === DRONE_PILOT_TYPE
      ));
      const pilotIds = new Set(pilots.map((pilot) => pilot.unit.id));
      game.supportDrones = game.supportDrones.filter((drone) => pilotIds.has(drone.pilotId));

      for (const pilot of pilots) {
        let drone = game.supportDrones.find((candidate) => candidate.pilotId === pilot.unit.id);
        const support = UNIT_CLASSES[DRONE_PILOT_TYPE].support;
        if (!drone) {
          drone = {
            id: game.entities.createId(),
            pilotId: pilot.unit.id,
            x: pilot.x + 28,
            y: pilot.y - 18,
            radius: support.droneRadius,
            hp: support.droneHp,
            maxHp: support.droneHp,
            dead: false,
            respawnAt: 0,
            grenadeCooldown: 0.75,
            targetId: null,
            hitFlash: 0,
            mercerAttackCount: 0,
          };
          game.supportDrones.push(drone);
        } else if (drone.dead && game.elapsed >= drone.respawnAt) {
          drone.dead = false;
          drone.hp = drone.maxHp;
          drone.x = pilot.x + 28;
          drone.y = pilot.y - 18;
          drone.grenadeCooldown = 0.75;
          drone.targetId = null;
          drone.hitFlash = 0;
          drone.mercerAttackCount = 0;
        }
      }
    }

    chooseDroneTarget(drone, pilot, support, modifiers) {
      const now = this.game.elapsed;
      const range = support.range * modifiers.range * this.game.getTransformerStatMultiplier();
      const radius = support.aoeRadius * modifiers.blastRadius;
      let best = null;
      let bestScore = -Infinity;

      for (const enemy of this.game.entities.enemies) {
        if (enemy.dead) continue;
        if ((enemy.stunnedUntil ?? 0) > now) continue;
        if ((enemy.droneRecentlyStunnedUntil ?? 0) > now) continue;
        const pilotDistanceSq = distanceSq(pilot.x, pilot.y, enemy.x, enemy.y);
        if (pilotDistanceSq > range * range) continue;

        let groupCount = 0;
        for (const other of this.game.entities.enemies) {
          if (other.dead || (other.stunnedUntil ?? 0) > now || (other.droneRecentlyStunnedUntil ?? 0) > now) continue;
          const groupRadius = radius + other.radius;
          if (distanceSq(enemy.x, enemy.y, other.x, other.y) <= groupRadius * groupRadius) groupCount += 1;
        }
        const score = pilotDistanceSq + groupCount * range * range * 0.08;
        if (score <= bestScore) continue;
        bestScore = score;
        best = enemy;
      }
      return best;
    }

    getMercerDroneAttack(drone, pilot) {
      const eligible = Boolean(
        pilot
        && this.isAdjacentCaptainUnit?.(pilot, MERCER_ID, ROCKETEER_CLASS)
      );
      if (!eligible) {
        drone.mercerAttackCount = 0;
        return { special: false, aoeMultiplier: 1, color: null };
      }

      const effect = CAPTAINS[MERCER_ID]?.effect;
      const interval = Math.max(1, Number(effect?.everyShots) || 3);
      drone.mercerAttackCount = (drone.mercerAttackCount ?? 0) + 1;
      const special = drone.mercerAttackCount % interval === 0;
      return {
        special,
        // Issue #41: Drone Pilots get the enlarged third attack, but never the
        // Rocketeer-only third-attack range increase.
        aoeMultiplier: special ? (Number(effect?.aoeMultiplier) || 3) : 1,
        color: special ? effect?.color : null,
      };
    }

    dropStunGrenade(drone, pilot, support, modifiers, target) {
      const game = this.game;
      const now = game.elapsed;
      const mercerAttack = this.getMercerDroneAttack(drone, pilot);
      const radius = support.aoeRadius
        * modifiers.blastRadius
        * mercerAttack.aoeMultiplier;
      for (const enemy of game.entities.enemies) {
        if (enemy.dead) continue;
        if ((enemy.stunnedUntil ?? 0) > now) continue;
        if ((enemy.droneRecentlyStunnedUntil ?? 0) > now) continue;
        const hitRadius = radius + enemy.radius;
        if (distanceSq(target.x, target.y, enemy.x, enemy.y) > hitRadius * hitRadius) continue;
        enemy.stunnedUntil = now + support.stunDuration;
        enemy.droneRecentlyStunnedUntil = now + support.recentStunLockout;
      }

      // #48: the stun grenade itself should always be readable, even if every
      // enemy in the blast is already on stun lockout. Keep the visual blue on
      // Mercer's enlarged third grenade too; only the radius changes.
      emitDroneStunExplosion(game, target.x, target.y, radius);

      drone.targetId = null;
      drone.grenadeCooldown = support.cooldown / modifiers.fireRate;
    }

    updateSupportDrones(dt) {
      const game = this.game;
      const attackSpeed = game.getAttackSpeedMultiplier();
      const pilots = new Map(
        game.getWeaponPositions()
          .filter((soldier) => !soldier.unit.dead && soldier.unit.type === DRONE_PILOT_TYPE)
          .map((soldier) => [soldier.unit.id, soldier]),
      );

      for (const drone of game.supportDrones ?? []) {
        drone.hitFlash = Math.max(0, (drone.hitFlash ?? 0) - dt);
        if (drone.dead) continue;
        const pilot = pilots.get(drone.pilotId);
        if (!pilot) continue;

        const support = UNIT_CLASSES[DRONE_PILOT_TYPE].support;
        const modifiers = getUnitModifiers(game.unitModifiers, DRONE_PILOT_TYPE);
        drone.grenadeCooldown = Math.max(0, (drone.grenadeCooldown ?? 0) - dt * attackSpeed);

        let target = game.entities.enemies.find((enemy) => enemy.id === drone.targetId && !enemy.dead) ?? null;
        const now = game.elapsed;
        const range = support.range * modifiers.range * game.getTransformerStatMultiplier();
        if (
          target
          && ((target.stunnedUntil ?? 0) > now
            || (target.droneRecentlyStunnedUntil ?? 0) > now
            || distanceSq(pilot.x, pilot.y, target.x, target.y) > range * range)
        ) target = null;

        if (!target && drone.grenadeCooldown <= 0) {
          target = this.chooseDroneTarget(drone, pilot, support, modifiers);
          drone.targetId = target?.id ?? null;
        }

        const destination = target
          ? { x: target.x, y: target.y }
          : { x: pilot.x + 36, y: pilot.y - 26 };
        const dx = destination.x - drone.x;
        const dy = destination.y - drone.y;
        const distance = Math.hypot(dx, dy);
        if (distance > 2) {
          const direction = normalize(dx, dy);
          const step = Math.min(distance, support.droneSpeed * dt);
          drone.x += direction.x * step;
          drone.y += direction.y * step;
        }

        if (target && drone.grenadeCooldown <= 0 && distance <= support.dropDistance) {
          this.dropStunGrenade(drone, pilot, support, modifiers, target);
        }
      }
    }

    updateEnemies(dt) {
      const allEnemies = this.game.entities.enemies;
      const now = this.game.elapsed;
      const active = [];
      const stunned = [];
      for (const enemy of allEnemies) {
        if (!enemy.dead && (enemy.stunnedUntil ?? 0) > now) stunned.push(enemy);
        else active.push(enemy);
      }
      if (stunned.length === 0) {
        super.updateEnemies(dt);
        return;
      }

      this.game.entities.enemies = active;
      try {
        super.updateEnemies(dt);
      } finally {
        this.game.entities.enemies = allEnemies;
      }
      for (const enemy of stunned) enemy.hitFlash = Math.max(0, (enemy.hitFlash ?? 0) - dt);
    }

    findNearestSoldierTarget(x, y, soldiers) {
      let target = super.findNearestSoldierTarget(x, y, soldiers);
      let bestDistance = target ? distanceSq(x, y, target.x, target.y) : Infinity;
      for (const drone of this.game.supportDrones ?? []) {
        if (drone.dead) continue;
        const dist = distanceSq(x, y, drone.x, drone.y);
        if (dist >= bestDistance) continue;
        bestDistance = dist;
        target = drone;
      }
      return target;
    }

    updateEnemyProjectiles(projectiles, dt) {
      super.updateEnemyProjectiles(projectiles, dt);
      this.resolveDroneProjectileHits(projectiles);
    }

    resolveDroneProjectileHits(projectiles) {
      const support = UNIT_CLASSES[DRONE_PILOT_TYPE].support;
      for (const projectile of projectiles) {
        if (projectile.dead) continue;
        for (const drone of this.game.supportDrones ?? []) {
          if (drone.dead) continue;
          const hitRadius = projectile.radius + drone.radius;
          if (distanceSq(projectile.x, projectile.y, drone.x, drone.y) > hitRadius * hitRadius) continue;
          projectile.dead = true;
          drone.hp = Math.max(0, drone.hp - projectile.damage);
          drone.hitFlash = DAMAGE_FLASH_DURATION;
          if (drone.hp <= 0) {
            drone.dead = true;
            drone.respawnAt = this.game.elapsed + support.respawnDelay;
            drone.targetId = null;
            drone.mercerAttackCount = 0;
            this.game.spawnDeathParticles(drone.x, drone.y, drone.radius);
          }
          break;
        }
      }
    }
  };
}

export class Game extends PreviousGame {
  constructor(...args) {
    super(...args);
    this.supportDrones = [];
    const SupportCombatSystem = createSupportCombatSystem(this.combatSystem.constructor);
    this.combatSystem = new SupportCombatSystem(this);
    this.combatSystem.reset();
  }

  drawEnemies(ctx) {
    super.drawEnemies(ctx);
    const now = this.elapsed;
    for (const enemy of this.entities.enemies) {
      if (enemy.dead || (enemy.stunnedUntil ?? 0) <= now) continue;
      ctx.save();
      ctx.strokeStyle = '#7de7ff';
      ctx.fillStyle = 'rgba(125,231,255,.12)';
      ctx.lineWidth = 2;
      ctx.shadowBlur = 14;
      ctx.shadowColor = '#7de7ff';
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, enemy.radius + 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  drawPlayer(ctx) {
    super.drawPlayer(ctx);
    if (this.isDropEffectActive('mothership') || this.isDropEffectActive('transformer')) return;
    this.drawSupportDrones(ctx);
  }

  drawSupportDrones(ctx) {
    for (const drone of this.supportDrones ?? []) {
      if (drone.dead) continue;
      const drawn = this.animationRenderer.draw(ctx, DRONE_SPRITE, 'idle', 0, drone.x, drone.y);
      if (!drawn) {
        ctx.save();
        ctx.translate(drone.x, drone.y);
        ctx.fillStyle = '#79e7ff';
        ctx.strokeStyle = '#d2f8ff';
        ctx.lineWidth = 2;
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#79e7ff';
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.lineTo(12, 0);
        ctx.lineTo(0, 10);
        ctx.lineTo(-12, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      if ((drone.hitFlash ?? 0) > 0) {
        ctx.save();
        ctx.globalAlpha = 0.42;
        ctx.filter = 'sepia(1) saturate(18) hue-rotate(305deg) brightness(1.15)';
        this.animationRenderer.draw(ctx, DRONE_SPRITE, 'idle', 0, drone.x, drone.y);
        ctx.restore();
      }

      const health = Math.max(0, Math.min(1, drone.hp / Math.max(1, drone.maxHp)));
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.fillRect(drone.x - 14, drone.y - 20, 28, 4);
      ctx.fillStyle = '#79e7ff';
      ctx.fillRect(drone.x - 14, drone.y - 20, 28 * health, 4);
      ctx.restore();
    }
  }
}

export class UI extends PreviousUI {
  constructor() {
    super();
    const help = document.querySelector('.squad-builder__help');
    if (help) {
      help.textContent = 'Freeform formation: drag or tap units onto hexes. Drones are battlefield entities and do not appear in the Squad Builder.';
    }
  }

  renderSquadStats(counts) {
    super.renderSquadStats(counts);
    if (!counts[DRONE_PILOT_TYPE]) return;

    const stats = getEffectiveUnitStats(DRONE_PILOT_TYPE, this.game?.unitModifiers);
    if (!stats || !this.squadBuilderSummary) return;

    const note = document.createElement('div');
    note.textContent = `Drone Pilot: ${stats.range.toFixed(0)} drone range • ${stats.fireRate.toFixed(2)}/s grenade rate • ${stats.blastRadius.toFixed(0)} stun radius • ${stats.stunDuration.toFixed(1)}s stun.`;
    Object.assign(note.style, {
      marginTop: '8px',
      color: '#8fa5bb',
      fontSize: '9px',
      fontWeight: '700',
    });
    this.squadBuilderSummary.append(note);
  }
}
