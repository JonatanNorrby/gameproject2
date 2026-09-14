import { Game as PreviousGame, UI as PreviousUI } from './powerupAnimations.js';
import { UNIT_CLASSES } from '../data/content.js';
import { areHexSlotsAdjacent, hexDistance } from '../utils/hexFormation.js';

const HEX_DIRECTIONS = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

function cloneHex(hex) {
  return { q: Number(hex?.q) || 0, r: Number(hex?.r) || 0 };
}

function hexKey(hex) {
  return `${hex.q},${hex.r}`;
}

function adjacentHexes(hex) {
  return HEX_DIRECTIONS.map((direction) => ({
    q: hex.q + direction.q,
    r: hex.r + direction.r,
  }));
}

function formationComponents(units) {
  const remaining = new Set(units.map((unit) => unit.id));
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const components = [];

  while (remaining.size > 0) {
    const firstId = remaining.values().next().value;
    remaining.delete(firstId);
    const queue = [byId.get(firstId)];
    const component = [];

    while (queue.length > 0) {
      const unit = queue.shift();
      component.push(unit);

      for (const candidateId of [...remaining]) {
        const candidate = byId.get(candidateId);
        if (!areHexSlotsAdjacent(unit.formationHex, candidate.formationHex)) continue;
        remaining.delete(candidateId);
        queue.push(candidate);
      }
    }

    components.push(component);
  }

  return components;
}

function chooseAnchorComponent(components, preferredUnitId = null) {
  if (preferredUnitId !== null) {
    const preferred = components.find((component) => component.some((unit) => unit.id === preferredUnitId));
    if (preferred) return preferred;
  }

  const captainComponent = components.find((component) => component.some((unit) => Boolean(unit.captainId)));
  if (captainComponent) return captainComponent;

  return [...components].sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    const aDistance = a.reduce((sum, unit) => sum + hexDistance(unit.formationHex, { q: 0, r: 0 }), 0);
    const bDistance = b.reduce((sum, unit) => sum + hexDistance(unit.formationHex, { q: 0, r: 0 }), 0);
    return aDistance - bDistance;
  })[0] ?? [];
}

function findComponentTranslation(component, anchor, allUnits) {
  const componentIds = new Set(component.map((unit) => unit.id));
  const blocked = new Set(
    allUnits
      .filter((unit) => !componentIds.has(unit.id))
      .map((unit) => hexKey(unit.formationHex)),
  );
  const candidates = new Map();

  for (const anchorUnit of anchor) {
    for (const target of adjacentHexes(anchorUnit.formationHex)) {
      for (const componentUnit of component) {
        const delta = {
          q: target.q - componentUnit.formationHex.q,
          r: target.r - componentUnit.formationHex.r,
        };
        const key = hexKey(delta);
        if (candidates.has(key)) continue;

        const translated = component.map((unit) => ({
          q: unit.formationHex.q + delta.q,
          r: unit.formationHex.r + delta.r,
        }));
        if (translated.some((hex) => blocked.has(hexKey(hex)))) continue;

        const shiftDistance = hexDistance(delta, { q: 0, r: 0 });
        const centerDistance = translated.reduce(
          (sum, hex) => sum + hexDistance(hex, { q: 0, r: 0 }),
          0,
        );
        candidates.set(key, { delta, shiftDistance, centerDistance });
      }
    }
  }

  return [...candidates.values()].sort((a, b) => (
    a.shiftDistance - b.shiftDistance
    || a.centerDistance - b.centerDistance
    || a.delta.r - b.delta.r
    || a.delta.q - b.delta.q
  ))[0] ?? null;
}

function repairFormation(units, preferredAnchorUnitId = null) {
  const shiftedUnitIds = new Set();
  let guard = Math.max(1, units.length * 2);

  while (guard > 0) {
    guard -= 1;
    const components = formationComponents(units);
    if (components.length <= 1) {
      return { ok: true, shiftedUnitIds };
    }

    const anchor = chooseAnchorComponent(components, preferredAnchorUnitId);
    const detached = components.filter((component) => component !== anchor);
    const options = detached
      .map((component) => ({ component, translation: findComponentTranslation(component, anchor, units) }))
      .filter((option) => Boolean(option.translation))
      .sort((a, b) => (
        a.translation.shiftDistance - b.translation.shiftDistance
        || b.component.length - a.component.length
        || a.translation.centerDistance - b.translation.centerDistance
      ));

    const best = options[0];
    if (!best) return { ok: false, shiftedUnitIds };

    for (const unit of best.component) {
      unit.formationHex = {
        q: unit.formationHex.q + best.translation.delta.q,
        r: unit.formationHex.r + best.translation.delta.r,
      };
      shiftedUnitIds.add(unit.id);
    }
  }

  return { ok: formationComponents(units).length <= 1, shiftedUnitIds };
}

function cloneFormation(units) {
  return units.map((unit) => ({
    ...unit,
    formationHex: cloneHex(unit.formationHex),
  }));
}

function applyMove(units, unitId, targetHex) {
  const moving = units.find((unit) => unit.id === unitId);
  if (!moving || !targetHex) return { moving: null, occupant: null };

  const target = cloneHex(targetHex);
  const occupant = units.find((unit) => (
    unit.id !== unitId && hexKey(unit.formationHex) === hexKey(target)
  ));
  const oldHex = cloneHex(moving.formationHex);
  moving.formationHex = target;
  if (occupant) occupant.formationHex = oldHex;
  return { moving, occupant };
}

export class Game extends PreviousGame {
  ensureFormationHexes() {
    super.ensureFormationHexes();
    repairFormation(this.player.squad);
  }

  getFormationPreview(unitId, targetHex) {
    super.ensureFormationHexes();
    const previewUnits = cloneFormation(this.player.squad);
    const { moving, occupant } = applyMove(previewUnits, unitId, targetHex);
    if (!moving) return null;

    const repair = repairFormation(previewUnits, unitId);
    return {
      valid: repair.ok,
      occupantId: occupant?.id ?? null,
      shiftedUnitIds: [...repair.shiftedUnitIds],
    };
  }

  canMoveSquadUnitFormation(unitId, targetHex) {
    return Boolean(this.getFormationPreview(unitId, targetHex)?.valid);
  }

  moveSquadUnitFormation(unitId, targetHex) {
    this.ensureFormationHexes();
    const snapshot = new Map(this.player.squad.map((unit) => [unit.id, cloneHex(unit.formationHex)]));
    const { moving, occupant } = applyMove(this.player.squad, unitId, targetHex);
    if (!moving) return { ok: false, message: 'That unit is no longer in the squad.' };

    const repair = repairFormation(this.player.squad, unitId);
    if (!repair.ok) {
      for (const unit of this.player.squad) {
        const original = snapshot.get(unit.id);
        if (original) unit.formationHex = original;
      }
      return { ok: false, message: 'No collision-free way to reconnect that formation.' };
    }

    const shiftedOthers = [...repair.shiftedUnitIds].filter((id) => id !== unitId).length;
    const action = occupant ? 'Units swapped.' : 'Unit moved.';
    return {
      ok: true,
      message: shiftedOthers > 0
        ? `${action} ${shiftedOthers} detached unit${shiftedOthers === 1 ? '' : 's'} shifted to reconnect the squad.`
        : action,
    };
  }

  removeSquadUnitFromBuilder(unitId) {
    this.ensureFormationHexes();
    const unit = this.player.squad.find((candidate) => candidate.id === unitId);
    if (!unit) return { ok: false, message: 'That unit is no longer in the squad.' };
    if (unit.captainId) return { ok: false, message: 'The selected Captain cannot be removed from the squad.' };

    const snapshot = this.player.squad.map((candidate) => ({
      unit: candidate,
      formationHex: cloneHex(candidate.formationHex),
    }));
    const index = this.player.squad.findIndex((candidate) => candidate.id === unitId);
    this.player.squad.splice(index, 1);

    const captainId = this.player.squad.find((candidate) => candidate.captainId)?.id ?? null;
    const repair = repairFormation(this.player.squad, captainId);
    if (!repair.ok) {
      this.player.squad.splice(index, 0, unit);
      for (const entry of snapshot) entry.unit.formationHex = entry.formationHex;
      return { ok: false, message: 'Could not remove that unit without breaking the formation.' };
    }

    const shifted = repair.shiftedUnitIds.size;
    const label = UNIT_CLASSES[unit.type]?.label ?? 'Unit';
    return {
      ok: true,
      message: shifted > 0
        ? `${label} removed. The remaining squad shifted back together.`
        : `${label} removed from the squad.`,
    };
  }
}

export class UI extends PreviousUI {
  constructor() {
    super();
    const help = document.querySelector('.squad-builder__help');
    if (help) {
      help.textContent = 'Freeform formation: drag or tap units onto hexes. If a move or removal splits the squad, detached groups automatically slide back into contact. Captains can move but cannot be removed.';
    }
  }

  getSquadBuilderHexRadius(count, mobile) {
    const base = super.getSquadBuilderHexRadius(count, mobile);
    const width = window.innerWidth;
    const height = window.innerHeight;
    let cap = base;

    if (width <= 380) cap = Math.min(cap, 34);
    else if (width <= 520) cap = Math.min(cap, 40);
    if (height <= 460) cap = Math.min(cap, 28);
    else if (height <= 600) cap = Math.min(cap, 34);
    else if (height <= 720) cap = Math.min(cap, 42);

    return Math.max(26, cap);
  }
}
