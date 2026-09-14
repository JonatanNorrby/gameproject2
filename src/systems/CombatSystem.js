import { CAPTAINS, GAME_BALANCE, UNIT_CLASSES } from '../data/content.js';
import { areHexSlotsAdjacent } from '../utils/hexFormation.js';
import { distanceSq, normalize } from '../utils/math.js';

const DAMAGE_FEEDBACK_INTERVAL = 0.16;
const DAMAGE_INVULNERABILITY_DURATION = 0.1;

export class CombatSystem {
  constructor(game) {
    this.game = game;
    this.fireCooldowns = new Map();
    this.shotCounts = new Map();
    this.damageFeedbackCooldown = 0;
    this.damageInvulnerability = 0;
  }

  reset() {
    this.fireCooldowns.clear();
    this.shotCounts.clear();
    this.damageFeedbackCooldown = 0;
    this.damageInvulnerability = 0;
  }

  update(dt) {
    this.damageFeedbackCooldown = Math.max(0, this.damageFeedbackCooldown - dt);
    this.damageInvulnerability = Math.max(0, this.damageInvulnerability - dt);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updateGems(dt);
    this.updateSquadWeapons(dt);
  }

  updateSquadWeapons(dt) {
    const game = this.game;
    const soldiers = game.getSoldierPositions();
    const captainSoldier = soldiers.find((soldier) => Boolean(soldier.unit.captainId));
    const captain = captainSoldier ? CAPTAINS[captainSoldier.unit.captainId] : null;
    const activeUnitIds = new Set();

    for (const soldier of soldiers) {
      const unit = soldier.unit;
      const unitClass = UNIT_CLASSES[unit.type] ?? UNIT_CLASSES.rifleman;
      const weapon = unitClass.weapon;
      const adjacentToCaptain = Boolean(
        captainSoldier
        && captain
        && unit.id !== captainSoldier.unit.id
        && areHexSlotsAdjacent(soldier.hex, captainSoldier.hex)
      );
      const valeFireRate = (
        adjacentToCaptain
        && captain?.effect.type === 'rifle-fire-rate'
        && unit.type === 'rifleman'
      ) ? captain.effect.fireRateMultiplier : 1;

      activeUnitIds.add(unit.id);

      const cooldown = (this.fireCooldowns.get(unit.id) ?? 0.15) - dt * valeFireRate;
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
      const target = this.findNearestTarget(soldier.x, soldier.y, weapon.range * rangeMultiplier);
      if (!target) continue;

      this.fireWeapon(soldier, unitClass, target, mercerSpecial ? {
        special: 'mercer-rocket',
        rangeMultiplier: captain.effect.rangeMultiplier,
        aoeMultiplier: captain.effect.aoeMultiplier,
        color: captain.effect.color,
      } : null);
      if (mercerEligible) this.shotCounts.set(unit.id, nextShotCount);
      this.fireCooldowns.set(unit.id, weapon.cooldown / game.modifiers.fireRate);
    }

    for (const unitId of this.fireCooldowns.keys()) {
      if (!activeUnitIds.has(unitId)) this.fireCooldowns.delete(unitId);
    }
    for (const unitId of this.shotCounts.keys()) {
      if (!activeUnitIds.has(unitId)) this.shotCounts.delete(unitId);
    }
  }

  fireWeapon(soldier, unitClass, target, shotEffect = null) {
    const game = this.game;
    const weapon = unitClass.weapon;
    const direction = normalize(target.x - soldier.x, target.y - soldier.y);
    const speed = weapon.projectileSpeed * game.modifiers.projectileSpeed;
    const explosive = weapon.kind === 'rocket';
    const rangeMultiplier = shotEffect?.rangeMultiplier ?? 1;
    const aoeMultiplier = shotEffect?.aoeMultiplier ?? 1;

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
      damage: weapon.damage * game.modifiers.damage,
      life: weapon.projectileLife * game.modifiers.projectileLife * rangeMultiplier,
      pierce: explosive ? weapon.pierce : weapon.pierce + game.modifiers.pierce,
      aoeRadius: (weapon.aoeRadius ?? 0) * aoeMultiplier,
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
    const soldiers = game.getSoldierPositions();

    for (const enemy of game.entities.enemies) {
      if (enemy.dead) continue;
      const direction = normalize(player.x - enemy.x, player.y - enemy.y);
      enemy.x += direction.x * enemy.speed * dt;
      enemy.y += direction.y * enemy.speed * dt;
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);

      const minDistance = GAME_BALANCE.player.soldierRadius + enemy.radius;
      const hitSoldier = soldiers.find((soldier) => (
        distanceSq(soldier.x, soldier.y, enemy.x, enemy.y) <= minDistance * minDistance
      ));

      if (hitSoldier && this.damageInvulnerability <= 0) {
        const damage = enemy.damage * (1 - player.armor) * DAMAGE_INVULNERABILITY_DURATION;
        if (!game.debug?.infiniteHp) player.hp -= damage;
        this.damageInvulnerability = DAMAGE_INVULNERABILITY_DURATION;

        if (this.damageFeedbackCooldown <= 0) {
          game.triggerDamageFeedback(hitSoldier.x, hitSoldier.y);
          this.damageFeedbackCooldown = DAMAGE_FEEDBACK_INTERVAL;
        }
      }
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

  killEnemy(enemy) {
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
