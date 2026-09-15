import { Game as PreviousGame, UI as PreviousUI } from './gameplayPolish.js';
import { CAPTAINS, ENEMY_TYPES, GAME_BALANCE, UNIT_CLASSES } from '../data/content.js';
import { FRAME_SPRITES, createStandardFrameSet } from '../data/sprites.js';
import { getUnitModifiers } from '../data/unitModifiers.js';
import { THORNE_CAPTAIN } from '../data/captainThorne.js';
import { distanceSq } from '../utils/math.js';

const THORNE_ID = THORNE_CAPTAIN.id;
const SHOCKBLADE_TYPE = 'shockblade';
const DAMAGE_FEEDBACK_INTERVAL = 0.16;
const DAMAGE_INVULNERABILITY_DURATION = 0.1;

if (!CAPTAINS[THORNE_ID]) CAPTAINS[THORNE_ID] = THORNE_CAPTAIN;
if (!FRAME_SPRITES.captains[THORNE_ID]) {
  FRAME_SPRITES.captains[THORNE_ID] = createStandardFrameSet('captain_thorne', {
    drawSize: 54,
    shootingFps: 5,
    shootingLoop: false,
  });
}

function clampArmor(value) {
  return Math.max(0, Math.min(0.9, Number(value) || 0));
}

function createThorneCombatSystem(ParentCombatSystem) {
  return class ThorneCombatSystem extends ParentCombatSystem {
    constructor(game) {
      super(game);
      this.thorneCooldowns = new Map();
    }

    reset() {
      super.reset();
      this.thorneCooldowns?.clear();
    }

    isThorneActive() {
      return this.game.player.squad.some((unit) => (
        !unit.dead && unit.captainId === THORNE_ID
      ));
    }

    getUnitArmor(unit) {
      const captainArmor = unit?.captainId
        ? CAPTAINS[unit.captainId]?.armor
        : null;
      return clampArmor(unit?.armor ?? captainArmor ?? this.game.player.armor);
    }

    getMeleeWeapon(unit) {
      const baseWeapon = UNIT_CLASSES[unit?.type]?.weapon ?? UNIT_CLASSES.shockblade.weapon;
      if (unit?.captainId !== THORNE_ID) return baseWeapon;
      return { ...baseWeapon, ...THORNE_CAPTAIN.weapon };
    }

    startShockbladeAttack(soldier, unitClass, target) {
      super.startShockbladeAttack(soldier, unitClass, target);
      if (soldier.unit.captainId !== THORNE_ID) return;

      const attack = this.meleeAttacks?.get(soldier.unit.id);
      if (attack) attack.lungeDistance = 0;
    }

    performShockbladeSlash(unit, attack) {
      const fullCircle = (
        unit?.captainId === THORNE_ID
        || (unit?.type === SHOCKBLADE_TYPE && this.isThorneActive())
      );
      if (!fullCircle) {
        super.performShockbladeSlash(unit, attack);
        return;
      }

      const soldier = this.game.getSoldierPositions()
        .find((candidate) => candidate.unit.id === unit.id);
      if (!soldier) return;

      const weapon = this.getMeleeWeapon(unit);
      const modifiers = getUnitModifiers(this.game.unitModifiers, unit.type);
      const statMultiplier = this.game.getTransformerStatMultiplier();
      const slashRadius = (weapon.aoeRadius ?? weapon.range)
        * modifiers.blastRadius
        * statMultiplier;
      const damage = weapon.damage * modifiers.damage * statMultiplier;
      let totalDamageDealt = 0;

      for (const enemy of this.game.entities.enemies) {
        if (enemy.dead) continue;
        const dx = enemy.x - soldier.x;
        const dy = enemy.y - soldier.y;
        const distance = Math.hypot(dx, dy);
        if (distance > slashRadius + enemy.radius) continue;

        const hpBefore = Math.max(0, enemy.hp);
        enemy.hp -= damage;
        totalDamageDealt += Math.min(hpBefore, damage);
        enemy.hitFlash = 0.1;
        this.game.spawnHitParticles(enemy.x, enemy.y);
        if (enemy.hp <= 0) this.killEnemy(enemy);
      }

      if (unit.captainId === THORNE_ID && weapon.lifesteal > 0 && totalDamageDealt > 0) {
        unit.hp = Math.min(unit.maxHp, unit.hp + totalDamageDealt * weapon.lifesteal);
        this.game.syncCaptainHealth();
      }

      const slashAngle = Math.atan2(attack.direction.y, attack.direction.x);
      for (const angle of [slashAngle, slashAngle + Math.PI]) {
        this.game.shockbladeSlashes.push({
          x: soldier.x,
          y: soldier.y,
          angle,
          radius: slashRadius,
          color: weapon.color ?? '#ff9adf',
          life: 0.24,
          maxLife: 0.24,
        });
      }
    }

    updateSquadWeapons(dt) {
      const game = this.game;
      const soldiers = game.getWeaponPositions();
      const thorneSoldier = soldiers.find((soldier) => (
        !soldier.unit.dead && soldier.unit.captainId === THORNE_ID
      ));

      if (thorneSoldier) {
        this.fireCooldowns.set(thorneSoldier.unit.id, Number.POSITIVE_INFINITY);
      }

      super.updateSquadWeapons(dt);

      if (!thorneSoldier) {
        this.thorneCooldowns.clear();
        return;
      }

      const unit = thorneSoldier.unit;
      const modifiers = getUnitModifiers(game.unitModifiers, unit.type);
      const statMultiplier = game.getTransformerStatMultiplier();
      const attackSpeed = game.getAttackSpeedMultiplier();
      const weapon = this.getMeleeWeapon(unit);

      let cooldown = (this.thorneCooldowns.get(unit.id) ?? 0.15) - dt * attackSpeed;
      this.thorneCooldowns.set(unit.id, cooldown);
      if (cooldown > 0 || this.meleeAttacks?.has(unit.id)) return;

      const target = this.findNearestTarget(
        thorneSoldier.x,
        thorneSoldier.y,
        weapon.range * modifiers.range * statMultiplier,
      );
      if (!target) return;

      this.startShockbladeAttack(
        thorneSoldier,
        { ...UNIT_CLASSES[SHOCKBLADE_TYPE], weapon },
        target,
      );
      this.thorneCooldowns.set(unit.id, weapon.cooldown / modifiers.fireRate);
    }

    updateEnemies(dt) {
      const game = this.game;
      const standardEnemies = [];
      const rangedEnemies = [];

      for (const enemy of game.entities.enemies) {
        if (ENEMY_TYPES[enemy.type]?.ranged) rangedEnemies.push(enemy);
        else standardEnemies.push(enemy);
      }

      this.updateStandardEnemiesWithUnitArmor(standardEnemies, dt);
      this.updateRangedEnemies(rangedEnemies, dt);
    }

    updateStandardEnemiesWithUnitArmor(enemies, dt) {
      const game = this.game;
      const player = game.player;
      const mothershipActive = game.isDropEffectActive('mothership');
      const transformerActive = game.isDropEffectActive('transformer');
      const soldiers = transformerActive ? [] : game.getSoldierPositions();

      for (const enemy of enemies) {
        if (enemy.dead) continue;
        enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
        if (mothershipActive) continue;

        const dx = player.x - enemy.x;
        const dy = player.y - enemy.y;
        const length = Math.hypot(dx, dy) || 1;
        enemy.x += (dx / length) * enemy.speed * dt;
        enemy.y += (dy / length) * enemy.speed * dt;

        if (transformerActive) {
          const minDistance = GAME_BALANCE.player.soldierRadius * 2.4 + enemy.radius;
          if (distanceSq(player.x, player.y, enemy.x, enemy.y) > minDistance * minDistance) continue;
          if (this.damageInvulnerability.has('transformer')) continue;

          const damage = enemy.damage
            * (1 - clampArmor(player.armor))
            * DAMAGE_INVULNERABILITY_DURATION;
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

        const damage = enemy.damage
          * (1 - this.getUnitArmor(unit))
          * DAMAGE_INVULNERABILITY_DURATION;
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

    updateEnemyProjectiles(projectiles, dt) {
      const game = this.game;
      const player = game.player;
      const mothershipActive = game.isDropEffectActive('mothership');
      const transformerActive = game.isDropEffectActive('transformer');

      for (const projectile of projectiles) {
        if (projectile.dead) continue;

        projectile.x += projectile.vx * dt;
        projectile.y += projectile.vy * dt;
        projectile.life -= dt;
        if (projectile.life <= 0) {
          projectile.dead = true;
          continue;
        }

        if (mothershipActive) continue;

        if (transformerActive) {
          const hitRadius = projectile.radius + GAME_BALANCE.player.soldierRadius * 2.4;
          if (distanceSq(projectile.x, projectile.y, player.x, player.y) > hitRadius * hitRadius) continue;

          projectile.dead = true;
          if (this.damageInvulnerability.has('transformer')) continue;

          const damage = projectile.damage * (1 - clampArmor(player.armor));
          if (!game.debug?.infiniteHp) game.damageMergedSquad(damage, player.x, player.y);
          this.damageInvulnerability.set('transformer', DAMAGE_INVULNERABILITY_DURATION);
          this.triggerRangedDamageFeedback(player.x, player.y);
          continue;
        }

        const soldiers = game.getSoldierPositions();
        for (const soldier of soldiers) {
          if (soldier.unit.dead) continue;
          const hitRadius = projectile.radius + GAME_BALANCE.player.soldierRadius;
          if (distanceSq(projectile.x, projectile.y, soldier.x, soldier.y) > hitRadius * hitRadius) continue;

          projectile.dead = true;
          const unit = soldier.unit;
          if (this.damageInvulnerability.has(unit.id)) break;

          unit.hitFlash = DAMAGE_FEEDBACK_INTERVAL;
          if (!game.debug?.infiniteHp) {
            unit.hp = Math.max(
              0,
              unit.hp - projectile.damage * (1 - this.getUnitArmor(unit)),
            );
          }
          this.damageInvulnerability.set(unit.id, DAMAGE_INVULNERABILITY_DURATION);
          this.triggerRangedDamageFeedback(soldier.x, soldier.y);

          if (!game.debug?.infiniteHp && unit.hp <= 0) game.killSquadUnit(soldier);
          break;
        }
      }
    }
  };
}

export class Game extends PreviousGame {
  constructor(...args) {
    super(...args);
    const ThorneCombatSystem = createThorneCombatSystem(this.combatSystem.constructor);
    this.combatSystem = new ThorneCombatSystem(this);
    this.combatSystem.reset();
  }
}

export class UI extends PreviousUI {
  renderCaptainOptions() {
    super.renderCaptainOptions();
    if (!this.captainOptions) return;

    this.captainOptions.style.gridTemplateColumns = window.innerWidth <= 760
      ? '1fr'
      : 'repeat(3, minmax(0, 1fr))';
  }
}
