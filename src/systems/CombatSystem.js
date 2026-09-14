import { CAPTAINS, GAME_BALANCE, UNIT_CLASSES } from '../data/content.js';
import { getUnitModifiers } from '../data/unitModifiers.js';
import { areHexSlotsAdjacent } from '../utils/hexFormation.js';
import { distanceSq, normalize } from '../utils/math.js';

const DAMAGE_FEEDBACK_INTERVAL = 0.16;
const DAMAGE_INVULNERABILITY_DURATION = 0.1;
const SHOOT_ANIMATION_DURATION = 0.36;

export class CombatSystem {
  constructor(game) {
    this.game = game;
    this.fireCooldowns = new Map();
    this.shotCounts = new Map();
    this.damageFeedbackCooldown = 0;
    this.damageInvulnerability = new Map();
  }

  reset() {
    this.fireCooldowns.clear();
    this.shotCounts.clear();
    this.damageFeedbackCooldown = 0;
    this.damageInvulnerability.clear();
  }

  update(dt) {
    this.damageFeedbackCooldown = Math.max(0, this.damageFeedbackCooldown - dt);
    for (const [unitId, time] of this.damageInvulnerability.entries()) {
      const remaining = time - dt;
      if (remaining <= 0) this.damageInvulnerability.delete(unitId);
      else this.damageInvulnerability.set(unitId, remaining);
    }

    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updateGems(dt);
    this.updateSquadWeapons(dt);
  }

  updateSquadWeapons(dt) {
    const game = this.game;
    if (game.isDropEffectActive('mothership')) return;

    const soldiers = game.getWeaponPositions();
    const captainSoldier = soldiers.find((soldier) => Boolean(soldier.unit.captainId));
    const captain = captainSoldier ? CAPTAINS[captainSoldier.unit.captainId] : null;
    const activeUnitIds = new Set();
    const merged = game.isDropEffectActive('transformer');
    const temporaryAttackSpeed = game.getAttackSpeedMultiplier();
    const statMultiplier = game.getTransformerStatMultiplier();

    for (const soldier of soldiers) {
      const unit = soldier.unit;
      const unitClass = UNIT_CLASSES[unit.type] ?? UNIT_CLASSES.rifleman;
      const weapon = unitClass.weapon;
      const unitModifiers = getUnitModifiers(game.unitModifiers, unit.type);
      const adjacentToCaptain = Boolean(
        captainSoldier
        && captain
        && unit.id !== captainSoldier.unit.id
        && (merged || areHexSlotsAdjacent(soldier.hex, captainSoldier.hex))
      );
      const valeFireRate = (
        adjacentToCaptain
        && captain?.effect.type === 'rifle-fire-rate'
        && unit.type === 'rifleman'
      ) ? captain.effect.fireRateMultiplier : 1;

      activeUnitIds.add(unit.id);

      const cooldown = (this.fireCooldowns.get(unit.id) ?? 0.15)
        - dt * valeFireRate * temporaryAttackSpeed;
      this.fireCooldowns.set(unit.id, cooldown);
      if (cooldown > 0) continue;

      const mercerEligible = Boolean(
        adjacentToCaptain
        && captain?.effect.type === 'rocketeer-special-rocket'
        && unit.type === 'rocketeer'
      );
      if (!mercerEligible) this.shotCounts.delete(unit.id);
      const nextShotCount = mercerEligible ? (this.shotCounts.get(unit.id) ?? 0) + 1 : 0;
      const mercerSpecial = mercerEligible && nextShotCount % captain.effect.everyShots === 0;
      const rangeMultiplier = mercerSpecial ? captain.effect.rangeMultiplier : 1;
      const target = this.findNearestTarget(
        soldier.x,
        soldier.y,
        weapon.range * unitModifiers.range * rangeMultiplier * statMultiplier,
      );
      if (!target) continue;

      this.fireWeapon(soldier, unitClass, target, mercerSpecial ? {
        special: 'mercer-rocket',
        rangeMultiplier: captain.effect.rangeMultiplier,
        aoeMultiplier: captain.effect.aoeMultiplier,
        color: captain.effect.color,
      } : null);
      game.playUnitAnimation(
        unit,
        game.player.moving ? 'shooting' : 'idle_shooting',
        SHOOT_ANIMATION_DURATION,
      );
      if (mercerEligible) this.shotCounts.set(unit.id, nextShotCount);
      this.fireCooldowns.set(unit.id, weapon.cooldown / unitModifiers.fireRate);
    }

    for (const unitId of this.fireCooldowns.keys()) {
      if (!activeUnitIds.has(unitId)) this.fireCooldowns.delete(unitId);
    }
    for (const unitId of this.shotCounts.keys()) {
      if (!activeUnitIds.has(unitId)) this.shotCounts.delete(unitId);
    }
    for (const unitId of this.damageInvulnerability.keys()) {
      if (typeof unitId === 'number' && !activeUnitIds.has(unitId)) {
        this.damageInvulnerability.delete(unitId);
      }
    }
  }

  fireWeapon(soldier, unitClass, target, shotEffect = null) {
    const game = this.game;
    const weapon = unitClass.weapon;
    const unitModifiers = getUnitModifiers(game.unitModifiers, soldier.unit.type);
    const direction = normalize(target.x - soldier.x, target.y - soldier.y);
    const statMultiplier = game.getTransformerStatMultiplier();
    const speed = weapon.projectileSpeed * unitModifiers.projectileSpeed * statMultiplier;
    const explosive = weapon.kind === 'rocket';
    const rangeMultiplier = shotEffect?.rangeMultiplier ?? 1;
    const aoeMultiplier = shotEffect?.aoeMultiplier ?? 1;
    const basePierce = explosive ? weapon.pierce : weapon.pierce + unitModifiers.pierce;

    game.entities.projectiles.push({
      id: game.entities.createId(),
      kind: weapon.kind,
      special: shotEffect?.special ?? null,
      sourceType: soldier.unit.type,
      x: soldier.x + direction.x * (GAME_BALANCE.player.soldierRadius + weapon.projectileRadius + 2),
      y: soldier.y + direction.y * (GAME_BALANCE.player.soldierRadius + weapon.projectileRadius + 2),
      vx: direction.x * speed,
      vy: direction.y * speed,
      radius: weapon.projectileRadius,
      damage: weapon.damage * unitModifiers.damage * statMultiplier,
      life: weapon.projectileLife * unitModifiers.range * rangeMultiplier * statMultiplier,
      pierce: Math.max(1, Math.round(basePierce * statMultiplier)),
      aoeRadius: (weapon.aoeRadius ?? 0) * unitModifiers.blastRadius * aoeMultiplier * statMultiplier,
      color: shotEffect?.color ?? weapon.color,
      hitIds: new Set(),
      dead: false,
    });
  }

  findNearestTarget(x, y, range) {
    let target = null;
    let bestDistance = range * range;
    for (const enemy of this.game.entities.enemies) {
      if (enemy.dead) continue;
      const distSq = distanceSq(x, y, enemy.x, enemy.y);
      if (distSq < bestDistance) {
        bestDistance = distSq;
        target = enemy;
      }
    }
    return target;
  }

  updateEnemies(dt) {
    const game = this.game;
    const player = game.player;
    const mothershipActive = game.isDropEffectActive('mothership');
    const transformerActive = game.isDropEffectActive('transformer');
    const soldiers = transformerActive ? [] : game.getSoldierPositions();

    for (const enemy of game.entities.enemies) {
      if (enemy.dead) continue;
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);

      if (mothershipActive) continue;

      const direction = normalize(player.x - enemy.x, player.y - enemy.y);
      enemy.x += direction.x * enemy.speed * dt;
      enemy.y += direction.y * enemy.speed * dt;

      if (transformerActive) {
        const minDistance = GAME_BALANCE.player.soldierRadius * 2.4 + enemy.radius;
        if (distanceSq(player.x, player.y, enemy.x, enemy.y) > minDistance * minDistance) continue;
        if (this.damageInvulnerability.has('transformer')) continue;

        const damage = enemy.damage * (1 - player.armor) * DAMAGE_INVULNERABILITY_DURATION;
        if (!game.debug?.infiniteHp) game.damageMergedSquad(damage, player.x, player.y);
        this.damageInvulnerability.set('transformer', DAMAGE_INVULNERABILITY_DURATION);

        if (this.damageFeedbackCooldown <= 0) {
          game.triggerDamageFeedback(player.x, player.y);
          this.damageFeedbackCooldown = DAMAGE_FEEDBACK_INTERVAL;
        }
        continue;
      }

      const minDistance = GAME_BALANCE.player.soldierRadius + enemy.radius;
      const hitSoldier = soldiers.find((soldier) => (
        !soldier.unit.dead
        && distanceSq(soldier.x, soldier.y, enemy.x, enemy.y) <= minDistance * minDistance
      ));
      if (!hitSoldier) continue;

      const unit = hitSoldier.unit;
      if (this.damageInvulnerability.has(unit.id)) continue;

      const damage = enemy.damage * (1 - player.armor) * DAMAGE_INVULNERABILITY_DURATION;
      unit.hitFlash = DAMAGE_FEEDBACK_INTERVAL;
      if (!game.debug?.infiniteHp) unit.hp = Math.max(0, unit.hp - damage);
      this.damageInvulnerability.set(unit.id, DAMAGE_INVULNERABILITY_DURATION);

      if (this.damageFeedbackCooldown <= 0) {
        game.triggerDamageFeedback(hitSoldier.x, hitSoldier.y);
        this.damageFeedbackCooldown = DAMAGE_FEEDBACK_INTERVAL;
      }

      if (!game.debug?.infiniteHp && unit.hp <= 0) game.killSquadUnit(hitSoldier);
    }
  }

  updateProjectiles(dt) {
    const enemies = this.game.entities.enemies;

    for (const projectile of this.game.entities.projectiles) {
      if (projectile.dead) continue;

      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      projectile.life -= dt;

      if (projectile.life <= 0) {
        if (projectile.kind === 'rocket') this.explodeProjectile(projectile);
        else projectile.dead = true;
        continue;
      }

      for (const enemy of enemies) {
        if (enemy.dead || projectile.hitIds.has(enemy.id)) continue;
        const radius = projectile.radius + enemy.radius;
        if (distanceSq(projectile.x, projectile.y, enemy.x, enemy.y) > radius * radius) continue;

        if (projectile.kind === 'rocket') {
          this.explodeProjectile(projectile);
          break;
        }

        projectile.hitIds.add(enemy.id);
        enemy.hp -= projectile.damage;
        enemy.hitFlash = 0.07;
        this.game.spawnHitParticles(projectile.x, projectile.y);
        projectile.pierce -= 1;

        if (enemy.hp <= 0) this.killEnemy(enemy);
        if (projectile.pierce <= 0) {
          projectile.dead = true;
          break;
        }
      }
    }
  }

  explodeProjectile(projectile) {
    if (projectile.dead) return;
    projectile.dead = true;

    const blastRadius = projectile.aoeRadius || projectile.radius * 4;
    for (const enemy of this.game.entities.enemies) {
      if (enemy.dead) continue;
      const damageRadius = blastRadius + enemy.radius;
      if (distanceSq(projectile.x, projectile.y, enemy.x, enemy.y) > damageRadius * damageRadius) continue;

      enemy.hp -= projectile.damage;
      enemy.hitFlash = 0.1;
      if (enemy.hp <= 0) this.killEnemy(enemy);
    }

    this.game.spawnExplosionEffect(projectile.x, projectile.y, blastRadius, projectile.color);
  }

  nukeAllEnemies() {
    for (const enemy of [...this.game.entities.enemies]) {
      if (!enemy.dead) this.killEnemy(enemy, { allowDrop: false });
    }
  }

  killEnemy(enemy, { allowDrop = true } = {}) {
    if (enemy.dead) return;
    enemy.dead = true;
    this.game.kills += 1;
    this.game.entities.gems.push({
      id: this.game.entities.createId(),
      x: enemy.x,
      y: enemy.y,
      value: enemy.xp,
      radius: 6 + Math.min(4, enemy.xp),
      dead: false,
    });
    if (allowDrop) this.game.trySpawnGroundDrop(enemy.x, enemy.y);
    this.game.spawnDeathParticles(enemy.x, enemy.y, enemy.radius);
  }

  updateGems(dt) {
    const player = this.game.player;
    for (const gem of this.game.entities.gems) {
      if (gem.dead) continue;
      const distSq = distanceSq(player.x, player.y, gem.x, gem.y);
      const magnetSq = player.magnetRadius * player.magnetRadius;
      if (distSq <= magnetSq) {
        const direction = normalize(player.x - gem.x, player.y - gem.y);
        const pull = 190 + Math.max(0, player.magnetRadius - Math.sqrt(distSq)) * 6;
        gem.x += direction.x * pull * dt;
        gem.y += direction.y * pull * dt;
      }
      const collectRadius = player.radius + gem.radius + 4;
      if (distanceSq(player.x, player.y, gem.x, gem.y) <= collectRadius * collectRadius) {
        gem.dead = true;
        this.game.progression.addXp(gem.value);
      }
    }
  }
}
