import { Game as PreviousGame, UI as PreviousUI } from './metaUpgradeTree.js';
import { GAME_BALANCE, UNIT_CLASSES } from '../data/content.js';
import { getUnitModifiers } from '../data/unitModifiers.js';
import { WARDEN_BOSS } from '../data/bosses.js';
import { distanceSq, normalize } from '../utils/math.js';

const THORNE_ID = 'thorne';
const SHOCKBLADE_TYPE = 'shockblade';
const BOSS_TARGET_PADDING = 8;

function normalizeAngle(angle) {
  let value = angle;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

function createWardenCombatSystem(ParentCombatSystem) {
  return class WardenCombatSystem extends ParentCombatSystem {
    findNearestTarget(x, y, range) {
      const normalTarget = super.findNearestTarget(x, y, range);
      const boss = this.game.getActiveWarden?.();
      if (!boss) return normalTarget;

      const bossCenterDistance = Math.sqrt(distanceSq(x, y, boss.x, boss.y));
      const bossEffectiveDistance = Math.max(0, bossCenterDistance - boss.radius);
      if (bossEffectiveDistance > range + BOSS_TARGET_PADDING) return normalTarget;
      if (!normalTarget) return boss;

      const normalEffectiveDistance = Math.max(
        0,
        Math.sqrt(distanceSq(x, y, normalTarget.x, normalTarget.y)) - (normalTarget.radius ?? 0),
      );
      return bossEffectiveDistance <= normalEffectiveDistance ? boss : normalTarget;
    }

    updateProjectiles(dt) {
      super.updateProjectiles(dt);

      const boss = this.game.getActiveWarden?.();
      if (!boss) return;

      for (const projectile of this.game.entities.projectiles) {
        if (projectile.dead || projectile.wardenHit || !projectile.sourceType) continue;
        const hitRadius = (projectile.radius ?? 0) + boss.radius;
        if (distanceSq(projectile.x, projectile.y, boss.x, boss.y) > hitRadius * hitRadius) continue;

        if (projectile.kind === 'rocket') {
          projectile.wardenHit = true;
          this.explodeProjectile(projectile);
          continue;
        }

        projectile.wardenHit = true;
        this.game.applyWardenDamage(
          projectile.damage,
          projectile.x,
          projectile.y,
          { sourceType: projectile.sourceType },
        );
        projectile.pierce -= 1;
        if (projectile.pierce <= 0) projectile.dead = true;
      }
    }

    explodeProjectile(projectile) {
      const boss = this.game.getActiveWarden?.();
      if (boss && !projectile?.dead && !projectile.wardenExplosionProcessed) {
        const blastRadius = projectile.aoeRadius || (projectile.radius ?? 0) * 4;
        const hitRadius = blastRadius + boss.radius;
        if (distanceSq(projectile.x, projectile.y, boss.x, boss.y) <= hitRadius * hitRadius) {
          projectile.wardenExplosionProcessed = true;
          this.game.applyWardenDamage(
            projectile.damage,
            projectile.x,
            projectile.y,
            {
              sourceType: projectile.sourceType,
              explosive: true,
              blastRadius,
            },
          );
        }
      }

      super.explodeProjectile(projectile);
    }

    performShockbladeSlash(unit, attack) {
      super.performShockbladeSlash(unit, attack);

      const boss = this.game.getActiveWarden?.();
      if (!boss || !unit || unit.dead) return;
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
      const dx = boss.x - soldier.x;
      const dy = boss.y - soldier.y;
      const distance = Math.hypot(dx, dy);
      if (distance > slashRadius + boss.radius) return;

      const thorneAttackCount = this.thorneShockbladeAttackCounts?.get(unit.id) ?? 0;
      const fullCircle = Boolean(
        unit.captainId === THORNE_ID
        || (
          unit.type === SHOCKBLADE_TYPE
          && this.isThorneActive?.()
          && thorneAttackCount > 0
          && thorneAttackCount % 5 === 0
        )
      );

      if (!fullCircle && distance > 0.001) {
        const halfArc = (weapon.arcRadians ?? Math.PI) / 2;
        const minimumFacingDot = Math.cos(halfArc);
        const facingDot = (dx * attack.direction.x + dy * attack.direction.y) / distance;
        if (facingDot < minimumFacingDot) return;
      }

      const damage = weapon.damage * modifiers.damage * statMultiplier;
      const result = this.game.applyWardenDamage(
        damage,
        soldier.x,
        soldier.y,
        { sourceType: unit.type, melee: true },
      );

      if (
        unit.captainId === THORNE_ID
        && weapon.lifesteal > 0
        && (result?.bodyDamage ?? 0) > 0
      ) {
        this.game.healSquadHealth?.(result.bodyDamage * weapon.lifesteal);
      }
    }
  };
}

export class Game extends PreviousGame {
  constructor(...args) {
    super(...args);
    const WardenCombatSystem = createWardenCombatSystem(this.combatSystem.constructor);
    this.combatSystem = new WardenCombatSystem(this);
    this.combatSystem.reset();
  }

  resetState() {
    this.wardenBoss = null;
    this.wardenSpawned = false;
    this.wardenDefeated = false;
    super.resetState();
  }

  update(dt) {
    super.update(dt);
    if (this.pauseReasons.has('gameover')) return;

    this.updateWardenKnockback(dt);
    if (!this.wardenSpawned && (this.player?.level ?? 1) >= WARDEN_BOSS.spawnLevel) {
      this.spawnWarden();
    }
    this.updateWarden(dt);
  }

  getActiveWarden() {
    return this.wardenBoss && !this.wardenBoss.dead ? this.wardenBoss : null;
  }

  getSoldierPositions() {
    return super.getSoldierPositions().map((soldier) => ({
      ...soldier,
      x: soldier.x + (soldier.unit.wardenKnockX ?? 0),
      y: soldier.y + (soldier.unit.wardenKnockY ?? 0),
    }));
  }

  updateWardenKnockback(dt) {
    const decay = Math.max(0, 1 - dt * 5.6);
    for (const unit of this.player?.squad ?? []) {
      unit.wardenKnockX = (unit.wardenKnockX ?? 0) * decay;
      unit.wardenKnockY = (unit.wardenKnockY ?? 0) * decay;
      if (Math.abs(unit.wardenKnockX) < 0.05) unit.wardenKnockX = 0;
      if (Math.abs(unit.wardenKnockY) < 0.05) unit.wardenKnockY = 0;
    }
  }

  spawnWarden() {
    this.wardenSpawned = true;
    const angle = Math.random() * Math.PI * 2;
    const distance = 650;
    const x = this.player.x + Math.cos(angle) * distance;
    const y = this.player.y + Math.sin(angle) * distance;
    const facingAngle = Math.atan2(this.player.y - y, this.player.x - x);

    this.wardenBoss = {
      id: `boss-${WARDEN_BOSS.id}`,
      type: WARDEN_BOSS.id,
      isBoss: true,
      x,
      y,
      radius: WARDEN_BOSS.radius,
      maxHp: WARDEN_BOSS.maxHp,
      hp: WARDEN_BOSS.maxHp,
      facingAngle,
      speed: WARDEN_BOSS.speed,
      hitFlash: 0,
      dead: false,
      enraged: false,
      state: 'approach',
      stateTime: 0,
      attackCooldown: 2.4,
      attackCycle: 0,
      coreExposedUntil: 0,
      chargeDirection: { x: 0, y: 0 },
      chargeHitIds: new Set(),
      chargeConnected: false,
      barrageMarkers: [],
      summonTriggered70: false,
      summonTriggered35: false,
      summonRemaining: 0,
      summonTick: 0,
      plates: WARDEN_BOSS.plates.map((plate) => ({
        ...plate,
        hp: WARDEN_BOSS.armor.plateHp,
        maxHp: WARDEN_BOSS.armor.plateHp,
        broken: false,
      })),
    };

    this.spawnExplosionEffect(x, y, 110, WARDEN_BOSS.colors.summon);
  }

  updateWarden(dt) {
    const boss = this.getActiveWarden();
    if (!boss) return;

    boss.hitFlash = Math.max(0, boss.hitFlash - dt);
    boss.attackCooldown = Math.max(0, boss.attackCooldown - dt);

    const hpRatio = boss.hp / boss.maxHp;
    if (!boss.enraged && hpRatio <= WARDEN_BOSS.enrageThreshold) {
      this.enterWardenEnrage(boss);
    }

    if (!boss.enraged && boss.state === 'approach') {
      if (!boss.summonTriggered70 && hpRatio <= WARDEN_BOSS.swarm.firstThreshold) {
        boss.summonTriggered70 = true;
        this.beginWardenSummon(boss, WARDEN_BOSS.swarm.firstCount);
      } else if (!boss.summonTriggered35 && hpRatio <= WARDEN_BOSS.swarm.secondThreshold) {
        boss.summonTriggered35 = true;
        this.beginWardenSummon(boss, WARDEN_BOSS.swarm.secondCount);
      }
    }

    if (boss.state === 'summoning') {
      this.updateWardenSummon(boss, dt);
      return;
    }

    if (boss.state === 'charge_windup') {
      boss.stateTime -= dt;
      if (boss.stateTime <= 0) {
        boss.state = 'charging';
        boss.stateTime = WARDEN_BOSS.charge.duration;
        boss.chargeHitIds.clear();
        boss.chargeConnected = false;
      }
      return;
    }

    if (boss.state === 'charging') {
      const chargeSpeed = boss.enraged
        ? WARDEN_BOSS.charge.enragedSpeed
        : WARDEN_BOSS.charge.speed;
      boss.x += boss.chargeDirection.x * chargeSpeed * dt;
      boss.y += boss.chargeDirection.y * chargeSpeed * dt;
      boss.stateTime -= dt;
      this.damageSquadFromWardenCharge(boss);

      if (boss.stateTime <= 0) {
        if (boss.chargeConnected) {
          boss.state = 'recovery';
          boss.stateTime = WARDEN_BOSS.charge.hitRecovery;
          boss.coreExposedUntil = 0;
        } else {
          boss.state = 'crashed';
          boss.stateTime = WARDEN_BOSS.charge.crashRecovery;
          boss.coreExposedUntil = this.elapsed + WARDEN_BOSS.charge.crashRecovery;
          this.spawnExplosionEffect(boss.x, boss.y, 90, WARDEN_BOSS.colors.core);
        }
      }
      return;
    }

    if (boss.state === 'slam_windup') {
      boss.stateTime -= dt;
      if (boss.stateTime <= 0) {
        this.resolveWardenSlam(boss);
        boss.state = 'recovery';
        boss.stateTime = 0.9;
      }
      return;
    }

    if (boss.state === 'barrage_windup') {
      boss.stateTime -= dt;
      if (boss.stateTime <= 0) {
        this.resolveWardenBarrage(boss);
        boss.state = 'recovery';
        boss.stateTime = 0.85;
      }
      return;
    }

    if (boss.state === 'crashed' || boss.state === 'recovery') {
      boss.stateTime -= dt;
      if (boss.stateTime <= 0) {
        boss.state = 'approach';
        boss.coreExposedUntil = 0;
        boss.attackCooldown = boss.enraged ? 1.15 : 2.35;
      }
      return;
    }

    const dx = this.player.x - boss.x;
    const dy = this.player.y - boss.y;
    const distanceToPlayer = Math.hypot(dx, dy) || 1;
    boss.facingAngle = Math.atan2(dy, dx);

    const moveSpeed = boss.enraged ? WARDEN_BOSS.enragedSpeed : WARDEN_BOSS.speed;
    if (distanceToPlayer > 125) {
      boss.x += (dx / distanceToPlayer) * moveSpeed * dt;
      boss.y += (dy / distanceToPlayer) * moveSpeed * dt;
    }

    if (boss.attackCooldown > 0) return;

    if (distanceToPlayer <= WARDEN_BOSS.slam.triggerRange) {
      this.beginWardenSlam(boss);
      return;
    }

    boss.attackCycle += 1;
    const useBarrage = !boss.enraged && boss.attackCycle % 3 === 0;
    if (useBarrage) this.beginWardenBarrage(boss);
    else this.beginWardenCharge(boss);
  }

  beginWardenCharge(boss) {
    const direction = normalize(this.player.x - boss.x, this.player.y - boss.y);
    boss.chargeDirection = direction;
    boss.facingAngle = Math.atan2(direction.y, direction.x);
    boss.state = 'charge_windup';
    boss.stateTime = boss.enraged
      ? WARDEN_BOSS.charge.enragedTelegraphDuration
      : WARDEN_BOSS.charge.telegraphDuration;
    boss.attackCooldown = boss.enraged ? 2.5 : 4.4;
  }

  beginWardenSlam(boss) {
    boss.state = 'slam_windup';
    boss.stateTime = WARDEN_BOSS.slam.telegraphDuration;
    boss.attackCooldown = boss.enraged ? 2.25 : 3.6;
  }

  beginWardenBarrage(boss) {
    boss.state = 'barrage_windup';
    boss.stateTime = WARDEN_BOSS.barrage.telegraphDuration;
    boss.attackCooldown = 4.6;
    boss.barrageMarkers = [];

    const baseAngle = Math.random() * Math.PI * 2;
    for (let index = 0; index < WARDEN_BOSS.barrage.markerCount; index += 1) {
      const ring = index === 0 ? 18 : 78 + (index % 3) * 48;
      const angle = baseAngle
        + index * ((Math.PI * 2) / WARDEN_BOSS.barrage.markerCount)
        + (Math.random() - 0.5) * 0.34;
      boss.barrageMarkers.push({
        x: this.player.x + Math.cos(angle) * ring,
        y: this.player.y + Math.sin(angle) * ring,
        radius: WARDEN_BOSS.barrage.markerRadius,
      });
    }
  }

  beginWardenSummon(boss, count) {
    boss.state = 'summoning';
    boss.stateTime = WARDEN_BOSS.swarm.duration;
    boss.summonRemaining = count;
    boss.summonTick = 0;
    boss.barrageMarkers = [];
    this.spawnExplosionEffect(boss.x, boss.y, 120, WARDEN_BOSS.colors.summon);
  }

  updateWardenSummon(boss, dt) {
    boss.stateTime -= dt;
    boss.summonTick -= dt;

    while (boss.summonRemaining > 0 && boss.summonTick <= 0) {
      this.spawnSystem.spawnEnemy();
      boss.summonRemaining -= 1;
      boss.summonTick += WARDEN_BOSS.swarm.spawnInterval;
    }

    if (boss.stateTime <= 0 && boss.summonRemaining <= 0) {
      boss.state = 'recovery';
      boss.stateTime = 0.75;
      boss.attackCooldown = 2.1;
    }
  }

  enterWardenEnrage(boss) {
    boss.enraged = true;
    boss.state = 'approach';
    boss.stateTime = 0;
    boss.attackCooldown = 0.65;
    boss.coreExposedUntil = 0;
    boss.barrageMarkers = [];
    boss.summonRemaining = 0;

    const intact = boss.plates
      .filter((plate) => !plate.broken)
      .sort((a, b) => a.hp - b.hp)
      .slice(0, 3);
    for (const plate of intact) this.breakWardenPlate(boss, plate, true);

    this.spawnExplosionEffect(boss.x, boss.y, 135, WARDEN_BOSS.colors.telegraph);
  }

  damageSquadFromWardenCharge(boss) {
    const soldiers = [...this.getSoldierPositions()];
    for (const soldier of soldiers) {
      if (soldier.unit.dead || boss.chargeHitIds.has(soldier.unit.id)) continue;
      const hitRadius = boss.radius + GAME_BALANCE.player.soldierRadius + 4;
      if (distanceSq(boss.x, boss.y, soldier.x, soldier.y) > hitRadius * hitRadius) continue;

      boss.chargeHitIds.add(soldier.unit.id);
      boss.chargeConnected = true;
      this.damageSquadUnitFromBoss(soldier, WARDEN_BOSS.charge.damage);

      const knockDirection = normalize(soldier.x - boss.x, soldier.y - boss.y);
      soldier.unit.wardenKnockX = (soldier.unit.wardenKnockX ?? 0)
        + knockDirection.x * WARDEN_BOSS.charge.knockback;
      soldier.unit.wardenKnockY = (soldier.unit.wardenKnockY ?? 0)
        + knockDirection.y * WARDEN_BOSS.charge.knockback;
    }
  }

  resolveWardenSlam(boss) {
    const soldiers = [...this.getSoldierPositions()];
    for (const soldier of soldiers) {
      if (soldier.unit.dead) continue;
      const hitRadius = WARDEN_BOSS.slam.radius + GAME_BALANCE.player.soldierRadius;
      if (distanceSq(boss.x, boss.y, soldier.x, soldier.y) > hitRadius * hitRadius) continue;
      this.damageSquadUnitFromBoss(soldier, WARDEN_BOSS.slam.damage);
    }
    this.spawnExplosionEffect(
      boss.x,
      boss.y,
      WARDEN_BOSS.slam.radius,
      WARDEN_BOSS.colors.telegraph,
    );
  }

  resolveWardenBarrage(boss) {
    const soldiers = [...this.getSoldierPositions()];
    for (const marker of boss.barrageMarkers) {
      for (const soldier of soldiers) {
        if (soldier.unit.dead) continue;
        const hitRadius = marker.radius + GAME_BALANCE.player.soldierRadius;
        if (distanceSq(marker.x, marker.y, soldier.x, soldier.y) > hitRadius * hitRadius) continue;
        this.damageSquadUnitFromBoss(soldier, WARDEN_BOSS.barrage.damage);
      }
      this.spawnExplosionEffect(
        marker.x,
        marker.y,
        marker.radius,
        WARDEN_BOSS.colors.telegraph,
      );
    }
    boss.barrageMarkers = [];
  }

  damageSquadUnitFromBoss(soldier, rawDamage) {
    const unit = soldier?.unit;
    if (!unit || unit.dead) return;
    const armor = this.combatSystem.getUnitArmor?.(unit)
      ?? unit.armor
      ?? this.player.armor
      ?? 0;
    const damage = rawDamage * (1 - Math.max(0, Math.min(0.9, armor)));

    unit.hitFlash = 0.22;
    this.triggerDamageFeedback(soldier.x, soldier.y);
    if (this.debug?.infiniteHp) return;

    unit.hp = Math.max(0, unit.hp - damage);
    if (unit.hp <= 0) this.killSquadUnit(soldier);
  }

  getWardenPlateWorldPosition(boss, plate) {
    const angle = boss.facingAngle + plate.angle;
    return {
      x: boss.x + Math.cos(angle) * plate.distance,
      y: boss.y + Math.sin(angle) * plate.distance,
    };
  }

  getWardenImpactPlate(boss, hitX, hitY) {
    const impactAngle = normalizeAngle(
      Math.atan2(hitY - boss.y, hitX - boss.x) - boss.facingAngle,
    );
    let best = null;
    let bestDifference = Infinity;
    for (const plate of boss.plates) {
      const difference = Math.abs(normalizeAngle(impactAngle - plate.angle));
      if (difference < bestDifference) {
        best = plate;
        bestDifference = difference;
      }
    }
    return bestDifference <= 0.82 ? best : null;
  }

  damageWardenPlate(boss, plate, damage) {
    if (!plate || plate.broken || damage <= 0) return;
    plate.hp = Math.max(0, plate.hp - damage);
    if (plate.hp <= 0) this.breakWardenPlate(boss, plate);
  }

  breakWardenPlate(boss, plate, forced = false) {
    if (!plate || plate.broken) return;
    plate.broken = true;
    plate.hp = 0;
    const position = this.getWardenPlateWorldPosition(boss, plate);
    this.spawnExplosionEffect(
      position.x,
      position.y,
      forced ? 46 : 34,
      forced ? WARDEN_BOSS.colors.telegraph : WARDEN_BOSS.colors.shellEdge,
    );
  }

  applyWardenDamage(amount, hitX, hitY, options = {}) {
    const boss = this.getActiveWarden();
    if (!boss || !Number.isFinite(amount) || amount <= 0) return null;

    const coreExposed = boss.coreExposedUntil > this.elapsed;
    let bodyMultiplier = 1;
    let primaryPlate = null;

    if (coreExposed) {
      bodyMultiplier = WARDEN_BOSS.armor.exposedCoreDamageMultiplier;
    } else {
      const relativeImpactAngle = normalizeAngle(
        Math.atan2(hitY - boss.y, hitX - boss.x) - boss.facingAngle,
      );
      primaryPlate = this.getWardenImpactPlate(boss, hitX, hitY);

      if (primaryPlate && !primaryPlate.broken) {
        bodyMultiplier = primaryPlate.front
          ? WARDEN_BOSS.armor.frontDamageMultiplier
          : WARDEN_BOSS.armor.sideDamageMultiplier;
      } else if (primaryPlate?.broken) {
        bodyMultiplier = WARDEN_BOSS.armor.brokenPlateDamageMultiplier;
      } else if (Math.abs(relativeImpactAngle) >= 2.25) {
        bodyMultiplier = WARDEN_BOSS.armor.rearDamageMultiplier;
      } else {
        bodyMultiplier = WARDEN_BOSS.armor.sideDamageMultiplier;
      }
    }

    if (!coreExposed && primaryPlate && !primaryPlate.broken) {
      this.damageWardenPlate(boss, primaryPlate, amount);
    }

    if (!coreExposed && options.explosive) {
      const blastRadius = Math.max(0, options.blastRadius ?? 0);
      for (const plate of boss.plates) {
        if (plate.broken || plate === primaryPlate) continue;
        const position = this.getWardenPlateWorldPosition(boss, plate);
        if (distanceSq(hitX, hitY, position.x, position.y) > (blastRadius + 22) ** 2) continue;
        this.damageWardenPlate(boss, plate, amount * 0.45);
      }
    }

    const bodyDamage = amount * bodyMultiplier;
    boss.hp = Math.max(0, boss.hp - bodyDamage);
    boss.hitFlash = 0.11;
    this.spawnHitParticles(hitX, hitY);

    if (boss.hp <= 0) this.defeatWarden(boss);
    return { bodyDamage, bodyMultiplier, coreExposed, plate: primaryPlate };
  }

  defeatWarden(boss) {
    if (!boss || boss.dead) return;
    boss.dead = true;
    boss.hp = 0;
    boss.barrageMarkers = [];
    this.wardenDefeated = true;
    this.kills += 1;

    for (let index = 0; index < 4; index += 1) {
      const angle = (Math.PI * 2 * index) / 4;
      this.spawnExplosionEffect(
        boss.x + Math.cos(angle) * 34,
        boss.y + Math.sin(angle) * 34,
        84,
        index % 2 === 0 ? WARDEN_BOSS.colors.core : WARDEN_BOSS.colors.shellEdge,
      );
    }

    const gemCount = 8;
    const value = Math.ceil(WARDEN_BOSS.xpReward / gemCount);
    for (let index = 0; index < gemCount; index += 1) {
      const angle = (Math.PI * 2 * index) / gemCount;
      this.entities.gems.push({
        id: this.entities.createId(),
        x: boss.x + Math.cos(angle) * 55,
        y: boss.y + Math.sin(angle) * 55,
        value,
        radius: 8,
        dead: false,
      });
    }
  }

  drawEnemies(ctx) {
    super.drawEnemies(ctx);
    const boss = this.getActiveWarden();
    if (boss) this.drawWarden(ctx, boss);
  }

  drawWarden(ctx, boss) {
    const colors = WARDEN_BOSS.colors;
    const coreExposed = boss.coreExposedUntil > this.elapsed;
    const pulse = (Math.sin(this.animationClock * (boss.enraged ? 9 : 5)) + 1) * 0.5;

    ctx.save();
    ctx.translate(boss.x, boss.y);
    ctx.rotate(boss.facingAngle);

    ctx.shadowBlur = boss.hitFlash > 0 ? 24 : 14;
    ctx.shadowColor = boss.hitFlash > 0 ? '#ffffff' : colors.core;

    ctx.fillStyle = boss.hitFlash > 0 ? '#ffffff' : colors.flesh;
    ctx.strokeStyle = colors.shellEdge;
    ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.ellipse(-22, 0, 42, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(18, 0, 48, 43, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = boss.enraged ? '#ff6677' : colors.shellEdge;
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    for (const [x1, y1, x2, y2] of [
      [-20, -24, -48, -50],
      [12, -31, 34, -59],
      [-20, 24, -48, 50],
      [12, 31, 34, 59],
    ]) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    ctx.shadowBlur = 18 + pulse * 12;
    ctx.shadowColor = colors.core;
    ctx.fillStyle = coreExposed || boss.enraged ? colors.coreHot : colors.core;
    ctx.beginPath();
    ctx.ellipse(5, 0, coreExposed ? 19 : 12, coreExposed ? 16 : 10, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = colors.shellEdge;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(48, -22);
    ctx.lineTo(76, -34);
    ctx.moveTo(48, 22);
    ctx.lineTo(76, 34);
    ctx.stroke();

    for (const plate of boss.plates) {
      const localX = Math.cos(plate.angle) * plate.distance;
      const localY = Math.sin(plate.angle) * plate.distance;
      if (plate.broken) {
        ctx.fillStyle = `${colors.core}aa`;
        ctx.beginPath();
        ctx.arc(localX, localY, 9, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      const healthRatio = plate.hp / plate.maxHp;
      ctx.save();
      ctx.translate(localX, localY);
      ctx.rotate(plate.angle * 0.5);
      ctx.fillStyle = boss.hitFlash > 0
        ? '#f7f2ff'
        : healthRatio < 0.45
          ? '#5c3c55'
          : colors.shell;
      ctx.strokeStyle = colors.shellEdge;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(-16, -11, 32, 22, 7);
      ctx.fill();
      ctx.stroke();

      if (healthRatio < 0.7) {
        ctx.strokeStyle = colors.core;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-8, -6);
        ctx.lineTo(6, 7);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (boss.enraged) {
      ctx.strokeStyle = `rgba(255,66,95,${0.45 + pulse * 0.35})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, boss.radius + 12 + pulse * 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  drawEffects(ctx) {
    super.drawEffects(ctx);
    const boss = this.getActiveWarden();
    if (!boss) return;

    const colors = WARDEN_BOSS.colors;
    if (boss.state === 'charge_windup') {
      const length = 680;
      const width = boss.radius * 1.45;
      const pulse = (Math.sin(this.animationClock * 12) + 1) * 0.5;
      ctx.save();
      ctx.translate(boss.x, boss.y);
      ctx.rotate(Math.atan2(boss.chargeDirection.y, boss.chargeDirection.x));
      ctx.fillStyle = `rgba(255,66,95,${0.08 + pulse * 0.07})`;
      ctx.strokeStyle = `rgba(255,90,110,${0.62 + pulse * 0.32})`;
      ctx.lineWidth = 3;
      ctx.setLineDash([16, 12]);
      ctx.fillRect(0, -width / 2, length, width);
      ctx.strokeRect(0, -width / 2, length, width);
      ctx.restore();
    }

    if (boss.state === 'slam_windup') {
      const progress = 1 - boss.stateTime / WARDEN_BOSS.slam.telegraphDuration;
      ctx.save();
      ctx.strokeStyle = colors.telegraph;
      ctx.fillStyle = 'rgba(255,66,95,.08)';
      ctx.lineWidth = 4;
      ctx.setLineDash([12, 10]);
      ctx.beginPath();
      ctx.arc(boss.x, boss.y, WARDEN_BOSS.slam.radius * (0.72 + progress * 0.28), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    if (boss.state === 'barrage_windup') {
      const progress = 1 - boss.stateTime / WARDEN_BOSS.barrage.telegraphDuration;
      for (const marker of boss.barrageMarkers) {
        ctx.save();
        ctx.strokeStyle = colors.telegraph;
        ctx.fillStyle = 'rgba(255,54,78,.10)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(marker.x, marker.y, marker.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(marker.x, marker.y, marker.radius * Math.max(0.08, 1 - progress), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    if (boss.state === 'summoning') {
      const pulse = (Math.sin(this.animationClock * 7) + 1) * 0.5;
      ctx.save();
      ctx.strokeStyle = colors.summon;
      ctx.lineWidth = 4;
      ctx.globalAlpha = 0.45 + pulse * 0.45;
      ctx.beginPath();
      ctx.arc(boss.x, boss.y, 92 + pulse * 30, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}

export class UI extends PreviousUI {
  constructor(...args) {
    super(...args);
    this.wardenHud = document.createElement('section');
    this.wardenHud.className = 'boss-hud';
    this.wardenHud.setAttribute('aria-live', 'polite');
    this.wardenHud.innerHTML = `
      <div class="boss-hud__topline">
        <span class="boss-hud__label">BOSS</span>
        <strong class="boss-hud__name">THE WARDEN</strong>
        <span class="boss-hud__state"></span>
      </div>
      <div class="boss-hud__bar"><div class="boss-hud__fill"></div></div>
      <div class="boss-hud__details">
        <span class="boss-hud__hp"></span>
        <span class="boss-hud__armor"></span>
      </div>
    `;
    document.body.append(this.wardenHud);
    this.wardenFill = this.wardenHud.querySelector('.boss-hud__fill');
    this.wardenState = this.wardenHud.querySelector('.boss-hud__state');
    this.wardenHp = this.wardenHud.querySelector('.boss-hud__hp');
    this.wardenArmor = this.wardenHud.querySelector('.boss-hud__armor');
  }

  update(game) {
    super.update(game);
    const boss = game.getActiveWarden?.();
    if (!this.wardenHud) return;

    if (!boss) {
      this.wardenHud.classList.remove('boss-hud--visible');
      return;
    }

    const hpRatio = Math.max(0, Math.min(1, boss.hp / boss.maxHp));
    const intactPlates = boss.plates.filter((plate) => !plate.broken).length;
    const coreExposed = boss.coreExposedUntil > game.elapsed;
    let stateLabel = boss.enraged ? 'ENRAGED' : '';
    if (coreExposed) stateLabel = 'CORE EXPOSED';
    else if (boss.state === 'summoning') stateLabel = 'CALLING SWARM';
    else if (boss.state === 'charge_windup') stateLabel = 'CHARGE';
    else if (boss.state === 'slam_windup') stateLabel = 'GROUND SLAM';
    else if (boss.state === 'barrage_windup') stateLabel = 'SPINE BARRAGE';

    this.wardenHud.classList.add('boss-hud--visible');
    this.wardenHud.classList.toggle('boss-hud--enraged', boss.enraged);
    this.wardenFill.style.width = `${hpRatio * 100}%`;
    this.wardenState.textContent = stateLabel;
    this.wardenHp.textContent = `${Math.ceil(boss.hp)} / ${boss.maxHp}`;
    this.wardenArmor.textContent = `ARMOR PLATES ${intactPlates} / ${boss.plates.length}`;
  }
}
