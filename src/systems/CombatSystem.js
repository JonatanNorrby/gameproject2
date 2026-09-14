import { GAME_BALANCE } from '../data/content.js';
import { distanceSq, normalize } from '../utils/math.js';

export class CombatSystem {
  constructor(game) {
    this.game = game;
    this.fireCooldown = 0;
  }

  reset() { this.fireCooldown = 0.15; }

  update(dt) {
    this.fireCooldown -= dt;
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updateGems(dt);

    if (this.fireCooldown <= 0) this.tryFire();
  }

  tryFire() {
    const game = this.game;
    const weapon = GAME_BALANCE.weapon;
    const speed = weapon.projectileSpeed * game.modifiers.projectileSpeed;
    let fired = false;

    for (const soldier of game.getSoldierPositions()) {
      const target = this.findNearestTarget(soldier.x, soldier.y, weapon.range);
      if (!target) continue;

      const direction = normalize(target.x - soldier.x, target.y - soldier.y);
      game.entities.projectiles.push({
        id: game.entities.createId(),
        x: soldier.x + direction.x * (GAME_BALANCE.player.soldierRadius + 7),
        y: soldier.y + direction.y * (GAME_BALANCE.player.soldierRadius + 7),
        vx: direction.x * speed,
        vy: direction.y * speed,
        radius: weapon.projectileRadius,
        damage: weapon.damage * game.modifiers.damage,
        life: weapon.projectileLife * game.modifiers.projectileLife,
        pierce: weapon.pierce + game.modifiers.pierce,
        hitIds: new Set(),
        dead: false,
      });
      fired = true;
    }

    if (fired) this.fireCooldown = weapon.cooldown / game.modifiers.fireRate;
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
      const touchingSquad = soldiers.some((soldier) => distanceSq(soldier.x, soldier.y, enemy.x, enemy.y) <= minDistance * minDistance);
      if (touchingSquad) {
        const damage = enemy.damage * (1 - player.armor) * dt;
        player.hp -= damage;
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
        projectile.dead = true;
        continue;
      }

      for (const enemy of enemies) {
        if (enemy.dead || projectile.hitIds.has(enemy.id)) continue;
        const radius = projectile.radius + enemy.radius;
        if (distanceSq(projectile.x, projectile.y, enemy.x, enemy.y) > radius * radius) continue;

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
