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
 * sits a little behind it.
 */
export const EYE = { x: 272, y: 410, rx: 19, ry: 9.5 }

/**
 * The trace from the frontal lobe to the eye: leaves the frontal board's lower-front chamfer, drops past the
 * temporal board's front edge (x = 330) with room to spare, and meets the eye's back corner on a 45° run.
 */
const BACK = EYE.x + EYE.rx
export const EYE_TRACE: UV[] = [[316, 340], [300, 356], [300, EYE.y - (300 - BACK)], [BACK, EYE.y]]

/** Delay (0..1) for the current wave at horizontal position x: the back of the head first, the face last. */
export const waveAt = (x: number, front: number, back: number) =>
  Math.max(0, Math.min(1, (back - x) / Math.max(1e-6, back - front)))

export const toD = (pts: [number, number][]) =>
  pts.map((p, i) => `${i ? 'L' : 'M'}${+p[0].toFixed(2)} ${+p[1].toFixed(2)}`).join(' ')
