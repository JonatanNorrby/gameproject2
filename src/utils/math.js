export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const distanceSq = (ax, ay, bx, by) => {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
};
export const normalize = (x, y) => {
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
};
export const randomRange = (min, max) => min + Math.random() * (max - min);
export const chooseWeighted = (entries) => {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * total;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) return entry.value;
  }
  return entries.at(-1)?.value;
};
