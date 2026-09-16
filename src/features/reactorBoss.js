import { Game as PreviousGame, UI as PreviousUI } from './cipherBoss.js';
import { REACTOR_BOSS } from '../data/bosses.js';
import { GAME_BALANCE, UNIT_CLASSES } from '../data/content.js';
import { STORMLANCER_TYPE } from '../data/stormlancer.js';
import { getUnitModifiers } from '../data/unitModifiers.js';
import { grantMetaUpgradePoints } from '../data/metaUpgrades.js';
import { distanceSq, normalize, randomRange } from '../utils/math.js';

const INTRO_PURGE_TIME = 0.45;
const INTRO_MESSAGE_TIME = 0.55;
const INTRO_SPAWN_TIME = 2.65;
const INTRO_SHAKE_DURATION = 0.4;
const SPAWN_LOCK_COOLDOWN = 1.25;
const THORNE_ID = 'thorne';
const TWO_PI = Math.PI * 2;

const REACTOR_SPRITE = Object.freeze({
  basePath: './assets/reactor',
  drawWidth: 158,
  drawHeight: 158,
  preserveAspect: true,
  smoothing: true,
  animations: {
    idle: { frames: ['idle_1.png'], fps: 1, loop: false },
  },
});

const CORE_LAYOUT = Object.freeze([
  Object.freeze({ id: 'red', angle: -Math.PI / 2 }),
  Object.freeze({ id: 'blue', angle: 0 }),
  Object.freeze({ id: 'green', angle: Math.PI / 2 }),
  Object.freeze({ id: 'yellow', angle: Math.PI }),
]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngle(angle) {
  let value = Number(angle) || 0;
  while (value > Math.PI) value -= TWO_PI;
  while (value < -Math.PI) value += TWO_PI;
  return value;
}

function effectiveTargetDistance(x, y, target) {
  return Math.max(
    0,
    Math.sqrt(distanceSq(x, y, target.x, target.y)) - (target.radius ?? 0),
  );
}

function firstSegmentCircleIntersection(startX, startY, endX, endY, centerX, centerY, radius) {
  const dx = endX - startX;
  const dy = endY - startY;
  const fx = startX - centerX;
  const fy = startY - centerY;
  const a = dx * dx + dy * dy;
  if (a <= 0.000001) return null;

  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;

  const root = Math.sqrt(discriminant);
  const candidates = [
    (-b - root) / (2 * a),
    (-b + root) / (2 * a),
  ].filter((value) => value >= 0 && value <= 1)
    .sort((left, right) => left - right);
  if (candidates.length === 0) return null;

  const t = candidates[0];
  return {
    x: startX + dx * t,
    y: startY + dy * t,
    t,
  };
}

function createReactorCombatSystem(ParentCombatSystem) {
  return class ReactorCombatSystem extends ParentCombatSystem {
    findNearestTarget(x, y, range) {
      let best = super.findNearestTarget(x, y, range);
      let bestDistance = best ? effectiveTargetDistance(x, y, best) : Infinity;

      for (const target of this.game.getReactorTargets?.() ?? []) {
        if (!target.targetable) continue;
        const targetDistance = effectiveTargetDistance(x, y, target);
        if (targetDistance > range + 8 || targetDistance >= bestDistance) continue;
        best = target;
        bestDistance = targetDistance;
      }
      return best;
    }

    updateProjectiles(dt) {
      const previousPositions = new Map();
      for (const projectile of this.game.entities.projectiles) {
        if (projectile.dead || projectile.hostile || !projectile.sourceType) continue;
        previousPositions.set(projectile.id, { x: projectile.x, y: projectile.y });
      }

      super.updateProjectiles(dt);

      const targets = this.game.getReactorTargets?.().filter((target) => target.targetable) ?? [];
      if (targets.length === 0) return;

      for (const projectile of this.game.entities.projectiles) {
        if (projectile.dead || projectile.hostile || !projectile.sourceType) continue;

        const previous = previousPositions.get(projectile.id) ?? {
          x: projectile.x - (projectile.vx ?? 0) * dt,
          y: projectile.y - (projectile.vy ?? 0) * dt,
        };
        let hitTarget = null;
        let hitPoint = null;

        for (const target of targets) {
          if (projectile.hitIds?.has(target.id)) continue;
          const hit = firstSegmentCircleIntersection(
            previous.x,
            previous.y,
            projectile.x,
            projectile.y,
            target.x,
            target.y,
            (target.radius ?? 0) + (projectile.radius ?? 0),
          );
          if (!hit || (hitPoint && hit.t >= hitPoint.t)) continue;
          hitTarget = target;
          hitPoint = hit;
        }

        if (!hitTarget || !hitPoint) continue;
        projectile.x = hitPoint.x;
        projectile.y = hitPoint.y;

        if (projectile.kind === 'rocket') {
          projectile.reactorImpact = true;
          this.explodeProjectile(projectile);
          continue;
        }

        projectile.hitIds?.add(hitTarget.id);
        this.game.damageReactorTarget(hitTarget, projectile.damage, hitPoint.x, hitPoint.y, {
          sourceType: projectile.sourceType,
        });
        projectile.pierce -= 1;
        if (projectile.pierce <= 0) projectile.dead = true;
      }
    }

    explodeProjectile(projectile) {
      if (!projectile?.dead) {
        const blastRadius = projectile.aoeRadius || (projectile.radius ?? 0) * 4;
        for (const target of this.game.getReactorTargets?.() ?? []) {
          if (!target.targetable) continue;
          const hitRadius = blastRadius + (target.radius ?? 0);
          if (distanceSq(projectile.x, projectile.y, target.x, target.y) > hitRadius ** 2) continue;
          this.game.damageReactorTarget(target, projectile.damage, projectile.x, projectile.y, {
            sourceType: projectile.sourceType,
            explosive: true,
          });
        }
      }
      super.explodeProjectile(projectile);
    }

    performShockbladeSlash(unit, attack) {
      if (unit?.type === STORMLANCER_TYPE && this.game.isReactorTarget?.(attack?.primaryTarget)) {
        this.performReactorStormlancerStrike(unit, attack);
        return;
      }

      super.performShockbladeSlash(unit, attack);
      if (!unit || unit.dead) return;

      const soldier = this.game.getSoldierPositions()
        .find((candidate) => candidate.unit.id === unit.id);
      if (!soldier) return;

      const weapon = this.getMeleeWeapon?.(unit) ?? UNIT_CLASSES[unit.type]?.weapon;
      if (!weapon || weapon.kind !== 'melee') return;

      const modifiers = getUnitModifiers(this.game.unitModifiers, unit.type);
      const statMultiplier = this.game.getTransformerStatMultiplier();
      const slashRadius = (weapon.aoeRadius ?? weapon.range)
        * modifiers.blastRadius
        * statMultiplier;
      const damage = weapon.damage * modifiers.damage * statMultiplier;
      const fullCircle = unit.captainId === THORNE_ID;

      for (const target of this.game.getReactorTargets?.() ?? []) {
        if (!target.targetable) continue;
        const dx = target.x - soldier.x;
        const dy = target.y - soldier.y;
        const distance = Math.hypot(dx, dy);
        if (distance > slashRadius + (target.radius ?? 0)) continue;

        if (!fullCircle && distance > 0.001) {
          const halfArc = (weapon.arcRadians ?? Math.PI) / 2;
          const facingDot = (dx * attack.direction.x + dy * attack.direction.y) / distance;
          if (facingDot < Math.cos(halfArc)) continue;
        }

        const result = this.game.damageReactorTarget(target, damage, target.x, target.y, {
          sourceType: unit.type,
          melee: true,
        });
        if (
          unit.captainId === THORNE_ID
          && weapon.lifesteal > 0
          && (result?.bodyDamage ?? result?.coreDamage ?? 0) > 0
        ) {
          unit.hp = Math.min(
            unit.maxHp,
            unit.hp + (result.bodyDamage ?? result.coreDamage) * weapon.lifesteal,
          );
          this.game.syncCaptainHealth();
        }
      }
    }

    performReactorStormlancerStrike(unit, attack) {
      const soldier = this.game.getSoldierPositions()
        .find((candidate) => candidate.unit.id === unit.id);
      const weapon = UNIT_CLASSES[STORMLANCER_TYPE]?.weapon;
      if (!soldier || !weapon) return;

      const modifiers = getUnitModifiers(this.game.unitModifiers, STORMLANCER_TYPE);
      const statMultiplier = this.game.getTransformerStatMultiplier();
      const strikeRange = weapon.range * modifiers.range * statMultiplier;
      const chainRange = (weapon.aoeRadius ?? 0) * modifiers.blastRadius * statMultiplier;
      const maxTargets = Math.max(1, Math.floor(weapon.chainTargets ?? 4));
      const falloff = clamp(weapon.chainDamageMultiplier ?? 0.82, 0, 1);
      let damage = weapon.damage * modifiers.damage * statMultiplier;
      let current = attack.primaryTarget;
      let source = { x: soldier.x, y: soldier.y };
      const visited = new Set();

      if (!this.game.isReactorTarget(current) || effectiveTargetDistance(source.x, source.y, current) > strikeRange) {
        current = this.findNearestReactorTarget(source.x, source.y, strikeRange, visited);
      }

      for (let bounce = 0; bounce < maxTargets && current; bounce += 1) {
        visited.add(current.id);
        const result = this.game.damageReactorTarget(current, damage, current.x, current.y, {
          sourceType: STORMLANCER_TYPE,
          melee: true,
        });
        if (!result) break;

        this.game.stormlancerArcs?.push({
          x1: source.x,
          y1: source.y,
          x2: current.x,
          y2: current.y,
          color: weapon.color ?? '#72e9ff',
          life: 0.18,
          maxLife: 0.18,
          seed: unit.id * 23 + bounce * 29 + this.game.elapsed * 7,
        });

        source = { x: current.x, y: current.y };
        damage *= falloff;
        current = this.findNearestReactorTarget(source.x, source.y, chainRange, visited);
      }
    }

    findNearestReactorTarget(x, y, range, visited) {
      let best = null;
      let bestDistance = Infinity;
      for (const target of this.game.getReactorTargets?.() ?? []) {
        if (!target.targetable || visited.has(target.id)) continue;
        const distance = effectiveTargetDistance(x, y, target);
        if (distance > range || distance >= bestDistance) continue;
        best = target;
        bestDistance = distance;
      }
      return best;
    }
  };
}

export class Game extends PreviousGame {
  constructor(...args) {
    super(...args);
    const ReactorCombatSystem = createReactorCombatSystem(this.combatSystem.constructor);
    this.combatSystem = new ReactorCombatSystem(this);
    this.combatSystem.reset();
  }

  resetState() {
    this.reactorBoss = null;
    this.reactorCores = [];
    this.reactorSpawned = false;
    this.reactorDefeated = false;
    this.reactorIntro = null;
    this.reactorSpawnLockActive = false;
    this.reactorPulses = [];
    this.reactorOverloadMarkers = [];
    this.reactorBeams = [];
    this.reactorVentWarnings = [];
    this.reactorLeakMarkers = [];
    super.resetState();
  }

  getActiveReactor() {
    return this.reactorBoss && !this.reactorBoss.removed ? this.reactorBoss : null;
  }

  isReactorSpawnLocked() {
    return Boolean(this.reactorIntro?.active || this.getActiveReactor());
  }

  getLivingReactorCores() {
    return this.reactorCores.filter((core) => !core.dead && core.targetable);
  }

  getReactorCore(coreId) {
    return this.reactorCores.find((core) => core.coreId === coreId) ?? null;
  }

  isReactorTarget(target) {
    const boss = this.getActiveReactor();
    return Boolean(
      target
      && (
        target === boss
        || this.reactorCores.includes(target)
      )
    );
  }

  getReactorTargets() {
    const boss = this.getActiveReactor();
    const targets = this.getLivingReactorCores();
    if (boss?.targetable) targets.push(boss);
    return targets;
  }

  isReactorCoreAlive(coreId) {
    const core = this.getReactorCore(coreId);
    return Boolean(core && !core.dead && core.hp > 0);
  }

  getReactorDestroyedCoreCount() {
    return this.reactorCores.filter((core) => core.dead).length;
  }

  getReactorBonuses() {
    const red = REACTOR_BOSS.cores.red;
    const blue = REACTOR_BOSS.cores.blue;
    const green = REACTOR_BOSS.cores.green;
    const yellow = REACTOR_BOSS.cores.yellow;
    return {
      damageMultiplier: this.isReactorCoreAlive('red') ? red.damageMultiplier : 1,
      explosionRadiusMultiplier: this.isReactorCoreAlive('red') ? red.explosionRadiusMultiplier : 1,
      bossDamageTakenMultiplier: this.isReactorCoreAlive('blue') ? blue.bossDamageTakenMultiplier : 1,
      regenPerSecond: this.isReactorCoreAlive('green') ? green.regenPerSecond : 0,
      attackIntervalMultiplier: this.isReactorCoreAlive('yellow') ? yellow.attackIntervalMultiplier : 1,
      projectileSpeedMultiplier: this.isReactorCoreAlive('yellow') ? yellow.projectileSpeedMultiplier : 1,
      beamRotationMultiplier: this.isReactorCoreAlive('yellow') ? yellow.beamRotationMultiplier : 1,
    };
  }

  update(dt) {
    const lockedBefore = this.isReactorSpawnLocked();
    if (lockedBefore) {
      this.spawnSystem.cooldown = Math.max(this.spawnSystem.cooldown, SPAWN_LOCK_COOLDOWN);
    }

    super.update(dt);
    if (this.pauseReasons.has('gameover')) return;

    this.updateReactorIntro(dt);
    if (
      !this.reactorSpawned
      && this.cipherDefeated
      && (this.player?.level ?? 1) >= REACTOR_BOSS.spawnLevel
    ) {
      this.beginReactorIntro();
    }

    this.updateReactor(dt);
    this.updateReactorHazards(dt);

    const lockedAfter = this.isReactorSpawnLocked();
    if (lockedAfter) {
      this.spawnSystem.cooldown = Math.max(this.spawnSystem.cooldown, SPAWN_LOCK_COOLDOWN);
    } else if (this.reactorSpawnLockActive) {
      this.spawnSystem.cooldown = 0.65;
    }
    this.reactorSpawnLockActive = lockedAfter;
  }

  beginReactorIntro() {
    if (this.reactorSpawned || this.reactorIntro?.active) return;
    this.reactorSpawned = true;
    this.reactorIntro = { active: true, elapsed: 0, purged: false };
    this.reactorSpawnLockActive = true;
    this.spawnSystem.cooldown = Math.max(this.spawnSystem.cooldown, SPAWN_LOCK_COOLDOWN);
  }

  updateReactorIntro(dt) {
    const intro = this.reactorIntro;
    if (!intro?.active) return;

    intro.elapsed += dt;
    if (!intro.purged && intro.elapsed >= INTRO_PURGE_TIME) {
      intro.purged = true;
      this.entities.enemies.length = 0;
      this.entities.projectiles.length = 0;
    }

    if (intro.elapsed < INTRO_SPAWN_TIME) return;
    intro.active = false;
    this.spawnReactor();
  }

  spawnReactor() {
    const angle = Math.random() * TWO_PI;
    const distance = 390;
    const x = this.player.x + Math.cos(angle) * distance;
    const y = this.player.y + Math.sin(angle) * distance;

    this.reactorBoss = {
      id: `boss-${REACTOR_BOSS.id}`,
      type: REACTOR_BOSS.id,
      isBoss: true,
      x,
      y,
      radius: REACTOR_BOSS.radius,
      maxHp: REACTOR_BOSS.maxHp,
      hp: REACTOR_BOSS.maxHp,
      hitFlash: 0,
      dead: false,
      removed: false,
      dying: false,
      targetable: true,
      critical: false,
      attackCooldown: 2.1,
      attackCycle: 0,
      environmentCooldown: REACTOR_BOSS.instability.baseEnvironmentInterval,
      deathElapsed: 0,
      deathNextSpark: 0,
      finalExplosionDone: false,
    };

    this.reactorCores = CORE_LAYOUT.map((slot) => {
      const config = REACTOR_BOSS.cores[slot.id];
      return {
        id: `reactor-core-${slot.id}`,
        type: 'reactor_core',
        coreId: slot.id,
        label: config.label,
        color: config.color,
        x: x + Math.cos(slot.angle) * REACTOR_BOSS.coreOrbitRadius,
        y: y + Math.sin(slot.angle) * REACTOR_BOSS.coreOrbitRadius,
        radius: config.radius,
        maxHp: config.hp,
        hp: config.hp,
        hitFlash: 0,
        targetable: true,
        dead: false,
      };
    });

    this.spawnExplosionEffect(x, y, 145, REACTOR_BOSS.colors.core);
  }

  updateReactor(dt) {
    const boss = this.getActiveReactor();
    if (!boss) return;

    boss.hitFlash = Math.max(0, boss.hitFlash - dt);
    for (const core of this.reactorCores) {
      core.hitFlash = Math.max(0, core.hitFlash - dt);
    }

    if (boss.dying) {
      this.updateReactorDeath(boss, dt);
      return;
    }

    const bonuses = this.getReactorBonuses();
    if (bonuses.regenPerSecond > 0 && boss.hp > 0 && boss.hp < boss.maxHp) {
      boss.hp = Math.min(boss.maxHp, boss.hp + bonuses.regenPerSecond * dt);
    }

    const destroyed = this.getReactorDestroyedCoreCount();
    if (destroyed >= 4 && !boss.critical) this.enterReactorCritical(boss);

    boss.attackCooldown = Math.max(0, boss.attackCooldown - dt);
    boss.environmentCooldown = Math.max(0, boss.environmentCooldown - dt);

    if (destroyed > 0 && boss.environmentCooldown <= 0) {
      this.startReactorLeak(boss, destroyed);
      const instability = REACTOR_BOSS.instability;
      boss.environmentCooldown = boss.critical
        ? instability.criticalEnvironmentInterval
        : Math.max(
          3.4,
          instability.baseEnvironmentInterval - destroyed * instability.perCoreDestroyedReduction,
        );
    }

    if (boss.attackCooldown > 0) return;
    this.selectReactorAttack(boss, destroyed);
    boss.attackCooldown = this.getReactorAttackInterval(boss, destroyed);
  }

  getReactorAttackInterval(boss, destroyed) {
    const instability = REACTOR_BOSS.instability;
    let interval = boss.critical
      ? instability.criticalAttackInterval
      : Math.max(
        1.9,
        instability.baseAttackInterval - destroyed * instability.perCoreDestroyedReduction,
      );
    interval *= this.getReactorBonuses().attackIntervalMultiplier;
    return interval + Math.random() * 0.28;
  }

  selectReactorAttack(boss, destroyed) {
    boss.attackCycle += 1;

    if (boss.critical) {
      const cycle = boss.attackCycle % 4;
      if (cycle === 0) {
        this.startReactorPulse(boss);
        this.startReactorOverload(boss, true);
      } else if (cycle === 1) {
        this.startReactorBarrage(boss, true);
      } else if (cycle === 2) {
        this.startReactorVent(boss, true);
      } else {
        this.startReactorPulse(boss);
      }
      return;
    }

    const livingCores = this.getLivingReactorCores();
    if (destroyed === 0) {
      const cycle = boss.attackCycle % 3;
      if (cycle === 0) this.startReactorPulse(boss);
      else if (cycle === 1) this.startReactorBarrage(boss, false);
      else this.startReactorCoreBeam(boss, livingCores);
      return;
    }

    if (destroyed === 1) {
      const cycle = boss.attackCycle % 4;
      if (cycle === 0) this.startReactorOverload(boss, false);
      else if (cycle === 1) this.startReactorPulse(boss);
      else if (cycle === 2) this.startReactorBarrage(boss, false);
      else this.startReactorCoreBeam(boss, livingCores);
      return;
    }

    if (destroyed === 2) {
      const cycle = boss.attackCycle % 4;
      if (cycle === 0) {
        this.startReactorCoreBeam(boss, livingCores);
        this.startReactorOverload(boss, false);
      } else if (cycle === 1) this.startReactorBarrage(boss, false);
      else if (cycle === 2) this.startReactorPulse(boss);
      else this.startReactorOverload(boss, false);
      return;
    }

    const cycle = boss.attackCycle % 4;
    if (cycle === 0) {
      this.startReactorVent(boss, false);
      this.startReactorOverload(boss, false);
    } else if (cycle === 1) this.startReactorPulse(boss);
    else if (cycle === 2) this.startReactorBarrage(boss, false);
    else this.startReactorCoreBeam(boss, livingCores);
  }

  startReactorPulse(boss) {
    const config = REACTOR_BOSS.attacks.pulse;
    this.reactorPulses.push({
      x: boss.x,
      y: boss.y,
      phase: 'warning',
      remaining: config.warningDuration,
      radius: config.startRadius,
      previousRadius: config.startRadius,
      hitIds: new Set(),
    });
  }

  startReactorBarrage(boss, critical) {
    const config = REACTOR_BOSS.attacks.barrage;
    const bonuses = this.getReactorBonuses();
    const count = critical ? config.criticalCount : config.count;
    const target = { x: this.player.x, y: this.player.y };
    const base = Math.atan2(target.y - boss.y, target.x - boss.x);

    for (let index = 0; index < count; index += 1) {
      const centered = count <= 1 ? 0 : index / (count - 1) - 0.5;
      const angle = base + centered * config.spreadRadians;
      const speed = config.projectileSpeed * bonuses.projectileSpeedMultiplier;
      this.entities.projectiles.push({
        id: this.entities.createId(),
        kind: 'enemy-shot',
        hostile: true,
        sourceType: REACTOR_BOSS.id,
        x: boss.x + Math.cos(angle) * (boss.radius + 16),
        y: boss.y + Math.sin(angle) * (boss.radius + 16),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: config.projectileRadius,
        damage: config.damage * bonuses.damageMultiplier,
        life: config.projectileLife,
        color: REACTOR_BOSS.colors.projectile,
        dead: false,
      });
    }
  }

  startReactorOverload(boss, critical) {
    const config = REACTOR_BOSS.attacks.overload;
    const bonuses = this.getReactorBonuses();
    const destroyed = this.getReactorDestroyedCoreCount();
    let count = critical
      ? config.criticalCount
      : destroyed >= 2
        ? config.unstableCount
        : config.count;
    if (!this.isReactorCoreAlive('red')) count = Math.max(3, count - 1);

    const baseAngle = Math.random() * TWO_PI;
    for (let index = 0; index < count; index += 1) {
      const ring = index % 3 === 0 ? randomRange(90, 160) : randomRange(180, 420);
      const angle = baseAngle + (TWO_PI * index) / count + randomRange(-0.24, 0.24);
      this.reactorOverloadMarkers.push({
        x: this.player.x + Math.cos(angle) * ring,
        y: this.player.y + Math.sin(angle) * ring,
        radius: config.radius * bonuses.explosionRadiusMultiplier,
        remaining: config.warningDuration,
        maxWarning: config.warningDuration,
        damage: config.damage * bonuses.damageMultiplier,
        exploded: false,
      });
    }
  }

  startReactorCoreBeam(boss, livingCores = this.getLivingReactorCores()) {
    if (livingCores.length === 0) {
      this.startReactorPulse(boss);
      return;
    }
    const core = livingCores[Math.floor(Math.random() * livingCores.length)];
    const config = REACTOR_BOSS.attacks.beam;
    this.reactorBeams.push({
      coreId: core.coreId,
      phase: 'warning',
      remaining: config.warningDuration,
      angle: Math.atan2(core.y - boss.y, core.x - boss.x),
      nextDamageAt: 0,
    });
  }

  startReactorVent(boss, critical) {
    const config = REACTOR_BOSS.attacks.vent;
    const rayCount = config.rayCount + (critical ? 2 : 0);
    const startAngle = Math.random() * TWO_PI;
    const gapStart = Math.floor(Math.random() * rayCount);
    const gapIndices = new Set();
    for (let index = 0; index < config.gapCount; index += 1) {
      gapIndices.add((gapStart + index) % rayCount);
    }

    this.reactorVentWarnings.push({
      x: boss.x,
      y: boss.y,
      remaining: config.warningDuration,
      maxWarning: config.warningDuration,
      rayCount,
      startAngle,
      gapIndices,
      critical,
    });
  }

  startReactorLeak(boss, destroyed) {
    const config = REACTOR_BOSS.attacks.leak;
    const count = boss.critical ? 3 : Math.min(3, 1 + Math.floor(destroyed / 2));
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * TWO_PI;
      const distance = randomRange(120, 430);
      this.reactorLeakMarkers.push({
        x: this.player.x + Math.cos(angle) * distance,
        y: this.player.y + Math.sin(angle) * distance,
        radius: config.radius,
        remaining: config.warningDuration,
        maxWarning: config.warningDuration,
        exploded: false,
      });
    }
  }

  updateReactorHazards(dt) {
    this.updateReactorPulses(dt);
    this.updateReactorOverload(dt);
    this.updateReactorBeams(dt);
    this.updateReactorVentWarnings(dt);
    this.updateReactorLeaks(dt);
  }

  updateReactorPulses(dt) {
    const config = REACTOR_BOSS.attacks.pulse;
    const bonuses = this.getReactorBonuses();
    for (const pulse of this.reactorPulses) {
      pulse.remaining -= dt;
      if (pulse.phase === 'warning') {
        if (pulse.remaining <= 0) {
          pulse.phase = 'active';
          pulse.remaining = 10;
        }
        continue;
      }

      pulse.previousRadius = pulse.radius;
      pulse.radius += config.speed * dt;
      for (const soldier of this.getSoldierPositions()) {
        if (soldier.unit.dead || pulse.hitIds.has(soldier.unit.id)) continue;
        const distance = Math.hypot(soldier.x - pulse.x, soldier.y - pulse.y);
        const minRadius = pulse.previousRadius - config.width;
        const maxRadius = pulse.radius + config.width;
        if (distance < minRadius || distance > maxRadius) continue;
        pulse.hitIds.add(soldier.unit.id);
        this.damageSquadUnitFromBoss(soldier, config.damage * bonuses.damageMultiplier);
      }
      if (pulse.radius > config.maxRadius) pulse.remaining = 0;
    }
    this.reactorPulses = this.reactorPulses.filter((pulse) => pulse.remaining > 0);
  }

  updateReactorOverload(dt) {
    for (const marker of this.reactorOverloadMarkers) {
      marker.remaining -= dt;
      if (marker.remaining > 0 || marker.exploded) continue;
      marker.exploded = true;
      for (const soldier of this.getSoldierPositions()) {
        if (soldier.unit.dead) continue;
        const hitRadius = marker.radius + GAME_BALANCE.player.soldierRadius;
        if (distanceSq(marker.x, marker.y, soldier.x, soldier.y) > hitRadius ** 2) continue;
        this.damageSquadUnitFromBoss(soldier, marker.damage);
      }
      this.spawnExplosionEffect(marker.x, marker.y, marker.radius, REACTOR_BOSS.colors.warning);
    }
    this.reactorOverloadMarkers = this.reactorOverloadMarkers.filter((marker) => !marker.exploded);
  }

  updateReactorBeams(dt) {
    const config = REACTOR_BOSS.attacks.beam;
    const bonuses = this.getReactorBonuses();
    const boss = this.getActiveReactor();
    for (const beam of this.reactorBeams) {
      beam.remaining -= dt;
      if (!boss || boss.dying) {
        beam.remaining = 0;
        continue;
      }
      const core = this.getReactorCore(beam.coreId);
      if (!core || core.dead) {
        beam.remaining = 0;
        continue;
      }

      if (beam.phase === 'warning') {
        if (beam.remaining <= 0) {
          beam.phase = 'active';
          beam.remaining = config.duration;
          beam.nextDamageAt = 0;
        }
        continue;
      }

      beam.angle = normalizeAngle(
        beam.angle + config.angularSpeed * bonuses.beamRotationMultiplier * dt,
      );
      beam.nextDamageAt -= dt;
      if (beam.nextDamageAt > 0) continue;
      beam.nextDamageAt = config.damageInterval;

      for (const soldier of this.getSoldierPositions()) {
        if (soldier.unit.dead) continue;
        const dx = soldier.x - boss.x;
        const dy = soldier.y - boss.y;
        const distance = Math.hypot(dx, dy);
        if (distance > 790) continue;
        const delta = Math.abs(normalizeAngle(Math.atan2(dy, dx) - beam.angle));
        if (delta > config.halfWidth) continue;
        this.damageSquadUnitFromBoss(soldier, config.damage * bonuses.damageMultiplier);
      }
    }
    this.reactorBeams = this.reactorBeams.filter((beam) => beam.remaining > 0);
  }

  updateReactorVentWarnings(dt) {
    const config = REACTOR_BOSS.attacks.vent;
    const bonuses = this.getReactorBonuses();
    for (const vent of this.reactorVentWarnings) {
      vent.remaining -= dt;
      if (vent.remaining > 0 || vent.spawned) continue;
      vent.spawned = true;

      for (let index = 0; index < vent.rayCount; index += 1) {
        if (vent.gapIndices.has(index)) continue;
        const angle = vent.startAngle + (TWO_PI * index) / vent.rayCount;
        const speed = config.projectileSpeed * bonuses.projectileSpeedMultiplier;
        this.entities.projectiles.push({
          id: this.entities.createId(),
          kind: 'enemy-shot',
          hostile: true,
          sourceType: REACTOR_BOSS.id,
          x: vent.x + Math.cos(angle) * 92,
          y: vent.y + Math.sin(angle) * 92,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: config.projectileRadius,
          damage: config.damage * bonuses.damageMultiplier,
          life: config.projectileLife,
          color: REACTOR_BOSS.colors.critical,
          dead: false,
        });
      }
    }
    this.reactorVentWarnings = this.reactorVentWarnings.filter((vent) => !vent.spawned);
  }

  updateReactorLeaks(dt) {
    const config = REACTOR_BOSS.attacks.leak;
    const bonuses = this.getReactorBonuses();
    for (const marker of this.reactorLeakMarkers) {
      marker.remaining -= dt;
      if (marker.remaining > 0 || marker.exploded) continue;
      marker.exploded = true;
      const radius = marker.radius * bonuses.explosionRadiusMultiplier;
      for (const soldier of this.getSoldierPositions()) {
        if (soldier.unit.dead) continue;
        const hitRadius = radius + GAME_BALANCE.player.soldierRadius;
        if (distanceSq(marker.x, marker.y, soldier.x, soldier.y) > hitRadius ** 2) continue;
        this.damageSquadUnitFromBoss(soldier, config.damage * bonuses.damageMultiplier);
      }
      this.spawnExplosionEffect(marker.x, marker.y, radius, REACTOR_BOSS.colors.critical);
    }
    this.reactorLeakMarkers = this.reactorLeakMarkers.filter((marker) => !marker.exploded);
  }

  clearReactorHazards() {
    this.reactorPulses = [];
    this.reactorOverloadMarkers = [];
    this.reactorBeams = [];
    this.reactorVentWarnings = [];
    this.reactorLeakMarkers = [];
    for (const projectile of this.entities.projectiles) {
      if (projectile.sourceType === REACTOR_BOSS.id) projectile.dead = true;
    }
  }

  enterReactorCritical(boss) {
    if (!boss || boss.critical) return;
    boss.critical = true;
    boss.attackCooldown = 0.75;
    boss.environmentCooldown = 1.3;
    this.clearReactorHazards();
    this.spawnExplosionEffect(boss.x, boss.y, 190, REACTOR_BOSS.colors.critical);
    this.setCipherBanner?.('REACTOR CRITICAL', 2.1);
  }

  damageReactorTarget(target, amount, hitX, hitY, options = {}) {
    if (!this.isReactorTarget(target) || !target.targetable) return null;
    if (target === this.getActiveReactor()) {
      return this.damageReactor(amount, hitX, hitY, options);
    }
    return this.damageReactorCore(target, amount, hitX, hitY, options);
  }

  damageReactor(amount, hitX, hitY, options = {}) {
    const boss = this.getActiveReactor();
    if (!boss || boss.dying || !boss.targetable || !Number.isFinite(amount) || amount <= 0) return null;

    const multiplier = this.getReactorBonuses().bossDamageTakenMultiplier;
    const bodyDamage = amount * multiplier;
    boss.hp = Math.max(0, boss.hp - bodyDamage);
    boss.hitFlash = 0.11;
    this.spawnHitParticles(hitX, hitY);

    if (boss.hp <= 0) this.beginReactorDeath(boss);
    return { bodyDamage, damageMultiplier: multiplier, sourceType: options.sourceType ?? null };
  }

  damageReactorCore(core, amount, hitX, hitY) {
    if (!core || core.dead || !core.targetable || !Number.isFinite(amount) || amount <= 0) return null;
    const coreDamage = Math.min(core.hp, amount);
    core.hp = Math.max(0, core.hp - amount);
    core.hitFlash = 0.12;
    this.spawnHitParticles(hitX, hitY);
    if (core.hp <= 0) this.destroyReactorCore(core);
    return { coreDamage, coreId: core.coreId };
  }

  destroyReactorCore(core) {
    if (!core || core.dead) return;
    core.dead = true;
    core.targetable = false;
    core.hp = 0;
    this.spawnExplosionEffect(core.x, core.y, 105, core.color);

    const destroyed = this.getReactorDestroyedCoreCount();
    const boss = this.getActiveReactor();
    if (boss && !boss.dying) {
      boss.attackCooldown = Math.min(boss.attackCooldown, 1.05);
      boss.environmentCooldown = Math.min(boss.environmentCooldown, 2.2);
    }

    this.setCipherBanner?.(`${core.label} DISABLED`, 1.15);
    if (destroyed >= 4 && boss) this.enterReactorCritical(boss);
  }

  beginReactorDeath(boss) {
    if (!boss || boss.dying) return;
    boss.hp = 0;
    boss.dying = true;
    boss.targetable = false;
    boss.deathElapsed = 0;
    boss.deathNextSpark = 0;
    boss.finalExplosionDone = false;
    this.clearReactorHazards();
    this.setCipherBanner?.('REACTOR FAILURE', 1.5);
  }

  updateReactorDeath(boss, dt) {
    const config = REACTOR_BOSS.death;
    boss.deathElapsed += dt;

    while (boss.deathElapsed >= boss.deathNextSpark && boss.deathNextSpark < config.finalExplosionAt) {
      boss.deathNextSpark += config.sparkInterval;
      const points = [
        ...this.reactorCores.map((core) => ({ x: core.x, y: core.y, color: core.color })),
        { x: boss.x, y: boss.y, color: REACTOR_BOSS.colors.critical },
      ];
      const point = points[Math.floor(Math.random() * points.length)];
      this.spawnExplosionEffect(
        point.x + randomRange(-26, 26),
        point.y + randomRange(-26, 26),
        randomRange(42, 78),
        point.color,
      );
    }

    if (!boss.finalExplosionDone && boss.deathElapsed >= config.finalExplosionAt) {
      boss.finalExplosionDone = true;
      this.spawnExplosionEffect(boss.x, boss.y, 280, REACTOR_BOSS.colors.core);
      this.spawnExplosionEffect(boss.x, boss.y, 210, REACTOR_BOSS.colors.critical);
    }

    if (boss.deathElapsed < config.duration) return;
    boss.removed = true;
    boss.dead = true;
    this.reactorDefeated = true;
    this.kills += 1;
    this.setCipherBanner?.('REACTOR DESTROYED', 1.6);

    const amount = Math.max(
      0,
      Math.floor(Number(REACTOR_BOSS.permanentUpgradePoints) || 0),
    );
    if (amount > 0) {
      const state = grantMetaUpgradePoints(amount);
      this.ui.renderMetaUpgradeTree?.();
      this.ui.showPermanentUpgradePointReward?.(
        amount,
        state.totalPoints,
        REACTOR_BOSS.name.toUpperCase(),
      );
    }
  }

  drawEnemies(ctx) {
    super.drawEnemies(ctx);
    const boss = this.getActiveReactor();
    if (!boss) return;
    this.drawReactorCores(ctx, boss);
    this.drawReactor(ctx, boss);
  }

  drawReactor(ctx, boss) {
    const colors = REACTOR_BOSS.colors;
    const pulse = (Math.sin(this.animationClock * (boss.critical ? 10 : 5)) + 1) * 0.5;
    const drawn = this.animationRenderer.draw(
      ctx,
      REACTOR_SPRITE,
      'idle',
      0,
      boss.x,
      boss.y,
      { alpha: boss.dying ? 0.82 : 1, strictAnimation: true },
    );

    if (!drawn) {
      ctx.save();
      ctx.translate(boss.x, boss.y);
      ctx.rotate(this.animationClock * 0.14);
      ctx.shadowBlur = boss.hitFlash > 0 ? 30 : 20;
      ctx.shadowColor = boss.hitFlash > 0 ? '#ffffff' : colors.core;
      ctx.fillStyle = boss.hitFlash > 0 ? '#ffffff' : colors.shell;
      ctx.strokeStyle = colors.shellEdge;
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (let index = 0; index < 12; index += 1) {
        const angle = (TWO_PI * index) / 12;
        const radius = index % 2 === 0 ? 72 : 58;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.rotate(-this.animationClock * 0.32);
      ctx.fillStyle = boss.critical ? colors.critical : colors.core;
      ctx.shadowColor = boss.critical ? colors.critical : colors.core;
      ctx.shadowBlur = 20 + pulse * 16;
      ctx.beginPath();
      ctx.arc(0, 0, 17 + pulse * 4, 0, TWO_PI);
      ctx.fill();
      ctx.restore();
    }

    if (this.isReactorCoreAlive('blue')) {
      ctx.save();
      ctx.translate(boss.x, boss.y);
      ctx.strokeStyle = REACTOR_BOSS.cores.blue.color;
      ctx.shadowColor = REACTOR_BOSS.cores.blue.color;
      ctx.shadowBlur = 22;
      ctx.lineWidth = 5;
      ctx.globalAlpha = 0.42 + pulse * 0.28;
      ctx.setLineDash([24, 12]);
      ctx.beginPath();
      ctx.arc(0, 0, boss.radius + 25, 0, TWO_PI);
      ctx.stroke();
      ctx.restore();
    }

    if (boss.critical && !boss.dying) {
      ctx.save();
      ctx.translate(boss.x, boss.y);
      ctx.strokeStyle = colors.critical;
      ctx.shadowColor = colors.critical;
      ctx.shadowBlur = 26;
      ctx.lineWidth = 3 + pulse * 3;
      ctx.globalAlpha = 0.48 + pulse * 0.36;
      for (let index = 0; index < 6; index += 1) {
        const angle = index * (TWO_PI / 6) + this.animationClock * 0.7;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * 26, Math.sin(angle) * 26);
        ctx.lineTo(Math.cos(angle) * (95 + pulse * 22), Math.sin(angle) * (95 + pulse * 22));
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  drawReactorCores(ctx, boss) {
    for (const core of this.reactorCores) {
      if (core.dead && !boss.dying) continue;
      const hpRatio = core.maxHp > 0 ? clamp(core.hp / core.maxHp, 0, 1) : 0;
      const pulse = (Math.sin(this.animationClock * 7 + core.x * 0.01) + 1) * 0.5;

      ctx.save();
      ctx.translate(core.x, core.y);
      ctx.globalAlpha = core.dead ? 0.24 : 1;
      ctx.shadowBlur = core.dead ? 5 : 18 + pulse * 10;
      ctx.shadowColor = core.color;
      ctx.fillStyle = core.hitFlash > 0 ? '#ffffff' : `${core.color}55`;
      ctx.strokeStyle = core.hitFlash > 0 ? '#ffffff' : core.color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (let index = 0; index < 6; index += 1) {
        const angle = -Math.PI / 2 + index * Math.PI / 3;
        const x = Math.cos(angle) * core.radius;
        const y = Math.sin(angle) * core.radius;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = core.color;
      ctx.beginPath();
      ctx.arc(0, 0, 10 + pulse * 3, 0, TWO_PI);
      ctx.fill();
      ctx.restore();

      if (core.dead) continue;
      const barWidth = 86;
      const barY = core.y - core.radius - 24;
      ctx.save();
      ctx.fillStyle = 'rgba(6,10,16,.82)';
      ctx.fillRect(core.x - barWidth / 2, barY, barWidth, 8);
      ctx.fillStyle = core.color;
      ctx.fillRect(core.x - barWidth / 2 + 1, barY + 1, (barWidth - 2) * hpRatio, 6);
      ctx.strokeStyle = 'rgba(255,255,255,.26)';
      ctx.strokeRect(core.x - barWidth / 2, barY, barWidth, 8);
      ctx.fillStyle = '#f3f7fb';
      ctx.font = '900 9px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(core.label, core.x, barY - 5);
      ctx.restore();
    }
  }

  drawEffects(ctx) {
    super.drawEffects(ctx);
    const boss = this.getActiveReactor();
    if (!boss) return;
    this.drawReactorConnections(ctx, boss);
    this.drawReactorHazards(ctx, boss);
  }

  drawReactorConnections(ctx, boss) {
    for (const core of this.reactorCores) {
      if (core.dead) continue;
      const pulse = (Math.sin(this.animationClock * 6 + core.x * 0.01) + 1) * 0.5;
      ctx.save();
      ctx.strokeStyle = core.color;
      ctx.shadowColor = core.color;
      ctx.shadowBlur = 12 + pulse * 12;
      ctx.globalAlpha = 0.42 + pulse * 0.34;
      ctx.lineWidth = 3 + pulse * 2;
      ctx.setLineDash([16, 11]);
      ctx.beginPath();
      ctx.moveTo(core.x, core.y);
      ctx.lineTo(boss.x, boss.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawReactorHazards(ctx, boss) {
    const pulseConfig = REACTOR_BOSS.attacks.pulse;
    for (const pulse of this.reactorPulses) {
      ctx.save();
      ctx.strokeStyle = REACTOR_BOSS.colors.pulse;
      ctx.shadowColor = REACTOR_BOSS.colors.pulse;
      ctx.shadowBlur = pulse.phase === 'warning' ? 8 : 20;
      ctx.globalAlpha = pulse.phase === 'warning' ? 0.45 : 0.78;
      ctx.lineWidth = pulse.phase === 'warning' ? 4 : pulseConfig.width;
      if (pulse.phase === 'warning') ctx.setLineDash([16, 10]);
      ctx.beginPath();
      ctx.arc(pulse.x, pulse.y, pulse.radius, 0, TWO_PI);
      ctx.stroke();
      ctx.restore();
    }

    for (const marker of [...this.reactorOverloadMarkers, ...this.reactorLeakMarkers]) {
      const progress = 1 - clamp(marker.remaining / marker.maxWarning, 0, 1);
      ctx.save();
      ctx.fillStyle = `rgba(255,53,93,${0.04 + progress * 0.11})`;
      ctx.strokeStyle = REACTOR_BOSS.colors.warning;
      ctx.lineWidth = 2 + progress * 3;
      ctx.setLineDash([10, 7]);
      ctx.beginPath();
      ctx.arc(marker.x, marker.y, marker.radius, 0, TWO_PI);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    for (const beam of this.reactorBeams) {
      const core = this.getReactorCore(beam.coreId);
      if (!core || core.dead) continue;
      ctx.save();
      ctx.strokeStyle = core.color;
      ctx.shadowColor = core.color;
      ctx.shadowBlur = beam.phase === 'warning' ? 10 : 24;
      ctx.globalAlpha = beam.phase === 'warning' ? 0.48 : 0.82;
      ctx.lineWidth = beam.phase === 'warning' ? 4 : 15;
      if (beam.phase === 'warning') ctx.setLineDash([18, 12]);
      ctx.beginPath();
      ctx.moveTo(core.x, core.y);
      ctx.lineTo(boss.x, boss.y);
      ctx.stroke();
      ctx.translate(boss.x, boss.y);
      ctx.rotate(beam.angle);
      ctx.beginPath();
      ctx.moveTo(boss.radius + 5, 0);
      ctx.lineTo(800, 0);
      ctx.stroke();
      ctx.restore();
    }

    for (const vent of this.reactorVentWarnings) {
      const alpha = clamp(vent.remaining / vent.maxWarning, 0, 1);
      ctx.save();
      ctx.translate(vent.x, vent.y);
      ctx.strokeStyle = REACTOR_BOSS.colors.critical;
      ctx.shadowColor = REACTOR_BOSS.colors.critical;
      ctx.shadowBlur = 12;
      ctx.globalAlpha = 0.75 - alpha * 0.3;
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 8]);
      for (let index = 0; index < vent.rayCount; index += 1) {
        if (vent.gapIndices.has(index)) continue;
        const angle = vent.startAngle + (TWO_PI * index) / vent.rayCount;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * 88, Math.sin(angle) * 88);
        ctx.lineTo(Math.cos(angle) * 250, Math.sin(angle) * 250);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}

export class UI extends PreviousUI {
  update(game) {
    super.update(game);

    const intro = game.reactorIntro;
    const introActive = Boolean(intro?.active);
    const introElapsed = intro?.elapsed ?? 0;
    const showArrival = introActive
      && introElapsed >= INTRO_MESSAGE_TIME
      && introElapsed < INTRO_SPAWN_TIME;

    if (this.bossArrivalNotice) {
      if (introActive) {
        this.bossArrivalNotice.textContent = `${REACTOR_BOSS.name} has arrived`;
        this.bossArrivalNotice.style.opacity = showArrival ? '1' : '0';
        this.bossArrivalNotice.style.transform = showArrival ? 'scale(1)' : 'scale(.9)';
      } else if (!game.wardenIntro?.active && !game.broodIntro?.active && !game.cipherIntro?.active) {
        this.bossArrivalNotice.style.opacity = '0';
        this.bossArrivalNotice.style.transform = 'scale(.9)';
      }
    }

    if (this.gameCanvas && introActive) {
      if (introElapsed < INTRO_SHAKE_DURATION) {
        const strength = 11 * (1 - introElapsed / INTRO_SHAKE_DURATION);
        this.gameCanvas.style.transform = `translate(${(Math.random() - 0.5) * strength * 2}px, ${(Math.random() - 0.5) * strength * 2}px) scale(1.01)`;
      } else {
        this.gameCanvas.style.transform = '';
      }
    }

    const boss = game.getActiveReactor?.();
    if (!boss || !this.wardenHud) return;

    const hpRatio = clamp(boss.hp / boss.maxHp, 0, 1);
    const name = this.wardenHud.querySelector('.boss-hud__name');
    if (name) name.textContent = 'THE REACTOR';

    const destroyed = game.getReactorDestroyedCoreCount?.() ?? 0;
    let stateLabel = `INSTABILITY ${destroyed}/4`;
    if (boss.critical) stateLabel = 'REACTOR CRITICAL';
    if (boss.dying) stateLabel = 'CORE FAILURE';

    this.wardenHud.classList.add('boss-hud--visible');
    this.wardenHud.classList.toggle('boss-hud--enraged', boss.critical || boss.dying);
    this.wardenFill.style.width = `${hpRatio * 100}%`;
    this.wardenState.textContent = stateLabel;
    this.wardenHp.textContent = boss.dying
      ? 'CRITICAL FAILURE'
      : `${Math.ceil(boss.hp)} / ${boss.maxHp}`;

    const shortLabels = {
      red: 'RED DMG',
      blue: 'BLUE DEF',
      green: 'GREEN REGEN',
      yellow: 'YELLOW SPEED',
    };
    this.wardenArmor.textContent = CORE_LAYOUT
      .map(({ id }) => `${shortLabels[id]} ${game.isReactorCoreAlive(id) ? 'ON' : 'OFF'}`)
      .join(' • ');
  }
}
