import { ENEMY_TYPES } from '../data/content.js';
import { chooseWeighted, randomRange } from '../utils/math.js';

export class SpawnSystem {
  constructor(game) {
    this.game = game;
    this.cooldown = 0;
  }

  reset() { this.cooldown = 0.65; }

  update(dt) {
    this.cooldown -= dt;
    if (this.cooldown > 0) return;

    const elapsed = this.game.elapsed;
    const interval = Math.max(0.28, 0.95 - elapsed * 0.003);
    const burst = 1 + Math.floor(elapsed / 120);
    for (let i = 0; i < burst; i += 1) this.spawnEnemy();
    this.cooldown = interval;
  }

  spawnEnemy() {
    const elapsed = this.game.elapsed;
    const available = Object.entries(ENEMY_TYPES)
      .filter(([, type]) => elapsed >= type.unlockAt)
      .map(([key, type]) => ({ value: key, weight: type.weight }));
    const key = chooseWeighted(available);
    const type = ENEMY_TYPES[key];
    const difficulty = 1 + elapsed * 0.008;

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
      damage: type.damage * Math.min(1.8, 1 + elapsed * 0.005),
      xp: type.xp,
      hitFlash: 0,
      dead: false,
    });
  }
}
