
export function smoothstep(x) {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}

export function smootherstep(x) {
  const t = Math.max(0, Math.min(1, x));
  return t * t * t * (t * (t * 6 - 15) + 10); // C² continuity
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}
