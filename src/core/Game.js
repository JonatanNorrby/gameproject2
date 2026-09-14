import { GAME_BALANCE, ENEMY_TYPES, UNIT_CLASSES } from '../data/content.js';
import { GROUND_DROPS, GROUND_DROP_CONFIG, GROUND_DROP_IDS } from '../data/groundDrops.js';
import { getEnemySprite, getSquadSprite } from '../data/sprites.js';
import { EntityStore } from './EntityStore.js';
import { SpawnSystem } from '../systems/SpawnSystem.js';
import { CombatSystem } from '../systems/CombatSystem.js';
import { ProgressionSystem } from '../systems/ProgressionSystem.js';
import { FrameAnimationRenderer } from '../rendering/FrameAnimationRenderer.js';
import { getHexFormationLayout, radiusForNeighborSpacing } from '../utils/hexFormation.js';
import { distanceSq, randomRange } from '../utils/math.js';

const DAMAGE_FEEDBACK_DURATION = 0.18;
const DEFAULT_SPRITE_FORWARD_ANGLE = -Math.PI / 2;
const UNIT_ANIMATION_PRIORITY = {
  shooting: 1,
  idle_shooting: 1,
  dead: 2,
};

export class Game {
  constructor(canvas, input, ui) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = input;
    this.ui = ui;
    this.entities = new EntityStore();
    this.animationRenderer = new FrameAnimationRenderer();
    this.spawnSystem = new SpawnSystem(this);
    this.combatSystem = new CombatSystem(this);
    this.progression = new ProgressionSystem(this, ui);
    this.pauseReasons = new Set(['menu']);
    this.running = false;
    this.lastTimestamp = 0;
    this.animationClock = performance.now() / 1000;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.resetState();

    this.ui.bindSquadBuilder({
      getSquad: () => this.player.squad,
      reorder: (fromIndex, toIndex) => this.reorderSquad(fromIndex, toIndex),
      onOpen: () => this.pause('squad-builder'),
      onClose: () => this.resume('squad-builder'),
    });
  }

  resetState() {
    this.entities.reset();
    this.elapsed = 0;
    this.kills = 0;
    this.damageFeedback = 0;
    this.deadCaptain = null;
    this.nextSquadUnitId = 1;
    this.dropEffects = {
      furyUntil: 0,
      mothershipUntil: 0,
      transformerUntil: 0,
    };
    this.modifiers = { damage: 1, fireRate: 1, moveSpeed: 1, projectileSpeed: 1, projectileLife: 1, pierce: 0 };
    this.player = {
      x: 0,
      y: 0,
      radius: GAME_BALANCE.player.radius,
      speed: GAME_BALANCE.player.speed,
      maxHp: GAME_BALANCE.player.maxHp,
      hp: GAME_BALANCE.player.maxHp,
      armor: GAME_BALANCE.player.armor,
      magnetRadius: GAME_BALANCE.player.magnetRadius,
      squad: [],
      level: 1,
      xp: 0,
      xpToNext: GAME_BALANCE.progression.startingXpToNext,
      moving: false,
      facingX: 1,
      facingAngle: DEFAULT_SPRITE_FORWARD_ANGLE,
    };

    for (const type of GAME_BALANCE.player.startingSquad) this.addSquadUnits(type, 1);

    this.progression.reset();
    this.spawnSystem.reset();
    this.combatSystem.reset();
  }

  start() {
    this.resetState();
    this.pauseReasons.clear();
    this.ui.hideStart();
    this.ui.hideGameOver();
    this.ui.hideSquadBuilder();
    if (!this.running) {
      this.running = true;
      this.lastTimestamp = performance.now();
      requestAnimationFrame((time) => this.loop(time));
    }
  }

  restart() { this.start(); }
  pause(reason) { this.pauseReasons.add(reason); }
  resume(reason) { this.pauseReasons.delete(reason); }
  get paused() { return this.pauseReasons.size > 0; }

  loop(timestamp) {
    const rawDt = (timestamp - this.lastTimestamp) / 1000;
    const dt = Math.min(0.033, Math.max(0, rawDt));
    this.lastTimestamp = timestamp;
    this.animationClock = timestamp / 1000;

    if (!this.paused) this.update(dt);
    this.render();
    this.ui.update(this);
    requestAnimationFrame((time) => this.loop(time));
  }

  update(dt) {
    this.elapsed += dt;
    this.updatePlayer(dt);
    this.updateUnitState(dt);
    this.spawnSystem.update(dt);
    this.combatSystem.update(dt);
    this.updateGroundDrops();
    this.updateParticles(dt);
    this.updateEffects(dt);
    this.damageFeedback = Math.max(0, this.damageFeedback - dt);

    if (this.debug?.infiniteHp) this.healAllUnits();
    this.syncCaptainHealth();

    this.entities.compact();

    if (this.player.hp <= 0 && this.deadCaptain && !this.pauseReasons.has('gameover')) {
      this.pause('gameover');
      this.ui.showGameOver(this);
    }
  }

  updatePlayer(dt) {
    const axis = this.input.getAxis();
    const speed = this.player.speed * this.modifiers.moveSpeed * this.getTransformerStatMultiplier();
    this.player.moving = Math.abs(axis.x) > 0.01 || Math.abs(axis.y) > 0.01;
    if (this.player.moving) {
      this.player.facingAngle = Math.atan2(axis.y, axis.x);
      if (Math.abs(axis.x) > 0.01) this.player.facingX = Math.sign(axis.x);
    }
    this.player.x += axis.x * speed * dt;
    this.player.y += axis.y * speed * dt;
  }

  updateUnitState(dt) {
    for (const unit of this.player.squad) {
      unit.hitFlash = Math.max(0, (unit.hitFlash ?? 0) - dt);
    }
  }

  addSquadUnits(type, amount = 1) {
    const unitClass = UNIT_CLASSES[type];
    if (!unitClass) return;
    const maxHp = unitClass.maxHp ?? GAME_BALANCE.player.maxHp;

    for (let i = 0; i < amount; i += 1) {
      this.player.squad.push({
        id: this.nextSquadUnitId,
        type,
        hp: maxHp,
        maxHp,
        hitFlash: 0,
        dead: false,
        animationState: null,
        animationStartedAt: 0,
        animationUntil: 0,
      });
      this.nextSquadUnitId += 1;
    }
  }

  getCaptainUnit() {
    return this.player.squad.find((unit) => Boolean(unit.captainId)) ?? null;
  }

  syncCaptainHealth() {
    const captainUnit = this.getCaptainUnit();
    if (captainUnit) {
      this.player.maxHp = captainUnit.maxHp;
      this.player.hp = Math.max(0, captainUnit.hp);
      return;
    }

    if (this.deadCaptain?.unit) {
      this.player.maxHp = this.deadCaptain.unit.maxHp;
      this.player.hp = 0;
    }
  }

  healAllUnits() {
    for (const unit of this.player.squad) unit.hp = unit.maxHp;
    this.syncCaptainHealth();
  }

  isDropEffectActive(type) {
    return (this.dropEffects?.[`${type}Until`] ?? 0) > this.elapsed;
  }

  getDropEffectRemaining(type) {
    return Math.max(0, (this.dropEffects?.[`${type}Until`] ?? 0) - this.elapsed);
  }

  getTransformerStatMultiplier() {
    return this.isDropEffectActive('transformer') ? 2 : 1;
  }

  getAttackSpeedMultiplier() {
    let multiplier = this.getTransformerStatMultiplier();
    if (this.isDropEffectActive('fury')) multiplier *= 4;
    return multiplier;
  }

  activateTimedDropEffect(type, duration) {
    const key = `${type}Until`;
    if (!(key in this.dropEffects)) return;
    const currentEnd = Math.max(this.elapsed, this.dropEffects[key]);
    this.dropEffects[key] = currentEnd + Math.max(0, duration);
  }

  spawnGroundDrop(type, x = this.player.x, y = this.player.y) {
    const definition = GROUND_DROPS[type];
    if (!definition) return null;

    const drop = {
      id: this.entities.createId(),
      type,
      x,
      y,
      radius: 15,
      dead: false,
    };
    this.entities.groundDrops.push(drop);
    return drop;
  }

  spawnDebugGroundDrop(type) {
    const definitionIndex = Math.max(0, GROUND_DROP_IDS.indexOf(type));
    const angle = -Math.PI / 2 + definitionIndex * (Math.PI * 2 / Math.max(1, GROUND_DROP_IDS.length));
    const distance = GROUND_DROP_CONFIG.debugSpawnDistance;
    return this.spawnGroundDrop(
      type,
      this.player.x + Math.cos(angle) * distance,
      this.player.y + Math.sin(angle) * distance,
    );
  }

  trySpawnGroundDrop(x, y) {
    if (Math.random() >= GROUND_DROP_CONFIG.spawnChanceOnKill) return null;
    const type = GROUND_DROP_IDS[Math.floor(Math.random() * GROUND_DROP_IDS.length)];
    return this.spawnGroundDrop(type, x, y);
  }

  updateGroundDrops() {
    const collectRadiusBase = GROUND_DROP_CONFIG.pickupRadius + this.player.radius;
    for (const drop of this.entities.groundDrops) {
      if (drop.dead) continue;
      const collectRadius = collectRadiusBase + (drop.radius ?? 0);
      if (distanceSq(this.player.x, this.player.y, drop.x, drop.y) > collectRadius * collectRadius) continue;
      drop.dead = true;
      this.collectGroundDrop(drop.type);
    }
  }

  collectGroundDrop(type) {
    const definition = GROUND_DROPS[type];
    if (!definition) return;

    if (type === 'magnet') {
      this.collectAllXp();
    } else if (type === 'nuke') {
      this.combatSystem.nukeAllEnemies();
    } else if (definition.kind === 'timed') {
      this.activateTimedDropEffect(type, definition.duration);
    }

    this.spawnExplosionEffect(this.player.x, this.player.y, 42, definition.color);
  }

  collectAllXp() {
    let totalXp = 0;
    for (const gem of this.entities.gems) {
      if (gem.dead) continue;
      gem.dead = true;
      totalXp += gem.value;
    }
    if (totalXp > 0) this.progression.addXp(totalXp);
  }

  getWeaponPositions() {
    const soldiers = this.getSoldierPositions();
    if (!this.isDropEffectActive('transformer')) return soldiers;
    return soldiers.map((soldier) => ({
      ...soldier,
      x: this.player.x,
      y: this.player.y,
    }));
  }

  damageMergedSquad(amount, x = this.player.x, y = this.player.y) {
    const livingUnits = [...this.player.squad].filter((unit) => !unit.dead);
    if (livingUnits.length === 0 || amount <= 0) return;

    const effectiveDamage = amount / this.getTransformerStatMultiplier();
    const damagePerUnit = effectiveDamage / livingUnits.length;
    for (const unit of livingUnits) {
      if (unit.dead) continue;
      unit.hitFlash = DAMAGE_FEEDBACK_DURATION;
      unit.hp = Math.max(0, unit.hp - damagePerUnit);
      if (unit.hp <= 0) {
        this.killSquadUnit({
          unit,
          x,
          y,
          index: -1,
          hex: { q: 0, r: 0, ring: 0 },
        });
      }
    }
  }

  playUnitAnimation(unit, state, duration = 0.2) {
    if (!unit || !state) return;
    const now = this.animationClock;
    const currentIsActive = Boolean(unit.animationState) && unit.animationUntil > now;
    const currentPriority = currentIsActive ? (UNIT_ANIMATION_PRIORITY[unit.animationState] ?? 0) : 0;
    const nextPriority = UNIT_ANIMATION_PRIORITY[state] ?? 0;
    if (currentIsActive && currentPriority > nextPriority) return;

    unit.animationState = state;
    unit.animationStartedAt = now;
    unit.animationUntil = state === 'dead' ? Infinity : now + Math.max(0, duration);
  }

  getUnitAnimation(unit) {
    if (unit.dead) return { name: 'dead', time: 0 };

    if (unit.animationState && unit.animationUntil > this.animationClock) {
      const isFiring = unit.animationState === 'shooting' || unit.animationState === 'idle_shooting';
      return {
        name: isFiring
          ? (this.player.moving ? 'shooting' : 'idle_shooting')
          : unit.animationState,
        time: Math.max(0, this.animationClock - unit.animationStartedAt),
      };
    }

    if (this.player.moving) {
      return { name: 'running', time: this.animationClock };
    }

    return { name: 'idle', time: 0 };
  }

  getUnitSpriteRotation(sprite, animationName) {
    if (animationName === 'idle' || animationName === 'idle_shooting') return 0;
    const sourceForwardAngle = Number.isFinite(sprite?.forwardAngle)
      ? sprite.forwardAngle
      : DEFAULT_SPRITE_FORWARD_ANGLE;
    return this.player.facingAngle - sourceForwardAngle;
  }

  killSquadUnit(soldier) {
    const unit = soldier?.unit;
    if (!unit || unit.dead) return;

    const sprite = getSquadSprite(unit);
    const currentAnimation = this.getUnitAnimation(unit);
    const rotation = this.getUnitSpriteRotation(sprite, currentAnimation.name);

    unit.hp = 0;
    unit.dead = true;
    this.playUnitAnimation(unit, 'dead');

    const corpseUnit = {
      ...unit,
      animationState: 'dead',
      animationStartedAt: this.animationClock,
      animationUntil: Infinity,
    };
    const corpse = {
      id: this.entities.createId(),
      unit: corpseUnit,
      x: soldier.x,
      y: soldier.y,
      rotation,
    };
    this.entities.corpses.push(corpse);

    const squadIndex = this.player.squad.findIndex((candidate) => candidate.id === unit.id);
    if (squadIndex >= 0) this.player.squad.splice(squadIndex, 1);

    if (unit.captainId) {
      this.deadCaptain = corpse;
      this.player.maxHp = unit.maxHp;
      this.player.hp = 0;
    }

    this.spawnDeathParticles(soldier.x, soldier.y, GAME_BALANCE.player.soldierRadius);
  }

  reorderSquad(fromIndex, toIndex) {
    const squad = this.player.squad;
    if (
      fromIndex === toIndex
      || fromIndex < 0
      || toIndex < 0
      || fromIndex >= squad.length
      || toIndex >= squad.length
    ) return;

    const [unit] = squad.splice(fromIndex, 1);
    squad.splice(toIndex, 0, unit);
  }

  getSoldierPositions() {
    const squad = this.player.squad;
    if (squad.length === 0) return [];

    const hexRadius = radiusForNeighborSpacing(GAME_BALANCE.player.formationSpacing);
    const layout = getHexFormationLayout(squad.length, hexRadius);

    return layout.map((slot, index) => ({
      x: this.player.x + slot.x,
      y: this.player.y + slot.y,
      index,
      hex: { q: slot.q, r: slot.r, ring: slot.ring },
      unit: squad[index],
    }));
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(window.innerWidth * dpr);
    this.canvas.height = Math.floor(window.innerHeight * dpr);
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.viewport = { width: window.innerWidth, height: window.innerHeight, dpr };
  }

  render() {
    const ctx = this.ctx;
    const { width, height } = this.viewport;
    const damageStrength = Math.min(1, this.damageFeedback / DAMAGE_FEEDBACK_DURATION);
    const shakeAmount = 4 * damageStrength;

    ctx.clearRect(0, 0, width, height);
    this.drawBackground(ctx, width, height);

    ctx.save();
    if (shakeAmount > 0) {
      ctx.translate(
        (Math.random() - 0.5) * shakeAmount,
        (Math.random() - 0.5) * shakeAmount,
      );
    }
    ctx.translate(width / 2 - this.player.x, height / 2 - this.player.y);
    this.drawGems(ctx);
    this.drawGroundDrops(ctx);
    this.drawCorpses(ctx);
    this.drawParticles(ctx);
    this.drawProjectiles(ctx);
    this.drawEnemies(ctx);
    this.drawEffects(ctx);
    this.drawPlayer(ctx);
    ctx.restore();

    if (damageStrength > 0) this.drawDamageOverlay(ctx, width, height, damageStrength);
  }

  drawBackground(ctx, width, height) {
    ctx.fillStyle = '#080b12';
    ctx.fillRect(0, 0, width, height);
    const grid = 64;
    const offsetX = ((-this.player.x + width / 2) % grid + grid) % grid;
    const offsetY = ((-this.player.y + height / 2) % grid + grid) % grid;
    ctx.strokeStyle = 'rgba(118, 146, 190, 0.075)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = offsetX; x <= width; x += grid) { ctx.moveTo(x, 0); ctx.lineTo(x, height); }
    for (let y = offsetY; y <= height; y += grid) { ctx.moveTo(0, y); ctx.lineTo(width, y); }
    ctx.stroke();

    const gradient = ctx.createRadialGradient(width / 2, height / 2, 30, width / 2, height / 2, Math.max(width, height) * 0.7);
    gradient.addColorStop(0, 'rgba(40, 71, 95, 0.08)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.36)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  drawDamageOverlay(ctx, width, height, strength) {
    const radius = Math.max(width, height) * 0.72;
    const gradient = ctx.createRadialGradient(width / 2, height / 2, radius * 0.28, width / 2, height / 2, radius);
    gradient.addColorStop(0, 'rgba(255, 45, 70, 0)');
    gradient.addColorStop(0.62, `rgba(255, 45, 70, ${0.05 * strength})`);
    gradient.addColorStop(1, `rgba(255, 35, 60, ${0.32 * strength})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  drawGroundDrops(ctx) {
    for (const drop of this.entities.groundDrops) {
      if (drop.dead) continue;
      const definition = GROUND_DROPS[drop.type];
      if (!definition) continue;

      const bob = Math.sin(this.animationClock * 3.4 + drop.id * 0.71) * 3;
      const pulse = 1 + Math.sin(this.animationClock * 5 + drop.id) * 0.06;
      ctx.save();
      ctx.translate(drop.x, drop.y + bob);
      ctx.scale(pulse, pulse);
      ctx.shadowBlur = 20;
      ctx.shadowColor = definition.color;
      ctx.fillStyle = `${definition.color}33`;
      ctx.strokeStyle = definition.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, drop.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.fillStyle = definition.color;
      ctx.font = '900 13px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(definition.symbol, 0, 0);

      ctx.font = '800 9px Inter, sans-serif';
      ctx.fillStyle = '#f3f7fb';
      ctx.textBaseline = 'top';
      ctx.fillText(definition.label.toUpperCase(), 0, drop.radius + 7);
      ctx.restore();
    }
  }

  drawCorpses(ctx) {
    const radius = GAME_BALANCE.player.soldierRadius;

    for (const corpse of this.entities.corpses) {
      const sprite = getSquadSprite(corpse.unit);
      const drawn = this.animationRenderer.draw(
        ctx,
        sprite,
        'dead',
        0,
        corpse.x,
        corpse.y,
        {
          rotation: corpse.rotation,
          alpha: 0.92,
          strictAnimation: true,
        },
      );
      if (drawn) continue;

      const unitClass = UNIT_CLASSES[corpse.unit.type] ?? UNIT_CLASSES.rifleman;
      ctx.save();
      ctx.translate(corpse.x, corpse.y);
      ctx.rotate(corpse.rotation || 0);
      ctx.globalAlpha = 0.72;
      ctx.fillStyle = unitClass.core;
      ctx.strokeStyle = unitClass.outline;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, radius + 4, radius * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  drawPlayer(ctx) {
    if (this.isDropEffectActive('mothership')) {
      this.drawMothership(ctx);
      return;
    }
    if (this.isDropEffectActive('transformer')) {
      this.drawMegaUnit(ctx);
      return;
    }

    const soldierRadius = GAME_BALANCE.player.soldierRadius;
    const soldiers = this.getSoldierPositions();

    ctx.save();
    for (const soldier of soldiers) {
      const unitClass = UNIT_CLASSES[soldier.unit.type] ?? UNIT_CLASSES.rifleman;
      const sprite = getSquadSprite(soldier.unit);
      const animation = this.getUnitAnimation(soldier.unit);
      const spriteRotation = this.getUnitSpriteRotation(sprite, animation.name);
      const takingDamage = (soldier.unit.hitFlash ?? 0) > 0;
      const spriteDrawn = this.animationRenderer.draw(
        ctx,
        sprite,
        animation.name,
        animation.time,
        soldier.x,
        soldier.y,
        {
          phase: animation.name === 'running' && this.player.moving ? soldier.unit.id * 0.113 : 0,
          rotation: spriteRotation,
        },
      );

      if (spriteDrawn) {
        if (takingDamage) {
          ctx.save();
          ctx.strokeStyle = 'rgba(255,102,119,.9)';
          ctx.lineWidth = 2;
          ctx.shadowBlur = 12;
          ctx.shadowColor = 'rgba(255,74,94,.75)';
          ctx.beginPath();
          ctx.arc(soldier.x, soldier.y, soldierRadius + 4, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
        continue;
      }

      const fill = takingDamage ? '#ff6677' : unitClass.fill;
      const core = takingDamage ? '#4a1119' : unitClass.core;
      const outline = takingDamage ? '#ffb0bb' : unitClass.outline;

      ctx.shadowBlur = takingDamage ? 22 : 14;
      ctx.shadowColor = takingDamage ? 'rgba(255,74,94,.72)' : `${outline}66`;
      ctx.fillStyle = fill;
      ctx.strokeStyle = outline;
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.arc(soldier.x, soldier.y, soldierRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(soldier.x, soldier.y, soldierRadius * 0.38, 0, Math.PI * 2);
      ctx.fill();

      if (soldier.unit.type === 'rocketeer') {
        ctx.fillStyle = takingDamage ? '#651a25' : '#6f421d';
        ctx.fillRect(soldier.x - soldierRadius - 4, soldier.y - 5, 5, 10);
        ctx.fillRect(soldier.x + soldierRadius - 1, soldier.y - 5, 5, 10);
      }
    }
    ctx.restore();
  }

  drawMothership(ctx) {
    const remaining = this.getDropEffectRemaining('mothership');
    ctx.save();
    ctx.translate(this.player.x, this.player.y);
    ctx.rotate(this.player.facingAngle + Math.PI / 2);
    ctx.shadowBlur = 30;
    ctx.shadowColor = '#9f8cff';
    ctx.fillStyle = 'rgba(159,140,255,.22)';
    ctx.strokeStyle = '#c8bdff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, 34, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#9f8cff';
    ctx.beginPath();
    ctx.moveTo(0, -30);
    ctx.lineTo(12, 13);
    ctx.lineTo(-12, 13);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.rotate(-(this.player.facingAngle + Math.PI / 2));
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e9e4ff';
    ctx.font = '900 10px Inter, sans-serif';
    ctx.fillText(`MOTHERSHIP ${remaining.toFixed(1)}s`, 0, 40);
    ctx.restore();
  }

  drawMegaUnit(ctx) {
    const remaining = this.getDropEffectRemaining('transformer');
    const takingDamage = this.player.squad.some((unit) => (unit.hitFlash ?? 0) > 0);
    ctx.save();
    ctx.translate(this.player.x, this.player.y);
    ctx.rotate(this.player.facingAngle + Math.PI / 2);
    ctx.shadowBlur = takingDamage ? 34 : 28;
    ctx.shadowColor = takingDamage ? '#ff5f79' : '#7ef9d4';
    ctx.fillStyle = takingDamage ? 'rgba(255,95,121,.28)' : 'rgba(126,249,212,.18)';
    ctx.strokeStyle = takingDamage ? '#ff9bad' : '#7ef9d4';
    ctx.lineWidth = 3;

    const radius = 30;
    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const angle = Math.PI / 3 * i - Math.PI / 2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#eafff8';
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.rotate(-(this.player.facingAngle + Math.PI / 2));
    ctx.textAlign = 'center';
    ctx.fillStyle = '#dffff5';
    ctx.font = '900 10px Inter, sans-serif';
    ctx.fillText(`MEGA +100% ${remaining.toFixed(1)}s`, 0, 45);
    ctx.restore();
  }

  drawEnemies(ctx) {
    for (const enemy of this.entities.enemies) {
      const type = ENEMY_TYPES[enemy.type];
      const sprite = getEnemySprite(enemy.type);
      const spriteDrawn = this.animationRenderer.draw(
        ctx,
        sprite,
        'running',
        this.animationClock,
        enemy.x,
        enemy.y,
        { phase: enemy.id * 0.071 },
      );

      if (spriteDrawn) {
        if (enemy.hitFlash > 0) {
          ctx.save();
          ctx.strokeStyle = 'rgba(255,255,255,.9)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(enemy.x, enemy.y, enemy.radius + 3, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
        continue;
      }

      ctx.save();
      ctx.translate(enemy.x, enemy.y);
      ctx.fillStyle = enemy.hitFlash > 0 ? '#ffffff' : type.fill;
      ctx.strokeStyle = type.outline;
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (enemy.type === 'runner') {
        ctx.moveTo(0, -enemy.radius);
        ctx.lineTo(enemy.radius, enemy.radius);
        ctx.lineTo(-enemy.radius, enemy.radius);
        ctx.closePath();
      } else if (enemy.type === 'brute') {
        const r = enemy.radius;
        ctx.rect(-r, -r, r * 2, r * 2);
      } else {
        ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  drawProjectiles(ctx) {
    for (const projectile of this.entities.projectiles) {
      ctx.save();
      ctx.fillStyle = projectile.color ?? '#bffcf0';
      ctx.shadowBlur = projectile.kind === 'rocket' ? 18 : 12;
      ctx.shadowColor = projectile.color ?? '#7ef9d4';

      if (projectile.kind === 'rocket') {
        const length = Math.hypot(projectile.vx, projectile.vy) || 1;
        const tailX = projectile.x - (projectile.vx / length) * 15;
        const tailY = projectile.y - (projectile.vy / length) * 15;
        ctx.strokeStyle = '#ffe19d';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(projectile.x, projectile.y);
        ctx.lineTo(tailX, tailY);
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, projectile.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  drawEffects(ctx) {
    for (const effect of this.entities.effects) {
      const progress = 1 - effect.life / effect.maxLife;
      const radius = effect.radius * (0.35 + progress * 0.65);
      const alpha = Math.max(0, effect.life / effect.maxLife);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = effect.color;
      ctx.fillStyle = `${effect.color}22`;
      ctx.lineWidth = 5 * alpha + 1;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  drawGems(ctx) {
    for (const gem of this.entities.gems) {
      ctx.save();
      ctx.translate(gem.x, gem.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#9f8cff';
      ctx.fillRect(-gem.radius, -gem.radius, gem.radius * 2, gem.radius * 2);
      ctx.restore();
    }
  }

  drawParticles(ctx) {
    for (const particle of this.entities.particles) {
      ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      ctx.fillStyle = particle.color;
      ctx.fillRect(particle.x - 2, particle.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
  }

  triggerDamageFeedback(x, y) {
    this.damageFeedback = DAMAGE_FEEDBACK_DURATION;
    this.spawnDamageParticles(x, y);
  }

  spawnHitParticles(x, y) {
    for (let i = 0; i < 3; i += 1) this.createParticle(x, y, '#bffcf0', 0.18, 95);
  }

  spawnDamageParticles(x, y) {
    for (let i = 0; i < 6; i += 1) this.createParticle(x, y, '#ff5f79', 0.24, 125);
  }

  spawnExplosionEffect(x, y, radius, color = '#ffb35c') {
    this.entities.effects.push({
      x, y, radius, color,
      life: 0.32,
      maxLife: 0.32,
    });

    for (let i = 0; i < 18; i += 1) {
      this.createParticle(x, y, i % 3 === 0 ? '#fff0b0' : color, 0.34, radius * 3.4);
    }
  }

  spawnDeathParticles(x, y, radius) {
    const amount = Math.min(10, Math.ceil(radius / 3));
    for (let i = 0; i < amount; i += 1) this.createParticle(x, y, '#e87aa0', 0.35, 150);
  }

  createParticle(x, y, color, life, speed) {
    const angle = Math.random() * Math.PI * 2;
    const velocity = randomRange(speed * 0.4, speed);
    this.entities.particles.push({
      x, y, color, life, maxLife: life,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
    });
  }

  updateParticles(dt) {
    for (const particle of this.entities.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.97;
      particle.vy *= 0.97;
      particle.life -= dt;
    }
  }

  updateEffects(dt) {
    for (const effect of this.entities.effects) effect.life -= dt;
  }
}
