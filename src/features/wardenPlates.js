import { Game as PreviousGame, UI as PreviousUI } from './wardenRewards.js';
import { WARDEN_BOSS } from '../data/bosses.js';

const TWO_PI = Math.PI * 2;
const ARMOR_RING_COLOR = '#ff334f';
const ARMOR_RING_INNER_COLOR = '#ff91a0';

function normalizePositiveAngle(angle) {
  let value = angle % TWO_PI;
  if (value < 0) value += TWO_PI;
  return value;
}

function segmentCircleFirstIntersection(startX, startY, endX, endY, centerX, centerY, radius) {
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

function createWardenPlateCombatSystem(ParentCombatSystem) {
  return class WardenPlateCombatSystem extends ParentCombatSystem {
    updateProjectiles(dt) {
      const game = this.game;
      const bossBeforeMove = game.getActiveWarden?.();
      if (!bossBeforeMove) {
        super.updateProjectiles(dt);
        return;
      }

      const previousPositions = new Map();
      for (const projectile of game.entities.projectiles) {
        if (projectile.dead || !projectile.sourceType) continue;
        previousPositions.set(projectile.id, { x: projectile.x, y: projectile.y });
      }

      // Let the inherited combat chain move projectiles and resolve normal
      // enemies, but temporarily hide the Warden so the older body-radius
      // collision cannot bypass the new shield ring.
      const originalGetActiveWarden = game.getActiveWarden;
      game.getActiveWarden = () => null;
      try {
        super.updateProjectiles(dt);
      } finally {
        game.getActiveWarden = originalGetActiveWarden;
      }

      const boss = game.getActiveWarden?.();
      if (!boss) return;

      for (const projectile of game.entities.projectiles) {
        if (projectile.dead || projectile.wardenHit || !projectile.sourceType) continue;

        const previous = previousPositions.get(projectile.id) ?? {
          x: projectile.x - projectile.vx * dt,
          y: projectile.y - projectile.vy * dt,
        };

        const plateHit = game.getWardenProjectilePlateHit?.(projectile, previous);
        if (plateHit) {
          projectile.x = plateHit.x;
          projectile.y = plateHit.y;
          projectile.wardenHit = true;
          game.damageWardenArmorPlate(
            plateHit.plate,
            projectile.damage,
            plateHit.x,
            plateHit.y,
          );

          // Armor plates are hard blockers. Pierce is deliberately ignored:
          // once a shot touches an intact plate, that projectile ends there.
          if (projectile.kind === 'rocket') this.explodeWithoutWarden(projectile);
          else projectile.dead = true;
          continue;
        }

        const bodyHit = segmentCircleFirstIntersection(
          previous.x,
          previous.y,
          projectile.x,
          projectile.y,
          boss.x,
          boss.y,
          boss.radius + (projectile.radius ?? 0),
        );
        if (!bodyHit) continue;

        projectile.x = bodyHit.x;
        projectile.y = bodyHit.y;
        projectile.wardenHit = true;
        game.applyWardenDamage(
          projectile.damage,
          bodyHit.x,
          bodyHit.y,
          {
            sourceType: projectile.sourceType,
            explosive: projectile.kind === 'rocket',
            blastRadius: projectile.aoeRadius ?? 0,
            projectilePassedArmor: true,
          },
        );

        if (projectile.kind === 'rocket') {
          this.explodeWithoutWarden(projectile);
          continue;
        }

        projectile.pierce -= 1;
        if (projectile.pierce <= 0) projectile.dead = true;
      }
    }

    explodeWithoutWarden(projectile) {
      const game = this.game;
      const originalGetActiveWarden = game.getActiveWarden;
      game.getActiveWarden = () => null;
      try {
        super.explodeProjectile(projectile);
      } finally {
        game.getActiveWarden = originalGetActiveWarden;
      }
    }
  };
}

export class Game extends PreviousGame {
  constructor(...args) {
    super(...args);
    const WardenPlateCombatSystem = createWardenPlateCombatSystem(this.combatSystem.constructor);
    this.combatSystem = new WardenPlateCombatSystem(this);
    this.combatSystem.reset();
  }

  updateWardenIntro(dt) {
    const hadBoss = Boolean(this.getActiveWarden?.());
    super.updateWardenIntro(dt);
    const boss = this.getActiveWarden?.();
    if (!boss || hadBoss || boss.armorPlates) return;
    this.initializeWardenArmorPlates(boss);
  }

  initializeWardenArmorPlates(boss) {
    const count = Math.max(1, Math.floor(WARDEN_BOSS.armor.plateCount ?? 10));
    const plateHp = Math.max(1, Number(WARDEN_BOSS.armor.plateHp) || 300);
    boss.armorRingRadius = boss.radius + (WARDEN_BOSS.armor.ringOffset ?? 30);
    boss.armorPlates = Array.from({ length: count }, (_, index) => ({
      id: `ring-${index}`,
      index,
      hp: plateHp,
      maxHp: plateHp,
      broken: false,
    }));
    this.syncWardenArmorTotals(boss);
  }

  syncWardenArmorTotals(boss) {
    if (!boss?.armorPlates) return;
    boss.armorHp = boss.armorPlates.reduce((sum, plate) => sum + Math.max(0, plate.hp), 0);
    boss.maxArmorHp = boss.armorPlates.reduce((sum, plate) => sum + plate.maxHp, 0);
  }

  getWardenArmorRotation() {
    return this.animationClock * 0.08;
  }

  getWardenArmorPlateAtPoint(boss, x, y) {
    const plates = boss?.armorPlates;
    if (!plates?.length) return null;

    const segmentArc = TWO_PI / plates.length;
    const gap = Math.max(0, Math.min(segmentArc * 0.4, WARDEN_BOSS.armor.gapRadians ?? 0.11));
    const worldAngle = Math.atan2(y - boss.y, x - boss.x);
    const localAngle = normalizePositiveAngle(worldAngle - this.getWardenArmorRotation());
    const index = Math.min(plates.length - 1, Math.floor(localAngle / segmentArc));
    const withinSegment = localAngle - index * segmentArc;

    if (withinSegment <= gap || withinSegment >= segmentArc - gap) return null;
    return plates[index] ?? null;
  }

  getWardenProjectilePlateHit(projectile, previous) {
    const boss = this.getActiveWarden?.();
    if (!boss?.armorPlates?.length) return null;

    const ringRadius = boss.armorRingRadius
      ?? boss.radius + (WARDEN_BOSS.armor.ringOffset ?? 30);
    const previousDistance = Math.hypot(previous.x - boss.x, previous.y - boss.y);

    // A projectile already inside the ring has no plate between it and the boss.
    if (previousDistance < ringRadius - (projectile.radius ?? 0)) return null;

    const hit = segmentCircleFirstIntersection(
      previous.x,
      previous.y,
      projectile.x,
      projectile.y,
      boss.x,
      boss.y,
      ringRadius + (projectile.radius ?? 0),
    );
    if (!hit) return null;

    const plate = this.getWardenArmorPlateAtPoint(boss, hit.x, hit.y);
    if (!plate || plate.broken || plate.hp <= 0) return null;
    return { ...hit, plate };
  }

  damageWardenArmorPlate(plate, amount, x, y) {
    const boss = this.getActiveWarden?.();
    if (!boss || !plate || plate.broken || !Number.isFinite(amount) || amount <= 0) return 0;

    const damage = Math.min(plate.hp, amount);
    plate.hp = Math.max(0, plate.hp - amount);
    this.spawnHitParticles(x, y);

    if (plate.hp <= 0) {
      plate.broken = true;
      this.spawnExplosionEffect(x, y, 38, ARMOR_RING_COLOR);
    }

    this.syncWardenArmorTotals(boss);
    return damage;
  }

  applyWardenDamage(amount, hitX, hitY, options = {}) {
    const boss = this.getActiveWarden?.();
    if (!boss || !Number.isFinite(amount) || amount <= 0) return null;

    if (!options.projectilePassedArmor && boss.armorPlates?.length) {
      const distanceFromBoss = Math.hypot(hitX - boss.x, hitY - boss.y);
      const ringRadius = boss.armorRingRadius
        ?? boss.radius + (WARDEN_BOSS.armor.ringOffset ?? 30);

      if (distanceFromBoss >= ringRadius - 2) {
        const plate = this.getWardenArmorPlateAtPoint(boss, hitX, hitY);
        if (plate && !plate.broken && plate.hp > 0) {
          const armorDamage = this.damageWardenArmorPlate(plate, amount, hitX, hitY);
          return {
            bodyDamage: 0,
            armorDamage,
            bodyMultiplier: 0,
            coreExposed: false,
            plate,
          };
        }
      }
    }

    const coreExposed = boss.coreExposedUntil > this.elapsed;
    const bodyMultiplier = coreExposed
      ? WARDEN_BOSS.armor.exposedCoreDamageMultiplier
      : 1;
    const bodyDamage = amount * bodyMultiplier;

    boss.hp = Math.max(0, boss.hp - bodyDamage);
    boss.hitFlash = 0.11;
    this.spawnHitParticles(hitX, hitY);

    if (boss.hp <= 0) this.defeatWarden(boss);
    return {
      bodyDamage,
      armorDamage: 0,
      bodyMultiplier,
      coreExposed,
      plate: null,
    };
  }

  drawWarden(ctx, boss) {
    // Suppress the older single shared-ring renderer while preserving the boss
    // body and every other inherited visual.
    const storedArmorHp = boss.armorHp;
    boss.armorHp = 0;
    super.drawWarden(ctx, boss);
    boss.armorHp = storedArmorHp;

    const plates = boss.armorPlates;
    if (!plates?.some((plate) => !plate.broken && plate.hp > 0)) return;

    const segmentArc = TWO_PI / plates.length;
    const gap = Math.max(0, Math.min(segmentArc * 0.4, WARDEN_BOSS.armor.gapRadians ?? 0.11));
    const ringRadius = boss.armorRingRadius
      ?? boss.radius + (WARDEN_BOSS.armor.ringOffset ?? 30);
    const pulse = 0.82 + (Math.sin(this.animationClock * 7.5) + 1) * 0.09;

    ctx.save();
    ctx.translate(boss.x, boss.y);
    ctx.rotate(this.getWardenArmorRotation());
    ctx.lineCap = 'round';

    for (const plate of plates) {
      if (plate.broken || plate.hp <= 0) continue;

      const healthRatio = Math.max(0, Math.min(1, plate.hp / plate.maxHp));
      const start = plate.index * segmentArc + gap;
      const end = (plate.index + 1) * segmentArc - gap;

      // A faint full-span underlay keeps the physical blocking area readable.
      ctx.save();
      ctx.globalAlpha = 0.18 + healthRatio * 0.2;
      ctx.strokeStyle = ARMOR_RING_COLOR;
      ctx.shadowColor = ARMOR_RING_COLOR;
      ctx.shadowBlur = 8;
      ctx.lineWidth = 3;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(0, 0, ringRadius, start, end);
      ctx.stroke();
      ctx.restore();

      // The bright layer visibly degrades as HP falls: glow, thickness and
      // continuity all weaken while the underlying collision span remains clear.
      ctx.save();
      ctx.globalAlpha = pulse * (0.42 + healthRatio * 0.58);
      ctx.strokeStyle = ARMOR_RING_COLOR;
      ctx.shadowColor = ARMOR_RING_COLOR;
      ctx.shadowBlur = 8 + healthRatio * 18;
      ctx.lineWidth = 4 + healthRatio * 5;
      if (healthRatio < 0.34) ctx.setLineDash([8, 8]);
      else if (healthRatio < 0.67) ctx.setLineDash([16, 6]);
      else ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(0, 0, ringRadius, start, end);
      ctx.stroke();

      ctx.globalAlpha = 0.45 + healthRatio * 0.5;
      ctx.strokeStyle = ARMOR_RING_INNER_COLOR;
      ctx.shadowBlur = 4 + healthRatio * 8;
      ctx.lineWidth = 1.5 + healthRatio * 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, ringRadius, start, end);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }
}

export class UI extends PreviousUI {
  update(game) {
    super.update(game);
    const boss = game.getActiveWarden?.();
    if (!boss?.armorPlates?.length || !this.wardenArmor) return;

    const intact = boss.armorPlates.filter((plate) => !plate.broken && plate.hp > 0).length;
    const armorHp = boss.armorPlates.reduce((sum, plate) => sum + Math.max(0, plate.hp), 0);
    const maxArmorHp = boss.armorPlates.reduce((sum, plate) => sum + plate.maxHp, 0);
    this.wardenArmor.textContent = `PLATES ${intact} / ${boss.armorPlates.length} • ARMOR ${Math.ceil(armorHp)} / ${maxArmorHp}`;
  }
}
