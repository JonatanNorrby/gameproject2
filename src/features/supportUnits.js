import { Game as PreviousGame, UI as PreviousUI } from './captainWeaponsAndDamageFlash.js';
import '../data/supportUnits.js';
import { CAPTAINS, UNIT_CLASSES } from '../data/content.js';
import {
  getPermanentUpgradeRank,
  isPermanentUpgradeActive,
} from '../data/metaUpgrades.js';
import { getEffectiveUnitStats, getUnitModifiers } from '../data/unitModifiers.js';
import { distanceSq, normalize } from '../utils/math.js';

const DRONE_PILOT_TYPE = 'drone_pilot';
const ROCKETEER_CLASS = 'rocketeer';
const MERCER_ID = 'mercer';
const DAMAGE_FLASH_DURATION = 0.16;
export const DRONE_PICKUP_UPGRADE_ID = 'drone_pickup';
export const DRONE_PICKUP_RADIUS = 140;
export const DRONE_PICKUP_RADIUS_BY_RANK = Object.freeze([0, 140, 210, 280]);

function getDronePickupRadius() {
  if (!isPermanentUpgradeActive(DRONE_PICKUP_UPGRADE_ID)) return 0;
  const rank = Math.max(1, Math.min(3, getPermanentUpgradeRank(DRONE_PICKUP_UPGRADE_ID)));
  return DRONE_PICKUP_RADIUS_BY_RANK[rank];
}

export function collectDronePickupXp(game) {
  const pickupRange = getDronePickupRadius();
  if (!game || pickupRange <= 0) return 0;

  const drones = (game.supportDrones ?? []).filter((drone) => !drone.dead);
  if (drones.length === 0) return 0;

  let totalXp = 0;
  for (const gem of game.entities?.gems ?? []) {
    if (gem.dead) continue;
    const pickupRadius = pickupRange + Math.max(0, Number(gem.radius) || 0);
    const pickupRadiusSq = pickupRadius * pickupRadius;
    const collected = drones.some((drone) => (
      distanceSq(drone.x, drone.y, gem.x, gem.y) <= pickupRadiusSq
    ));
    if (!collected) continue;

    gem.dead = true;
    totalXp += Math.max(0, Number(gem.value) || 0);
  }

  if (totalXp > 0) game.progression?.addXp?.(totalXp);
  return totalXp;
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
      collectDronePickupXp(this.game);
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
            target: null,
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
          drone.target = null;
          drone.hitFlash = 0;
          drone.mercerAttackCount = 0;
        }
      }
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
        // #133: Drone grenades share Mercer's every-third 3x blast-radius bonus,
        // while the separate Rocketeer rocket range bonus remains rocket-only.
        aoeMultiplier: special ? (Number(effect?.aoeMultiplier) || 3) : 1,
        color: special ? effect?.color : null,
      };
    }

    dropExplosiveGrenade(drone, pilot, support, modifiers) {
      const game = this.game;
      const weapon = UNIT_CLASSES[DRONE_PILOT_TYPE].weapon;
      const rocketWeapon = UNIT_CLASSES[ROCKETEER_CLASS].weapon;
      const statMultiplier = game.getTransformerStatMultiplier();
      const mercerAttack = this.getMercerDroneAttack(drone, pilot);
      const radius = support.aoeRadius
        * modifiers.blastRadius
        * mercerAttack.aoeMultiplier
        * statMultiplier;

      // #136: Drone grenades now enter the exact same projectile/explosion path
      // as Rocketeer rockets. The zero-life rocket is spawned under the drone,
      // then CombatSystem.updateProjectiles resolves the shared AoE on this frame.
      game.entities.projectiles.push({
        id: game.entities.createId(),
        kind: 'rocket',
        special: mercerAttack.special ? 'mercer-drone-grenade' : 'drone-grenade',
        sourceType: DRONE_PILOT_TYPE,
        x: drone.x,
        y: drone.y,
        vx: 0,
        vy: 0,
        radius: rocketWeapon.projectileRadius,
        damage: weapon.damage * modifiers.damage * statMultiplier,
        life: 0,
        pierce: 1,
        aoeRadius: radius,
        color: mercerAttack.color ?? rocketWeapon.color,
        hitIds: new Set(),
        dead: false,
      });

      drone.target = null;
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

        // #136: keep a direct target reference while the drone is travelling so
        // we do not rescan the entire enemy list every frame. When ready to fire,
        // acquire targets with the same nearest-target helper Rocketeers use.
        let target = drone.target && !drone.target.dead ? drone.target : null;
        const range = support.range * modifiers.range * game.getTransformerStatMultiplier();
        if (
          target
          && distanceSq(drone.x, drone.y, target.x, target.y) > range * range
        ) target = null;

        if (!target && drone.grenadeCooldown <= 0) {
          target = this.findNearestTarget(drone.x, drone.y, range);
        }
        drone.target = target;

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
          this.dropExplosiveGrenade(drone, pilot, support, modifiers);
        }
      }
    }

    // Preserve generic stun-state handling for other systems. Drone Pilot no
    // longer creates stunnedUntil/droneRecentlyStunnedUntil states after #133.
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
            drone.target = null;
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
    note.textContent = `Drone Pilot: ${stats.damage.toFixed(0)} grenade damage • ${stats.range.toFixed(0)} drone range • ${stats.fireRate.toFixed(2)}/s grenade rate • ${stats.blastRadius.toFixed(0)} blast radius.`;
    Object.assign(note.style, {
      marginTop: '8px',
      color: '#8fa5bb',
      fontSize: '9px',
      fontWeight: '700',
    });
    this.squadBuilderSummary.append(note);
  }
}
