from pathlib import Path
import re

def read(path):
    return Path(path).read_text(encoding='utf-8')

def write(path, text):
    Path(path).write_text(text, encoding='utf-8')

def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'Expected {label} not found')
    return text.replace(old, new, 1)

path = 'src/core/Game.js'
source = read(path)
source = replace_once(source, 'const DAMAGE_FEEDBACK_DURATION = 0.18;\n', 'const DAMAGE_FEEDBACK_DURATION = 0.18;\nexport const SQUAD_HP_PER_ADDITIONAL_UNIT = 0.1;\n', 'damage feedback constant')
source = replace_once(source, "    if (this.player.hp <= 0 && this.deadCaptain && !this.pauseReasons.has('gameover')) {\n", "    if (this.player.hp <= 0 && !this.pauseReasons.has('gameover')) {\n", 'game-over health check')
pattern = re.compile(r'  addSquadUnits\(type, amount = 1\) \{.*?\n  isDropEffectActive\(type\) \{', re.S)
replacement = r'''  addSquadUnits(type, amount = 1) {
    const unitClass = UNIT_CLASSES[type];
    if (!unitClass) return;
    const maxHp = unitClass.maxHp ?? GAME_BALANCE.player.maxHp;

    for (let i = 0; i < amount; i += 1) {
      const unit = {
        id: this.nextSquadUnitId,
        type,
        maxHp,
        hitFlash: 0,
        dead: false,
        animationState: null,
        animationStartedAt: 0,
        animationUntil: 0,
      };

      // v122: squad members no longer own mutable health. Older combat layers
      // can keep targeting a unit position and writing unit.hp; damage writes
      // are redirected into the one shared Squad Health pool instead.
      Object.defineProperty(unit, 'hp', {
        enumerable: true,
        configurable: true,
        get() {
          return Math.max(0, Number(unit.maxHp) || 0);
        },
        set: (nextHp) => {
          const fullHp = Math.max(0, Number(unit.maxHp) || 0);
          const requestedHp = Math.max(0, Math.min(fullHp, Number(nextHp) || 0));
          const damage = Math.max(0, fullHp - requestedHp);
          if (damage > 0) this.applySquadDamage(damage);
        },
      });

      this.player.squad.push(unit);
      this.nextSquadUnitId += 1;
    }

    // Preserve missing HP while adding the new maximum capacity from recruits.
    this.syncCaptainHealth();
  }

  getCaptainUnit() {
    return this.player.squad.find((unit) => Boolean(unit.captainId)) ?? null;
  }

  getSquadHealthBaseMax() {
    const squad = this.player?.squad ?? [];
    const primaryCaptain = squad.find((unit) => unit.primaryCaptain && !unit.dead)
      ?? squad.find((unit) => unit.captainId && !unit.dead)
      ?? squad[0];
    return Math.max(
      1,
      Number(primaryCaptain?.maxHp)
        || Number(this.player?.squadBaseMaxHp)
        || GAME_BALANCE.player.maxHp,
    );
  }

  syncCaptainHealth() {
    if (!this.player) return;

    const baseMaxHp = this.getSquadHealthBaseMax();
    const unitCount = Math.max(1, this.player.squad?.length ?? 0);
    const multiplier = 1 + SQUAD_HP_PER_ADDITIONAL_UNIT * Math.max(0, unitCount - 1);
    const nextMaxHp = Math.round(baseMaxHp * multiplier * 100) / 100;
    const previousMaxHp = Math.max(1, Number(this.player.maxHp) || baseMaxHp);
    const previousHp = Math.max(0, Math.min(previousMaxHp, Number(this.player.hp) || 0));
    const missingHp = Math.max(0, previousMaxHp - previousHp);

    this.player.squadBaseMaxHp = baseMaxHp;
    this.player.maxHp = nextMaxHp;
    this.player.hp = Math.max(0, Math.min(nextMaxHp, nextMaxHp - missingHp));
  }

  applySquadDamage(amount) {
    if (this.debug?.infiniteHp) return 0;
    const damage = Math.max(0, Number(amount) || 0);
    if (damage <= 0) return 0;

    const before = Math.max(0, Number(this.player?.hp) || 0);
    this.player.hp = Math.max(0, before - damage);
    return before - this.player.hp;
  }

  healSquadHealth(amount) {
    const healing = Math.max(0, Number(amount) || 0);
    if (healing <= 0) return 0;

    const before = Math.max(0, Number(this.player?.hp) || 0);
    const maxHp = Math.max(1, Number(this.player?.maxHp) || 1);
    this.player.hp = Math.min(maxHp, before + healing);
    return this.player.hp - before;
  }

  healSquadHealthFraction(fraction) {
    const normalized = Math.max(0, Number(fraction) || 0);
    return this.healSquadHealth(this.player.maxHp * normalized);
  }

  healAllUnits() {
    this.player.hp = Math.max(1, Number(this.player.maxHp) || 1);
    for (const unit of this.player.squad) {
      unit.dead = false;
      unit.hitFlash = 0;
    }
  }

  isDropEffectActive(type) {'''
source, count = pattern.subn(replacement, source, count=1)
if count != 1:
    raise SystemExit('Expected addSquadUnits through health helpers block not found')
old_merged = '''  damageMergedSquad(amount, x = this.player.x, y = this.player.y) {
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
'''
new_merged = '''  damageMergedSquad(amount, x = this.player.x, y = this.player.y) {
    const livingUnits = [...this.player.squad].filter((unit) => !unit.dead);
    if (livingUnits.length === 0 || amount <= 0) return;

    const effectiveDamage = amount / this.getTransformerStatMultiplier();
    for (const unit of livingUnits) unit.hitFlash = DAMAGE_FEEDBACK_DURATION;
    this.applySquadDamage(effectiveDamage);
  }
'''
source = replace_once(source, old_merged, new_merged, 'merged squad damage')
kill_pattern = re.compile(r'  killSquadUnit\(soldier\) \{.*?\n  reorderSquad\(fromIndex, toIndex\) \{', re.S)
kill_replacement = r'''  killSquadUnit(soldier) {
    // v122: combat damage can no longer remove an individual squad member.
    // Squad Health reaching zero now ends the run instead.
    const unit = soldier?.unit;
    if (!unit) return false;
    unit.dead = false;
    unit.hitFlash = Math.max(unit.hitFlash ?? 0, DAMAGE_FEEDBACK_DURATION);
    return false;
  }

  reorderSquad(fromIndex, toIndex) {'''
source, count = kill_pattern.subn(kill_replacement, source, count=1)
if count != 1:
    raise SystemExit('Expected killSquadUnit block not found')
write(path, source)

path = 'src/core/UI.js'
source = read(path)
old = '''    const player = game.player;
    const selectedCaptainId = game.selectedCaptainId ?? this.selectedCaptainId;
    const captain = CAPTAINS[selectedCaptainId];
    const liveCaptain = game.getCaptainUnit?.() ?? null;
    const healthUnit = liveCaptain ?? game.deadCaptain?.unit ?? null;
    const fallbackMaxHp = UNIT_CLASSES[captain?.unitType]?.maxHp ?? player.maxHp ?? 100;
    const maxHp = healthUnit?.maxHp ?? fallbackMaxHp;
    const hp = healthUnit ? Math.max(0, healthUnit.hp) : maxHp;
    const infiniteHp = Boolean(game.debug?.infiniteHp && liveCaptain);
    const hpPercent = infiniteHp ? 100 : Math.max(0, Math.min(1, hp / Math.max(1, maxHp))) * 100;
'''
new = '''    const player = game.player;
    const selectedCaptainId = game.selectedCaptainId ?? this.selectedCaptainId;
    const captain = CAPTAINS[selectedCaptainId];
    const maxHp = Math.max(1, Number(player.maxHp) || 1);
    const hp = Math.max(0, Math.min(maxHp, Number(player.hp) || 0));
    const infiniteHp = Boolean(game.debug?.infiniteHp);
    const hpPercent = infiniteHp ? 100 : Math.max(0, Math.min(1, hp / maxHp)) * 100;
'''
source = replace_once(source, old, new, 'HUD health source')
source = replace_once(source, "    if (this.hpLabel) this.hpLabel.textContent = `${captain?.name ?? 'Captain'} Health`;\n", "    if (this.hpLabel) this.hpLabel.textContent = 'Squad Health';\n", 'HUD health label')
write(path, source)

path = 'src/systems/ProgressionSystem.js'
source = read(path)
old = '''  healSquadOnLevelUp() {
    for (const unit of this.game.player?.squad ?? []) {
      if (unit.dead) continue;
      const maxHp = Math.max(0, Number(unit.maxHp) || 0);
      const currentHp = Math.max(0, Number(unit.hp) || 0);
      unit.hp = Math.min(maxHp, currentHp + maxHp * LEVEL_UP_HEAL_FRACTION);
    }
    this.game.syncCaptainHealth?.();
  }
'''
new = '''  healSquadOnLevelUp() {
    this.game.healSquadHealthFraction?.(LEVEL_UP_HEAL_FRACTION);
  }
'''
source = replace_once(source, old, new, 'level-up heal')
write(path, source)

path = 'src/features/captainThorne.js'
source = read(path)
pattern = re.compile(r'    applyThorneLifesteal\(unit, totalDamageDealt\) \{.*?\n    \}\n\n    getUnitArmor', re.S)
replacement = '''    applyThorneLifesteal(unit, totalDamageDealt) {
      const lifesteal = this.getThorneLifestealRate();
      const damage = Math.max(0, Number(totalDamageDealt) || 0);
      if (lifesteal <= 0 || damage <= 0 || !this.isThorneLifestealEligible(unit)) return 0;
      return this.game.healSquadHealth?.(damage * lifesteal) ?? 0;
    }

    getUnitArmor'''
source, count = pattern.subn(replacement, source, count=1)
if count != 1:
    raise SystemExit('Expected Thorne lifesteal function not found')
write(path, source)

for path in ['src/features/wardenBoss.js', 'src/features/broodmotherBoss.js', 'src/features/cipherBoss.js']:
    source = read(path)
    old = '''        unit.hp = Math.min(unit.maxHp, unit.hp + result.bodyDamage * weapon.lifesteal);
        this.game.syncCaptainHealth();
'''
    new = '''        this.game.healSquadHealth?.(result.bodyDamage * weapon.lifesteal);
'''
    source = replace_once(source, old, new, f'boss lifesteal in {path}')
    write(path, source)

path = 'src/features/squadBuilderVisuals.js'
source = read(path)
health_block = '''const BUILDER_HEALTH_COLORS = Object.freeze({
  healthy: '#7ef9d4',
  wounded: '#ffd36a',
  critical: '#ff7188',
});

'''
source = replace_once(source, health_block, '', 'builder health colors')
health_func = '''function getBuilderHealthState(unit) {
  const maxHp = Math.max(1, Number(unit?.maxHp) || 1);
  const ratio = Math.max(0, Math.min(1, (Number(unit?.hp) || 0) / maxHp));
  if (ratio > 0.6) return 'healthy';
  if (ratio > 0.3) return 'wounded';
  return 'critical';
}

'''
source = replace_once(source, health_func, '', 'builder health state')
old = '''      const healthState = getBuilderHealthState(unit);

      card.style.setProperty('--unit-color', color);
      card.style.setProperty('--health-border-color', BUILDER_HEALTH_COLORS[healthState]);
      card.dataset.healthState = healthState;
'''
new = '''      card.style.setProperty('--unit-color', color);
      card.style.setProperty('--health-border-color', color);
      card.dataset.healthState = 'shared';
'''
source = replace_once(source, old, new, 'builder health presentation')
write(path, source)

path = 'src/features/squadFormation.js'
source = read(path)
old = '''    const index = this.player.squad.findIndex((candidate) => candidate.id === unitId);
    if (index >= 0) this.player.squad.splice(index, 1);
    return { ok: true, message: `${UNIT_CLASSES[unit.type]?.label ?? 'Unit'} removed from the squad.` };
'''
new = '''    const index = this.player.squad.findIndex((candidate) => candidate.id === unitId);
    if (index >= 0) this.player.squad.splice(index, 1);
    this.syncCaptainHealth?.();
    return { ok: true, message: `${UNIT_CLASSES[unit.type]?.label ?? 'Unit'} removed from the squad.` };
'''
source = replace_once(source, old, new, 'builder removal health sync')
write(path, source)

path = 'src/main.js'
source = read(path)
source = replace_once(source, 'const GAME_VERSION = 121;', 'const GAME_VERSION = 122;', 'GAME_VERSION')
source = replace_once(source, '  // Additional Captains deliberately keep normal unit health/armor. Their\n  // captainId activates passives while slot flags keep their death non-fatal.\n', '  // Additional Captains contribute to the shared Squad Health multiplier.\n  // Their captainId activates passives while slot flags identify their slot.\n', 'additional Captain health comment')
write(path, source)

path = 'index.html'
source = read(path)
for old, new, label in [
    ('BUILD v121', 'BUILD v122', 'boot version'),
    ('id="version-text">v121<', 'id="version-text">v122<', 'HUD version'),
    ('SYSTEM ONLINE • v121', 'SYSTEM ONLINE • v122', 'menu version'),
    ('<span id="hp-label">Captain Health</span>', '<span id="hp-label">Squad Health</span>', 'static HP label'),
    ('<span>Your primary Captain is the squad leader. If the primary Captain dies, the run ends.</span>', '<span>Your squad shares one health pool. If Squad Health reaches zero, the run ends.</span>', 'main-menu health explanation'),
]:
    source = replace_once(source, old, new, label)
write(path, source)
