import { Game as PreviousGame, UI as PreviousUI } from './wardenChargeAndAntiAirFixes.js';
import { BROODMOTHER_BOSS } from '../data/bosses.js';
import { ENEMY_TYPES, GAME_BALANCE, UNIT_CLASSES } from '../data/content.js';
import { getUnitModifiers } from '../data/unitModifiers.js';
import { grantMetaUpgradePoints } from '../data/metaUpgrades.js';
import { distanceSq, normalize, randomRange } from '../utils/math.js';

const BOSS_TARGET_PADDING = 8;
const INTRO_PURGE_TIME = 0.45;
const INTRO_MESSAGE_TIME = 0.55;
const INTRO_SPAWN_TIME = 2.65;
const INTRO_SHAKE_DURATION = 0.4;
const SPAWN_LOCK_COOLDOWN = 1.25;
const THORNE_ID = 'thorne';
const SHOCKBLADE_TYPE = 'shockblade';

const BROODMOTHER_SPRITE = Object.freeze({
  basePath: './assets/broodmother',
  drawWidth: 150,
  drawHeight: 150,
  preserveAspect: true,
  smoothing: true,
  animations: {
    idle: { frames: ['idle_1.png'], fps: 1, loop: false },
  },
});

const EGG_SPRITE = Object.freeze({
  basePath: './assets/broodmother/eggs',
  drawWidth: 48,
  drawHeight: 48,
  preserveAspect: true,
  smoothing: true,
  animations: {
    idle: { frames: ['egg_1.png'], fps: 1, loop: false },
  },
});

const ELITE_EGG_SPRITE = Object.freeze({
  ...EGG_SPRITE,
  drawWidth: 62,
  drawHeight: 62,
  animations: {
    idle: { frames: ['elite_egg_1.png'], fps: 1, loop: false },
  },
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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
  const t1 = (-b - root) / (2 * a);
  const t2 = (-b + root) / (2 * a);
  const candidates = [t1, t2]
    .filter((value) => value >= 0 && value <= 1)
    .sort((left, right) => left - right);
  if (candidates.length === 0) return null;

  const t = candidates[0];
  return {
    x: startX + dx * t,
    y: startY + dy * t,
    t,
  };
}

function effectiveTargetDistance(x, y, target) {
  return Math.max(
    0,
    Math.sqrt(distanceSq(x, y, target.x, target.y)) - (target.radius ?? 0),
  );
}

function createBroodmotherCombatSystem(ParentCombatSystem) {
  return class BroodmotherCombatSystem extends ParentCombatSystem {
    findNearestTarget(x, y, range) {
      let best = super.findNearestTarget(x, y, range);
      let bestDistance = best ? effectiveTargetDistance(x, y, best) : Infinity;

      const boss = this.game.getActiveBroodmother?.();
      if (boss?.targetable !== false) {
        const bossDistance = effectiveTargetDistance(x, y, boss);
        if (bossDistance <= range + BOSS_TARGET_PADDING && bossDistance < bestDistance) {
          best = boss;
          bestDistance = bossDistance;
        }
      }

      for (const egg of this.game.broodEggs ?? []) {
        if (egg.dead) continue;
        const eggDistance = effectiveTargetDistance(x, y, egg);
        if (eggDistance > range + BOSS_TARGET_PADDING || eggDistance >= bestDistance) continue;
        best = egg;
        bestDistance = eggDistance;
      }

      return best;
    }

    updateProjectiles(dt) {
      const game = this.game;
      const previousPositions = new Map();
      for (const projectile of game.entities.projectiles) {
        if (
          projectile.dead
          || projectile.hostile
          || projectile.antiAirInterceptor
          || !projectile.sourceType
        ) continue;
        previousPositions.set(projectile.id, { x: projectile.x, y: projectile.y });
      }

      super.updateProjectiles(dt);

      const boss = game.getActiveBroodmother?.();
      const hasEggs = (game.broodEggs ?? []).some((egg) => !egg.dead);
      if (!boss && !hasEggs) return;

      for (const projectile of game.entities.projectiles) {
        if (
          projectile.dead
          || projectile.hostile
          || projectile.antiAirInterceptor
          || !projectile.sourceType
        ) continue;

        const previous = previousPositions.get(projectile.id) ?? {
          x: projectile.x - projectile.vx * dt,
          y: projectile.y - projectile.vy * dt,
        };
        const collision = this.findFirstBroodCollision(projectile, previous, boss);
        if (!collision) continue;

        projectile.x = collision.x;
        projectile.y = collision.y;

        if (projectile.kind === 'rocket') {
          this.explodeProjectile(projectile);
          continue;
        }

        if (collision.kind === 'egg') {
          if (!(projectile.broodHitIds instanceof Set)) projectile.broodHitIds = new Set();
          projectile.broodHitIds.add(collision.target.id);
          game.damageBroodEgg(collision.target, projectile.damage, collision.x, collision.y);
        } else {
          projectile.broodmotherHit = true;
          game.damageBroodmother(projectile.damage, collision.x, collision.y);
        }

        projectile.pierce -= 1;
        if (projectile.pierce <= 0) projectile.dead = true;
      }
    }

    findFirstBroodCollision(projectile, previous, boss) {
      let best = null;
      const projectileRadius = projectile.radius ?? 0;
      const broodHitIds = projectile.broodHitIds instanceof Set
        ? projectile.broodHitIds
        : new Set();

      for (const egg of this.game.broodEggs ?? []) {
        if (egg.dead || broodHitIds.has(egg.id)) continue;
        const hit = firstSegmentCircleIntersection(
          previous.x,
          previous.y,
          projectile.x,
          projectile.y,
          egg.x,
          egg.y,
          egg.radius + projectileRadius,
        );
        if (!hit || (best && hit.t >= best.t)) continue;
        best = { ...hit, kind: 'egg', target: egg };
      }

      if (boss && boss.targetable !== false && !projectile.broodmotherHit) {
        const hit = firstSegmentCircleIntersection(
          previous.x,
          previous.y,
          projectile.x,
          projectile.y,
          boss.x,
          boss.y,
          boss.radius + projectileRadius,
        );
        if (hit && (!best || hit.t < best.t)) {
          best = { ...hit, kind: 'boss', target: boss };
        }
      }

      return best;
    }

    explodeProjectile(projectile) {
      if (!projectile?.dead) {
        const game = this.game;
        const blastRadius = projectile.aoeRadius || (projectile.radius ?? 0) * 4;

        for (const egg of game.broodEggs ?? []) {
          if (egg.dead) continue;
          const hitRadius = blastRadius + egg.radius;
          if (distanceSq(projectile.x, projectile.y, egg.x, egg.y) > hitRadius * hitRadius) continue;
          game.damageBroodEgg(egg, projectile.damage, projectile.x, projectile.y);
        }

        const boss = game.getActiveBroodmother?.();
        if (boss?.targetable !== false) {
          const hitRadius = blastRadius + boss.radius;
          if (distanceSq(projectile.x, projectile.y, boss.x, boss.y) <= hitRadius * hitRadius) {
            game.damageBroodmother(projectile.damage, projectile.x, projectile.y);
          }
        }
      }

      super.explodeProjectile(projectile);
    }

    performShockbladeSlash(unit, attack) {
      super.performShockbladeSlash(unit, attack);

      if (!unit || unit.dead) return;
      const soldier = this.game.getSoldierPositions()
        .find((candidate) => candidate.unit.id === unit.id);
      if (!soldier) return;

      const weapon = this.getMeleeWeapon?.(unit) ?? UNIT_CLASSES[unit.type]?.weapon;
      if (!weapon) return;

      const modifiers = getUnitModifiers(this.game.unitModifiers, unit.type);
      const statMultiplier = this.game.getTransformerStatMultiplier();
      const slashRadius = (weapon.aoeRadius ?? weapon.range)
        * modifiers.blastRadius
        * statMultiplier;
      const damage = weapon.damage * modifiers.damage * statMultiplier;

      for (const egg of this.game.broodEggs ?? []) {
        if (egg.dead) continue;
        const hitRadius = slashRadius + egg.radius;
        if (distanceSq(soldier.x, soldier.y, egg.x, egg.y) > hitRadius * hitRadius) continue;
        this.game.damageBroodEgg(egg, damage, egg.x, egg.y);
      }

      const boss = this.game.getActiveBroodmother?.();
      if (!boss || boss.targetable === false) return;
      const hitRadius = slashRadius + boss.radius;
      if (distanceSq(soldier.x, soldier.y, boss.x, boss.y) > hitRadius * hitRadius) return;

      const result = this.game.damageBroodmother(damage, boss.x, boss.y);
      if (
        unit.captainId === THORNE_ID
        && unit.type === SHOCKBLADE_TYPE
        && weapon.lifesteal > 0
        && (result?.bodyDamage ?? 0) > 0
      ) {
        unit.hp = Math.min(unit.maxHp, unit.hp + result.bodyDamage * weapon.lifesteal);
        this.game.syncCaptainHealth();
      }
    }
  };
}

export class Game extends PreviousGame {
  constructor(...args) {
    super(...args);
    const BroodmotherCombatSystem = createBroodmotherCombatSystem(this.combatSystem.constructor);
    this.combatSystem = new BroodmotherCombatSystem(this);
    this.combatSystem.reset();
  }

  resetState() {
    this.broodmotherBoss = null;
    this.broodmotherSpawned = false;
    this.broodmotherDefeated = false;
    this.broodIntro = null;
    this.broodSpawnLockActive = false;
    this.broodEggs = [];
    this.broodAcidBlobs = [];
    this.broodAcidPools = [];
    this.nextBroodEggId = 1;
    super.resetState();
  }

  getActiveBroodmother() {
    return this.broodmotherBoss && !this.broodmotherBoss.dead
      ? this.broodmotherBoss
      : null;
  }

  isBroodmotherSpawnLocked() {
    return Boolean(this.broodIntro?.active || this.getActiveBroodmother());
  }

  update(dt) {
    this.updateBroodEnemySpeedState();

    const lockedBefore = this.isBroodmotherSpawnLocked();
    if (lockedBefore) {
      this.spawnSystem.cooldown = Math.max(this.spawnSystem.cooldown, SPAWN_LOCK_COOLDOWN);
    }

    super.update(dt);
    if (this.pauseReasons.has('gameover')) return;

    this.updateBroodKnockback(dt);
    this.updateBroodIntro(dt);

    if (
      !this.broodmotherSpawned
      && this.wardenDefeated
      && (this.player?.level ?? 1) >= BROODMOTHER_BOSS.spawnLevel
    ) {
      this.beginBroodmotherIntro();
    }

    this.updateBroodmother(dt);
    this.updateBroodEggs(dt);
    this.updateBroodAcidBlobs(dt);
    this.updateBroodAcidPools(dt);

    const lockedAfter = this.isBroodmotherSpawnLocked();
    if (lockedAfter) {
      this.spawnSystem.cooldown = Math.max(this.spawnSystem.cooldown, SPAWN_LOCK_COOLDOWN);
    } else if (this.broodSpawnLockActive) {
      this.spawnSystem.cooldown = 0.65;
    }
    this.broodSpawnLockActive = lockedAfter;
  }

  updateBroodEnemySpeedState() {
    for (const enemy of this.entities?.enemies ?? []) {
      if (!Number.isFinite(enemy.broodBaseSpeed)) continue;
      const boosted = this.elapsed < (enemy.broodSurgeSpeedUntil ?? 0);
      enemy.speed = enemy.broodBaseSpeed * (
        boosted ? BROODMOTHER_BOSS.surge.speedMultiplier : 1
      );
    }
  }

  getSoldierPositions() {
    return super.getSoldierPositions().map((soldier) => ({
      ...soldier,
      x: soldier.x + (soldier.unit.broodKnockX ?? 0),
      y: soldier.y + (soldier.unit.broodKnockY ?? 0),
    }));
  }

  updateBroodKnockback(dt) {
    const decay = Math.max(0, 1 - dt * 5.2);
    for (const unit of this.player?.squad ?? []) {
      unit.broodKnockX = (unit.broodKnockX ?? 0) * decay;
      unit.broodKnockY = (unit.broodKnockY ?? 0) * decay;
      if (Math.abs(unit.broodKnockX) < 0.05) unit.broodKnockX = 0;
      if (Math.abs(unit.broodKnockY) < 0.05) unit.broodKnockY = 0;
    }
  }

  beginBroodmotherIntro() {
    if (this.broodmotherSpawned || this.broodIntro?.active) return;
    this.broodmotherSpawned = true;
    this.broodIntro = { active: true, elapsed: 0, purged: false };
    this.broodSpawnLockActive = true;
    this.spawnSystem.cooldown = Math.max(this.spawnSystem.cooldown, SPAWN_LOCK_COOLDOWN);
  }

  updateBroodIntro(dt) {
    const intro = this.broodIntro;
    if (!intro?.active) return;

    intro.elapsed += dt;
    if (!intro.purged && intro.elapsed >= INTRO_PURGE_TIME) {
      intro.purged = true;
      // Boss-intro cleanup deliberately bypasses the kill path: no XP or kill credit.
      this.entities.enemies.length = 0;
      this.entities.projectiles.length = 0;
    }

    if (intro.elapsed < INTRO_SPAWN_TIME) return;
    intro.active = false;
    this.spawnBroodmother();
  }

  spawnBroodmother() {
    const angle = Math.random() * Math.PI * 2;
    const distance = 620;
    const x = this.player.x + Math.cos(angle) * distance;
    const y = this.player.y + Math.sin(angle) * distance;

    this.broodmotherBoss = {
      id: `boss-${BROODMOTHER_BOSS.id}`,
      type: BROODMOTHER_BOSS.id,
      isBoss: true,
      x,
      y,
      radius: BROODMOTHER_BOSS.radius,
      maxHp: BROODMOTHER_BOSS.maxHp,
      hp: BROODMOTHER_BOSS.maxHp,
      speed: BROODMOTHER_BOSS.speed,
      facingAngle: Math.atan2(this.player.y - y, this.player.x - x),
      hitFlash: 0,
      dead: false,
      targetable: true,
      nestAwakened: false,
      desperation: false,
      state: 'active',
      stateTime: 0,
      attackCooldown: 2.2,
      attackCycle: 0,
      eggCooldown: 1.6,
      tailCooldown: 3.2,
      burrowCooldown: 8,
      surgeAt: this.elapsed + BROODMOTHER_BOSS.surge.interval,
      acidTargets: [],
      lungeDirection: { x: 0, y: 0 },
      lungeHitIds: new Set(),
    };

    this.spawnExplosionEffect(x, y, 120, BROODMOTHER_BOSS.colors.core);
  }

  updateBroodmother(dt) {
    const boss = this.getActiveBroodmother();
    if (!boss) return;

    boss.hitFlash = Math.max(0, boss.hitFlash - dt);
    boss.attackCooldown = Math.max(0, boss.attackCooldown - dt);
    boss.eggCooldown = Math.max(0, boss.eggCooldown - dt);
    boss.tailCooldown = Math.max(0, boss.tailCooldown - dt);
    boss.burrowCooldown = Math.max(0, boss.burrowCooldown - dt);

    const hpRatio = boss.hp / boss.maxHp;
    if (!boss.nestAwakened && hpRatio <= BROODMOTHER_BOSS.nestThreshold) {
      boss.nestAwakened = true;
      boss.eggCooldown = Math.min(boss.eggCooldown, 1.1);
      boss.burrowCooldown = Math.min(boss.burrowCooldown, 4.5);
      this.spawnExplosionEffect(boss.x, boss.y, 145, BROODMOTHER_BOSS.colors.eliteEgg);
    }

    if (!boss.desperation && hpRatio <= BROODMOTHER_BOSS.desperationThreshold) {
      boss.desperation = true;
      boss.state = 'active';
      boss.stateTime = 0;
      boss.targetable = true;
      boss.eggCooldown = Infinity;
      boss.burrowCooldown = Infinity;
      boss.surgeAt = Infinity;
      boss.attackCooldown = 0.55;
      boss.tailCooldown = Math.min(boss.tailCooldown, 1.2);
      this.spawnExplosionEffect(boss.x, boss.y, 170, BROODMOTHER_BOSS.colors.warning);
    }

    if (!boss.desperation) {
      if (boss.eggCooldown <= 0) this.spawnBroodEggClutch(boss);
      if (this.elapsed >= boss.surgeAt) this.triggerBroodSurge(boss);
    }

    if (boss.state === 'acid_windup') {
      boss.stateTime -= dt;
      if (boss.stateTime <= 0) this.launchBroodAcidBarrage(boss);
      return;
    }

    if (boss.state === 'tail_windup') {
      boss.stateTime -= dt;
      if (boss.stateTime <= 0) {
        this.resolveBroodTailSweep(boss);
        boss.state = 'active';
        boss.attackCooldown = boss.desperation ? 0.7 : 1.3;
      }
      return;
    }

    if (boss.state === 'burrow_down') {
      boss.stateTime -= dt;
      if (boss.stateTime <= 0) {
        boss.state = 'burrow_hidden';
        boss.stateTime = BROODMOTHER_BOSS.burrow.hiddenDuration;
        boss.targetable = false;
        const angle = Math.random() * Math.PI * 2;
        const distance = randomRange(
          BROODMOTHER_BOSS.burrow.relocateMin,
          BROODMOTHER_BOSS.burrow.relocateMax,
        );
        boss.x = this.player.x + Math.cos(angle) * distance;
        boss.y = this.player.y + Math.sin(angle) * distance;
      }
      return;
    }

    if (boss.state === 'burrow_hidden') {
      boss.stateTime -= dt;
      if (boss.stateTime <= 0) {
        boss.state = 'burrow_up';
        boss.stateTime = BROODMOTHER_BOSS.burrow.upDuration;
        boss.targetable = true;
        this.spawnExplosionEffect(boss.x, boss.y, 78, BROODMOTHER_BOSS.colors.burrow);
      }
      return;
    }

    if (boss.state === 'burrow_up') {
      boss.stateTime -= dt;
      if (boss.stateTime <= 0) {
        boss.state = 'active';
        boss.attackCooldown = 0.9;
      }
      return;
    }

    if (boss.state === 'lunge_windup') {
      boss.stateTime -= dt;
      if (boss.stateTime <= 0) {
        boss.state = 'lunging';
        boss.stateTime = BROODMOTHER_BOSS.lunge.duration;
        boss.lungeHitIds.clear();
      }
      return;
    }

    if (boss.state === 'lunging') {
      boss.x += boss.lungeDirection.x * BROODMOTHER_BOSS.lunge.speed * dt;
      boss.y += boss.lungeDirection.y * BROODMOTHER_BOSS.lunge.speed * dt;
      boss.stateTime -= dt;
      this.damageSquadFromBroodLunge(boss);
      if (boss.stateTime <= 0) {
        boss.state = 'active';
        boss.attackCooldown = 0.65;
      }
      return;
    }

    const dx = this.player.x - boss.x;
    const dy = this.player.y - boss.y;
    const distance = Math.hypot(dx, dy) || 1;
    boss.facingAngle = Math.atan2(dy, dx);

    if (boss.desperation) {
      boss.x += (dx / distance) * BROODMOTHER_BOSS.desperationSpeed * dt;
      boss.y += (dy / distance) * BROODMOTHER_BOSS.desperationSpeed * dt;
    } else {
      const preferred = BROODMOTHER_BOSS.preferredRange;
      const speed = boss.nestAwakened ? BROODMOTHER_BOSS.nestSpeed : BROODMOTHER_BOSS.speed;
      if (distance > preferred + 70) {
        boss.x += (dx / distance) * speed * dt;
        boss.y += (dy / distance) * speed * dt;
      } else if (distance < preferred - 80) {
        boss.x -= (dx / distance) * speed * 0.75 * dt;
        boss.y -= (dy / distance) * speed * 0.75 * dt;
      }
    }

    if (distance <= BROODMOTHER_BOSS.tail.triggerRange && boss.tailCooldown <= 0) {
      this.beginBroodTailSweep(boss);
      return;
    }

    if (!boss.desperation && boss.burrowCooldown <= 0) {
      this.beginBroodBurrow(boss);
      return;
    }

    if (boss.attackCooldown > 0) return;

    boss.attackCycle += 1;
    if (boss.desperation && boss.attackCycle % 2 === 1) {
      this.beginBroodLunge(boss);
    } else {
      this.beginBroodAcidBarrage(boss);
    }
  }

  spawnBroodEggClutch(boss) {
    const eggConfig = BROODMOTHER_BOSS.egg;
    const min = boss.nestAwakened ? eggConfig.nestSpawnMin : eggConfig.spawnMin;
    const max = boss.nestAwakened ? eggConfig.nestSpawnMax : eggConfig.spawnMax;
    const count = min + Math.floor(Math.random() * (max - min + 1));
    const baseAngle = Math.random() * Math.PI * 2;

    for (let index = 0; index < count; index += 1) {
      const angle = baseAngle + (Math.PI * 2 * index) / count + randomRange(-0.28, 0.28);
      const distance = randomRange(150, 390);
      const elite = boss.nestAwakened && Math.random() < eggConfig.eliteChance;
      const targetX = this.player.x + Math.cos(angle) * distance;
      const targetY = this.player.y + Math.sin(angle) * distance;
      const maxHp = elite ? eggConfig.eliteHp : eggConfig.hp;
      const radius = elite ? eggConfig.eliteRadius : eggConfig.radius;

      this.broodEggs.push({
        id: `brood-egg-${this.nextBroodEggId++}`,
        type: 'brood_egg',
        x: boss.x,
        y: boss.y,
        startX: boss.x,
        startY: boss.y,
        targetX,
        targetY,
        radius,
        maxHp,
        hp: maxHp,
        elite,
        dead: false,
        landed: false,
        flightElapsed: 0,
        flightDuration: eggConfig.flightDuration,
        hatchAt: Infinity,
        hitFlash: 0,
      });
    }

    boss.eggCooldown = boss.nestAwakened
      ? eggConfig.nestSpawnCooldown
      : eggConfig.spawnCooldown;
  }

  updateBroodEggs(dt) {
    const eggConfig = BROODMOTHER_BOSS.egg;
    for (const egg of this.broodEggs) {
      if (egg.dead) continue;
      egg.hitFlash = Math.max(0, egg.hitFlash - dt);

      if (!egg.landed) {
        egg.flightElapsed += dt;
        const progress = clamp(egg.flightElapsed / egg.flightDuration, 0, 1);
        egg.x = egg.startX + (egg.targetX - egg.startX) * progress;
        egg.y = egg.startY + (egg.targetY - egg.startY) * progress;
        if (progress >= 1) {
          egg.landed = true;
          egg.hatchAt = this.elapsed + (egg.elite
            ? eggConfig.eliteHatchDelay
            : eggConfig.hatchDelay);
        }
      } else if (this.elapsed >= egg.hatchAt) {
        this.hatchBroodEgg(egg);
      }
    }

    this.broodEggs = this.broodEggs.filter((egg) => !egg.dead);
  }

  damageBroodEgg(egg, amount, x = egg?.x, y = egg?.y) {
    if (!egg || egg.dead || !Number.isFinite(amount) || amount <= 0) return 0;
    const damage = Math.min(egg.hp, amount);
    egg.hp = Math.max(0, egg.hp - amount);
    egg.hitFlash = 0.1;
    this.spawnHitParticles(x, y);
    if (egg.hp <= 0) {
      egg.dead = true;
      this.spawnExplosionEffect(
        egg.x,
        egg.y,
        egg.elite ? 46 : 34,
        egg.elite ? BROODMOTHER_BOSS.colors.eliteEgg : BROODMOTHER_BOSS.colors.egg,
      );
    }
    return damage;
  }

  hatchBroodEgg(egg) {
    if (!egg || egg.dead) return;
    egg.dead = true;
    this.spawnBroodEnemyAt(egg.x, egg.y, egg.elite);
    this.spawnExplosionEffect(
      egg.x,
      egg.y,
      egg.elite ? 52 : 38,
      egg.elite ? BROODMOTHER_BOSS.colors.eliteEgg : BROODMOTHER_BOSS.colors.egg,
    );
  }

  spawnBroodEnemyAt(x, y, elite = false) {
    const elapsed = this.elapsed;
    const typeKey = elite
      ? (Math.random() < 0.72 ? 'brute' : 'spitter')
      : (Math.random() < 0.58 ? 'crawler' : 'runner');
    const type = ENEMY_TYPES[typeKey] ?? ENEMY_TYPES.crawler;
    const difficulty = 1 + elapsed * 0.008;
    const damageScaling = Math.min(1.8, 1 + elapsed * 0.005);
    const eliteHpMultiplier = elite ? 1.5 : 1;
    const baseSpeed = type.speed * Math.min(1.42, 1 + elapsed * 0.0018);
    const surgeActive = elapsed < (this.getActiveBroodmother()?.broodSurgeBuffUntil ?? 0);
    const speedUntil = surgeActive
      ? this.getActiveBroodmother().broodSurgeBuffUntil
      : 0;

    this.entities.enemies.push({
      id: this.entities.createId(),
      type: typeKey,
      x,
      y,
      radius: type.radius,
      speed: baseSpeed * (surgeActive ? BROODMOTHER_BOSS.surge.speedMultiplier : 1),
      broodBaseSpeed: baseSpeed,
      broodSurgeSpeedUntil: speedUntil,
      maxHp: type.hp * difficulty * eliteHpMultiplier,
      hp: type.hp * difficulty * eliteHpMultiplier,
      damage: type.damage * damageScaling,
      rangedDamage: type.ranged ? type.ranged.damage * damageScaling : 0,
      rangedCooldown: type.ranged ? randomRange(type.ranged.cooldown * 0.5, type.ranged.cooldown) : 0,
      xp: type.xp,
      hitFlash: 0,
      dead: false,
      broodSpawned: true,
      eliteBrood: elite,
    });
  }

  triggerBroodSurge(boss) {
    boss.broodSurgeBuffUntil = this.elapsed + BROODMOTHER_BOSS.surge.speedDuration;
    for (const egg of [...this.broodEggs]) {
      if (!egg.dead) this.hatchBroodEgg(egg);
    }
    boss.surgeAt = this.elapsed + BROODMOTHER_BOSS.surge.interval;
    this.spawnExplosionEffect(boss.x, boss.y, 165, BROODMOTHER_BOSS.colors.egg);
  }

  beginBroodAcidBarrage(boss) {
    boss.state = 'acid_windup';
    boss.stateTime = BROODMOTHER_BOSS.acid.windup;
    boss.acidTargets = [];

    const acid = BROODMOTHER_BOSS.acid;
    const count = boss.desperation
      ? acid.desperationBlobCount
      : boss.nestAwakened
        ? acid.nestBlobCount
        : acid.blobCount;
    const axis = this.input.getAxis?.() ?? { x: 0, y: 0 };
    const predictedX = this.player.x + axis.x * acid.predictionDistance;
    const predictedY = this.player.y + axis.y * acid.predictionDistance;
    const baseAngle = Math.random() * Math.PI * 2;

    for (let index = 0; index < count; index += 1) {
      const ring = index === 0 ? 0 : 68 + (index % 3) * 44;
      const angle = baseAngle + index * ((Math.PI * 2) / Math.max(1, count));
      boss.acidTargets.push({
        x: predictedX + Math.cos(angle) * ring,
        y: predictedY + Math.sin(angle) * ring,
      });
    }
  }

  launchBroodAcidBarrage(boss) {
    const acid = BROODMOTHER_BOSS.acid;
    const poolDuration = boss.desperation
      ? acid.desperationPoolDuration
      : boss.nestAwakened
        ? acid.nestPoolDuration
        : acid.poolDuration;

    for (const target of boss.acidTargets) {
      this.broodAcidBlobs.push({
        startX: boss.x,
        startY: boss.y,
        targetX: target.x,
        targetY: target.y,
        x: boss.x,
        y: boss.y,
        elapsed: 0,
        duration: acid.travelDuration,
        poolDuration,
      });
    }

    boss.acidTargets = [];
    boss.state = 'active';
    boss.attackCooldown = boss.desperation
      ? acid.desperationCooldown
      : boss.nestAwakened
        ? acid.nestCooldown
        : acid.cooldown;
  }

  updateBroodAcidBlobs(dt) {
    const remaining = [];
    for (const blob of this.broodAcidBlobs) {
      blob.elapsed += dt;
      const progress = clamp(blob.elapsed / blob.duration, 0, 1);
      blob.x = blob.startX + (blob.targetX - blob.startX) * progress;
      blob.y = blob.startY + (blob.targetY - blob.startY) * progress;
      if (progress < 1) {
        remaining.push(blob);
        continue;
      }

      this.broodAcidPools.push({
        x: blob.targetX,
        y: blob.targetY,
        radius: BROODMOTHER_BOSS.acid.poolRadius,
        remaining: blob.poolDuration,
        maxDuration: blob.poolDuration,
        nextHitByUnit: new Map(),
      });
      this.spawnExplosionEffect(
        blob.targetX,
        blob.targetY,
        BROODMOTHER_BOSS.acid.poolRadius,
        BROODMOTHER_BOSS.colors.acid,
      );
    }
    this.broodAcidBlobs = remaining;
  }

  updateBroodAcidPools(dt) {
    const acid = BROODMOTHER_BOSS.acid;
    const soldiers = this.getSoldierPositions();
    for (const pool of this.broodAcidPools) {
      pool.remaining -= dt;
      if (pool.remaining <= 0) continue;

      for (const soldier of soldiers) {
        if (soldier.unit.dead) continue;
        const hitRadius = pool.radius + GAME_BALANCE.player.soldierRadius;
        if (distanceSq(pool.x, pool.y, soldier.x, soldier.y) > hitRadius * hitRadius) continue;
        const nextHit = pool.nextHitByUnit.get(soldier.unit.id) ?? 0;
        if (this.elapsed < nextHit) continue;
        pool.nextHitByUnit.set(soldier.unit.id, this.elapsed + acid.tickInterval);
        this.damageSquadUnitFromBoss(soldier, acid.tickDamage);
      }
    }
    this.broodAcidPools = this.broodAcidPools.filter((pool) => pool.remaining > 0);
  }

  beginBroodTailSweep(boss) {
    boss.state = 'tail_windup';
    boss.stateTime = BROODMOTHER_BOSS.tail.windup;
    boss.tailFacingAngle = boss.facingAngle;
    boss.tailCooldown = boss.desperation
      ? BROODMOTHER_BOSS.tail.desperationCooldown
      : boss.nestAwakened
        ? BROODMOTHER_BOSS.tail.nestCooldown
        : BROODMOTHER_BOSS.tail.cooldown;
  }

  resolveBroodTailSweep(boss) {
    const tail = BROODMOTHER_BOSS.tail;
    const halfArc = tail.arcRadians / 2;
    for (const soldier of this.getSoldierPositions()) {
      if (soldier.unit.dead) continue;
      const dx = soldier.x - boss.x;
      const dy = soldier.y - boss.y;
      const distance = Math.hypot(dx, dy) || 0.001;
      if (distance > tail.radius + GAME_BALANCE.player.soldierRadius) continue;
      let delta = Math.atan2(dy, dx) - boss.tailFacingAngle;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      if (Math.abs(delta) > halfArc) continue;

      this.damageSquadUnitFromBoss(soldier, tail.damage);
      const direction = normalize(dx, dy);
      soldier.unit.broodKnockX = (soldier.unit.broodKnockX ?? 0) + direction.x * tail.knockback;
      soldier.unit.broodKnockY = (soldier.unit.broodKnockY ?? 0) + direction.y * tail.knockback;
    }
    this.spawnExplosionEffect(boss.x, boss.y, tail.radius, BROODMOTHER_BOSS.colors.warning);
  }

  beginBroodBurrow(boss) {
    boss.state = 'burrow_down';
    boss.stateTime = BROODMOTHER_BOSS.burrow.downDuration;
    boss.burrowCooldown = boss.nestAwakened
      ? BROODMOTHER_BOSS.burrow.nestCooldown
      : BROODMOTHER_BOSS.burrow.cooldown;
  }

  beginBroodLunge(boss) {
    const direction = normalize(this.player.x - boss.x, this.player.y - boss.y);
    boss.lungeDirection = direction;
    boss.facingAngle = Math.atan2(direction.y, direction.x);
    boss.state = 'lunge_windup';
    boss.stateTime = BROODMOTHER_BOSS.lunge.windup;
  }

  damageSquadFromBroodLunge(boss) {
    for (const soldier of this.getSoldierPositions()) {
      if (soldier.unit.dead || boss.lungeHitIds.has(soldier.unit.id)) continue;
      const hitRadius = boss.radius + GAME_BALANCE.player.soldierRadius + 5;
      if (distanceSq(boss.x, boss.y, soldier.x, soldier.y) > hitRadius * hitRadius) continue;
      boss.lungeHitIds.add(soldier.unit.id);
      this.damageSquadUnitFromBoss(soldier, BROODMOTHER_BOSS.lunge.damage);
      const direction = normalize(soldier.x - boss.x, soldier.y - boss.y);
      soldier.unit.broodKnockX = (soldier.unit.broodKnockX ?? 0)
        + direction.x * BROODMOTHER_BOSS.lunge.knockback;
      soldier.unit.broodKnockY = (soldier.unit.broodKnockY ?? 0)
        + direction.y * BROODMOTHER_BOSS.lunge.knockback;
    }
  }

  damageBroodmother(amount, hitX, hitY) {
    const boss = this.getActiveBroodmother();
    if (!boss || boss.targetable === false || !Number.isFinite(amount) || amount <= 0) return null;
    const bodyDamage = amount;
    boss.hp = Math.max(0, boss.hp - bodyDamage);
    boss.hitFlash = 0.11;
    this.spawnHitParticles(hitX, hitY);
    if (boss.hp <= 0) this.defeatBroodmother(boss);
    return { bodyDamage };
  }

  defeatBroodmother(boss) {
    if (!boss || boss.dead) return;
    boss.dead = true;
    boss.hp = 0;
    this.broodmotherDefeated = true;
    this.kills += 1;
    this.broodEggs = [];
    this.broodAcidBlobs = [];
    this.broodAcidPools = [];

    for (let index = 0; index < 6; index += 1) {
      const angle = (Math.PI * 2 * index) / 6;
      this.spawnExplosionEffect(
        boss.x + Math.cos(angle) * 45,
        boss.y + Math.sin(angle) * 45,
        92,
        index % 2 === 0 ? BROODMOTHER_BOSS.colors.core : BROODMOTHER_BOSS.colors.egg,
      );
    }

    const amount = Math.max(
      0,
      Math.floor(Number(BROODMOTHER_BOSS.permanentUpgradePoints) || 0),
    );
    if (amount <= 0) return;
    const state = grantMetaUpgradePoints(amount);
    this.ui.renderMetaUpgradeTree?.();
    this.ui.showPermanentUpgradePointReward?.(
      amount,
      state.totalPoints,
      BROODMOTHER_BOSS.name.toUpperCase(),
    );
  }

  drawEnemies(ctx) {
    super.drawEnemies(ctx);
    this.drawBroodEggs(ctx);
    const boss = this.getActiveBroodmother();
    if (boss) this.drawBroodmother(ctx, boss);
  }

  drawBroodEggs(ctx) {
    const eggConfig = BROODMOTHER_BOSS.egg;
    for (const egg of this.broodEggs) {
      if (egg.dead) continue;
      const sprite = egg.elite ? ELITE_EGG_SPRITE : EGG_SPRITE;
      const color = egg.elite ? BROODMOTHER_BOSS.colors.eliteEgg : BROODMOTHER_BOSS.colors.egg;
      const timeToHatch = egg.landed ? Math.max(0, egg.hatchAt - this.elapsed) : Infinity;
      const urgent = egg.landed && timeToHatch <= 2.5;
      const bob = egg.landed ? 0 : -Math.sin(clamp(egg.flightElapsed / egg.flightDuration, 0, 1) * Math.PI) * 58;
      const pulse = 1 + (Math.sin(this.animationClock * (urgent ? 11 : 4) + egg.index) + 1) * 0.04;

      ctx.save();
      ctx.translate(egg.x, egg.y + bob);
      ctx.scale(pulse, pulse);
      const drawn = this.animationRenderer.draw(ctx, sprite, 'idle', 0, 0, 0);
      if (!drawn) {
        ctx.shadowBlur = urgent ? 26 : 14;
        ctx.shadowColor = color;
        ctx.fillStyle = egg.hitFlash > 0 ? '#ffffff' : `${color}55`;
        ctx.strokeStyle = color;
        ctx.lineWidth = egg.elite ? 4 : 3;
        ctx.beginPath();
        ctx.ellipse(0, 0, egg.radius * 0.78, egg.radius, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();

      const healthRatio = clamp(egg.hp / egg.maxHp, 0, 1);
      const barWidth = egg.elite ? 54 : 42;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,.72)';
      ctx.fillRect(egg.x - barWidth / 2, egg.y - egg.radius - 16, barWidth, 6);
      ctx.fillStyle = color;
      ctx.fillRect(egg.x - barWidth / 2, egg.y - egg.radius - 16, barWidth * healthRatio, 6);
      if (urgent) {
        ctx.font = '900 9px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff3f5';
        ctx.fillText(`${timeToHatch.toFixed(1)}s`, egg.x, egg.y - egg.radius - 21);
      }
      if (egg.elite) {
        ctx.font = '900 8px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = color;
        ctx.fillText('ELITE', egg.x, egg.y + egg.radius + 13);
      }
      ctx.restore();
    }
  }

  drawBroodmother(ctx, boss) {
    if (boss.state === 'burrow_hidden') return;
    const colors = BROODMOTHER_BOSS.colors;
    const pulse = (Math.sin(this.animationClock * (boss.desperation ? 9 : 5)) + 1) * 0.5;
    const alpha = boss.state === 'burrow_down' || boss.state === 'burrow_up' ? 0.62 : 1;

    const drawn = this.animationRenderer.draw(
      ctx,
      BROODMOTHER_SPRITE,
      'idle',
      0,
      boss.x,
      boss.y,
      { alpha },
    );

    if (!drawn) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(boss.x, boss.y);
      ctx.rotate(boss.facingAngle);
      ctx.shadowBlur = boss.hitFlash > 0 ? 28 : 18;
      ctx.shadowColor = boss.hitFlash > 0 ? '#ffffff' : colors.core;
      ctx.fillStyle = boss.hitFlash > 0 ? '#ffffff' : colors.shell;
      ctx.strokeStyle = colors.shellEdge;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(-8, 0, 64, 50, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = colors.flesh;
      ctx.beginPath();
      ctx.ellipse(38, 0, 34, 31, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 18 + pulse * 12;
      ctx.shadowColor = colors.core;
      ctx.fillStyle = colors.core;
      ctx.beginPath();
      ctx.arc(7, 0, 13 + pulse * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (boss.nestAwakened || boss.desperation) {
      ctx.save();
      ctx.strokeStyle = boss.desperation
        ? `rgba(255,77,103,${0.45 + pulse * 0.35})`
        : `rgba(215,140,255,${0.32 + pulse * 0.25})`;
      ctx.lineWidth = boss.desperation ? 5 : 3;
      ctx.beginPath();
      ctx.arc(boss.x, boss.y, boss.radius + 13 + pulse * 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawEffects(ctx) {
    super.drawEffects(ctx);
    const boss = this.getActiveBroodmother();

    for (const pool of this.broodAcidPools) {
      const lifeRatio = clamp(pool.remaining / pool.maxDuration, 0, 1);
      const pulse = (Math.sin(this.animationClock * 4 + pool.x * 0.01) + 1) * 0.5;
      ctx.save();
      ctx.globalAlpha = 0.25 + lifeRatio * 0.32;
      ctx.fillStyle = BROODMOTHER_BOSS.colors.acid;
      ctx.strokeStyle = BROODMOTHER_BOSS.colors.acidHot;
      ctx.shadowBlur = 14 + pulse * 9;
      ctx.shadowColor = BROODMOTHER_BOSS.colors.acid;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pool.x, pool.y, pool.radius * (0.96 + pulse * 0.04), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    for (const blob of this.broodAcidBlobs) {
      const progress = clamp(blob.elapsed / blob.duration, 0, 1);
      const arcHeight = Math.sin(progress * Math.PI) * 58;
      ctx.save();
      ctx.fillStyle = BROODMOTHER_BOSS.colors.acidHot;
      ctx.shadowBlur = 18;
      ctx.shadowColor = BROODMOTHER_BOSS.colors.acid;
      ctx.beginPath();
      ctx.arc(blob.x, blob.y - arcHeight, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (!boss) return;

    if (!boss.desperation) {
      const timeToSurge = boss.surgeAt - this.elapsed;
      if (timeToSurge <= BROODMOTHER_BOSS.surge.warningDuration && timeToSurge > 0) {
        const warningProgress = 1 - timeToSurge / BROODMOTHER_BOSS.surge.warningDuration;
        const pulse = (Math.sin(this.animationClock * 10) + 1) * 0.5;
        ctx.save();
        ctx.strokeStyle = BROODMOTHER_BOSS.colors.egg;
        ctx.shadowColor = BROODMOTHER_BOSS.colors.egg;
        ctx.shadowBlur = 18;
        ctx.lineWidth = 4 + warningProgress * 3;
        ctx.globalAlpha = 0.38 + pulse * 0.48;
        ctx.beginPath();
        ctx.arc(boss.x, boss.y, boss.radius + 44 + warningProgress * 24, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    if (boss.state === 'acid_windup') {
      const progress = 1 - boss.stateTime / BROODMOTHER_BOSS.acid.windup;
      for (const target of boss.acidTargets) {
        ctx.save();
        ctx.strokeStyle = BROODMOTHER_BOSS.colors.acid;
        ctx.fillStyle = 'rgba(141,255,98,.08)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(target.x, target.y, BROODMOTHER_BOSS.acid.poolRadius * (0.72 + progress * 0.28), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }

    if (boss.state === 'tail_windup') {
      const tail = BROODMOTHER_BOSS.tail;
      ctx.save();
      ctx.translate(boss.x, boss.y);
      ctx.rotate(boss.tailFacingAngle);
      ctx.fillStyle = 'rgba(255,77,103,.10)';
      ctx.strokeStyle = BROODMOTHER_BOSS.colors.warning;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, tail.radius, -tail.arcRadians / 2, tail.arcRadians / 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    if (boss.state === 'burrow_down' || boss.state === 'burrow_up' || boss.state === 'burrow_hidden') {
      const pulse = (Math.sin(this.animationClock * 8) + 1) * 0.5;
      ctx.save();
      ctx.fillStyle = `rgba(76,53,42,${0.24 + pulse * 0.16})`;
      ctx.strokeStyle = BROODMOTHER_BOSS.colors.burrow;
      ctx.lineWidth = 4;
      ctx.setLineDash([14, 9]);
      ctx.beginPath();
      ctx.ellipse(boss.x, boss.y, 78 + pulse * 8, 42 + pulse * 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    if (boss.state === 'lunge_windup') {
      ctx.save();
      ctx.translate(boss.x, boss.y);
      ctx.rotate(Math.atan2(boss.lungeDirection.y, boss.lungeDirection.x));
      ctx.fillStyle = 'rgba(255,77,103,.08)';
      ctx.strokeStyle = BROODMOTHER_BOSS.colors.warning;
      ctx.lineWidth = 3;
      ctx.setLineDash([14, 10]);
      ctx.fillRect(0, -boss.radius * 0.7, 440, boss.radius * 1.4);
      ctx.strokeRect(0, -boss.radius * 0.7, 440, boss.radius * 1.4);
      ctx.restore();
    }
  }
}

export class UI extends PreviousUI {
  update(game) {
    super.update(game);

    const intro = game.broodIntro;
    const introActive = Boolean(intro?.active);
    const elapsed = intro?.elapsed ?? 0;
    const showArrival = introActive
      && elapsed >= INTRO_MESSAGE_TIME
      && elapsed < INTRO_SPAWN_TIME;

    if (this.bossArrivalNotice && introActive) {
      this.bossArrivalNotice.textContent = `${BROODMOTHER_BOSS.name} has arrived`;
      this.bossArrivalNotice.style.opacity = showArrival ? '1' : '0';
      this.bossArrivalNotice.style.transform = showArrival ? 'scale(1)' : 'scale(.9)';
    }

    if (this.gameCanvas && introActive) {
      if (elapsed < INTRO_SHAKE_DURATION) {
        const strength = 11 * (1 - elapsed / INTRO_SHAKE_DURATION);
        this.gameCanvas.style.transform = `translate(${(Math.random() - 0.5) * strength * 2}px, ${(Math.random() - 0.5) * strength * 2}px) scale(1.01)`;
      } else {
        this.gameCanvas.style.transform = '';
      }
    }

    const boss = game.getActiveBroodmother?.();
    if (!boss || !this.wardenHud) return;

    const hpRatio = clamp(boss.hp / boss.maxHp, 0, 1);
    const name = this.wardenHud.querySelector('.boss-hud__name');
    if (name) name.textContent = 'THE BROODMOTHER';

    let stateLabel = boss.desperation
      ? 'DESPERATION'
      : boss.nestAwakened
        ? 'THE NEST AWAKENS'
        : '';
    if (boss.state === 'acid_windup') stateLabel = 'ACID BARRAGE';
    else if (boss.state === 'tail_windup') stateLabel = 'TAIL SWEEP';
    else if (boss.state.startsWith('burrow')) stateLabel = 'BURROWING';
    else if (boss.state === 'lunge_windup' || boss.state === 'lunging') stateLabel = 'LUNGE';

    this.wardenHud.classList.add('boss-hud--visible');
    this.wardenHud.classList.toggle('boss-hud--enraged', boss.desperation);
    this.wardenFill.style.width = `${hpRatio * 100}%`;
    this.wardenState.textContent = stateLabel;
    this.wardenHp.textContent = `${Math.ceil(boss.hp)} / ${boss.maxHp}`;

    const activeEggs = (game.broodEggs ?? []).filter((egg) => !egg.dead).length;
    const surgeText = boss.desperation
      ? 'NO MORE EGGS'
      : `SURGE ${Math.max(0, boss.surgeAt - game.elapsed).toFixed(1)}s`;
    this.wardenArmor.textContent = `EGGS ${activeEggs} • ${surgeText}`;
  }

  showPermanentUpgradePointReward(amount, totalPoints, bossName = 'WARDEN') {
    if (!this.bossRewardToast) return;
    const plural = amount === 1 ? '' : 'S';
    this.bossRewardToast.innerHTML = `
      <div style="font-size:10px;color:#7ef9d4;letter-spacing:.16em;margin-bottom:5px;">${bossName} DEFEATED</div>
      <div style="font-size:18px;">+${amount} PERMANENT UPGRADE POINT${plural}</div>
      <div style="margin-top:5px;font-size:10px;color:#8ea0ae;font-weight:800;letter-spacing:.08em;">${totalPoints} TOTAL EARNED • SPEND FROM THE MAIN MENU</div>
    `;

    window.clearTimeout(this.bossRewardTimer);
    this.bossRewardToast.style.opacity = '1';
    this.bossRewardToast.style.transform = 'translate(-50%, 0)';
    this.bossRewardTimer = window.setTimeout(() => {
      this.bossRewardToast.style.opacity = '0';
      this.bossRewardToast.style.transform = 'translate(-50%, -10px)';
    }, 4200);
  }
}
