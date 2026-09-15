import { Game as PreviousGame, UI as PreviousUI } from './captainWeaponsAndDamageFlash.js';
import '../data/supportUnits.js';
import { GAME_BALANCE, UNIT_CLASSES } from '../data/content.js';
import { getEffectiveUnitStats, getUnitModifiers } from '../data/unitModifiers.js';
import { distanceSq, normalize } from '../utils/math.js';
import { hexDistance } from '../utils/hexFormation.js';

const DRONE_PILOT_TYPE = 'drone_pilot';
const ANTI_AIR_TYPE = 'anti_air';
const DAMAGE_INVULNERABILITY_DURATION = 0.1;
const DAMAGE_FLASH_DURATION = 0.16;

const DRONE_SPRITE = Object.freeze({
  basePath: './assets/drone_pilot',
  drawSize: 34,
  preserveAspect: true,
  smoothing: true,
  animations: {
    idle: { frames: ['drone.png'], fps: 1, loop: false },
  },
});

function cloneHex(hex) {
  return { q: Number(hex?.q) || 0, r: Number(hex?.r) || 0 };
}

function hexKey(hex) {
  return `${hex.q},${hex.r}`;
}

function footprintHexes(unit, primaryHex = unit?.formationHex) {
  if (!primaryHex) return [];
  const primary = cloneHex(primaryHex);
  if (unit?.type !== ANTI_AIR_TYPE) return [primary];
  return [primary, { q: primary.q + 1, r: primary.r }];
}

function snapshotFormation(units) {
  return new Map(units.map((unit) => [unit.id, cloneHex(unit.formationHex)]));
}

function restoreFormation(units, snapshot) {
  for (const unit of units) {
    const original = snapshot.get(unit.id);
    if (original) unit.formationHex = cloneHex(original);
  }
}

function footprintCollision(units) {
  const occupied = new Map();
  for (const unit of units) {
    for (const hex of footprintHexes(unit)) {
      const key = hexKey(hex);
      const previous = occupied.get(key);
      if (previous && previous !== unit.id) return { firstId: previous, secondId: unit.id, hex };
      occupied.set(key, unit.id);
    }
  }
  return null;
}

function occupiedFootprints(units, excludeUnitId = null) {
  const occupied = new Set();
  for (const unit of units) {
    if (unit.id === excludeUnitId) continue;
    for (const hex of footprintHexes(unit)) occupied.add(hexKey(hex));
  }
  return occupied;
}

function candidateTouchesFormation(candidateFootprint, occupied) {
  if (occupied.size === 0) return true;
  const directions = [
    { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
    { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
  ];
  return candidateFootprint.some((hex) => directions.some((direction) => (
    occupied.has(hexKey({ q: hex.q + direction.q, r: hex.r + direction.r }))
  )));
}

function findFreeFootprintSlot(units, movingUnit) {
  const occupied = occupiedFootprints(units, movingUnit.id);
  if (occupied.size === 0) return { q: 0, r: 0 };

  const candidates = [];
  for (let radius = 0; radius <= 24; radius += 1) {
    for (let q = -radius - 1; q <= radius + 1; q += 1) {
      for (let r = -radius - 1; r <= radius + 1; r += 1) {
        const primary = { q, r };
        if (hexDistance(primary, { q: 0, r: 0 }) > radius + 1) continue;
        const footprint = footprintHexes(movingUnit, primary);
        if (footprint.some((hex) => occupied.has(hexKey(hex)))) continue;
        if (!candidateTouchesFormation(footprint, occupied)) continue;
        const contacts = footprint.reduce((count, hex) => {
          const neighbors = [
            { q: hex.q + 1, r: hex.r }, { q: hex.q + 1, r: hex.r - 1 },
            { q: hex.q, r: hex.r - 1 }, { q: hex.q - 1, r: hex.r },
            { q: hex.q - 1, r: hex.r + 1 }, { q: hex.q, r: hex.r + 1 },
          ];
          return count + neighbors.filter((neighbor) => occupied.has(hexKey(neighbor))).length;
        }, 0);
        candidates.push({ primary, contacts, distance: hexDistance(primary, { q: 0, r: 0 }) });
      }
    }
    if (candidates.length > 0) break;
  }

  return candidates.sort((a, b) => (
    b.contacts - a.contacts
    || a.distance - b.distance
    || a.primary.r - b.primary.r
    || a.primary.q - b.primary.q
  ))[0]?.primary ?? { q: 0, r: 0 };
}

function createSupportCombatSystem(ParentCombatSystem) {
  return class SupportCombatSystem extends ParentCombatSystem {
    constructor(game) {
      super(game);
      this.antiAirCooldowns = new Map();
    }

    reset() {
      super.reset();
      this.antiAirCooldowns?.clear();
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

    dropStunGrenade(drone, support, modifiers, target) {
      const game = this.game;
      const now = game.elapsed;
      const radius = support.aoeRadius * modifiers.blastRadius;
      let stunnedCount = 0;
      for (const enemy of game.entities.enemies) {
        if (enemy.dead) continue;
        if ((enemy.stunnedUntil ?? 0) > now) continue;
        if ((enemy.droneRecentlyStunnedUntil ?? 0) > now) continue;
        const hitRadius = radius + enemy.radius;
        if (distanceSq(target.x, target.y, enemy.x, enemy.y) > hitRadius * hitRadius) continue;
        enemy.stunnedUntil = now + support.stunDuration;
        enemy.droneRecentlyStunnedUntil = now + support.recentStunLockout;
        stunnedCount += 1;
      }
      if (stunnedCount > 0) {
        game.spawnExplosionEffect(target.x, target.y, radius, support.color);
      }
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
          this.dropStunGrenade(drone, support, modifiers, target);
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

    updateSquadWeapons(dt) {
      super.updateSquadWeapons(dt);
      const game = this.game;
      if (game.isDropEffectActive('mothership')) return;

      const antiAirSoldiers = game.getWeaponPositions().filter((soldier) => (
        !soldier.unit.dead && soldier.unit.type === ANTI_AIR_TYPE
      ));
      const activeIds = new Set();
      const attackSpeed = game.getAttackSpeedMultiplier();
      const statMultiplier = game.getTransformerStatMultiplier();
      const support = UNIT_CLASSES[ANTI_AIR_TYPE].support;
      const modifiers = getUnitModifiers(game.unitModifiers, ANTI_AIR_TYPE);

      for (const soldier of antiAirSoldiers) {
        activeIds.add(soldier.unit.id);
        let cooldown = (this.antiAirCooldowns.get(soldier.unit.id) ?? 0.25) - dt * attackSpeed;
        this.antiAirCooldowns.set(soldier.unit.id, cooldown);
        if (cooldown > 0) continue;

        const range = support.range * modifiers.range * statMultiplier;
        const target = this.findAntiAirTarget(soldier, range);
        if (!target) continue;

        this.fireAntiAirInterceptor(soldier, target, support, modifiers, statMultiplier);
        this.antiAirCooldowns.set(soldier.unit.id, support.cooldown / modifiers.fireRate);
        game.playUnitAnimation(
          soldier.unit,
          game.player.moving ? 'shooting' : 'idle_shooting',
          0.36,
        );
      }

      for (const unitId of this.antiAirCooldowns.keys()) {
        if (!activeIds.has(unitId)) this.antiAirCooldowns.delete(unitId);
      }
    }

    findAntiAirTarget(soldier, range) {
      let best = null;
      let bestDistance = range * range;
      for (const projectile of this.game.entities.projectiles) {
        if (!projectile.hostile || projectile.dead || projectile.antiAirReservedBy) continue;
        const dist = distanceSq(soldier.x, soldier.y, projectile.x, projectile.y);
        if (dist >= bestDistance) continue;
        bestDistance = dist;
        best = projectile;
      }
      return best;
    }

    fireAntiAirInterceptor(soldier, target, support, modifiers, statMultiplier) {
      target.antiAirReservedBy = soldier.unit.id;
      const direction = normalize(target.x - soldier.x, target.y - soldier.y);
      const startSpeed = support.projectileSpeed * modifiers.projectileSpeed * statMultiplier;
      this.game.entities.projectiles.push({
        id: this.game.entities.createId(),
        kind: support.projectileKind,
        sourceType: ANTI_AIR_TYPE,
        antiAirInterceptor: true,
        targetProjectileId: target.id,
        x: soldier.x,
        y: soldier.y,
        vx: direction.x * startSpeed,
        vy: direction.y * startSpeed,
        currentSpeed: startSpeed,
        acceleration: support.projectileAcceleration * modifiers.projectileSpeed * statMultiplier,
        maxSpeed: support.maxProjectileSpeed * modifiers.projectileSpeed * statMultiplier,
        radius: support.projectileRadius,
        damage: 0,
        life: support.projectileLife,
        pierce: 1,
        aoeRadius: 0,
        color: support.color,
        hitIds: new Set(),
        dead: false,
      });
    }

    updateProjectiles(dt) {
      const all = this.game.entities.projectiles;
      const interceptors = all.filter((projectile) => projectile.antiAirInterceptor);
      this.game.entities.projectiles = all.filter((projectile) => !projectile.antiAirInterceptor);
      try {
        super.updateProjectiles(dt);
      } finally {
        this.game.entities.projectiles = [...this.game.entities.projectiles, ...interceptors];
      }
      this.updateAntiAirInterceptors(interceptors, dt);
    }

    updateAntiAirInterceptors(interceptors, dt) {
      const projectiles = this.game.entities.projectiles;
      for (const interceptor of interceptors) {
        if (interceptor.dead) continue;
        const target = projectiles.find((projectile) => (
          projectile.id === interceptor.targetProjectileId && projectile.hostile && !projectile.dead
        ));
        if (!target) {
          interceptor.dead = true;
          continue;
        }

        interceptor.life -= dt;
        if (interceptor.life <= 0) {
          target.antiAirReservedBy = null;
          interceptor.dead = true;
          continue;
        }

        interceptor.currentSpeed = Math.min(
          interceptor.maxSpeed,
          interceptor.currentSpeed + interceptor.acceleration * dt,
        );
        const dx = target.x - interceptor.x;
        const dy = target.y - interceptor.y;
        const distance = Math.hypot(dx, dy);
        const hitDistance = target.radius + interceptor.radius + 3;
        const travel = interceptor.currentSpeed * dt;
        if (distance <= hitDistance + travel) {
          interceptor.x = target.x;
          interceptor.y = target.y;
          interceptor.dead = true;
          target.dead = true;
          this.game.spawnExplosionEffect(target.x, target.y, 18, interceptor.color);
          continue;
        }

        const direction = normalize(dx, dy);
        interceptor.vx = direction.x * interceptor.currentSpeed;
        interceptor.vy = direction.y * interceptor.currentSpeed;
        interceptor.x += interceptor.vx * dt;
        interceptor.y += interceptor.vy * dt;
      }
    }

    updateEnemyProjectiles(projectiles, dt) {
      super.updateEnemyProjectiles(projectiles, dt);
      this.resolveDroneProjectileHits(projectiles);
      this.resolveAntiAirFootprintProjectileHits(projectiles);
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
            this.game.spawnDeathParticles(drone.x, drone.y, drone.radius);
          }
          break;
        }
      }
    }

    resolveAntiAirFootprintProjectileHits(projectiles) {
      const antiAirSoldiers = this.game.getSoldierPositions().filter((soldier) => (
        !soldier.unit.dead && soldier.unit.type === ANTI_AIR_TYPE
      ));
      for (const projectile of projectiles) {
        if (projectile.dead) continue;
        for (const soldier of antiAirSoldiers) {
          const unit = soldier.unit;
          if (this.damageInvulnerability.has(unit.id)) continue;
          const centers = soldier.footprintCenters ?? [{ x: soldier.x, y: soldier.y }];
          const hit = centers.some((center) => {
            const radius = projectile.radius + GAME_BALANCE.player.soldierRadius;
            return distanceSq(projectile.x, projectile.y, center.x, center.y) <= radius * radius;
          });
          if (!hit) continue;

          projectile.dead = true;
          unit.hitFlash = DAMAGE_FLASH_DURATION;
          const armor = typeof this.getUnitArmor === 'function' ? this.getUnitArmor(unit) : (unit.armor ?? 0);
          if (!this.game.debug?.infiniteHp) unit.hp = Math.max(0, unit.hp - projectile.damage * (1 - armor));
          this.damageInvulnerability.set(unit.id, DAMAGE_INVULNERABILITY_DURATION);
          if (!this.game.debug?.infiniteHp && unit.hp <= 0) this.game.killSquadUnit(soldier);
          break;
        }
      }
    }

    updateStandardEnemiesWithUnitArmor(enemies, dt) {
      super.updateStandardEnemiesWithUnitArmor(enemies, dt);
      const antiAirSoldiers = this.game.getSoldierPositions().filter((soldier) => (
        !soldier.unit.dead && soldier.unit.type === ANTI_AIR_TYPE
      ));

      for (const enemy of enemies) {
        if (enemy.dead) continue;
        for (const soldier of antiAirSoldiers) {
          const unit = soldier.unit;
          if (this.damageInvulnerability.has(unit.id)) continue;
          const centers = soldier.footprintCenters ?? [];
          const hit = centers.some((center) => {
            const radius = enemy.radius + GAME_BALANCE.player.soldierRadius;
            return distanceSq(enemy.x, enemy.y, center.x, center.y) <= radius * radius;
          });
          if (!hit) continue;

          const armor = typeof this.getUnitArmor === 'function' ? this.getUnitArmor(unit) : (unit.armor ?? 0);
          const damage = enemy.damage * (1 - armor) * DAMAGE_INVULNERABILITY_DURATION;
          unit.hitFlash = DAMAGE_FLASH_DURATION;
          if (!this.game.debug?.infiniteHp) unit.hp = Math.max(0, unit.hp - damage);
          this.damageInvulnerability.set(unit.id, DAMAGE_INVULNERABILITY_DURATION);
          if (!this.game.debug?.infiniteHp && unit.hp <= 0) this.game.killSquadUnit(soldier);
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

  ensureFormationHexes() {
    super.ensureFormationHexes();
    let guard = Math.max(2, this.player.squad.length * 3);
    while (guard > 0) {
      guard -= 1;
      const collision = footprintCollision(this.player.squad);
      if (!collision) break;
      const first = this.player.squad.find((unit) => unit.id === collision.firstId);
      const second = this.player.squad.find((unit) => unit.id === collision.secondId);
      const moving = second?.captainId ? first : second;
      if (!moving) break;
      moving.formationHex = findFreeFootprintSlot(this.player.squad, moving);
    }
  }

  getFormationPreview(unitId, targetHex) {
    this.ensureFormationHexes();
    const snapshot = snapshotFormation(this.player.squad);
    const targetKey = hexKey(targetHex);
    const occupant = this.player.squad.find((unit) => (
      unit.id !== unitId && hexKey(unit.formationHex) === targetKey
    ));
    const result = super.moveSquadUnitFormation(unitId, targetHex);
    const collision = footprintCollision(this.player.squad);
    restoreFormation(this.player.squad, snapshot);
    return {
      valid: Boolean(result?.ok && !collision),
      occupantId: occupant?.id ?? null,
      shiftedUnitIds: [],
    };
  }

  moveSquadUnitFormation(unitId, targetHex) {
    this.ensureFormationHexes();
    const snapshot = snapshotFormation(this.player.squad);
    const result = super.moveSquadUnitFormation(unitId, targetHex);
    if (!result?.ok) return result;
    if (!footprintCollision(this.player.squad)) return result;
    restoreFormation(this.player.squad, snapshot);
    return { ok: false, message: 'That move would overlap the Anti Air unit\'s two-hex footprint.' };
  }

  getSoldierPositions() {
    const positions = super.getSoldierPositions();
    const spacing = GAME_BALANCE.player.formationSpacing;
    for (const soldier of positions) {
      if (soldier.unit.type !== ANTI_AIR_TYPE) {
        soldier.footprintCenters = [{ x: soldier.x, y: soldier.y, hex: cloneHex(soldier.hex) }];
        continue;
      }
      const left = { x: soldier.x, y: soldier.y, hex: cloneHex(soldier.hex) };
      const right = {
        x: soldier.x + spacing,
        y: soldier.y,
        hex: { q: soldier.hex.q + 1, r: soldier.hex.r },
      };
      soldier.x = (left.x + right.x) / 2;
      soldier.y = (left.y + right.y) / 2;
      soldier.footprintCenters = [left, right];
    }
    return positions;
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
      help.textContent = 'Freeform formation: drag or tap units onto hexes. Anti Air occupies two horizontal hexes and is centered between them. Drones are battlefield entities and do not appear in the Squad Builder.';
    }
  }

  renderSquadStats(counts) {
    super.renderSquadStats(counts);
    const notes = [];
    if (counts[DRONE_PILOT_TYPE]) {
      const stats = getEffectiveUnitStats(DRONE_PILOT_TYPE, this.game?.unitModifiers);
      if (stats) notes.push(`Drone Pilot: ${stats.range.toFixed(0)} drone range • ${stats.fireRate.toFixed(2)}/s grenade rate • ${stats.blastRadius.toFixed(0)} stun radius • ${stats.stunDuration.toFixed(1)}s stun.`);
    }
    if (counts[ANTI_AIR_TYPE]) {
      const stats = getEffectiveUnitStats(ANTI_AIR_TYPE, this.game?.unitModifiers);
      if (stats) notes.push(`Anti Air: ${stats.range.toFixed(0)} intercept range • ${stats.fireRate.toFixed(2)}/s interceptor rate • ${stats.projectileSpeed.toFixed(0)} starting interceptor speed • two-hex footprint.`);
    }
    if (notes.length === 0) return;
    const note = document.createElement('div');
    note.textContent = notes.join('  ');
    Object.assign(note.style, {
      marginTop: '8px',
      color: '#8fa5bb',
      fontSize: '9px',
      fontWeight: '700',
    });
    this.squadBuilderSummary.append(note);
  }

  renderSquadBuilder() {
    super.renderSquadBuilder();
    const squad = this.squadBuilderHandlers?.getSquad?.() ?? [];
    for (const unit of squad) {
      if (unit.type !== ANTI_AIR_TYPE) continue;
      const card = this.squadBuilderGrid.querySelector(`[data-unit-id="${unit.id}"]`);
      if (!card) continue;
      const width = Number.parseFloat(card.style.width) || card.getBoundingClientRect().width || 80;
      card.style.marginLeft = `${width / 2}px`;
      card.style.width = `${width * 1.8}px`;
      card.setAttribute('aria-label', `${UNIT_CLASSES[ANTI_AIR_TYPE].label}, ${Math.ceil(unit.hp)} of ${unit.maxHp} health, occupies two horizontal hexes`);
    }
  }
}
