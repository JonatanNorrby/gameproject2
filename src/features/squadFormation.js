import { Game as BaseGame } from '../core/Game.js';
import { UI as BaseUI } from '../core/UI.js';
import { CAPTAINS, GAME_BALANCE, UNIT_CLASSES } from '../data/content.js';
import { getEffectiveUnitStats } from '../data/unitModifiers.js';
import { areHexSlotsAdjacent, hexDistance, hexToPixel, radiusForNeighborSpacing } from '../utils/hexFormation.js';

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

function centeredHexLayout(slots, radius) {
  if (!slots.length) return [];
  const raw = slots.map((slot) => hexToPixel(slot, radius));
  const xs = raw.map((position) => position.x);
  const ys = raw.map((position) => position.y);
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
  return slots.map((slot, index) => ({
    ...slot,
    x: raw[index].x - centerX,
    y: raw[index].y - centerY,
  }));
}

function isFormationValid(units) {
  if (units.length <= 1) return true;
  return units.every((unit, index) => units.some((other, otherIndex) => (
    index !== otherIndex
    && areHexSlotsAdjacent(unit.formationHex, other.formationHex)
  )));
}

export class Game extends BaseGame {
  addSquadUnits(type, amount = 1) {
    const unitClass = UNIT_CLASSES[type];
    if (!unitClass) return;

    for (let i = 0; i < amount; i += 1) {
      super.addSquadUnits(type, 1);
      const unit = this.player.squad.at(-1);
      if (unit) unit.formationHex = this.findBestFormationSlot(unit.id);
    }
  }

  ensureFormationHexes() {
    const occupied = new Set();
    for (const unit of this.player.squad) {
      if (unit.formationHex && !occupied.has(hexKey(unit.formationHex))) {
        unit.formationHex = cloneHex(unit.formationHex);
        occupied.add(hexKey(unit.formationHex));
        continue;
      }

      unit.formationHex = this.findBestFormationSlot(unit.id, occupied);
      occupied.add(hexKey(unit.formationHex));
    }
  }

  findBestFormationSlot(excludeUnitId = null, occupiedOverride = null) {
    const units = this.player?.squad ?? [];
    const occupied = occupiedOverride ?? new Set(
      units
        .filter((unit) => unit.id !== excludeUnitId && unit.formationHex)
        .map((unit) => hexKey(unit.formationHex)),
    );

    if (occupied.size === 0) return { q: 0, r: 0 };

    const candidates = new Map();
    for (const unit of units) {
      if (unit.id === excludeUnitId || !unit.formationHex) continue;
      for (const candidate of adjacentHexes(unit.formationHex)) {
        const key = hexKey(candidate);
        if (!occupied.has(key)) candidates.set(key, candidate);
      }
    }

    if (candidates.size === 0) {
      let radius = 1;
      while (radius < 100) {
        for (let q = -radius; q <= radius; q += 1) {
          for (let r = -radius; r <= radius; r += 1) {
            const candidate = { q, r };
            if (hexDistance(candidate, { q: 0, r: 0 }) !== radius) continue;
            if (!occupied.has(hexKey(candidate))) return candidate;
          }
        }
        radius += 1;
      }
    }

    return [...candidates.values()]
      .map((candidate) => ({
        candidate,
        neighbors: units.filter((unit) => (
          unit.id !== excludeUnitId
          && unit.formationHex
          && areHexSlotsAdjacent(candidate, unit.formationHex)
        )).length,
        distance: hexDistance(candidate, { q: 0, r: 0 }),
      }))
      .sort((a, b) => b.neighbors - a.neighbors || a.distance - b.distance || a.candidate.r - b.candidate.r || a.candidate.q - b.candidate.q)[0]?.candidate
      ?? { q: 0, r: 0 };
  }

  getFormationTargetHexes() {
    this.ensureFormationHexes();
    const occupied = new Set(this.player.squad.map((unit) => hexKey(unit.formationHex)));
    const targets = new Map();

    for (const unit of this.player.squad) {
      for (const candidate of adjacentHexes(unit.formationHex)) {
        const key = hexKey(candidate);
        if (!occupied.has(key)) targets.set(key, candidate);
      }
    }

    if (targets.size === 0 && this.player.squad.length === 1) {
      for (const candidate of adjacentHexes(this.player.squad[0].formationHex)) {
        targets.set(hexKey(candidate), candidate);
      }
    }

    return [...targets.values()];
  }

  getFormationPreview(unitId, targetHex) {
    this.ensureFormationHexes();
    const moving = this.player.squad.find((unit) => unit.id === unitId);
    if (!moving || !targetHex) return null;

    const target = cloneHex(targetHex);
    const occupant = this.player.squad.find((unit) => (
      unit.id !== unitId && hexKey(unit.formationHex) === hexKey(target)
    ));
    const originalMoving = cloneHex(moving.formationHex);
    const originalOccupant = occupant ? cloneHex(occupant.formationHex) : null;

    moving.formationHex = target;
    if (occupant) occupant.formationHex = originalMoving;
    const valid = isFormationValid(this.player.squad);
    moving.formationHex = originalMoving;
    if (occupant) occupant.formationHex = originalOccupant;

    return { valid, occupantId: occupant?.id ?? null };
  }

  canMoveSquadUnitFormation(unitId, targetHex) {
    return Boolean(this.getFormationPreview(unitId, targetHex)?.valid);
  }

  moveSquadUnitFormation(unitId, targetHex) {
    const moving = this.player.squad.find((unit) => unit.id === unitId);
    if (!moving) return { ok: false, message: 'That unit is no longer in the squad.' };

    const preview = this.getFormationPreview(unitId, targetHex);
    if (!preview?.valid) {
      return { ok: false, message: 'Invalid formation: every unit must remain adjacent to at least one squadmate.' };
    }

    const target = cloneHex(targetHex);
    const occupant = this.player.squad.find((unit) => unit.id === preview.occupantId);
    const oldHex = cloneHex(moving.formationHex);
    moving.formationHex = target;
    if (occupant) occupant.formationHex = oldHex;
    return { ok: true, message: occupant ? 'Units swapped.' : 'Unit moved.' };
  }

  removeSquadUnitFromBuilder(unitId) {
    const unit = this.player.squad.find((candidate) => candidate.id === unitId);
    if (!unit) return { ok: false, message: 'That unit is no longer in the squad.' };
    if (unit.captainId) return { ok: false, message: 'The selected Captain cannot be removed from the squad.' };

    const remaining = this.player.squad.filter((candidate) => candidate.id !== unitId);
    if (!isFormationValid(remaining)) {
      return { ok: false, message: 'Cannot remove this unit because it would leave another unit isolated.' };
    }

    const index = this.player.squad.findIndex((candidate) => candidate.id === unitId);
    if (index >= 0) this.player.squad.splice(index, 1);
    this.syncCaptainHealth?.();
    return { ok: true, message: `${UNIT_CLASSES[unit.type]?.label ?? 'Unit'} removed from the squad.` };
  }

  getSoldierPositions() {
    const squad = this.player.squad;
    if (squad.length === 0) return [];
    this.ensureFormationHexes();

    const hexRadius = radiusForNeighborSpacing(GAME_BALANCE.player.formationSpacing);
    const slots = squad.map((unit) => cloneHex(unit.formationHex));
    const layout = centeredHexLayout(slots, hexRadius);

    return layout.map((slot, index) => ({
      x: this.player.x + slot.x,
      y: this.player.y + slot.y,
      index,
      hex: { q: slot.q, r: slot.r, ring: hexDistance(slot, { q: 0, r: 0 }) },
      unit: squad[index],
    }));
  }
}

export class UI extends BaseUI {
  constructor() {
    super();
    this.squadBuilderMessage = '';
    const help = document.querySelector('.squad-builder__help');
    if (help) {
      help.textContent = 'Freeform formation: drag a unit to an empty hex or another unit to move/swap. On touch, tap a unit and then a target. Every unit must have at least one adjacent squadmate. Captains can move but cannot be removed.';
    }
  }

  bindSquadBuilder({ getSquad, onOpen, onClose }) {
    this.squadBuilderHandlers = {
      getSquad,
      onOpen,
      onClose,
      getTargets: () => this.game?.getFormationTargetHexes?.() ?? [],
      canMove: (unitId, targetHex) => this.game?.canMoveSquadUnitFormation?.(unitId, targetHex) ?? false,
      move: (unitId, targetHex) => this.game?.moveSquadUnitFormation?.(unitId, targetHex) ?? { ok: false },
      remove: (unitId) => this.game?.removeSquadUnitFromBuilder?.(unitId) ?? { ok: false },
    };

    this.squadBuilderToggle.addEventListener('click', () => {
      onOpen();
      this.showSquadBuilder();
    });

    const close = () => {
      if (!this.squadBuilderScreen.classList.contains('overlay--visible')) return;
      this.hideSquadBuilder();
      onClose();
    };

    this.squadBuilderClose.addEventListener('click', close);
    this.squadBuilderDone.addEventListener('click', close);

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') close();
    });

    window.addEventListener('resize', () => {
      this.renderCaptainOptions();
      if (!this.squadBuilderScreen.classList.contains('overlay--visible')) return;
      this.squadBuilderHasCentered = false;
      this.renderSquadBuilder();
    });
  }

  showSquadBuilder() {
    this.squadBuilderMessage = '';
    super.showSquadBuilder();
  }

  getSelectedBuilderUnit() {
    const squad = this.squadBuilderHandlers?.getSquad?.() ?? [];
    return squad.find((unit) => unit.id === this.squadBuilderSelection) ?? null;
  }

  applyFormationAction(result, { clearSelection = false } = {}) {
    this.squadBuilderMessage = result?.message ?? (result?.ok ? 'Formation updated.' : 'That formation is not allowed.');
    if (result?.ok && clearSelection) this.squadBuilderSelection = null;
    this.renderSquadBuilder();
  }

  renderSquadBuilder() {
    if (!this.squadBuilderHandlers) return;
    const squad = this.squadBuilderHandlers.getSquad();
    const previousScrollLeft = this.squadBuilderGrid.scrollLeft;
    const previousScrollTop = this.squadBuilderGrid.scrollTop;
    this.squadBuilderGrid.replaceChildren();

    const counts = squad.reduce((result, unit) => {
      result[unit.type] = (result[unit.type] || 0) + 1;
      return result;
    }, {});
    this.renderSquadStats(counts);

    if (squad.length === 0) return;

    const selectedUnit = this.getSelectedBuilderUnit();
    if (this.squadBuilderSelection !== null && !selectedUnit) this.squadBuilderSelection = null;

    const toolbar = document.createElement('div');
    toolbar.className = 'squad-formation-toolbar';
    const status = document.createElement('div');
    status.className = 'squad-formation-toolbar__status';
    status.textContent = this.squadBuilderMessage || (selectedUnit
      ? `${selectedUnit.captainId ? CAPTAINS[selectedUnit.captainId]?.name : UNIT_CLASSES[selectedUnit.type]?.label} selected — choose a highlighted target.`
      : 'Select a unit to reposition or remove it.');
    toolbar.append(status);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'squad-formation-remove';
    removeButton.textContent = selectedUnit?.captainId ? 'CAPTAIN LOCKED' : 'REMOVE SELECTED';
    removeButton.disabled = !selectedUnit || Boolean(selectedUnit?.captainId);
    removeButton.addEventListener('click', () => {
      if (!selectedUnit) return;
      const result = this.squadBuilderHandlers.remove(selectedUnit.id);
      this.applyFormationAction(result, { clearSelection: result?.ok });
    });
    toolbar.append(removeButton);
    this.squadBuilderGrid.append(toolbar);

    const mobile = window.innerWidth <= 760;
    const hexRadius = this.getSquadBuilderHexRadius(squad.length, mobile);
    const cardWidth = Math.sqrt(3) * hexRadius;
    const cardHeight = hexRadius * 2;
    const targetHexes = this.squadBuilderHandlers.getTargets();
    const occupiedHexes = squad.map((unit) => cloneHex(unit.formationHex));
    const allHexes = [...occupiedHexes, ...targetHexes];
    const allLayout = centeredHexLayout(allHexes, hexRadius);
    const positionByKey = new Map(allLayout.map((slot) => [hexKey(slot), slot]));
    const xs = allLayout.map((slot) => Math.abs(slot.x));
    const ys = allLayout.map((slot) => Math.abs(slot.y));
    const maxAbsX = Math.max(0, ...xs);
    const maxAbsY = Math.max(0, ...ys);
    const dense = hexRadius <= 44;
    const veryDense = hexRadius <= 36;

    const board = document.createElement('div');
    board.className = 'squad-builder__board squad-builder__board--freeform';
    board.style.width = `${Math.max(mobile ? 340 : 480, maxAbsX * 2 + cardWidth + 90)}px`;
    board.style.height = `${Math.max(300, maxAbsY * 2 + cardHeight + 90)}px`;

    const moveToHex = (unitId, targetHex) => {
      const result = this.squadBuilderHandlers.move(unitId, targetHex);
      this.applyFormationAction(result, { clearSelection: result?.ok });
    };

    for (const targetHex of targetHexes) {
      const slot = positionByKey.get(hexKey(targetHex));
      const target = document.createElement('button');
      target.type = 'button';
      target.className = 'squad-formation-target';
      target.dataset.hexQ = String(targetHex.q);
      target.dataset.hexR = String(targetHex.r);
      target.style.width = `${cardWidth * 0.72}px`;
      target.style.height = `${cardHeight * 0.72}px`;
      target.style.left = `calc(50% + ${slot.x}px)`;
      target.style.top = `calc(50% + ${slot.y}px)`;

      const valid = selectedUnit ? this.squadBuilderHandlers.canMove(selectedUnit.id, targetHex) : false;
      if (selectedUnit) target.classList.add(valid ? 'squad-formation-target--valid' : 'squad-formation-target--invalid');
      target.setAttribute('aria-label', valid ? 'Move selected unit here' : 'Empty formation hex');

      target.addEventListener('dragover', (event) => {
        event.preventDefault();
        target.classList.add('squad-formation-target--dragover');
      });
      target.addEventListener('dragleave', () => target.classList.remove('squad-formation-target--dragover'));
      target.addEventListener('drop', (event) => {
        event.preventDefault();
        target.classList.remove('squad-formation-target--dragover');
        const unitId = Number(event.dataTransfer.getData('text/plain'));
        if (Number.isFinite(unitId)) moveToHex(unitId, targetHex);
      });
      target.addEventListener('click', () => {
        if (!selectedUnit) {
          this.squadBuilderMessage = 'Select a unit first, then choose an empty hex.';
          this.renderSquadBuilder();
          return;
        }
        moveToHex(selectedUnit.id, targetHex);
      });
      board.append(target);
    }

    squad.forEach((unit, index) => {
      const unitClass = UNIT_CLASSES[unit.type] ?? UNIT_CLASSES.rifleman;
      const unitCaptain = unit.captainId ? CAPTAINS[unit.captainId] : null;
      const effectiveStats = getEffectiveUnitStats(unit.type, this.game?.unitModifiers);
      const slot = positionByKey.get(hexKey(unit.formationHex));
      const card = document.createElement('button');

      card.type = 'button';
      card.draggable = true;
      card.className = 'squad-unit-card';
      card.dataset.unitId = String(unit.id);
      card.dataset.hexQ = String(unit.formationHex.q);
      card.dataset.hexR = String(unit.formationHex.r);
      card.style.setProperty('--unit-color', unitCaptain?.color ?? unitClass.fill);
      card.style.width = `${cardWidth}px`;
      card.style.height = `${cardHeight}px`;
      card.style.left = `calc(50% + ${slot.x}px)`;
      card.style.top = `calc(50% + ${slot.y}px)`;
      card.style.padding = dense ? '10px 7px' : '18px 12px';
      card.setAttribute('aria-label', `${unitCaptain?.name ?? unitClass.label}, ${Math.ceil(unit.hp)} of ${unit.maxHp} health, hex ${unit.formationHex.q}, ${unit.formationHex.r}`);
      if (this.squadBuilderSelection === unit.id) card.classList.add('squad-unit-card--selected');

      const weapon = unitClass.weapon;
      const statLine = effectiveStats
        ? `${this.formatCombatValue(effectiveStats.damage)} DMG • ${this.formatCombatValue(effectiveStats.fireRate, 2)}/s`
        : (weapon.kind === 'rocket' ? 'AoE rockets' : 'Automatic rifle');
      const healthRatio = Math.max(0, Math.min(1, unit.hp / Math.max(1, unit.maxHp)));
      const healthColor = healthRatio > 0.6 ? '#7ef9d4' : healthRatio > 0.3 ? '#ffd36a' : '#ff7188';

      card.innerHTML = `
        <span class="squad-unit-card__slot">${index + 1}</span>
        <span class="squad-unit-card__icon">${unitCaptain?.shortLabel ?? unitClass.shortLabel}</span>
        <strong>${unitCaptain?.name ?? unitClass.label}</strong>
        <span class="squad-unit-card__health" style="margin-top:4px;color:${healthColor};font-size:10px;font-weight:950;letter-spacing:.02em;">${Math.ceil(unit.hp)} / ${unit.maxHp} HP</span>
        <small>${statLine}</small>
      `;

      const slotLabel = card.querySelector('.squad-unit-card__slot');
      const icon = card.querySelector('.squad-unit-card__icon');
      const label = card.querySelector('strong');
      const health = card.querySelector('.squad-unit-card__health');
      const detail = card.querySelector('small');
      if (dense) {
        slotLabel.style.top = '16%';
        slotLabel.style.left = '17%';
        slotLabel.style.fontSize = veryDense ? '7px' : '8px';
        icon.style.width = veryDense ? '30px' : '34px';
        icon.style.height = veryDense ? '30px' : '34px';
        icon.style.fontSize = veryDense ? '8px' : '9px';
        label.style.fontSize = '10px';
        label.style.marginTop = '4px';
        health.style.fontSize = veryDense ? '7px' : '8px';
        health.style.marginTop = '2px';
        detail.style.display = 'none';
      }
      if (veryDense) label.style.display = 'none';

      card.addEventListener('dragstart', (event) => {
        this.squadBuilderDragging = true;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(unit.id));
        card.classList.add('squad-unit-card--dragging');
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('squad-unit-card--dragging');
        setTimeout(() => { this.squadBuilderDragging = false; }, 0);
      });
      card.addEventListener('dragover', (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      });
      card.addEventListener('drop', (event) => {
        event.preventDefault();
        const unitId = Number(event.dataTransfer.getData('text/plain'));
        if (Number.isFinite(unitId) && unitId !== unit.id) moveToHex(unitId, unit.formationHex);
      });
      card.addEventListener('click', () => {
        if (this.squadBuilderDragging) return;
        const currentlySelected = this.getSelectedBuilderUnit();
        if (currentlySelected && currentlySelected.id !== unit.id) {
          moveToHex(currentlySelected.id, unit.formationHex);
          return;
        }
        this.squadBuilderSelection = this.squadBuilderSelection === unit.id ? null : unit.id;
        this.squadBuilderMessage = '';
        this.renderSquadBuilder();
      });

      board.append(card);
    });

    this.squadBuilderGrid.append(board);

    requestAnimationFrame(() => {
      if (!this.squadBuilderHasCentered) {
        this.squadBuilderGrid.scrollLeft = Math.max(0, (this.squadBuilderGrid.scrollWidth - this.squadBuilderGrid.clientWidth) / 2);
        this.squadBuilderGrid.scrollTop = Math.max(0, (this.squadBuilderGrid.scrollHeight - this.squadBuilderGrid.clientHeight) / 2);
        this.squadBuilderHasCentered = true;
        return;
      }
      this.squadBuilderGrid.scrollLeft = previousScrollLeft;
      this.squadBuilderGrid.scrollTop = previousScrollTop;
    });
  }
}
