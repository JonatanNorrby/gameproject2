import { Game as PreviousGame, UI as PreviousUI } from './stormlancerClass.js';
import { CIPHER_BOSS } from '../data/bosses.js';
import { GAME_BALANCE, UNIT_CLASSES } from '../data/content.js';
import { STORMLANCER_TYPE } from '../data/stormlancer.js';
import { getUnitModifiers } from '../data/unitModifiers.js';
import { grantMetaUpgradePoints } from '../data/metaUpgrades.js';
import { distanceSq, normalize, randomRange } from '../utils/math.js';

const INTRO_PURGE_TIME = 0.45;
const INTRO_MESSAGE_TIME = 0.55;
const INTRO_SPAWN_TIME = 2.65;
const INTRO_SHAKE_DURATION = 0.4;
const SPAWN_LOCK_COOLDOWN = 1.25;
const THORNE_ID = 'thorne';
const TWO_PI = Math.PI * 2;

const CIPHER_SYMBOLS = Object.freeze([
  Object.freeze({ id: 'circle', label: 'Circle' }),
  Object.freeze({ id: 'triangle', label: 'Triangle' }),
  Object.freeze({ id: 'cross', label: 'Cross' }),
  Object.freeze({ id: 'diamond', label: 'Diamond' }),
  Object.freeze({ id: 'three_lines', label: 'Three Lines' }),
  Object.freeze({ id: 'spiral', label: 'Spiral' }),
]);

const CIPHER_SPRITE = Object.freeze({
  basePath: './assets/cipher',
  drawWidth: 142,
  drawHeight: 142,
  preserveAspect: true,
  smoothing: true,
  animations: {
    idle: { frames: ['idle_1.png'], fps: 1, loop: false },
  },
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngle(angle) {
  let value = Number(angle) || 0;
  while (value > Math.PI) value -= TWO_PI;
  while (value < -Math.PI) value += TWO_PI;
  return value;
}

function shuffle(values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function effectiveTargetDistance(x, y, target) {
  return Math.max(
    0,
    Math.sqrt(distanceSq(x, y, target.x, target.y)) - (target.radius ?? 0),
  );
}

function firstSegmentCircleIntersection(startX, startY, endX, endY, centerX, centerY, radius) {
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
  const candidates = [
    (-b - root) / (2 * a),
    (-b + root) / (2 * a),
  ].filter((value) => value >= 0 && value <= 1)
    .sort((left, right) => left - right);
  if (candidates.length === 0) return null;

  const t = candidates[0];
  return {
    x: startX + dx * t,
    y: startY + dy * t,
    t,
  };
}

function createCipherCombatSystem(ParentCombatSystem) {
  return class CipherCombatSystem extends ParentCombatSystem {
    findNearestTarget(x, y, range) {
      let best = super.findNearestTarget(x, y, range);
      let bestDistance = best ? effectiveTargetDistance(x, y, best) : Infinity;
      const boss = this.game.getActiveCipher?.();
      if (!boss?.targetable) return best;

      const bossDistance = effectiveTargetDistance(x, y, boss);
      if (bossDistance <= range + 8 && bossDistance < bestDistance) {
        best = boss;
        bestDistance = bossDistance;
      }
      return best;
    }

    updateProjectiles(dt) {
      const previousPositions = new Map();
      for (const projectile of this.game.entities.projectiles) {
        if (projectile.dead || projectile.hostile || !projectile.sourceType) continue;
        previousPositions.set(projectile.id, { x: projectile.x, y: projectile.y });
      }

      super.updateProjectiles(dt);

      const boss = this.game.getActiveCipher?.();
      if (!boss?.targetable) return;

      for (const projectile of this.game.entities.projectiles) {
        if (
          projectile.dead
          || projectile.hostile
          || !projectile.sourceType
          || projectile.cipherHit
        ) continue;

        const previous = previousPositions.get(projectile.id) ?? {
          x: projectile.x - (projectile.vx ?? 0) * dt,
          y: projectile.y - (projectile.vy ?? 0) * dt,
        };
        const hit = firstSegmentCircleIntersection(
          previous.x,
          previous.y,
          projectile.x,
          projectile.y,
          boss.x,
          boss.y,
          boss.radius + (projectile.radius ?? 0),
        );
        if (!hit) continue;

        projectile.x = hit.x;
        projectile.y = hit.y;
        projectile.cipherHit = true;

        if (projectile.kind === 'rocket') {
          this.explodeProjectile(projectile);
          continue;
        }

        this.game.damageCipher(projectile.damage, hit.x, hit.y, {
          sourceType: projectile.sourceType,
        });
        projectile.pierce -= 1;
        if (projectile.pierce <= 0) projectile.dead = true;
      }
    }

    explodeProjectile(projectile) {
      const boss = this.game.getActiveCipher?.();
      if (
        boss?.targetable
        && !projectile?.dead
        && !projectile.cipherExplosionProcessed
      ) {
        const blastRadius = projectile.aoeRadius || (projectile.radius ?? 0) * 4;
        const hitRadius = blastRadius + boss.radius;
        if (distanceSq(projectile.x, projectile.y, boss.x, boss.y) <= hitRadius * hitRadius) {
          projectile.cipherExplosionProcessed = true;
          this.game.damageCipher(projectile.damage, projectile.x, projectile.y, {
            sourceType: projectile.sourceType,
            explosive: true,
          });
        }
      }

      super.explodeProjectile(projectile);
    }

    performShockbladeSlash(unit, attack) {
      const boss = this.game.getActiveCipher?.();

      if (
        unit?.type === STORMLANCER_TYPE
        && boss?.targetable
        && attack?.primaryTarget === boss
      ) {
        const soldier = this.game.getSoldierPositions()
          .find((candidate) => candidate.unit.id === unit.id);
        const weapon = UNIT_CLASSES[STORMLANCER_TYPE]?.weapon;
        if (!soldier || !weapon) return;

        const modifiers = getUnitModifiers(this.game.unitModifiers, STORMLANCER_TYPE);
        const statMultiplier = this.game.getTransformerStatMultiplier();
        const range = weapon.range * modifiers.range * statMultiplier;
        if (effectiveTargetDistance(soldier.x, soldier.y, boss) > range) return;

        const damage = weapon.damage * modifiers.damage * statMultiplier;
        this.game.damageCipher(damage, boss.x, boss.y, {
          sourceType: STORMLANCER_TYPE,
          melee: true,
        });
        this.game.stormlancerArcs?.push({
          x1: soldier.x,
          y1: soldier.y,
          x2: boss.x,
          y2: boss.y,
          color: weapon.color ?? '#72e9ff',
          life: 0.18,
          maxLife: 0.18,
          seed: unit.id * 19 + this.game.elapsed * 7,
        });
        return;
      }

      super.performShockbladeSlash(unit, attack);

      if (!boss?.targetable || !unit || unit.dead || unit.type === STORMLANCER_TYPE) return;
      const soldier = this.game.getSoldierPositions()
        .find((candidate) => candidate.unit.id === unit.id);
      if (!soldier) return;

      const weapon = this.getMeleeWeapon?.(unit) ?? UNIT_CLASSES[unit.type]?.weapon;
      if (!weapon || weapon.kind !== 'melee') return;

      const modifiers = getUnitModifiers(this.game.unitModifiers, unit.type);
      const statMultiplier = this.game.getTransformerStatMultiplier();
      const slashRadius = (weapon.aoeRadius ?? weapon.range)
        * modifiers.blastRadius
        * statMultiplier;
      const dx = boss.x - soldier.x;
      const dy = boss.y - soldier.y;
      const distance = Math.hypot(dx, dy);
      if (distance > slashRadius + boss.radius) return;

      const fullCircle = unit.captainId === THORNE_ID;
      if (!fullCircle && distance > 0.001) {
        const halfArc = (weapon.arcRadians ?? Math.PI) / 2;
        const facingDot = (dx * attack.direction.x + dy * attack.direction.y) / distance;
        if (facingDot < Math.cos(halfArc)) return;
      }

      const damage = weapon.damage * modifiers.damage * statMultiplier;
      const result = this.game.damageCipher(damage, boss.x, boss.y, {
        sourceType: unit.type,
        melee: true,
      });
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
    const CipherCombatSystem = createCipherCombatSystem(this.combatSystem.constructor);
    this.combatSystem = new CipherCombatSystem(this);
    this.combatSystem.reset();
  }

  resetState() {
    this.cipherBoss = null;
    this.cipherSpawned = false;
    this.cipherDefeated = false;
    this.cipherIntro = null;
    this.cipherSpawnLockActive = false;
    this.cipherSquadMotion = new Map();
    this.cipherBeams = [];
    this.cipherBarrageMarkers = [];
    this.cipherWalls = [];
    this.cipherWallProjectiles = [];
    this.cipherShockwaves = [];
    this.cipherBannerText = '';
    this.cipherBannerUntil = 0;
    super.resetState();
  }

  getActiveCipher() {
    return this.cipherBoss && !this.cipherBoss.dead ? this.cipherBoss : null;
  }

  isCipherSpawnLocked() {
    return Boolean(this.cipherIntro?.active || this.getActiveCipher());
  }

  update(dt) {
    this.updateCipherSquadMotion(dt);

    const lockedBefore = this.isCipherSpawnLocked();
    if (lockedBefore) {
      this.spawnSystem.cooldown = Math.max(this.spawnSystem.cooldown, SPAWN_LOCK_COOLDOWN);
    }

    super.update(dt);
    if (this.pauseReasons.has('gameover')) return;

    this.updateCipherIntro(dt);
    if (
      !this.cipherSpawned
      && this.broodmotherDefeated
      && (this.player?.level ?? 1) >= CIPHER_BOSS.spawnLevel
    ) {
      this.beginCipherIntro();
    }

    this.updateCipher(dt);
    this.updateCipherHazards(dt);

    const lockedAfter = this.isCipherSpawnLocked();
    if (lockedAfter) {
      this.spawnSystem.cooldown = Math.max(this.spawnSystem.cooldown, SPAWN_LOCK_COOLDOWN);
    } else if (this.cipherSpawnLockActive) {
      this.spawnSystem.cooldown = 0.65;
    }
    this.cipherSpawnLockActive = lockedAfter;
  }

  beginCipherIntro() {
    if (this.cipherSpawned || this.cipherIntro?.active) return;
    this.cipherSpawned = true;
    this.cipherIntro = { active: true, elapsed: 0, purged: false };
    this.cipherSpawnLockActive = true;
    this.spawnSystem.cooldown = Math.max(this.spawnSystem.cooldown, SPAWN_LOCK_COOLDOWN);
  }

  updateCipherIntro(dt) {
    const intro = this.cipherIntro;
    if (!intro?.active) return;

    intro.elapsed += dt;
    if (!intro.purged && intro.elapsed >= INTRO_PURGE_TIME) {
      intro.purged = true;
      this.entities.enemies.length = 0;
      this.entities.projectiles.length = 0;
    }

    if (intro.elapsed < INTRO_SPAWN_TIME) return;
    intro.active = false;
    this.spawnCipher();
  }

  spawnCipher() {
    const angle = Math.random() * TWO_PI;
    const distance = 385;
    const x = this.player.x + Math.cos(angle) * distance;
    const y = this.player.y + Math.sin(angle) * distance;

    this.cipherBoss = {
      id: `boss-${CIPHER_BOSS.id}`,
      type: CIPHER_BOSS.id,
      isBoss: true,
      x,
      y,
      radius: CIPHER_BOSS.radius,
      maxHp: CIPHER_BOSS.maxHp,
      hp: CIPHER_BOSS.maxHp,
      facingAngle: Math.atan2(this.player.y - y, this.player.x - x),
      hitFlash: 0,
      dead: false,
      targetable: true,
      invulnerable: true,
      shielded: true,
      shieldPermanentBroken: false,
      state: 'shielded',
      stateTime: 0,
      pendingPuzzleAt: this.elapsed + 1.25,
      pendingPuzzleTier: 1,
      puzzleActive: false,
      puzzleTier: 0,
      lastSolvedTier: 0,
      sequence: [],
      revealElapsed: 0,
      puzzleProgress: 0,
      puzzleDeadline: Infinity,
      glyphs: [],
      glyphInsideIds: new Set(),
      attackCooldown: 1.25,
      attackCycle: 0,
      damagePhaseEnds: 0,
      finalPhase: false,
      wrongFlashUntil: 0,
    };

    this.spawnExplosionEffect(x, y, 125, CIPHER_BOSS.colors.shield);
  }

  updateCipher(dt) {
    const boss = this.getActiveCipher();
    if (!boss) return;

    boss.hitFlash = Math.max(0, boss.hitFlash - dt);

    if (boss.finalPhase) {
      this.updateCipherFinalPhase(boss, dt);
      return;
    }

    if (boss.puzzleActive) {
      this.updateCipherPuzzle(boss, dt);
      this.updateCipherAttackSchedule(boss, dt, true);
      return;
    }

    if (boss.state === 'damage_transition') {
      boss.stateTime -= dt;
      if (boss.stateTime <= 0) this.beginCipherPuzzle(boss, boss.pendingPuzzleTier);
      return;
    }

    if (boss.state === 'damage') {
      if (this.elapsed >= boss.damagePhaseEnds) this.endCipherDamagePhase(boss);
      return;
    }

    if (boss.state === 'shielded' && this.elapsed >= boss.pendingPuzzleAt) {
      this.beginCipherPuzzle(boss, boss.pendingPuzzleTier || 1);
    }
  }

  beginCipherPuzzle(boss, tier) {
    if (!boss || boss.dead || boss.shieldPermanentBroken) return;

    this.clearCipherHazards();
    boss.puzzleActive = true;
    boss.puzzleTier = clamp(Math.floor(tier || 1), 1, 3);
    boss.state = 'puzzle_reveal';
    boss.invulnerable = true;
    boss.shielded = true;
    boss.sequence = this.generateCipherSequence();
    boss.revealElapsed = 0;
    boss.puzzleProgress = 0;
    boss.puzzleDeadline = Infinity;
    boss.glyphs = [];
    boss.glyphInsideIds = new Set();
    boss.attackCooldown = 1.2;
    boss.attackCycle = 0;

    this.beginCipherSquadRetreat(boss);
    this.setCipherBanner('CAPTAIN REQUIRED', 2.2);
  }

  generateCipherSequence() {
    return shuffle(CIPHER_SYMBOLS.map((symbol) => symbol.id))
      .slice(0, CIPHER_BOSS.puzzle.sequenceLength);
  }

  getCipherRevealDuration(boss) {
    return boss.puzzleTier >= 3
      ? CIPHER_BOSS.puzzle.finalRevealDuration
      : CIPHER_BOSS.puzzle.revealDuration;
  }

  getCipherVisibleSymbol(boss) {
    if (!boss?.puzzleActive || boss.state !== 'puzzle_reveal') return null;
    const revealDuration = this.getCipherRevealDuration(boss);
    const clock = boss.revealElapsed - CIPHER_BOSS.puzzle.initialDelay;
    if (clock < 0) return null;

    const step = revealDuration + CIPHER_BOSS.puzzle.revealGap;
    const index = Math.floor(clock / step);
    if (index < 0 || index >= boss.sequence.length) return null;
    const within = clock - index * step;
    return within <= revealDuration ? boss.sequence[index] : null;
  }

  updateCipherPuzzle(boss, dt) {
    if (boss.state === 'puzzle_reveal') {
      boss.revealElapsed += dt;
      const revealDuration = this.getCipherRevealDuration(boss);
      const step = revealDuration + CIPHER_BOSS.puzzle.revealGap;
      const total = CIPHER_BOSS.puzzle.initialDelay + boss.sequence.length * step;
      if (boss.revealElapsed >= total) {
        boss.state = 'puzzle_solve';
        boss.glyphs = this.createCipherGlyphs(boss);
        boss.glyphInsideIds = new Set();
        boss.puzzleDeadline = this.elapsed + (
          boss.puzzleTier >= 3
            ? CIPHER_BOSS.puzzle.finalTimer
            : CIPHER_BOSS.puzzle.timer
        );
      }
      return;
    }

    if (boss.state !== 'puzzle_solve') return;

    if (this.elapsed >= boss.puzzleDeadline) {
      this.failCipherPuzzleByTimeout(boss);
      return;
    }

    const captain = this.getCipherCaptainSoldier();
    if (!captain) return;

    const insideNow = new Set();
    for (const glyph of boss.glyphs) {
      const activationRadius = glyph.radius + GAME_BALANCE.player.soldierRadius;
      if (distanceSq(captain.x, captain.y, glyph.x, glyph.y) > activationRadius ** 2) continue;
      insideNow.add(glyph.id);
      if (!boss.glyphInsideIds.has(glyph.id)) this.activateCipherGlyph(boss, glyph);
    }
    boss.glyphInsideIds = insideNow;
  }

  createCipherGlyphs(boss) {
    const required = [...boss.sequence];
    const desiredCount = boss.puzzleTier >= 2 ? CIPHER_SYMBOLS.length : 4;
    const extras = shuffle(
      CIPHER_SYMBOLS.map((symbol) => symbol.id)
        .filter((symbolId) => !required.includes(symbolId)),
    );
    const ids = shuffle([...required, ...extras.slice(0, desiredCount - required.length)]);
    const radius = CIPHER_BOSS.puzzle.glyphRingRadius;
    const baseAngle = Math.random() * TWO_PI;

    return ids.map((symbolId, index) => {
      const angle = baseAngle + (TWO_PI * index) / ids.length;
      return {
        id: `cipher-glyph-${symbolId}`,
        symbolId,
        x: boss.x + Math.cos(angle) * radius,
        y: boss.y + Math.sin(angle) * radius,
        radius: CIPHER_BOSS.puzzle.glyphRadius,
        completed: false,
        completedAt: 0,
      };
    });
  }

  activateCipherGlyph(boss, glyph) {
    const expected = boss.sequence[boss.puzzleProgress];
    if (glyph.symbolId === expected) {
      glyph.completed = true;
      glyph.completedAt = this.elapsed;
      boss.puzzleProgress += 1;
      this.spawnExplosionEffect(glyph.x, glyph.y, glyph.radius + 18, CIPHER_BOSS.colors.correct);
      if (boss.puzzleProgress >= boss.sequence.length) this.solveCipherPuzzle(boss);
      return;
    }

    boss.puzzleProgress = 0;
    boss.wrongFlashUntil = this.elapsed + 0.55;
    for (const candidate of boss.glyphs) {
      candidate.completed = false;
      candidate.completedAt = 0;
    }
    this.triggerCipherShockwave(boss, true);
    this.setCipherBanner('SEQUENCE RESET', 0.85);
  }

  failCipherPuzzleByTimeout(boss) {
    this.triggerCipherShockwave(boss, true);
    boss.sequence = this.generateCipherSequence();
    boss.revealElapsed = 0;
    boss.puzzleProgress = 0;
    boss.puzzleDeadline = Infinity;
    boss.glyphs = [];
    boss.glyphInsideIds = new Set();
    boss.state = 'puzzle_reveal';
    this.setCipherBanner('SEQUENCE RESET', 1.05);
  }

  solveCipherPuzzle(boss) {
    const solvedTier = boss.puzzleTier;
    boss.puzzleActive = false;
    boss.lastSolvedTier = solvedTier;
    boss.glyphs = [];
    boss.glyphInsideIds = new Set();
    boss.invulnerable = false;
    boss.shielded = false;
    this.clearCipherHazards();
    this.beginCipherSquadReturn();
    this.spawnExplosionEffect(boss.x, boss.y, 190, CIPHER_BOSS.colors.shieldHot);
    this.setCipherBanner('SHIELD BROKEN • SQUAD, ENGAGE!', 1.8);

    if (solvedTier >= 3) {
      boss.shieldPermanentBroken = true;
      boss.finalPhase = true;
      boss.state = 'final';
      boss.attackCooldown = 2.2;
      return;
    }

    boss.state = 'damage';
    boss.damagePhaseEnds = this.elapsed + CIPHER_BOSS.puzzle.damagePhaseDuration;
  }

  endCipherDamagePhase(boss) {
    if (!boss || boss.dead || boss.finalPhase) return;
    boss.invulnerable = true;
    boss.shielded = true;
    boss.state = 'damage_transition';
    boss.stateTime = 0.8;
    boss.pendingPuzzleTier = Math.max(1, boss.lastSolvedTier);
    this.setCipherBanner('SHIELD RESTORED', 0.8);
  }

  scheduleCipherNextTier(boss, tier) {
    if (!boss || boss.dead || boss.finalPhase) return;
    boss.invulnerable = true;
    boss.shielded = true;
    boss.state = 'damage_transition';
    boss.stateTime = 0.9;
    boss.pendingPuzzleTier = tier;
    boss.damagePhaseEnds = 0;
    this.setCipherBanner(tier >= 3 ? 'FINAL SEQUENCE' : 'CORRUPTED SEQUENCE', 1.1);
  }

  damageCipher(amount, hitX, hitY, options = {}) {
    const boss = this.getActiveCipher();
    if (!boss || !Number.isFinite(amount) || amount <= 0) return null;

    boss.hitFlash = 0.11;
    this.spawnHitParticles(hitX, hitY);

    if (boss.invulnerable) {
      return { bodyDamage: 0, shielded: true, sourceType: options.sourceType ?? null };
    }

    let floorRatio = 0;
    if (!boss.finalPhase && boss.lastSolvedTier === 1) {
      floorRatio = CIPHER_BOSS.puzzle.phaseTwoThreshold;
    } else if (!boss.finalPhase && boss.lastSolvedTier === 2) {
      floorRatio = CIPHER_BOSS.puzzle.finalThreshold;
    }

    const floorHp = boss.maxHp * floorRatio;
    const allowedDamage = Math.max(0, boss.hp - floorHp);
    const bodyDamage = Math.min(amount, allowedDamage);
    boss.hp = Math.max(floorHp, boss.hp - bodyDamage);

    if (boss.hp <= 0) {
      this.defeatCipher(boss);
      return { bodyDamage, shielded: false };
    }

    if (!boss.finalPhase && bodyDamage > 0 && boss.hp <= floorHp + 0.001) {
      if (boss.lastSolvedTier === 1) this.scheduleCipherNextTier(boss, 2);
      else if (boss.lastSolvedTier === 2) this.scheduleCipherNextTier(boss, 3);
    }

    return { bodyDamage, shielded: false, sourceType: options.sourceType ?? null };
  }

  defeatCipher(boss) {
    if (!boss || boss.dead) return;
    boss.dead = true;
    boss.hp = 0;
    this.cipherDefeated = true;
    this.kills += 1;
    this.clearCipherHazards();
    this.beginCipherSquadReturn();

    for (let index = 0; index < 8; index += 1) {
      const angle = (TWO_PI * index) / 8;
      this.spawnExplosionEffect(
        boss.x + Math.cos(angle) * 52,
        boss.y + Math.sin(angle) * 52,
        88,
        index % 2 === 0 ? CIPHER_BOSS.colors.core : CIPHER_BOSS.colors.shield,
      );
    }

    const amount = Math.max(
      0,
      Math.floor(Number(CIPHER_BOSS.permanentUpgradePoints) || 0),
    );
    if (amount > 0) {
      const state = grantMetaUpgradePoints(amount);
      this.ui.renderMetaUpgradeTree?.();
      this.ui.showPermanentUpgradePointReward?.(
        amount,
        state.totalPoints,
        CIPHER_BOSS.name.toUpperCase(),
      );
    }
  }

  beginCipherSquadRetreat(boss) {
    const currentPositions = new Map(
      this.getSoldierPositions().map((soldier) => [soldier.unit.id, soldier]),
    );
    let retreatIndex = 0;

    for (const unit of this.player.squad) {
      if (unit.dead || unit.captainId) continue;
      const current = currentPositions.get(unit.id);
      if (!current) continue;

      let dx = current.x - boss.x;
      let dy = current.y - boss.y;
      let distance = Math.hypot(dx, dy);
      if (distance < 0.001) {
        const angle = (unit.id * 2.399) % TWO_PI;
        dx = Math.cos(angle);
        dy = Math.sin(angle);
        distance = 1;
      }
      const dirX = dx / distance;
      const dirY = dy / distance;
      const sideX = -dirY;
      const sideY = dirX;
      const sideOffset = ((retreatIndex % 5) - 2) * 34;
      retreatIndex += 1;

      this.cipherSquadMotion.set(unit.id, {
        x: current.x,
        y: current.y,
        targetX: boss.x + dirX * CIPHER_BOSS.puzzle.retreatDistance + sideX * sideOffset,
        targetY: boss.y + dirY * CIPHER_BOSS.puzzle.retreatDistance + sideY * sideOffset,
        mode: 'retreat',
      });
    }
  }

  beginCipherSquadReturn() {
    const current = new Map(
      this.getSoldierPositions().map((soldier) => [soldier.unit.id, soldier]),
    );
    for (const unit of this.player.squad) {
      if (unit.dead || unit.captainId) continue;
      let motion = this.cipherSquadMotion.get(unit.id);
      if (!motion) {
        const soldier = current.get(unit.id);
        if (!soldier) continue;
        motion = { x: soldier.x, y: soldier.y, targetX: soldier.x, targetY: soldier.y };
        this.cipherSquadMotion.set(unit.id, motion);
      }
      motion.mode = 'return';
    }
  }

  updateCipherSquadMotion(dt) {
    if (!(this.cipherSquadMotion instanceof Map) || this.cipherSquadMotion.size === 0) return;
    const formation = new Map(
      super.getSoldierPositions().map((soldier) => [soldier.unit.id, soldier]),
    );

    for (const [unitId, motion] of [...this.cipherSquadMotion.entries()]) {
      const unit = this.player?.squad?.find((candidate) => candidate.id === unitId);
      if (!unit || unit.dead) {
        this.cipherSquadMotion.delete(unitId);
        continue;
      }

      if (motion.mode === 'waiting') continue;
      const target = motion.mode === 'return'
        ? formation.get(unitId)
        : { x: motion.targetX, y: motion.targetY };
      if (!target) {
        this.cipherSquadMotion.delete(unitId);
        continue;
      }

      const dx = target.x - motion.x;
      const dy = target.y - motion.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= 7) {
        motion.x = target.x;
        motion.y = target.y;
        if (motion.mode === 'return') this.cipherSquadMotion.delete(unitId);
        else motion.mode = 'waiting';
        continue;
      }

      const speed = motion.mode === 'return'
        ? CIPHER_BOSS.puzzle.returnSpeed
        : CIPHER_BOSS.puzzle.retreatSpeed;
      const step = Math.min(distance, speed * dt);
      motion.x += (dx / distance) * step;
      motion.y += (dy / distance) * step;
    }
  }

  getSoldierPositions() {
    const soldiers = super.getSoldierPositions();
    if (!(this.cipherSquadMotion instanceof Map) || this.cipherSquadMotion.size === 0) return soldiers;

    return soldiers.map((soldier) => {
      const motion = this.cipherSquadMotion.get(soldier.unit.id);
      if (!motion) return soldier;
      return { ...soldier, x: motion.x, y: motion.y };
    });
  }

  getWeaponPositions() {
    const soldiers = super.getWeaponPositions();
    const boss = this.getActiveCipher();
    if (!boss) return soldiers;

    return soldiers.filter((soldier) => {
      if (soldier.unit.captainId) return true;
      return !this.cipherSquadMotion.has(soldier.unit.id);
    });
  }

  getUnitAnimation(unit) {
    const motion = this.cipherSquadMotion?.get(unit?.id);
    if (motion?.mode === 'retreat' || motion?.mode === 'return') {
      return { name: 'running', time: this.animationClock };
    }
    if (motion?.mode === 'waiting') return { name: 'idle', time: 0 };
    return super.getUnitAnimation(unit);
  }

  getCipherCaptainSoldier() {
    return this.getSoldierPositions().find((soldier) => Boolean(soldier.unit.captainId)) ?? null;
  }

  setCipherBanner(text, duration) {
    this.cipherBannerText = text;
    this.cipherBannerUntil = this.elapsed + Math.max(0, duration);
  }

  updateCipherAttackSchedule(boss, dt, soloOnly) {
    if (!boss || boss.dead) return;
    boss.attackCooldown = Math.max(0, (boss.attackCooldown ?? 0) - dt);
    if (boss.attackCooldown > 0) return;

    boss.attackCycle = (boss.attackCycle ?? 0) + 1;
    const kind = boss.attackCycle % 3;
    if (kind === 1) this.startCipherSweepingBeam(boss, soloOnly);
    else if (kind === 2) this.startCipherTargetedBarrage(boss, soloOnly);
    else this.startCipherProjectileWall(boss, soloOnly);

    let interval = CIPHER_BOSS.attacks.puzzleInterval;
    if (boss.finalPhase) interval = CIPHER_BOSS.attacks.finalCombatInterval;
    else if (boss.puzzleTier >= 3) interval = CIPHER_BOSS.attacks.finalPuzzleInterval;
    else if (boss.puzzleTier >= 2) interval = CIPHER_BOSS.attacks.corruptedInterval;
    boss.attackCooldown = interval + Math.random() * 0.35;
  }

  updateCipherFinalPhase(boss, dt) {
    const dx = this.player.x - boss.x;
    const dy = this.player.y - boss.y;
    const distance = Math.hypot(dx, dy) || 1;
    boss.facingAngle = Math.atan2(dy, dx);

    const preferred = CIPHER_BOSS.preferredRange;
    if (distance > preferred) {
      boss.x += (dx / distance) * CIPHER_BOSS.finalSpeed * dt;
      boss.y += (dy / distance) * CIPHER_BOSS.finalSpeed * dt;
    } else if (distance < preferred * 0.62) {
      boss.x -= (dx / distance) * CIPHER_BOSS.finalSpeed * 0.55 * dt;
      boss.y -= (dy / distance) * CIPHER_BOSS.finalSpeed * 0.55 * dt;
    }

    this.updateCipherAttackSchedule(boss, dt, false);
  }

  startCipherSweepingBeam(boss, soloOnly) {
    const config = CIPHER_BOSS.attacks.beam;
    this.cipherBeams.push({
      angle: Math.random() * TWO_PI,
      phase: 'warning',
      remaining: config.warningDuration,
      soloOnly,
      nextDamageAt: 0,
    });
  }

  startCipherTargetedBarrage(boss, soloOnly) {
    const config = CIPHER_BOSS.attacks.barrage;
    const target = this.getCipherCaptainSoldier() ?? { x: this.player.x, y: this.player.y };
    const axis = this.input.getAxis?.() ?? { x: 0, y: 0 };
    const predictedX = target.x + axis.x * 105;
    const predictedY = target.y + axis.y * 105;
    const count = boss.finalPhase
      ? config.finalCount
      : boss.puzzleTier >= 2
        ? config.corruptedCount
        : config.count;
    const baseAngle = Math.random() * TWO_PI;

    for (let index = 0; index < count; index += 1) {
      const ring = index === 0 ? 0 : 64 + (index % 2) * 46;
      const angle = baseAngle + (TWO_PI * index) / Math.max(1, count);
      this.cipherBarrageMarkers.push({
        x: predictedX + Math.cos(angle) * ring,
        y: predictedY + Math.sin(angle) * ring,
        radius: config.radius,
        remaining: config.warningDuration,
        maxWarning: config.warningDuration,
        soloOnly,
      });
    }
  }

  startCipherProjectileWall(boss, soloOnly) {
    const config = CIPHER_BOSS.attacks.wall;
    const verticalLine = Math.random() < 0.5;
    const direction = Math.random() < 0.5 ? -1 : 1;
    const centerX = this.player.x;
    const centerY = this.player.y;
    const gap1 = randomRange(-235, -70);
    const gap2 = randomRange(70, 235);

    this.cipherWalls.push({
      phase: 'warning',
      remaining: config.warningDuration,
      verticalLine,
      direction,
      centerX,
      centerY,
      gaps: [gap1, gap2],
      soloOnly,
    });
  }

  triggerCipherShockwave(boss, soloOnly = true) {
    this.cipherShockwaves.push({
      x: boss.x,
      y: boss.y,
      radius: boss.radius + 10,
      previousRadius: boss.radius + 10,
      soloOnly,
      hitIds: new Set(),
    });
  }

  updateCipherHazards(dt) {
    this.updateCipherBeams(dt);
    this.updateCipherBarrage(dt);
    this.updateCipherWalls(dt);
    this.updateCipherWallProjectiles(dt);
    this.updateCipherShockwaves(dt);
  }

  getCipherHazardTargets(soloOnly) {
    const soldiers = this.getSoldierPositions().filter((soldier) => !soldier.unit.dead);
    return soloOnly
      ? soldiers.filter((soldier) => Boolean(soldier.unit.captainId))
      : soldiers;
  }

  updateCipherBeams(dt) {
    const config = CIPHER_BOSS.attacks.beam;
    for (const beam of this.cipherBeams) {
      beam.remaining -= dt;
      if (beam.phase === 'warning') {
        if (beam.remaining <= 0) {
          beam.phase = 'active';
          beam.remaining = config.duration;
          beam.nextDamageAt = 0;
        }
        continue;
      }

      beam.angle = normalizeAngle(beam.angle + config.angularSpeed * dt);
      beam.nextDamageAt -= dt;
      if (beam.nextDamageAt > 0) continue;
      beam.nextDamageAt = config.damageInterval;

      const boss = this.getActiveCipher();
      if (!boss) continue;
      for (const soldier of this.getCipherHazardTargets(beam.soloOnly)) {
        const dx = soldier.x - boss.x;
        const dy = soldier.y - boss.y;
        const distance = Math.hypot(dx, dy);
        if (distance > config.range) continue;
        const delta = Math.abs(normalizeAngle(Math.atan2(dy, dx) - beam.angle));
        if (delta > config.halfWidth) continue;
        this.damageSquadUnitFromBoss(soldier, config.damage);
      }
    }
    this.cipherBeams = this.cipherBeams.filter((beam) => beam.remaining > 0);
  }

  updateCipherBarrage(dt) {
    const config = CIPHER_BOSS.attacks.barrage;
    for (const marker of this.cipherBarrageMarkers) {
      marker.remaining -= dt;
      if (marker.remaining > 0 || marker.exploded) continue;
      marker.exploded = true;

      for (const soldier of this.getCipherHazardTargets(marker.soloOnly)) {
        const hitRadius = marker.radius + GAME_BALANCE.player.soldierRadius;
        if (distanceSq(marker.x, marker.y, soldier.x, soldier.y) > hitRadius ** 2) continue;
        this.damageSquadUnitFromBoss(soldier, config.damage);
      }
      this.spawnExplosionEffect(marker.x, marker.y, marker.radius, CIPHER_BOSS.colors.danger);
    }
    this.cipherBarrageMarkers = this.cipherBarrageMarkers
      .filter((marker) => !marker.exploded);
  }

  updateCipherWalls(dt) {
    const config = CIPHER_BOSS.attacks.wall;
    for (const wall of this.cipherWalls) {
      wall.remaining -= dt;
      if (wall.remaining > 0 || wall.spawned) continue;
      wall.spawned = true;

      const travelOffset = config.halfSpan + 90;
      for (let offset = -config.halfSpan; offset <= config.halfSpan; offset += config.spacing) {
        if (wall.gaps.some((gap) => Math.abs(offset - gap) <= config.gapHalfWidth)) continue;

        if (wall.verticalLine) {
          this.cipherWallProjectiles.push({
            x: wall.centerX - wall.direction * travelOffset,
            y: wall.centerY + offset,
            vx: wall.direction * config.speed,
            vy: 0,
            radius: config.radius,
            life: config.life,
            soloOnly: wall.soloOnly,
            hitIds: new Set(),
          });
        } else {
          this.cipherWallProjectiles.push({
            x: wall.centerX + offset,
            y: wall.centerY - wall.direction * travelOffset,
            vx: 0,
            vy: wall.direction * config.speed,
            radius: config.radius,
            life: config.life,
            soloOnly: wall.soloOnly,
            hitIds: new Set(),
          });
        }
      }
    }
    this.cipherWalls = this.cipherWalls.filter((wall) => !wall.spawned);
  }

  updateCipherWallProjectiles(dt) {
    const config = CIPHER_BOSS.attacks.wall;
    for (const projectile of this.cipherWallProjectiles) {
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      projectile.life -= dt;
      if (projectile.life <= 0) continue;

      for (const soldier of this.getCipherHazardTargets(projectile.soloOnly)) {
        if (projectile.hitIds.has(soldier.unit.id)) continue;
        const hitRadius = projectile.radius + GAME_BALANCE.player.soldierRadius;
        if (distanceSq(projectile.x, projectile.y, soldier.x, soldier.y) > hitRadius ** 2) continue;
        projectile.hitIds.add(soldier.unit.id);
        this.damageSquadUnitFromBoss(soldier, config.damage);
      }
    }
    this.cipherWallProjectiles = this.cipherWallProjectiles
      .filter((projectile) => projectile.life > 0);
  }

  updateCipherShockwaves(dt) {
    const config = CIPHER_BOSS.attacks.shockwave;
    for (const wave of this.cipherShockwaves) {
      wave.previousRadius = wave.radius;
      wave.radius += config.speed * dt;
      for (const soldier of this.getCipherHazardTargets(wave.soloOnly)) {
        if (wave.hitIds.has(soldier.unit.id)) continue;
        const distance = Math.hypot(soldier.x - wave.x, soldier.y - wave.y);
        const minRadius = wave.previousRadius - config.width;
        const maxRadius = wave.radius + config.width;
        if (distance < minRadius || distance > maxRadius) continue;
        wave.hitIds.add(soldier.unit.id);
        this.damageSquadUnitFromBoss(soldier, config.damage);
      }
    }
    this.cipherShockwaves = this.cipherShockwaves
      .filter((wave) => wave.radius <= config.maxRadius);
  }

  clearCipherHazards() {
    this.cipherBeams = [];
    this.cipherBarrageMarkers = [];
    this.cipherWalls = [];
    this.cipherWallProjectiles = [];
    this.cipherShockwaves = [];
  }

  drawEnemies(ctx) {
    super.drawEnemies(ctx);
    const boss = this.getActiveCipher();
    if (boss) this.drawCipher(ctx, boss);
  }

  drawCipher(ctx, boss) {
    const colors = CIPHER_BOSS.colors;
    const pulse = (Math.sin(this.animationClock * (boss.finalPhase ? 9 : 5)) + 1) * 0.5;
    const drawn = this.animationRenderer.draw(
      ctx,
      CIPHER_SPRITE,
      'idle',
      0,
      boss.x,
      boss.y,
    );

    if (!drawn) {
      ctx.save();
      ctx.translate(boss.x, boss.y);
      ctx.rotate(this.animationClock * 0.18);
      ctx.shadowBlur = boss.hitFlash > 0 ? 28 : 18;
      ctx.shadowColor = boss.hitFlash > 0 ? '#ffffff' : colors.core;
      ctx.fillStyle = boss.hitFlash > 0 ? '#ffffff' : colors.shell;
      ctx.strokeStyle = colors.shellEdge;
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (let index = 0; index < 8; index += 1) {
        const angle = (TWO_PI * index) / 8 - Math.PI / 2;
        const radius = index % 2 === 0 ? 64 : 52;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.rotate(-this.animationClock * 0.36);
      ctx.shadowBlur = 20 + pulse * 10;
      ctx.shadowColor = colors.core;
      ctx.fillStyle = colors.core;
      ctx.beginPath();
      ctx.arc(0, 0, 14 + pulse * 3, 0, TWO_PI);
      ctx.fill();
      ctx.restore();
    }

    if (boss.shielded && !boss.shieldPermanentBroken) {
      ctx.save();
      ctx.translate(boss.x, boss.y);
      ctx.rotate(this.animationClock * 0.22);
      ctx.strokeStyle = colors.shield;
      ctx.shadowColor = colors.shield;
      ctx.shadowBlur = 22;
      ctx.globalAlpha = 0.55 + pulse * 0.35;
      ctx.lineWidth = 5;
      ctx.setLineDash([30, 10]);
      ctx.beginPath();
      ctx.arc(0, 0, boss.radius + 28, 0, TWO_PI);
      ctx.stroke();
      ctx.rotate(-this.animationClock * 0.5);
      ctx.strokeStyle = colors.shieldHot;
      ctx.lineWidth = 2;
      ctx.setLineDash([12, 16]);
      ctx.beginPath();
      ctx.arc(0, 0, boss.radius + 38, 0, TWO_PI);
      ctx.stroke();
      ctx.restore();
    }

    const visibleSymbol = this.getCipherVisibleSymbol(boss);
    if (visibleSymbol) {
      ctx.save();
      ctx.translate(boss.x, boss.y - boss.radius - 82);
      const size = 34 + pulse * 3;
      ctx.fillStyle = 'rgba(7,14,25,.88)';
      ctx.strokeStyle = colors.glyph;
      ctx.lineWidth = 3;
      ctx.shadowBlur = 18;
      ctx.shadowColor = colors.glyph;
      ctx.beginPath();
      ctx.arc(0, 0, 48, 0, TWO_PI);
      ctx.fill();
      ctx.stroke();
      this.drawCipherSymbol(ctx, visibleSymbol, 0, 0, size, colors.glyph, 4);
      ctx.restore();
    }
  }

  drawEffects(ctx) {
    super.drawEffects(ctx);
    const boss = this.getActiveCipher();
    if (boss) this.drawCipherPuzzleEffects(ctx, boss);
    this.drawCipherHazards(ctx);
  }

  drawCipherPuzzleEffects(ctx, boss) {
    const colors = CIPHER_BOSS.colors;
    for (const glyph of boss.glyphs ?? []) {
      const pulse = (Math.sin(this.animationClock * 5 + glyph.x * 0.01) + 1) * 0.5;
      const recentlyCompleted = glyph.completed && this.elapsed - glyph.completedAt < 0.7;
      const color = glyph.completed ? colors.correct : colors.glyph;

      ctx.save();
      ctx.translate(glyph.x, glyph.y);
      ctx.globalAlpha = glyph.completed ? 0.68 : 0.9;
      ctx.fillStyle = glyph.completed ? 'rgba(126,249,212,.11)' : 'rgba(120,207,255,.08)';
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 14 + pulse * 10;
      ctx.lineWidth = glyph.completed ? 5 : 3;
      ctx.beginPath();
      ctx.arc(0, 0, glyph.radius + pulse * 3, 0, TWO_PI);
      ctx.fill();
      ctx.stroke();
      this.drawCipherSymbol(ctx, glyph.symbolId, 0, 0, 23, color, 3.5);

      if (recentlyCompleted) {
        ctx.fillStyle = colors.correct;
        ctx.font = '1000 24px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✓', glyph.radius * 0.72, -glyph.radius * 0.72);
      }

      const definition = CIPHER_SYMBOLS.find((symbol) => symbol.id === glyph.symbolId);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#dfefff';
      ctx.font = '900 8px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText((definition?.label ?? glyph.symbolId).toUpperCase(), 0, glyph.radius + 9);
      ctx.restore();
    }

    if (boss.state === 'puzzle_solve') {
      const remaining = Math.max(0, boss.puzzleDeadline - this.elapsed);
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = '1000 15px Inter, sans-serif';
      ctx.fillStyle = remaining <= 4 ? colors.wrong : '#effaff';
      ctx.shadowBlur = 12;
      ctx.shadowColor = remaining <= 4 ? colors.wrong : colors.shield;
      ctx.fillText(
        `SEQUENCE ${boss.puzzleProgress}/${boss.sequence.length}  •  ${remaining.toFixed(1)}s`,
        boss.x,
        boss.y + boss.radius + 68,
      );
      ctx.restore();
    }
  }

  drawCipherHazards(ctx) {
    const boss = this.getActiveCipher();
    const colors = CIPHER_BOSS.colors;
    const beamConfig = CIPHER_BOSS.attacks.beam;

    if (boss) {
      for (const beam of this.cipherBeams) {
        ctx.save();
        ctx.translate(boss.x, boss.y);
        ctx.rotate(beam.angle);
        const warning = beam.phase === 'warning';
        ctx.strokeStyle = warning ? 'rgba(255,83,109,.55)' : colors.danger;
        ctx.shadowColor = colors.danger;
        ctx.shadowBlur = warning ? 8 : 24;
        ctx.lineWidth = warning ? 3 : 14;
        if (warning) ctx.setLineDash([18, 12]);
        ctx.beginPath();
        ctx.moveTo(boss.radius + 8, 0);
        ctx.lineTo(beamConfig.range, 0);
        ctx.stroke();
        ctx.restore();
      }
    }

    for (const marker of this.cipherBarrageMarkers) {
      const progress = 1 - clamp(marker.remaining / marker.maxWarning, 0, 1);
      ctx.save();
      ctx.fillStyle = `rgba(255,83,109,${0.05 + progress * 0.12})`;
      ctx.strokeStyle = colors.danger;
      ctx.lineWidth = 2 + progress * 3;
      ctx.setLineDash([10, 7]);
      ctx.beginPath();
      ctx.arc(marker.x, marker.y, marker.radius, 0, TWO_PI);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    const wallConfig = CIPHER_BOSS.attacks.wall;
    for (const wall of this.cipherWalls) {
      ctx.save();
      ctx.strokeStyle = 'rgba(157,140,255,.65)';
      ctx.shadowColor = CIPHER_BOSS.colors.projectile;
      ctx.shadowBlur = 12;
      ctx.lineWidth = 3;
      ctx.setLineDash([14, 10]);
      const startOffset = wallConfig.halfSpan + 90;
      if (wall.verticalLine) {
        const x = wall.centerX - wall.direction * startOffset;
        ctx.beginPath();
        ctx.moveTo(x, wall.centerY - wallConfig.halfSpan);
        ctx.lineTo(x, wall.centerY + wallConfig.halfSpan);
        ctx.stroke();
      } else {
        const y = wall.centerY - wall.direction * startOffset;
        ctx.beginPath();
        ctx.moveTo(wall.centerX - wallConfig.halfSpan, y);
        ctx.lineTo(wall.centerX + wallConfig.halfSpan, y);
        ctx.stroke();
      }
      ctx.restore();
    }

    for (const projectile of this.cipherWallProjectiles) {
      ctx.save();
      ctx.fillStyle = colors.projectile;
      ctx.shadowColor = colors.projectile;
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, projectile.radius, 0, TWO_PI);
      ctx.fill();
      ctx.restore();
    }

    for (const wave of this.cipherShockwaves) {
      ctx.save();
      ctx.strokeStyle = colors.wrong;
      ctx.shadowColor = colors.wrong;
      ctx.shadowBlur = 18;
      ctx.lineWidth = CIPHER_BOSS.attacks.shockwave.width;
      ctx.globalAlpha = 0.52;
      ctx.beginPath();
      ctx.arc(wave.x, wave.y, wave.radius, 0, TWO_PI);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawCipherSymbol(ctx, symbolId, x, y, size, color, lineWidth = 3) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();

    if (symbolId === 'circle') {
      ctx.arc(0, 0, size * 0.62, 0, TWO_PI);
    } else if (symbolId === 'triangle') {
      ctx.moveTo(0, -size * 0.72);
      ctx.lineTo(size * 0.68, size * 0.58);
      ctx.lineTo(-size * 0.68, size * 0.58);
      ctx.closePath();
    } else if (symbolId === 'cross') {
      ctx.moveTo(-size * 0.62, -size * 0.62);
      ctx.lineTo(size * 0.62, size * 0.62);
      ctx.moveTo(size * 0.62, -size * 0.62);
      ctx.lineTo(-size * 0.62, size * 0.62);
    } else if (symbolId === 'diamond') {
      ctx.moveTo(0, -size * 0.78);
      ctx.lineTo(size * 0.62, 0);
      ctx.lineTo(0, size * 0.78);
      ctx.lineTo(-size * 0.62, 0);
      ctx.closePath();
    } else if (symbolId === 'three_lines') {
      for (let row = -1; row <= 1; row += 1) {
        ctx.moveTo(-size * 0.65, row * size * 0.38);
        ctx.lineTo(size * 0.65, row * size * 0.38);
      }
    } else if (symbolId === 'spiral') {
      const turns = 2.15;
      const points = 36;
      for (let index = 0; index <= points; index += 1) {
        const t = index / points;
        const angle = t * turns * TWO_PI;
        const radius = size * 0.08 + size * 0.62 * t;
        const px = Math.cos(angle) * radius;
        const py = Math.sin(angle) * radius;
        if (index === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
    }

    ctx.stroke();
    ctx.restore();
  }
}

export class UI extends PreviousUI {
  constructor(...args) {
    super(...args);
    this.cipherBanner = document.createElement('div');
    this.cipherBanner.setAttribute('aria-live', 'assertive');
    Object.assign(this.cipherBanner.style, {
      position: 'fixed',
      left: '50%',
      top: '24%',
      transform: 'translate(-50%, -8px) scale(.96)',
      zIndex: '18',
      padding: '10px 18px',
      border: '1px solid rgba(99,207,255,.52)',
      borderRadius: '10px',
      background: 'rgba(7,14,25,.88)',
      boxShadow: '0 0 32px rgba(99,207,255,.22)',
      color: '#effaff',
      fontSize: 'clamp(18px, 3.6vw, 34px)',
      fontWeight: '1000',
      letterSpacing: '.12em',
      textAlign: 'center',
      textTransform: 'uppercase',
      textShadow: '0 0 16px rgba(99,207,255,.78)',
      opacity: '0',
      pointerEvents: 'none',
      transition: 'opacity 120ms ease, transform 120ms ease',
    });
    document.body.append(this.cipherBanner);
  }

  update(game) {
    super.update(game);

    const intro = game.cipherIntro;
    const introActive = Boolean(intro?.active);
    const introElapsed = intro?.elapsed ?? 0;
    const showArrival = introActive
      && introElapsed >= INTRO_MESSAGE_TIME
      && introElapsed < INTRO_SPAWN_TIME;

    if (this.bossArrivalNotice && introActive) {
      this.bossArrivalNotice.textContent = `${CIPHER_BOSS.name} has arrived`;
      this.bossArrivalNotice.style.opacity = showArrival ? '1' : '0';
      this.bossArrivalNotice.style.transform = showArrival ? 'scale(1)' : 'scale(.9)';
    }

    if (this.gameCanvas && introActive) {
      if (introElapsed < INTRO_SHAKE_DURATION) {
        const strength = 11 * (1 - introElapsed / INTRO_SHAKE_DURATION);
        this.gameCanvas.style.transform = `translate(${(Math.random() - 0.5) * strength * 2}px, ${(Math.random() - 0.5) * strength * 2}px) scale(1.01)`;
      } else {
        this.gameCanvas.style.transform = '';
      }
    }

    if (this.cipherBanner) {
      const visible = game.cipherBannerUntil > game.elapsed;
      this.cipherBanner.textContent = visible ? game.cipherBannerText : '';
      this.cipherBanner.style.opacity = visible ? '1' : '0';
      this.cipherBanner.style.transform = visible
        ? 'translate(-50%, 0) scale(1)'
        : 'translate(-50%, -8px) scale(.96)';
    }

    const boss = game.getActiveCipher?.();
    if (!boss || !this.wardenHud) return;

    const hpRatio = clamp(boss.hp / boss.maxHp, 0, 1);
    const name = this.wardenHud.querySelector('.boss-hud__name');
    if (name) name.textContent = 'THE CIPHER';

    let stateLabel = 'SHIELDED';
    if (boss.finalPhase) stateLabel = 'FINAL PHASE';
    else if (boss.state === 'puzzle_reveal') stateLabel = 'MEMORIZE';
    else if (boss.state === 'puzzle_solve') stateLabel = 'CAPTAIN: SOLVE SEQUENCE';
    else if (boss.state === 'damage') stateLabel = 'SHIELD BROKEN';
    else if (boss.state === 'damage_transition') stateLabel = 'SHIELD RESTORING';

    this.wardenHud.classList.add('boss-hud--visible');
    this.wardenHud.classList.toggle('boss-hud--enraged', boss.finalPhase);
    this.wardenFill.style.width = `${hpRatio * 100}%`;
    this.wardenState.textContent = stateLabel;
    this.wardenHp.textContent = `${Math.ceil(boss.hp)} / ${boss.maxHp}`;

    if (boss.finalPhase) {
      this.wardenArmor.textContent = 'SHIELD DESTROYED • FULL SQUAD ENGAGED';
    } else if (boss.state === 'puzzle_solve') {
      this.wardenArmor.textContent = `SEQUENCE ${boss.puzzleProgress}/${boss.sequence.length} • ${Math.max(0, boss.puzzleDeadline - game.elapsed).toFixed(1)}s`;
    } else if (boss.state === 'puzzle_reveal') {
      this.wardenArmor.textContent = `PUZZLE ${boss.puzzleTier}/3 • MEMORIZE`; 
    } else if (boss.state === 'damage') {
      this.wardenArmor.textContent = `VULNERABLE ${Math.max(0, boss.damagePhaseEnds - game.elapsed).toFixed(1)}s`;
    } else {
      this.wardenArmor.textContent = 'SHIELD LOCKED';
    }
  }
}
