export class EntityStore {
  constructor() { this.reset(); }

  reset() {
    this.enemies = [];
    this.projectiles = [];
    this.gems = [];
    this.particles = [];
    this.nextId = 1;
  }

  createId() { return this.nextId++; }

  compact() {
    this.enemies = this.enemies.filter((entity) => !entity.dead);
    this.projectiles = this.projectiles.filter((entity) => !entity.dead);
    this.gems = this.gems.filter((entity) => !entity.dead);
    this.particles = this.particles.filter((entity) => entity.life > 0);
  }
}
