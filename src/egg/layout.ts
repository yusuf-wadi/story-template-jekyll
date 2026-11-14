// Pure geometry for the completed-circuit easter egg (head `<g>` source coordinates; the head faces left).

export type UV = [number, number]

const dedupe = (pts: UV[]): UV[] =>
  pts.filter((p, i) => i === 0 || Math.abs(p[0] - pts[i - 1][0]) > 1e-9 || Math.abs(p[1] - pts[i - 1][1]) > 1e-9)

/** Join two facing edge pads: straight, one 45° jog in the middle, straight. */
export function bridge(a: UV, b: UV): UV[] {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const sx = Math.sign(dx), sy = Math.sign(dy)
  if (Math.abs(dx) >= Math.abs(dy)) {
    const h = (Math.abs(dx) - Math.abs(dy)) / 2
    return dedupe([a, [a[0] + sx * h, a[1]], [a[0] + sx * (h + Math.abs(dy)), b[1]], b])
  }
  const h = (Math.abs(dy) - Math.abs(dx)) / 2
  return dedupe([a, [a[0], a[1] + sy * h], [b[0], a[1] + sy * (h + Math.abs(dx))], b])
}

/**
 * The eye, worked out from the silhouette: the brow juts forward to x≈228 at y≈360, the nasal bridge (sellion)
 * dips back to x≈240 at y≈410 and the nose tip reaches y≈510. Eye level is the sellion; in profile the eye
 * sits a little behind it. `rx` is half the eye's depth (cornea apex to outer corner), `ry` half its open height.
 */
export const EYE = { x: 272, y: 410, rx: 20, ry: 14 }

/**
 * The eye in profile (local coordinates, origin at EYE, the face is toward −x). Both lids leave the outer
 * corner O at the back of the eye and open toward the front, where the cornea bulges between their ends.
 * A lid is one cubic from O: [c1, c2, end].
 */
export type Bez = [UV, UV, UV]
export const EYE_O: UV = [EYE.rx, 0]
const LID_OPEN: Bez = [[12, -12], [-2, -18], [-13, -14.5]]
const LID_SHUT: Bez = [[12, 6], [-1, 11.5], [-11.5, 11.8]] // lying on the lower lid
export const LOWER_LID: Bez = [[12, 7], [-1, 12.5], [-11, 12.5]]
const CORNEA: [UV, UV] = [[-21, -10.5], [-23, 6.5]] // controls from the upper lid's end to the lower lid's end

const lerp = (a: UV, b: UV, t: number): UV => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
/** The upper lid at openness t (0 shut, 1 open; values a little past 1 overshoot). It hinges at the outer corner. */
export const upperLid = (t: number): Bez => [0, 1, 2].map((i) => lerp(LID_SHUT[i], LID_OPEN[i], t)) as Bez
/** Point at s ∈ [0,1] along a lid. */
export function lidAt(b: Bez, s: number): UV {
  const [p0, [c1, c2, p3]] = [EYE_O, b]
  const u = 1 - s
  const k = [u * u * u, 3 * u * u * s, 3 * u * s * s, s * s * s]
  return [0, 1].map((j) => k[0] * p0[j] + k[1] * c1[j] + k[2] * c2[j] + k[3] * p3[j]) as UV
}
const f = (p: UV) => `${+p[0].toFixed(2)} ${+p[1].toFixed(2)}`
export const lidD = (b: Bez) => `M${f(EYE_O)} C${f(b[0])} ${f(b[1])} ${f(b[2])}`
/** Everything below the upper lid: what the lid uncovers as it lifts. */
export function lidMaskD(b: Bez): string {
  // Past the lid's end the mask's edge carries on along the lid's tangent, so the uncovered cornea has no seam.
  const [, c2, e] = b
  const p: UV = [e[0] + (e[0] - c2[0]) * 4, e[1] + (e[1] - c2[1]) * 4]
  return `${lidD(b)} L${f(p)} L-60 60 L60 60 L60 0 Z`
}
/** Lashes: a few short strokes off the front of the upper lid, swept forward and up. */
export function lashesD(b: Bez): string {
  return [0.8, 0.9, 0.98].map((s, i) => {
    const p = lidAt(b, s)
    const len = 2.8 + i * 0.7
    return `M${f(p)} q${f([-len * 0.75, -len * 0.15])} ${f([-len * 0.95, -len * 0.85])}`
  }).join(' ')
}
/** The open eye's outline: upper lid, cornea, lower lid back to the corner. */
export const EYE_SHAPE = `${lidD(LID_OPEN)} C${f(CORNEA[0])} ${f(CORNEA[1])} ${f(LOWER_LID[2])} ` +
  `C${f(LOWER_LID[1])} ${f(LOWER_LID[0])} ${f(EYE_O)} Z`
/** The cornea's front arc alone. */
export const CORNEA_D = `M${f(LID_OPEN[2])} C${f(CORNEA[0])} ${f(CORNEA[1])} ${f(LOWER_LID[2])}`
/** The fold above the upper lid; it stays put while the lid lifts. */
export const CREASE_D = 'M13 -9 C6 -18 -4 -22.5 -11.5 -20'
/** The iris and pupil, seen nearly edge-on just behind the cornea. */
export const IRIS = { cx: -13.5, cy: -1, rx: 4, ry: 10 }
export const PUPIL = { cx: -15.8, cy: -1, rx: 1.8, ry: 4.6 }

/**
 * The trace from the frontal lobe to the eye: leaves the frontal board's lower-front chamfer, drops past the
 * temporal board's front edge (x = 330) with room to spare, and meets the eye's outer corner on a 45° run.
 */
const BACK = EYE.x + EYE.rx
const COL = 306
export const EYE_TRACE: UV[] = [[316, 340], [COL, 350], [COL, EYE.y - (COL - BACK)], [BACK, EYE.y]]

/** Delay (0..1) for the current wave at horizontal position x: the back of the head first, the face last. */
export const waveAt = (x: number, front: number, back: number) =>
  Math.max(0, Math.min(1, (back - x) / Math.max(1e-6, back - front)))

export const toD = (pts: [number, number][]) =>
  pts.map((p, i) => `${i ? 'L' : 'M'}${+p[0].toFixed(2)} ${+p[1].toFixed(2)}`).join(' ')
