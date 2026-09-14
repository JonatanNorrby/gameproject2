const HEX_DIRECTIONS = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function getHexFormationSlots(count) {
  const total = Math.max(0, Math.floor(count));
  if (total === 0) return [];

  const slots = [{ q: 0, r: 0, ring: 0 }];

  for (let radius = 1; slots.length < total; radius += 1) {
    let q = -radius;
    let r = radius;

    for (const direction of HEX_DIRECTIONS) {
      for (let step = 0; step < radius && slots.length < total; step += 1) {
        slots.push({ q, r, ring: radius });
        q += direction.q;
        r += direction.r;
      }
    }
  }

  return slots;
}

export function hexToPixel(slot, radius = 1) {
  return {
    x: Math.sqrt(3) * radius * (slot.q + slot.r / 2),
    y: 1.5 * radius * slot.r,
  };
}

export function getHexFormationLayout(count, radius = 1) {
  const slots = getHexFormationSlots(count);
  if (slots.length === 0) return [];

  const rawPositions = slots.map((slot) => hexToPixel(slot, radius));
  const xs = rawPositions.map((position) => position.x);
  const ys = rawPositions.map((position) => position.y);
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;

  return slots.map((slot, index) => ({
    ...slot,
    x: rawPositions[index].x - centerX,
    y: rawPositions[index].y - centerY,
  }));
}

export function radiusForNeighborSpacing(spacing) {
  return Math.max(0, spacing) / Math.sqrt(3);
}

export function hexDistance(a, b) {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export function areHexSlotsAdjacent(a, b) {
  return hexDistance(a, b) === 1;
}
