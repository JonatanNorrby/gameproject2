import { Game as PreviousGame, UI } from './thorneEveryFifth.js';
import { CAPTAINS, GAME_BALANCE, UNIT_CLASSES } from '../data/content.js';
import { getUnitModifiers } from '../data/unitModifiers.js';
import { areHexSlotsAdjacent } from '../utils/hexFormation.js';
import { distanceSq } from '../utils/math.js';
import { MERCER_CHAIN_REACTION, VALE_COORDINATED_FIRE } from '../data/captainReworks.js';

const VALE_ID = 'vale';
const MERCER_ID = 'mercer';
const RIFLEMAN_TYPE = 'rifleman';
const ROCKETEER_TYPE = 'rocketeer';
const SHOOT_ANIMATION_DURATION = 0.36;
const FOCUS_EPSILON = 0.999;

Object.assign(CAPTAINS[VALE_ID], {
  description: VALE_COORDINATED_FIRE.description,
  passiveText: VALE_COORDINATED_FIRE.passiveText,
  effect: { ...VALE_COORDINATED_FIRE.effect },
});

Object.assign(CAPTAINS[MERCER_ID], {
  description: MERCER_CHAIN_REACTION.description,
  passiveText: MERCER_CHAIN_REACTION.passiveText,
  effect: { ...MERCER_CHAIN_REACTION.effect },
});

function createCaptainReworksCombatSystem(ParentCombatSystem) {
  return class CaptainReworksCombatSystem extends ParentCombatSystem {
    constructor(game) {
      super(game);
      this.valeFocus = new Map();
      this.valeFiredThisUpdate = new Set();
      this.valeNextVolleyAt = 0;
    }

    reset() {
      super.reset();
      this.valeFocus?.clear();
      this.valeFiredThisUpdate?.clear();
      this.valeNextVolleyAt = 0;
    }

    getCaptainSoldier(captainId, soldiers = this.game.getWeaponPositions()) {
      return soldiers.find((soldier) => (
        !soldier.unit.dead && soldier.unit.captainId === captainId
      )) ?? null;
    }

    isAdjacentCaptainUnit(soldier, captainId, expectedType) {
      if (
        !soldier
        || soldier.unit.dead
        || soldier.unit.captainId
        || soldier.unit.type !== expectedType
      ) return false;

      const soldiers = this.game.getWeaponPositions();
      const captainSoldier = this.getCaptainSoldier(captainId, soldiers);
      if (!captainSoldier) return false;

      if (this.game.isDropEffectActive('transformer')) return true;
      return areHexSlotsAdjacent(soldier.hex, captainSoldier.hex);
    }

    getValeEffect() {
      return CAPTAINS[VALE_ID]?.effect ?? VALE_COORDINATED_FIRE.effect;
    }

    getMercerEffect() {
      return CAPTAINS[MERCER_ID]?.effect ?? MERCER_CHAIN_REACTION.effect;
    }

    getValeFocus(unitId) {
      return Math.max(0, Math.min(1, this.valeFocus.get(unitId)?.focus ?? 0));
    }

    getValeEligibleRiflemen() {
      const soldiers = this.game.getWeaponPositions();
      const captainSoldier = this.getCaptainSoldier(VALE_ID, soldiers);
      if (!captainSoldier) return [];

      const merged = this.game.isDropEffectActive('transformer');
      return soldiers.filter((soldier) => (
        !soldier.unit.dead
        && !soldier.unit.captainId
        && soldier.unit.type === RIFLEMAN_TYPE
        && (merged || areHexSlotsAdjacent(soldier.hex, captainSoldier.hex))
      ));
    }

    updateValeFocusDecay(dt) {
      const effect = this.getValeEffect();
      const eligibleIds = new Set(
        this.getValeEligibleRiflemen().map((soldier) => soldier.unit.id),
      );
      const moving = this.game.player.moving;
      const now = this.game.elapsed;

      for (const [unitId, state] of this.valeFocus.entries()) {
        let decay = 0;
        if (!eligibleIds.has(unitId)) {
          decay = Math.max(effect.moveDecayPerSecond, effect.idleDecayPerSecond) * 1.35;
        } else if (moving) {
          decay = effect.moveDecayPerSecond;
        } else if (now - state.lastShotAt > effect.continuityGrace) {
          decay = effect.idleDecayPerSecond;
        }

        if (decay > 0) state.focus = Math.max(0, state.focus - decay * dt);
        if (state.focus <= 0 && now - state.lastShotAt > effect.continuityGrace * 2) {
          this.valeFocus.delete(unitId);
        }
      }
    }

    updateValeFocusFromShot(soldier, target) {
      if (!this.isAdjacentCaptainUnit(soldier, VALE_ID, RIFLEMAN_TYPE)) return null;

      const effect = this.getValeEffect();
      const previous = this.valeFocus.get(soldier.unit.id);
      const state = previous ?? {
        focus: 0,
        targetId: null,
        lastShotAt: -Infinity,
      };

      if (state.targetId !== null && state.targetId !== target.id) {
        state.focus *= effect.targetChangeRetention;
      }
      state.targetId = target.id;
      state.lastShotAt = this.game.elapsed;

      if (!this.game.player.moving) {
        state.focus = Math.min(1, state.focus + effect.focusGainPerShot);
      }

      this.valeFocus.set(soldier.unit.id, state);
      return state;
    }

    maybeApplyValePierce(projectile, focusState) {
      if (
        !projectile
        || projectile.dead
        || projectile.kind !== 'bullet'
        || !focusState
        || focusState.focus < FOCUS_EPSILON
      ) return;

      const chance = this.getValeEffect().bonusPierceChance;
      if (Math.random() >= chance) return;

      projectile.pierce += 1;
      projectile.valeFocusPierce = true;
      projectile.color = this.getValeEffect().color;
    }

    fireWeapon(soldier, unitClass, target, shotEffect = null) {
      const projectiles = this.game.entities.projectiles;
      const beforeCount = projectiles.length;
      const valeState = (
        soldier.unit.type === RIFLEMAN_TYPE
        && !soldier.unit.captainId
      ) ? this.updateValeFocusFromShot(soldier, target) : null;

      super.fireWeapon(soldier, unitClass, target, shotEffect);

      const projectile = projectiles.length > beforeCount
        ? projectiles[projectiles.length - 1]
        : null;

      if (valeState) {
        this.valeFiredThisUpdate.add(soldier.unit.id);
        this.maybeApplyValePierce(projectile, valeState);
      }

      if (
        projectile
        && projectile.kind === 'rocket'
        && this.isAdjacentCaptainUnit(soldier, MERCER_ID, ROCKETEER_TYPE)
      ) {
        projectile.mercerChainEligible = true;
        projectile.mercerHeavyWarhead = shotEffect?.special === 'mercer-rocket';
      }
    }

    updateValeFocusedCooldowns() {
      const effect = this.getValeEffect();
      for (const unitId of this.valeFiredThisUpdate) {
        const state = this.valeFocus.get(unitId);
        if (!state || state.focus < FOCUS_EPSILON) continue;

        const cooldown = this.fireCooldowns.get(unitId);
        if (!Number.isFinite(cooldown) || cooldown <= 0) continue;
        this.fireCooldowns.set(unitId, cooldown / effect.maxFireRateMultiplier);
      }
    }

    getValeVolleyGroup() {
      const effect = this.getValeEffect();
      const enemiesById = new Map(
        this.game.entities.enemies
          .filter((enemy) => !enemy.dead)
          .map((enemy) => [enemy.id, enemy]),
      );
      const groups = new Map();

      for (const soldier of this.getValeEligibleRiflemen()) {
        const state = this.valeFocus.get(soldier.unit.id);
        if (!state || state.focus < FOCUS_EPSILON) continue;
        const target = enemiesById.get(state.targetId);
        if (!target) continue;

        const modifiers = getUnitModifiers(this.game.unitModifiers, RIFLEMAN_TYPE);
        const range = UNIT_CLASSES.rifleman.weapon.range
          * modifiers.range
          * this.game.getTransformerStatMultiplier();
        if (distanceSq(soldier.x, soldier.y, target.x, target.y) > range * range) continue;

        if (!groups.has(target.id)) groups.set(target.id, { target, soldiers: [] });
        groups.get(target.id).soldiers.push(soldier);
      }

      return [...groups.values()]
        .filter((group) => group.soldiers.length >= effect.minVolleyRiflemen)
        .sort((a, b) => b.soldiers.length - a.soldiers.length)[0] ?? null;
    }

    triggerValeVolley() {
      const effect = this.getValeEffect();
      if (this.game.player.moving || this.game.elapsed < this.valeNextVolleyAt) return;

      const group = this.getValeVolleyGroup();
      if (!group) return;

      for (const soldier of group.soldiers) {
        const projectiles = this.game.entities.projectiles;
        const beforeCount = projectiles.length;

        super.fireWeapon(
          soldier,
          UNIT_CLASSES.rifleman,
          group.target,
          {
            special: 'vale-coordinated-volley',
            rangeMultiplier: 1,
            aoeMultiplier: 1,
            color: effect.color,
          },
        );

        const projectile = projectiles.length > beforeCount
          ? projectiles[projectiles.length - 1]
          : null;
        this.maybeApplyValePierce(projectile, this.valeFocus.get(soldier.unit.id));
        this.game.playUnitAnimation(
          soldier.unit,
          this.game.player.moving ? 'shooting' : 'idle_shooting',
          SHOOT_ANIMATION_DURATION,
        );
      }

      this.valeNextVolleyAt = this.game.elapsed + effect.volleyInterval;
      this.game.spawnExplosionEffect(
        group.target.x,
        group.target.y,
        24,
        effect.color,
      );
    }

    updateSquadWeapons(dt) {
      this.valeFiredThisUpdate.clear();
      this.updateValeFocusDecay(dt);

      super.updateSquadWeapons(dt);

      this.updateValeFocusedCooldowns();
      this.triggerValeVolley();

      const livingRiflemen = new Set(
        this.game.player.squad
          .filter((unit) => !unit.dead && unit.type === RIFLEMAN_TYPE && !unit.captainId)
          .map((unit) => unit.id),
      );
      for (const unitId of this.valeFocus.keys()) {
        if (!livingRiflemen.has(unitId)) this.valeFocus.delete(unitId);
      }
    }

    addMercerMark(enemy) {
      if (!enemy || enemy.dead) return;
      const effect = this.getMercerEffect();
      enemy.mercerMarks = Math.min(
        effect.maxMarks,
        (enemy.mercerMarks ?? 0) + 1,
      );
      enemy.mercerMarksExpireAt = this.game.elapsed + effect.markDuration;
    }

    getEnemiesInProjectileBlast(projectile) {
      const blastRadius = projectile.aoeRadius || projectile.radius * 4;
      return this.game.entities.enemies.filter((enemy) => {
        if (enemy.dead) return false;
        const damageRadius = blastRadius + enemy.radius;
        return distanceSq(
          projectile.x,
          projectile.y,
          enemy.x,
          enemy.y,
        ) <= damageRadius * damageRadius;
      });
    }

    detonateMercerMarks(initialEnemies, projectile) {
      const effect = this.getMercerEffect();
      const queue = [];
      const queuedIds = new Set();

      for (const enemy of initialEnemies) {
        if (!enemy || queuedIds.has(enemy.id)) continue;
        const marks = Math.min(effect.maxMarks, (enemy.mercerMarks ?? 0) + 1);
        if (marks <= 0) continue;
        queue.push({
          id: enemy.id,
          x: enemy.x,
          y: enemy.y,
          marks,
        });
        queuedIds.add(enemy.id);
        enemy.mercerMarks = 0;
        enemy.mercerMarksExpireAt = 0;
      }

      const detonated = new Set();
      while (queue.length > 0) {
        const origin = queue.shift();
        if (detonated.has(origin.id)) continue;
        detonated.add(origin.id);

        const damage = projectile.damage
          * effect.cascadeDamageMultiplier
          * origin.marks;
        this.game.spawnExplosionEffect(
          origin.x,
          origin.y,
          effect.cascadeRadius,
          effect.color,
        );

        for (const enemy of this.game.entities.enemies) {
          if (enemy.dead) continue;
          const radius = effect.cascadeRadius + enemy.radius;
          if (distanceSq(origin.x, origin.y, enemy.x, enemy.y) > radius * radius) continue;

          enemy.hp -= damage;
          enemy.hitFlash = 0.12;
          this.game.spawnHitParticles(enemy.x, enemy.y);

          if (
            !detonated.has(enemy.id)
            && !queuedIds.has(enemy.id)
            && (enemy.mercerMarks ?? 0) > 0
          ) {
            queue.push({
              id: enemy.id,
              x: enemy.x,
              y: enemy.y,
              marks: Math.min(effect.maxMarks, enemy.mercerMarks),
            });
            queuedIds.add(enemy.id);
            enemy.mercerMarks = 0;
            enemy.mercerMarksExpireAt = 0;
          }

          if (enemy.hp <= 0) this.killEnemy(enemy);
        }
      }
    }

    explodeProjectile(projectile) {
      if (!projectile?.mercerChainEligible) {
        super.explodeProjectile(projectile);
        return;
      }

      const affected = this.getEnemiesInProjectileBlast(projectile);
      const heavy = Boolean(projectile.mercerHeavyWarhead);

      super.explodeProjectile(projectile);

      if (heavy) {
        this.detonateMercerMarks(affected, projectile);
        return;
      }

      for (const enemy of affected) this.addMercerMark(enemy);
    }

    updateEnemies(dt) {
      super.updateEnemies(dt);

      const now = this.game.elapsed;
      for (const enemy of this.game.entities.enemies) {
        if ((enemy.mercerMarks ?? 0) <= 0) continue;
        if ((enemy.mercerMarksExpireAt ?? 0) > now) continue;
        enemy.mercerMarks = 0;
        enemy.mercerMarksExpireAt = 0;
      }
    }
  };
}

export class Game extends PreviousGame {
  constructor(...args) {
    super(...args);
    const CaptainReworksCombatSystem = createCaptainReworksCombatSystem(
      this.combatSystem.constructor,
    );
    this.combatSystem = new CaptainReworksCombatSystem(this);
    this.combatSystem.reset();
  }

  drawPlayer(ctx) {
    super.drawPlayer(ctx);
    if (
      this.isDropEffectActive('mothership')
      || this.isDropEffectActive('transformer')
      || CAPTAINS[VALE_ID]?.effect?.type !== 'coordinated-fire'
    ) return;

    for (const soldier of this.getSoldierPositions()) {
      if (soldier.unit.dead || soldier.unit.type !== RIFLEMAN_TYPE || soldier.unit.captainId) continue;
      const focus = this.combatSystem.getValeFocus?.(soldier.unit.id) ?? 0;
      if (focus <= 0.001) continue;

      const radius = GAME_BALANCE.player.soldierRadius + 7;
      ctx.save();
      ctx.strokeStyle = focus >= FOCUS_EPSILON
        ? VALE_COORDINATED_FIRE.effect.color
        : 'rgba(143,255,228,.58)';
      ctx.lineWidth = focus >= FOCUS_EPSILON ? 3 : 2;
      ctx.shadowBlur = focus >= FOCUS_EPSILON ? 14 : 0;
      ctx.shadowColor = VALE_COORDINATED_FIRE.effect.color;
      ctx.beginPath();
      ctx.arc(
        soldier.x,
        soldier.y,
        radius,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * focus,
      );
      ctx.stroke();
      ctx.restore();
    }
  }

  drawEnemies(ctx) {
    super.drawEnemies(ctx);

    const effect = CAPTAINS[MERCER_ID]?.effect;
    const color = effect?.markColor ?? MERCER_CHAIN_REACTION.effect.markColor;
    for (const enemy of this.entities.enemies) {
      const marks = Math.max(0, Math.floor(enemy.mercerMarks ?? 0));
      if (enemy.dead || marks <= 0) continue;

      ctx.save();
      ctx.fillStyle = color;
      ctx.shadowBlur = 9;
      ctx.shadowColor = color;
      for (let index = 0; index < marks; index += 1) {
        const x = enemy.x + (index - (marks - 1) / 2) * 8;
        const y = enemy.y - enemy.radius - 10;
        ctx.beginPath();
        ctx.arc(x, y, 2.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}

export { UI };
