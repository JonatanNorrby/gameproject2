import { Game as PreviousGame, UI as PreviousUI } from './bossRuntime.js';
import { GAME_BALANCE, UNIT_CLASSES } from '../data/content.js';
import { STORMLANCER_TYPE } from '../data/stormlancer.js';
import { getUnitModifiers } from '../data/unitModifiers.js';
import { distanceSq, normalize } from '../utils/math.js';

const ARC_LIFETIME = 0.18;

function isAliveTarget(target) {
  return Boolean(target && !target.dead && (target.hp ?? 1) > 0);
}

function createStormlancerCombatSystem(ParentCombatSystem) {
  return class StormlancerCombatSystem extends ParentCombatSystem {
    reset() {
      super.reset();
      if (this.game) this.game.stormlancerArcs = [];
    }

    startShockbladeAttack(soldier, unitClass, target) {
      super.startShockbladeAttack(soldier, unitClass, target);
      if (soldier?.unit?.type !== STORMLANCER_TYPE) return;

      const attack = this.meleeAttacks?.get(soldier.unit.id);
      if (attack) attack.primaryTarget = target;
    }

    performShockbladeSlash(unit, attack) {
      if (unit?.type !== STORMLANCER_TYPE) {
        super.performShockbladeSlash(unit, attack);
        return;
      }

      this.performStormlancerStrike(unit, attack);
    }

    performStormlancerStrike(unit, attack) {
      const game = this.game;
      const soldier = game.getSoldierPositions()
        .find((candidate) => candidate.unit.id === unit.id);
      if (!soldier) return;

      const weapon = UNIT_CLASSES[STORMLANCER_TYPE]?.weapon;
      if (!weapon) return;

      const modifiers = getUnitModifiers(game.unitModifiers, STORMLANCER_TYPE);
      const statMultiplier = game.getTransformerStatMultiplier();
      const strikeRange = weapon.range * modifiers.range * statMultiplier;
      const chainRange = (weapon.aoeRadius ?? 0) * modifiers.blastRadius * statMultiplier;
      const maxTargets = Math.max(1, Math.floor(weapon.chainTargets ?? 4));
      const falloff = Math.max(0, Math.min(1, weapon.chainDamageMultiplier ?? 0.82));
      const baseDamage = weapon.damage * modifiers.damage * statMultiplier;

      let primary = attack?.primaryTarget;
      if (!this.isStormlancerCandidate(primary)) primary = null;
      if (
        primary
        && distanceSq(soldier.x, soldier.y, primary.x, primary.y)
          > Math.pow(strikeRange + (primary.radius ?? 0), 2)
      ) {
        primary = null;
      }

      if (!primary) {
        primary = this.findNearestStormlancerCandidate(soldier.x, soldier.y, strikeRange);
      }
      if (!primary) return;

      const visited = new Set();
      let currentTarget = primary;
      let sourcePoint = { x: soldier.x, y: soldier.y };
      let damage = baseDamage;

      for (let bounce = 0; bounce < maxTargets && currentTarget; bounce += 1) {
        const targetId = this.getStormlancerTargetId(currentTarget);
        if (visited.has(targetId)) break;
        visited.add(targetId);

        const result = this.damageStormlancerTarget(
          currentTarget,
          damage,
          sourcePoint.x,
          sourcePoint.y,
        );
        if (!result) break;

        game.stormlancerArcs.push({
          x1: sourcePoint.x,
          y1: sourcePoint.y,
          x2: result.x,
          y2: result.y,
          color: weapon.color ?? '#72e9ff',
          life: ARC_LIFETIME,
          maxLife: ARC_LIFETIME,
          seed: unit.id * 17 + bounce * 31 + game.elapsed * 7,
        });

        sourcePoint = { x: result.x, y: result.y };
        damage *= falloff;
        currentTarget = this.findNearestStormlancerCandidate(
          sourcePoint.x,
          sourcePoint.y,
          chainRange,
          visited,
        );
      }
    }

    getStormlancerTargetId(target) {
      return target?.id ?? target;
    }

    getStormlancerCandidates() {
      const game = this.game;
      const candidates = game.entities.enemies.filter((enemy) => !enemy.dead);

      const warden = game.getActiveWarden?.();
      if (warden) candidates.push(warden);

      const broodmother = game.getActiveBroodmother?.();
      if (broodmother && broodmother.targetable !== false) candidates.push(broodmother);

      for (const egg of game.broodEggs ?? []) {
        if (!egg.dead) candidates.push(egg);
      }

      return candidates;
    }

    isStormlancerCandidate(target) {
      if (!isAliveTarget(target)) return false;
      const game = this.game;
      if (game.entities.enemies.includes(target)) return true;
      if (target === game.getActiveWarden?.()) return true;
      if (target === game.getActiveBroodmother?.() && target.targetable !== false) return true;
      return (game.broodEggs ?? []).includes(target);
    }

    findNearestStormlancerCandidate(x, y, range, visited = new Set()) {
      let best = null;
      let bestDistance = Infinity;

      for (const target of this.getStormlancerCandidates()) {
        const targetId = this.getStormlancerTargetId(target);
        if (visited.has(targetId) || !this.isStormlancerCandidate(target)) continue;

        const effectiveDistance = Math.max(
          0,
          Math.sqrt(distanceSq(x, y, target.x, target.y)) - (target.radius ?? 0),
        );
        if (effectiveDistance > range || effectiveDistance >= bestDistance) continue;
        bestDistance = effectiveDistance;
        best = target;
      }

      return best;
    }

    damageStormlancerTarget(target, damage, sourceX, sourceY) {
      const game = this.game;
      if (!this.isStormlancerCandidate(target)) return null;

      const warden = game.getActiveWarden?.();
      if (target === warden) {
        const ringRadius = warden.armorRingRadius
          ?? warden.radius + 30;
        const distanceToBoss = Math.hypot(sourceX - warden.x, sourceY - warden.y);

        if (warden.armorPlates?.length && distanceToBoss > ringRadius) {
          const direction = normalize(warden.x - sourceX, warden.y - sourceY);
          const hitX = warden.x - direction.x * ringRadius;
          const hitY = warden.y - direction.y * ringRadius;
          const plate = game.getWardenArmorPlateAtPoint?.(warden, hitX, hitY);

          if (plate && !plate.broken && plate.hp > 0) {
            game.damageWardenArmorPlate?.(plate, damage, hitX, hitY);
            return { x: hitX, y: hitY };
          }
        }

        game.applyWardenDamage?.(
          damage,
          warden.x,
          warden.y,
          { sourceType: STORMLANCER_TYPE, melee: true, projectilePassedArmor: true },
        );
        return { x: warden.x, y: warden.y };
      }

      const broodmother = game.getActiveBroodmother?.();
      if (target === broodmother) {
        game.damageBroodmother?.(damage, broodmother.x, broodmother.y);
        return { x: broodmother.x, y: broodmother.y };
      }

      if ((game.broodEggs ?? []).includes(target)) {
        game.damageBroodEgg?.(target, damage, target.x, target.y);
        return { x: target.x, y: target.y };
      }

      if (game.entities.enemies.includes(target)) {
        target.hp = Math.max(0, target.hp - damage);
        target.hitFlash = 0.1;
        game.spawnHitParticles(target.x, target.y);
        if (target.hp <= 0) this.killEnemy(target);
        return { x: target.x, y: target.y };
      }

      return null;
    }
  };
}

export class Game extends PreviousGame {
  constructor(...args) {
    super(...args);
    this.stormlancerArcs = [];
    const StormlancerCombatSystem = createStormlancerCombatSystem(this.combatSystem.constructor);
    this.combatSystem = new StormlancerCombatSystem(this);
    this.combatSystem.reset();
  }

  update(dt) {
    super.update(dt);
    this.stormlancerArcs = (this.stormlancerArcs ?? []).filter((arc) => {
      arc.life -= dt;
      return arc.life > 0;
    });
  }

  drawEffects(ctx) {
    super.drawEffects(ctx);

    for (const arc of this.stormlancerArcs ?? []) {
      const alpha = Math.max(0, arc.life / arc.maxLife);
      const dx = arc.x2 - arc.x1;
      const dy = arc.y2 - arc.y1;
      const length = Math.hypot(dx, dy) || 1;
      const normalX = -dy / length;
      const normalY = dx / length;
      const segments = Math.max(4, Math.ceil(length / 24));

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = arc.color;
      ctx.shadowColor = arc.color;
      ctx.shadowBlur = 18;
      ctx.lineWidth = 4;
      ctx.beginPath();

      for (let index = 0; index <= segments; index += 1) {
        const t = index / segments;
        const taper = Math.sin(t * Math.PI);
        const jitter = Math.sin(arc.seed + index * 12.73 + this.animationClock * 41) * 8 * taper;
        const x = arc.x1 + dx * t + normalX * jitter;
        const y = arc.y1 + dy * t + normalY * jitter;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.strokeStyle = '#efffff';
      ctx.shadowBlur = 7;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = alpha * 0.9;
      ctx.stroke();
      ctx.restore();
    }
  }
}

export class UI extends PreviousUI {
  renderSquadStats(counts) {
    super.renderSquadStats(counts);
    const count = counts?.[STORMLANCER_TYPE] ?? 0;
    if (count <= 0 || !this.squadBuilderSummary) return;

    const weapon = UNIT_CLASSES[STORMLANCER_TYPE]?.weapon;
    const modifiers = getUnitModifiers(this.game?.unitModifiers, STORMLANCER_TYPE);
    const note = document.createElement('div');
    note.textContent = `Stormlancer: ${weapon.chainTargets} targets max • ${Math.round(weapon.aoeRadius * modifiers.blastRadius)} chain range • ${Math.round(weapon.chainDamageMultiplier * 100)}% damage retained per bounce.`;
    Object.assign(note.style, {
      marginTop: '8px',
      color: '#8fa5bb',
      fontSize: '9px',
      fontWeight: '700',
    });
    this.squadBuilderSummary.append(note);
  }
}
