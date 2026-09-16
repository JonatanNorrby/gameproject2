import { Game as PreviousGame, UI } from './captainReworks.js';
import { CAPTAINS, GAME_BALANCE, UNIT_CLASSES } from '../data/content.js';
import { getSquadSprite } from '../data/sprites.js';
import { CAPTAIN_WEAPON_TUNING } from '../data/captainReworks.js';

const VALE_ID = 'vale';
const MERCER_ID = 'mercer';
const RIFLEMAN_TYPE = 'rifleman';
const ROCKETEER_TYPE = 'rocketeer';
const SHOOT_ANIMATION_DURATION = 0.36;

UNIT_CLASSES.rifleman.weapon.cooldown = CAPTAIN_WEAPON_TUNING.riflemanBaseCooldown;

Object.assign(CAPTAINS[VALE_ID], {
  passiveText: 'Vale plus adjacent Riflemen and Snipers build Focus with every shot. Reaching full Focus activates the full bonus for 5 seconds: +75% fire rate, a 12% chance for +1 pierce, and synchronized volleys. Vale fires 3 rounds one after another at the same target on every attack.',
});
Object.assign(CAPTAINS[MERCER_ID], {
  passiveText: 'Every third attack from an adjacent Rocketeer-class unit gains 3× area size. Rocketeer rockets also gain +75% range on that third attack; Drone Pilot stun attacks gain area only. Mercer rockets still scatter light burst rounds after exploding.',
});

function isPrimaryCaptainUnit(unit, captainId) {
  return Boolean(
    unit
    && !unit.dead
    && unit.captainId === captainId
    && !unit.secondaryCaptain
  );
}

function createCaptainWeaponCombatSystem(ParentCombatSystem) {
  return class CaptainWeaponCombatSystem extends ParentCombatSystem {
    constructor(game) {
      super(game);
      this.mercerCaptainShotCount = 0;
      this.valeCaptainFocusState = null;
      this.valeBurstQueue = [];
    }

    reset() {
      super.reset();
      this.mercerCaptainShotCount = 0;
      this.valeCaptainFocusState = null;
      this.valeBurstQueue = [];
    }

    isAdjacentCaptainUnit(soldier, captainId, expectedType) {
      if (
        isPrimaryCaptainUnit(soldier?.unit, captainId)
        && soldier.unit.type === expectedType
      ) return true;
      return super.isAdjacentCaptainUnit(soldier, captainId, expectedType);
    }

    getValeEligibleRiflemen() {
      const eligible = super.getValeEligibleRiflemen();
      const soldiers = this.game.getWeaponPositions();
      const vale = soldiers.find((soldier) => (
        isPrimaryCaptainUnit(soldier.unit, VALE_ID)
        && soldier.unit.type === RIFLEMAN_TYPE
      ));
      if (vale && !eligible.some((soldier) => soldier.unit.id === vale.unit.id)) eligible.push(vale);
      return eligible;
    }

    updateValeFocusFromShot(soldier, target) {
      const state = super.updateValeFocusFromShot(soldier, target);
      if (isPrimaryCaptainUnit(soldier?.unit, VALE_ID) && state) {
        this.valeCaptainFocusState = state;
      }
      return state;
    }

    getCurrentSoldierPosition(unitId) {
      return this.game.getWeaponPositions().find((soldier) => (
        soldier.unit.id === unitId && !soldier.unit.dead
      )) ?? null;
    }

    fireValeBurstRound(burst, animate = false) {
      const soldier = this.getCurrentSoldierPosition(burst.unitId);
      if (!soldier || !burst.target) return false;

      const before = this.game.entities.projectiles.length;
      super.fireWeapon(soldier, UNIT_CLASSES.rifleman, burst.target, burst.shotEffect);
      if (this.game.entities.projectiles.length <= before) return false;

      const projectile = this.game.entities.projectiles[this.game.entities.projectiles.length - 1];
      projectile.valeCaptainBurst = true;
      this.maybeApplyValePierce(projectile, burst.focusState);

      if (animate) {
        this.game.playUnitAnimation(
          soldier.unit,
          this.game.player.moving ? 'shooting' : 'idle_shooting',
          SHOOT_ANIMATION_DURATION,
        );
      }
      return true;
    }

    fireValeBurst(soldier, unitClass, target, shotEffect) {
      const focusState = this.updateValeFocusFromShot(soldier, target);
      const burst = {
        unitId: soldier.unit.id,
        target,
        shotEffect,
        focusState,
        shotsRemaining: Math.max(1, CAPTAIN_WEAPON_TUNING.valeBurstCount),
        nextShotAt: this.game.elapsed,
      };

      if (this.fireValeBurstRound(burst, false)) burst.shotsRemaining -= 1;
      else burst.shotsRemaining = 0;

      if (burst.shotsRemaining > 0) {
        burst.nextShotAt = this.game.elapsed + CAPTAIN_WEAPON_TUNING.valeBurstShotInterval;
        this.valeBurstQueue.push(burst);
      }

      if (focusState) this.valeFiredThisUpdate.add(soldier.unit.id);
    }

    updateValeBurstRounds() {
      if (this.valeBurstQueue.length === 0) return;

      const now = this.game.elapsed;
      const active = [];
      for (const burst of this.valeBurstQueue) {
        while (burst.shotsRemaining > 0 && now >= burst.nextShotAt) {
          if (!this.fireValeBurstRound(burst, true)) {
            burst.shotsRemaining = 0;
            break;
          }
          burst.shotsRemaining -= 1;
          burst.nextShotAt += CAPTAIN_WEAPON_TUNING.valeBurstShotInterval;
        }
        if (burst.shotsRemaining > 0) active.push(burst);
      }
      this.valeBurstQueue = active;
    }

    fireWeapon(soldier, unitClass, target, shotEffect = null) {
      if (
        isPrimaryCaptainUnit(soldier?.unit, VALE_ID)
        && soldier.unit.type === RIFLEMAN_TYPE
      ) {
        this.fireValeBurst(soldier, unitClass, target, shotEffect);
        return;
      }

      if (
        isPrimaryCaptainUnit(soldier?.unit, MERCER_ID)
        && soldier.unit.type === ROCKETEER_TYPE
      ) {
        this.mercerCaptainShotCount += 1;
        const effect = this.getMercerEffect();
        const everyShots = Math.max(1, effect?.everyShots ?? 3);
        const heavy = this.mercerCaptainShotCount % everyShots === 0;
        const effectiveEffect = heavy
          ? {
              ...(shotEffect ?? {}),
              special: 'mercer-rocket',
              rangeMultiplier: effect?.rangeMultiplier ?? 1,
              aoeMultiplier: effect?.aoeMultiplier ?? 1,
              color: effect?.color,
            }
          : shotEffect;

        const before = this.game.entities.projectiles.length;
        super.fireWeapon(soldier, unitClass, target, effectiveEffect);
        const projectile = this.game.entities.projectiles.length > before
          ? this.game.entities.projectiles[this.game.entities.projectiles.length - 1]
          : null;
        if (projectile) projectile.mercerCaptainRocket = true;
        return;
      }

      super.fireWeapon(soldier, unitClass, target, shotEffect);
    }

    triggerValeVolley() {
      const effect = this.getValeEffect();
      if (this.game.player.moving || this.game.elapsed < this.valeNextVolleyAt) return;
      const group = this.getValeVolleyGroup();
      if (!group) return;

      for (const soldier of group.soldiers) {
        this.fireWeapon(
          soldier,
          UNIT_CLASSES[soldier.unit.type] ?? UNIT_CLASSES.rifleman,
          group.target,
          {
            special: 'vale-coordinated-volley',
            rangeMultiplier: 1,
            aoeMultiplier: 1,
            color: effect.color,
          },
        );
        this.game.playUnitAnimation(
          soldier.unit,
          this.game.player.moving ? 'shooting' : 'idle_shooting',
          SHOOT_ANIMATION_DURATION,
        );
      }

      this.valeNextVolleyAt = this.game.elapsed + effect.volleyInterval;
      this.game.spawnExplosionEffect(group.target.x, group.target.y, 24, effect.color);
    }

    updateSquadWeapons(dt) {
      super.updateSquadWeapons(dt);
      this.updateValeBurstRounds();

      const vale = this.game.player.squad.find((unit) => (
        isPrimaryCaptainUnit(unit, VALE_ID) && unit.type === RIFLEMAN_TYPE
      ));
      if (vale && this.valeCaptainFocusState) {
        this.valeFocus.set(vale.id, this.valeCaptainFocusState);
      } else if (!vale) {
        this.valeCaptainFocusState = null;
        this.valeBurstQueue = [];
      }
    }

    spawnMercerBurstRounds(projectile) {
      const count = CAPTAIN_WEAPON_TUNING.mercerBurstCount;
      const baseAngle = Math.atan2(projectile.vy, projectile.vx);
      for (let i = 0; i < count; i += 1) {
        const angle = baseAngle + (i / count) * Math.PI * 2;
        const speed = CAPTAIN_WEAPON_TUNING.mercerBurstSpeed;
        this.game.entities.projectiles.push({
          id: this.game.entities.createId(),
          kind: 'bullet',
          sourceType: ROCKETEER_TYPE,
          x: projectile.x,
          y: projectile.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: CAPTAIN_WEAPON_TUNING.mercerBurstRadius,
          damage: projectile.damage * CAPTAIN_WEAPON_TUNING.mercerBurstDamageMultiplier,
          life: CAPTAIN_WEAPON_TUNING.mercerBurstLife,
          pierce: 1,
          aoeRadius: 0,
          color: CAPTAIN_WEAPON_TUNING.mercerBurstColor,
          hitIds: new Set(),
          dead: false,
          mercerBurstRound: true,
        });
      }
    }

    explodeProjectile(projectile) {
      const mercerCaptainRocket = Boolean(projectile?.mercerCaptainRocket);
      if (!mercerCaptainRocket) {
        super.explodeProjectile(projectile);
        return;
      }

      const snapshot = {
        x: projectile.x,
        y: projectile.y,
        vx: projectile.vx,
        vy: projectile.vy,
        damage: projectile.damage,
      };
      super.explodeProjectile(projectile);
      this.spawnMercerBurstRounds(snapshot);
    }
  };
}

export class Game extends PreviousGame {
  constructor(...args) {
    super(...args);
    const CaptainWeaponCombatSystem = createCaptainWeaponCombatSystem(this.combatSystem.constructor);
    this.combatSystem = new CaptainWeaponCombatSystem(this);
    this.combatSystem.reset();
  }

  drawPlayer(ctx) {
    if (this.isDropEffectActive('mothership') || this.isDropEffectActive('transformer')) {
      super.drawPlayer(ctx);
      return;
    }

    const damaged = this.getSoldierPositions()
      .filter((soldier) => !soldier.unit.dead && (soldier.unit.hitFlash ?? 0) > 0)
      .map((soldier) => ({ soldier, hitFlash: soldier.unit.hitFlash }));

    for (const { soldier } of damaged) soldier.unit.hitFlash = 0;
    super.drawPlayer(ctx);
    for (const { soldier, hitFlash } of damaged) soldier.unit.hitFlash = hitFlash;

    for (const { soldier, hitFlash } of damaged) {
      const sprite = getSquadSprite(soldier.unit);
      const animation = this.getUnitAnimation(soldier.unit);
      const rotation = this.getUnitSpriteRotation(sprite, animation.name);
      const intensity = Math.max(0.28, Math.min(0.52, hitFlash / 0.16 * 0.52));

      ctx.save();
      ctx.globalAlpha *= intensity;
      ctx.filter = 'sepia(1) saturate(18) hue-rotate(305deg) brightness(1.15)';
      const drawn = this.animationRenderer.draw(
        ctx,
        sprite,
        animation.name,
        animation.time,
        soldier.x,
        soldier.y,
        {
          phase: animation.name === 'running' && this.player.moving ? soldier.unit.id * 0.113 : 0,
          rotation,
        },
      );
      ctx.restore();

      if (!drawn) {
        ctx.save();
        ctx.globalAlpha = 0.32;
        ctx.fillStyle = '#ff334d';
        ctx.beginPath();
        ctx.arc(soldier.x, soldier.y, GAME_BALANCE.player.soldierRadius + 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }
}

export { UI };
