import { ENEMY_TYPES } from '../data/content.js';
import { chooseWeighted, randomRange } from '../utils/math.js';

const SPAWN_INTERVAL_MULTIPLIER = 1.5;
const SPAWN_XP_MULTIPLIER = 1.5;

export class SpawnSystem {
  constructor(game) {
    this.game = game;
    this.cooldown = 0;
  }

  reset() { this.cooldown = 0.65 * SPAWN_INTERVAL_MULTIPLIER; }

  update(dt) {
    this.cooldown -= dt;
    if (this.cooldown > 0) return;

    const elapsed = this.game.elapsed;
    // #127: keep the existing escalation/burst curve, but space every burst
    // farther apart. XP per spawned enemy is increased by the same factor so
    // progression remains close to the established level-50-at-~30-min pace.
    const baseInterval = Math.max(0.28, 0.95 - elapsed * 0.003);
    const interval = baseInterval * SPAWN_INTERVAL_MULTIPLIER;
    const burst = 1 + Math.floor(elapsed / 120);
    for (let i = 0; i < burst; i += 1) this.spawnEnemy();
    this.cooldown = interval;
  }

  spawnEnemy() {
    const elapsed = this.game.elapsed;
    const activeCounts = new Map();
    for (const enemy of this.game.entities.enemies) {
      if (enemy.dead) continue;
      activeCounts.set(enemy.type, (activeCounts.get(enemy.type) ?? 0) + 1);
    }

    const available = Object.entries(ENEMY_TYPES)
      .filter(([key, type]) => (
        elapsed >= type.unlockAt
        && (!Number.isFinite(type.maxActive) || (activeCounts.get(key) ?? 0) < type.maxActive)
      ))
      .map(([key, type]) => ({ value: key, weight: type.weight }));
    const key = chooseWeighted(available);
    const type = ENEMY_TYPES[key];
    const difficulty = 1 + elapsed * 0.008;
    const damageScaling = Math.min(1.8, 1 + elapsed * 0.005);

    const angle = Math.random() * Math.PI * 2;
    const distance = randomRange(500, 720);
    const { x, y } = this.game.player;
    this.game.entities.enemies.push({
      id: this.game.entities.createId(),
      type: key,
      x: x + Math.cos(angle) * distance,
      y: y + Math.sin(angle) * distance,
      radius: type.radius,
      speed: type.speed * Math.min(1.42, 1 + elapsed * 0.0018),
      maxHp: type.hp * difficulty,
      hp: type.hp * difficulty,
      damage: type.damage * damageScaling,
      rangedDamage: type.ranged ? type.ranged.damage * damageScaling : 0,
      rangedCooldown: type.ranged ? randomRange(type.ranged.cooldown * 0.5, type.ranged.cooldown) : 0,
      xp: type.xp * SPAWN_XP_MULTIPLIER,
      hitFlash: 0,
      dead: false,
    });
  }
}
