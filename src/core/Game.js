import { GAME_BALANCE, ENEMY_TYPES } from '../data/content.js';
import { EntityStore } from './EntityStore.js';
import { SpawnSystem } from '../systems/SpawnSystem.js';
import { CombatSystem } from '../systems/CombatSystem.js';
import { ProgressionSystem } from '../systems/ProgressionSystem.js';
import { randomRange } from '../utils/math.js';

const DAMAGE_FEEDBACK_DURATION = 0.18;

export class Game {
  constructor(canvas, input, ui) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = input;
    this.ui = ui;
    this.entities = new EntityStore();
    this.spawnSystem = new SpawnSystem(this);
    this.combatSystem = new CombatSystem(this);
    this.progression = new ProgressionSystem(this, ui);
    this.pauseReasons = new Set(['menu']);
    this.running = false;
    this.lastTimestamp = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.resetState();
  }

  resetState() {
    this.entities.reset();
    this.elapsed = 0;
    this.kills = 0;
    this.damageFeedback = 0;
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
      soldiers: GAME_BALANCE.player.startingSoldiers,
      level: 1,
      xp: 0,
      xpToNext: GAME_BALANCE.progression.startingXpToNext,
    };
    this.progression.reset();
    this.spawnSystem.reset();
    this.combatSystem.reset();
  }

  start() {
    this.resetState();
    this.pauseReasons.clear();
    this.ui.hideStart();
    this.ui.hideGameOver();
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

    if (!this.paused) this.update(dt);
    this.render();
    this.ui.update(this);
    requestAnimationFrame((time) => this.loop(time));
  }

  update(dt) {
    this.elapsed += dt;
    this.updatePlayer(dt);
    this.spawnSystem.update(dt);
    this.combatSystem.update(dt);
    this.updateParticles(dt);
    this.damageFeedback = Math.max(0, this.damageFeedback - dt);
    this.entities.compact();

    if (this.player.hp <= 0) {
      this.player.hp = 0;
      this.pause('gameover');
      this.ui.showGameOver(this);
    }
  }

  updatePlayer(dt) {
    const axis = this.input.getAxis();
    const speed = this.player.speed * this.modifiers.moveSpeed;
    this.player.x += axis.x * speed * dt;
    this.player.y += axis.y * speed * dt;
  }

  getSoldierPositions() {
    const count = Math.max(1, this.player.soldiers);
    const columns = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / columns);
    const spacing = GAME_BALANCE.player.formationSpacing;
    const positions = [];

    for (let row = 0; row < rows; row += 1) {
      const firstIndex = row * columns;
      const rowCount = Math.min(columns, count - firstIndex);
      const y = this.player.y + (row - (rows - 1) / 2) * spacing;
      for (let column = 0; column < rowCount; column += 1) {
        positions.push({
          x: this.player.x + (column - (rowCount - 1) / 2) * spacing,
          y,
        });
      }
    }
    return positions;
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
    this.drawParticles(ctx);
    this.drawProjectiles(ctx);
    this.drawEnemies(ctx);
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

  drawPlayer(ctx) {
    const soldierRadius = GAME_BALANCE.player.soldierRadius;
    const soldiers = this.getSoldierPositions();
    const takingDamage = this.damageFeedback > 0;

    ctx.save();
    ctx.shadowBlur = takingDamage ? 22 : 14;
    ctx.shadowColor = takingDamage ? 'rgba(255,74,94,.72)' : 'rgba(126,249,212,.42)';
    for (const soldier of soldiers) {
      ctx.fillStyle = takingDamage ? '#ff6677' : '#7ef9d4';
      ctx.beginPath();
      ctx.arc(soldier.x, soldier.y, soldierRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.fillStyle = takingDamage ? '#4a1119' : '#0c302a';
      ctx.beginPath();
      ctx.arc(soldier.x, soldier.y, soldierRadius * 0.38, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = takingDamage ? 22 : 14;
    }
    ctx.restore();
  }

  drawEnemies(ctx) {
    for (const enemy of this.entities.enemies) {
      const type = ENEMY_TYPES[enemy.type];
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
    ctx.fillStyle = '#bffcf0';
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#7ef9d4';
    for (const projectile of this.entities.projectiles) {
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, projectile.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
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
}
