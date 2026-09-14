import { Game as PreviousGame, UI as PreviousUI } from './projectileImages.js';
import { CombatSystem } from '../systems/CombatSystem.js';
import { CAPTAINS, GAME_BALANCE, UNIT_CLASSES } from '../data/content.js';
import { getEffectiveUnitStats, getUnitModifiers } from '../data/unitModifiers.js';
import { areHexSlotsAdjacent } from '../utils/hexFormation.js';
import { normalize } from '../utils/math.js';

const SHOOT_ANIMATION_DURATION = 0.36;
const SHOCKBLADE_TYPE = 'shockblade';

class ShockbladeCombatSystem extends CombatSystem {
  constructor(game) {
    super(game);
    this.meleeAttacks = new Map();
  }

  reset() {
    super.reset();
    this.meleeAttacks.clear();
    this.game.shockbladeSlashes = [];
    for (const unit of this.game.player?.squad ?? []) this.clearMeleeState(unit);
  }

  update(dt) {
    this.updateMeleeAttacks(dt);
    super.update(dt);
  }

  clearMeleeState(unit) {
    if (!unit) return;
    unit.meleeOffsetX = 0;
    unit.meleeOffsetY = 0;
    unit.meleeAttacking = false;
    unit.meleeFacingAngle = null;
  }

  updateMeleeAttacks(dt) {
    this.game.shockbladeSlashes = (this.game.shockbladeSlashes ?? [])
      .filter((effect) => {
        effect.life -= dt;
        return effect.life > 0;
      });

    for (const [unitId, attack] of [...this.meleeAttacks.entries()]) {
      const unit = this.game.player.squad.find((candidate) => candidate.id === unitId);
      if (!unit || unit.dead) {
        this.damageInvulnerability.delete(unitId);
        this.meleeAttacks.delete(unitId);
        continue;
      }

      attack.elapsed += dt;
      const progress = Math.min(1, attack.elapsed / attack.duration);
      const lunge = Math.sin(progress * Math.PI);
      unit.meleeOffsetX = attack.direction.x * attack.lungeDistance * lunge;
      unit.meleeOffsetY = attack.direction.y * attack.lungeDistance * lunge;

      if (!attack.hit && attack.elapsed >= attack.hitTime) {
        attack.hit = true;
        this.performShockbladeSlash(unit, attack);
      }

      if (progress >= 1) {
        this.clearMeleeState(unit);
        this.damageInvulnerability.delete(unitId);
        this.meleeAttacks.delete(unitId);
      }
    }
  }

  startShockbladeAttack(soldier, unitClass, target) {
    const unit = soldier.unit;
    const weapon = unitClass.weapon;
    const modifiers = getUnitModifiers(this.game.unitModifiers, unit.type);
    const statMultiplier = this.game.getTransformerStatMultiplier();
    const direction = normalize(target.x - soldier.x, target.y - soldier.y);
    const duration = weapon.attackDuration ?? SHOOT_ANIMATION_DURATION;
    const hitTime = Math.min(duration, weapon.hitTime ?? duration * 0.5);

    this.meleeAttacks.set(unit.id, {
      direction,
      elapsed: 0,
      duration,
      hitTime,
      hit: false,
      lungeDistance: (weapon.lungeDistance ?? 0) * modifiers.range * statMultiplier,
    });

    unit.meleeAttacking = true;
    unit.meleeFacingAngle = Math.atan2(direction.y, direction.x);
    this.damageInvulnerability.set(unit.id, Infinity);
    this.game.playUnitAnimation(unit, 'shooting', duration);
  }

  performShockbladeSlash(unit, attack) {
    const soldier = this.game.getSoldierPositions().find((candidate) => candidate.unit.id === unit.id);
    if (!soldier) return;

    const unitClass = UNIT_CLASSES[unit.type];
    const weapon = unitClass?.weapon;
    if (!weapon) return;

    const modifiers = getUnitModifiers(this.game.unitModifiers, unit.type);
    const statMultiplier = this.game.getTransformerStatMultiplier();
    const slashRadius = (weapon.aoeRadius ?? weapon.range) * modifiers.blastRadius * statMultiplier;
    const damage = weapon.damage * modifiers.damage * statMultiplier;
    const halfArc = (weapon.arcRadians ?? Math.PI) / 2;
    const minimumFacingDot = Math.cos(halfArc);

    for (const enemy of this.game.entities.enemies) {
      if (enemy.dead) continue;
      const dx = enemy.x - soldier.x;
      const dy = enemy.y - soldier.y;
      const distance = Math.hypot(dx, dy);
      if (distance > slashRadius + enemy.radius) continue;

      if (distance > 0.001) {
        const facingDot = (dx * attack.direction.x + dy * attack.direction.y) / distance;
        if (facingDot < minimumFacingDot) continue;
      }

      enemy.hp -= damage;
      enemy.hitFlash = 0.1;
      this.game.spawnHitParticles(enemy.x, enemy.y);
      if (enemy.hp <= 0) this.killEnemy(enemy);
    }

    this.game.shockbladeSlashes.push({
      x: soldier.x,
      y: soldier.y,
      angle: Math.atan2(attack.direction.y, attack.direction.x),
      radius: slashRadius,
      color: weapon.color ?? '#7ad7ff',
      life: 0.2,
      maxLife: 0.2,
    });
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

      if (weapon.kind === 'melee') {
        if (this.meleeAttacks.has(unit.id)) continue;

        const target = this.findNearestTarget(
          soldier.x,
          soldier.y,
          weapon.range * unitModifiers.range * statMultiplier,
        );
        if (!target) continue;

        this.startShockbladeAttack(soldier, unitClass, target);
        this.fireCooldowns.set(unit.id, weapon.cooldown / unitModifiers.fireRate);
        continue;
      }

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
      if (
        typeof unitId === 'number'
        && !activeUnitIds.has(unitId)
        && !this.meleeAttacks.has(unitId)
      ) {
        this.damageInvulnerability.delete(unitId);
      }
    }
  }
}

export class Game extends PreviousGame {
  constructor(...args) {
    super(...args);
    this.shockbladeSlashes = [];
    this.combatSystem = new ShockbladeCombatSystem(this);
    this.combatSystem.reset();
  }

  getSoldierPositions() {
    return super.getSoldierPositions().map((soldier) => ({
      ...soldier,
      x: soldier.x + (soldier.unit.meleeOffsetX ?? 0),
      y: soldier.y + (soldier.unit.meleeOffsetY ?? 0),
    }));
  }

  getUnitAnimation(unit) {
    const animation = super.getUnitAnimation(unit);
    if (
      unit?.type === SHOCKBLADE_TYPE
      && unit.meleeAttacking
      && (animation.name === 'shooting' || animation.name === 'idle_shooting')
    ) {
      return { ...animation, name: 'shooting' };
    }
    return animation;
  }

  drawEffects(ctx) {
    super.drawEffects(ctx);

    for (const slash of this.shockbladeSlashes ?? []) {
      const alpha = Math.max(0, slash.life / slash.maxLife);
      const progress = 1 - alpha;
      const radius = slash.radius * (0.72 + progress * 0.28);

      ctx.save();
      ctx.translate(slash.x, slash.y);
      ctx.rotate(slash.angle);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = `${slash.color}26`;
      ctx.strokeStyle = slash.color;
      ctx.lineWidth = 5 * alpha + 1;
      ctx.shadowBlur = 18;
      ctx.shadowColor = slash.color;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, -Math.PI / 2, Math.PI / 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }
}

export class UI extends PreviousUI {
  renderSquadStats(counts) {
    super.renderSquadStats(counts);
    const count = counts?.[SHOCKBLADE_TYPE] ?? 0;
    if (count <= 0) return;

    const stats = getEffectiveUnitStats(SHOCKBLADE_TYPE, this.game?.unitModifiers);
    const grid = this.squadBuilderSummary?.children?.[1];
    if (!stats || !grid) return;

    const card = [...grid.children].find(
      (candidate) => candidate.querySelector('strong')?.textContent === stats.label,
    );
    if (!card) return;

    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:8px;">
        <strong style="font-size:12px;color:#f4f7fb;">${stats.label}</strong>
        <span style="font-size:10px;color:#7f8da3;">${count} unit${count === 1 ? '' : 's'}</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px;text-align:center;">
        <span><small style="display:block;color:#718097;font-size:8px;">DMG</small><b style="font-size:11px;">${this.formatCombatValue(stats.damage)}</b></span>
        <span><small style="display:block;color:#718097;font-size:8px;">RATE</small><b style="font-size:11px;">${this.formatCombatValue(stats.fireRate, 2)}/s</b></span>
        <span><small style="display:block;color:#718097;font-size:8px;">TRIGGER</small><b style="font-size:11px;">${this.formatCombatValue(stats.range)}</b></span>
        <span><small style="display:block;color:#718097;font-size:8px;">LUNGE</small><b style="font-size:11px;">${this.formatCombatValue(stats.lungeDistance)}</b></span>
        <span><small style="display:block;color:#718097;font-size:8px;">SLASH</small><b style="font-size:11px;">${this.formatCombatValue(stats.blastRadius)}</b></span>
      </div>
    `;
  }
}
