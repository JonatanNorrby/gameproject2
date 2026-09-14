export class EntityStore {
  constructor() { this.reset(); }

  reset() {
    this.enemies = [];
    this.projectiles = [];
    this.gems = [];
    this.particles = [];
    this.effects = [];
    this.corpses = [];
    this.nextId = 1;
  }

  createId() { return this.nextId++; }

  compact() {
    this.enemies = this.enemies.filter((entity) => !entity.dead);
    this.projectiles = this.projectiles.filter((entity) => !entity.dead);
    this.gems = this.gems.filter((entity) => !entity.dead);
    this.particles = this.particles.filter((entity) => entity.life > 0);
    this.effects = this.effects.filter((entity) => entity.life > 0);
    // Corpses intentionally persist for the full run and are never compacted.
  }
}
