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
 * The eye, as Yusuf sketched it: on the face just behind the brow, level with the gap between the frontal and
 * temporal boards. In profile (the face is toward −x) it is line art in the traces' stroke language: an eyeball
 * drawn as a "C" bulging toward the face, an upper and a lower lid running back from it as near-level strokes
 * (the upper one a little longer, overhanging the front), and an iris just inside the C. `rx` is half the eye's
 * depth, `ry` half its height.
 */
export const EYE = { x: 274, y: 420, rx: 22, ry: 19 }

/** Local coordinates, origin at EYE. The upper lid runs from its front end to its hinge at the back. */
export const LID_FRONT: UV = [-22, -20]
export const LID_HINGE: UV = [22, -17]
export const LOWER_LID: [UV, UV] = [[-16, 18], [22, 18]]
/** Height of the open upper lid at local x. */
export const lidY = (x: number) =>
  LID_FRONT[1] + ((x - LID_FRONT[0]) / (LID_HINGE[0] - LID_FRONT[0])) * (LID_HINGE[1] - LID_FRONT[1])
/** Where the eyeball's C leaves the upper lid and lands on the lower one. */
export const BALL_TOP: UV = [-4, lidY(-4)]
export const BALL_BOTTOM: UV = [-10, LOWER_LID[0][1]]
const BALL_C: [UV, UV] = [[-21, -17], [-23, 14]]

/**
 * Shut, the upper lid is swung down about its hinge until its front end rests on the lower lid. Returns the
 * lid's rotation (degrees, about LID_HINGE) at openness t: 0 shut, 1 open; values a little past 1 overshoot.
 */
const SHUT_DEG = (() => {
  const vx = LID_FRONT[0] - LID_HINGE[0], vy = LID_FRONT[1] - LID_HINGE[1]
  const r = Math.hypot(vx, vy), drop = LOWER_LID[0][1] - LID_HINGE[1]
  // Rotating v by −φ: its y becomes r·sin(φ − α) with α the lid's own tilt; solve for y = drop.
  const a = Math.atan2(-vy, -vx)
  return -((Math.asin(drop / r) + a) * 180) / Math.PI
})()
export const lidAngle = (t: number) => SHUT_DEG * (1 - t)
/** A local point carried by the upper lid at openness t. */
export function onLid(p: UV, t: number): UV {
  const a = (lidAngle(t) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
  const dx = p[0] - LID_HINGE[0], dy = p[1] - LID_HINGE[1]
  return [LID_HINGE[0] + dx * c - dy * s, LID_HINGE[1] + dx * s + dy * c]
}
export const lidTransform = (t: number) => `rotate(${+lidAngle(t).toFixed(3)} ${LID_HINGE[0]} ${LID_HINGE[1]})`

const f = (p: UV) => `${+p[0].toFixed(2)} ${+p[1].toFixed(2)}`
/** The upper lid in its open position (it is swung by lidTransform). */
export const UPPER_D = `M${f(LID_FRONT)} L${f(LID_HINGE)}`
export const LOWER_D = `M${f(LOWER_LID[0])} L${f(LOWER_LID[1])}`
/** Everything below the open upper lid; carried by the lid, it is what the lid uncovers as it lifts. */
export const LID_MASK_D = (() => {
  const v: UV = [LID_FRONT[0] - LID_HINGE[0], LID_FRONT[1] - LID_HINGE[1]]
  const fwd: UV = [LID_HINGE[0] + v[0] * 3, LID_HINGE[1] + v[1] * 3]
  const back: UV = [LID_HINGE[0] - v[0] * 2, LID_HINGE[1] - v[1] * 2]
  return `M${f(back)} L${f(fwd)} L${f([fwd[0], 140])} L${f([back[0], 140])} Z`
})()
/** The eyeball's C, from the upper lid round the front to the lower lid. */
export const BALL_D = `M${f(BALL_TOP)} C${f(BALL_C[0])} ${f(BALL_C[1])} ${f(BALL_BOTTOM)}`
/** The open eye's outline: the C, back along the lower lid, up to the hinge, forward along the upper lid. */
export const EYE_SHAPE = `${BALL_D} L${f(LOWER_LID[1])} L${f(LID_HINGE)} L${f(BALL_TOP)} Z`
/** The iris, nearly edge-on just inside the C toward the face, and the pupil on it. */
export const IRIS_D = 'M-9 -9 C-13.5 -4 -13.5 5 -9 10'
export const PUPIL = { cx: -12.4, cy: 0.5, r: 2.4 }

/**
 * Two traces feed the eye (head source coordinates). The upper one leaves the frontal board's lower-front
 * chamfer, runs down-left under it and drops straight onto the upper lid where the C begins. The lower one leaves
 * the temporal board's front chamfer down-left to a V under the eye, then climbs into the lower lid's back end.
 */
const UP_X = EYE.x + BALL_TOP[0]
export const UPPER_TRACE: UV[] = [[326, 350], [306, 370], [UP_X + 6, 370], [UP_X, 376], [UP_X, EYE.y + BALL_TOP[1]]]
const LOW_END: UV = [EYE.x + LOWER_LID[1][0], EYE.y + LOWER_LID[1][1]]
export const LOWER_TRACE: UV[] = [[355, 447], [334, 468], [LOW_END[0] + 30, LOW_END[1] + 30], LOW_END]
export const EYE_TRACES: UV[][] = [UPPER_TRACE, LOWER_TRACE]

/** Delay (0..1) for the current wave at horizontal position x: the back of the head first, the face last. */
export const waveAt = (x: number, front: number, back: number) =>
  Math.max(0, Math.min(1, (back - x) / Math.max(1e-6, back - front)))

export const toD = (pts: [number, number][]) =>
  pts.map((p, i) => `${i ? 'L' : 'M'}${+p[0].toFixed(2)} ${+p[1].toFixed(2)}`).join(' ')
