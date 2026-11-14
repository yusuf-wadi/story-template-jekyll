// The dive: a lobe's outline is pushed into, dissolves into particles, and the particles become the section's nodes.
// Shared, DOM-free helpers; the profile owns the 2D side, the section scene the 3D side, app.ts the timing.

export type P = { x: number; y: number }

/** Where a dive starts (or a reverse ends), in viewport px. */
export interface DiveFrom {
  /** The region outline, sampled in path order. */
  pts: P[]
  /** Centre of the region: the point the push zooms into. */
  origin: P
  /** Viewport centre: where the origin ends up when fully zoomed. */
  center: P
  /** Scale at full push. */
  zoom: number
}

export const DIVE_MS = 1200
export const FADE_MS = 200
export const PARTICLES = 400
/** CSS easing that matches easeInOutCubic, for the WAAPI side of the dive. */
export const EASE_CSS = 'cubic-bezier(0.65, 0, 0.35, 1)'

export function easeInOutCubic(t: number): number {
  if (t <= 0) return 0
  if (t >= 1) return 1
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

export const smoothstep = (a: number, b: number, t: number): number => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)))
  return x * x * (3 - 2 * x)
}

/** How far to push so the region fills ~80% of the view. */
export function diveZoom(box: { w: number; h: number }, view: { w: number; h: number }): number {
  const s = Math.min(view.w / Math.max(1, box.w), view.h / Math.max(1, box.h)) * 0.8
  return Math.min(6, Math.max(1.5, s))
}

/** A point of the profile at push progress `e` (0..1): scaled about the origin while the origin slides to the centre. */
export function zoomAt(p: P, from: DiveFrom, e: number): P {
  const s = 1 + (from.zoom - 1) * e
  return {
    x: from.origin.x + (p.x - from.origin.x) * s + (from.center.x - from.origin.x) * e,
    y: from.origin.y + (p.y - from.origin.y) * s + (from.center.y - from.origin.y) * e,
  }
}

/**
 * Which node each outline sample flies to: nodes ordered by angle around `origin` in the outline's winding, and the
 * outline cut into one contiguous, centred run per node, so particles flow to their own side and never cross over.
 */
export function assignParticles(samples: P[], nodes: P[], origin: P): number[] {
  const k = nodes.length
  if (!k || !samples.length) return []
  const ang = (p: P) => Math.atan2(p.y - origin.y, p.x - origin.x)
  let area = 0
  for (let i = 0; i < samples.length; i++) {
    const a = samples[i], b = samples[(i + 1) % samples.length]
    area += a.x * b.y - b.x * a.y
  }
  const dir = area >= 0 ? 1 : -1
  const order = nodes.map((p, i) => ({ a: ang(p), i })).sort((m, n) => dir * (m.a - n.a) || m.i - n.i).map((o) => o.i)
  const a0 = ang(samples[0])
  const diff = (a: number) => { const d = Math.abs(a - a0) % (2 * Math.PI); return d > Math.PI ? 2 * Math.PI - d : d }
  let start = 0
  for (let j = 1; j < k; j++) if (diff(ang(nodes[order[j]])) < diff(ang(nodes[order[start]]))) start = j
  const n = samples.length
  return samples.map((_, i) => order[(start + Math.floor(((i + n / (2 * k)) * k) / n)) % k])
}
