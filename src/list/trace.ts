/**
 * One continuous PCB trace through the list. The spine runs straight down through every item's pad; at each
 * section title it passes an entry via, and a loop routes around the title as a closed chamfered ring: the spine
 * is the ring's left edge, and an "arm" leaves the via over the top, down the right and back along the bottom to
 * rejoin the spine at the bottom-left. Lit, current runs both ways from the via and meets there, then carries on.
 */

export interface SectionGeom {
  /** The title text's box (container px). */
  head: { top: number; bottom: number; left: number; right: number }
  /** Pad centres (container px, y only: every pad sits on the spine). */
  pads: number[]
}
export interface Loop {
  /** The arm: via → top → right → bottom → join (the spine closes the ring). */
  d: string
  length: number
  via: [number, number]
  join: [number, number]
}
export interface Trace {
  /** The spine. */
  d: string
  points: [number, number][]
  cum: number[]
  total: number
  loops: Loop[]
  /** Spine length at each loop's join (the title is fully ringed once the spine is lit this far). */
  frameEnds: number[]
  /** Spine length at each pad, per section. */
  padLens: number[][]
}

/** Chamfer size, lead-in above the first via, tail past the last pad, and the clearance bounds around a title. */
export const CHAMFER = 5, LEAD = 18, TAIL = 22, MIN_GAP = 6, MAX_GAP = 14

const path = (pts: [number, number][]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('')
const lengthOf = (pts: [number, number][]) => {
  const cum = pts.map(() => 0)
  for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1])
  return cum
}

export function buildTrace(x: number, sections: SectionGeom[]): Trace {
  const pts: [number, number][] = []
  const push = (py: number) => { const last = pts[pts.length - 1]; pts.push([x, last ? Math.max(py, last[1]) : py]) }
  const loops: Loop[] = []
  const at: { join: number; pads: number[] }[] = []
  for (const sec of sections) {
    // One clearance on every side: the gap between the spine and the title's left edge.
    const g = Math.min(MAX_GAP, Math.max(MIN_GAP, sec.head.left - x))
    const c = CHAMFER
    const top = sec.head.top - g, bot = sec.head.bottom + g, right = Math.max(sec.head.right + g, x + 3 * c)
    const via: [number, number] = [x, top + c]
    const join: [number, number] = [x, bot - c]
    if (!pts.length) push(via[1] - LEAD)
    push(via[1])
    push(join[1])
    const joinAt = pts.length - 1
    const arm: [number, number][] = [via, [x + c, top], [right - c, top], [right, top + c], [right, bot - c], [right - c, bot], [x + c, bot], join]
    const armCum = lengthOf(arm)
    loops.push({ d: path(arm), length: armCum[armCum.length - 1]!, via, join })
    const pads = sec.pads.map((py) => { push(py); return pts.length - 1 })
    at.push({ join: joinAt, pads })
  }
  if (pts.length) push(pts[pts.length - 1]![1] + TAIL)
  const cum = lengthOf(pts)
  return {
    d: path(pts), points: pts, cum, total: cum[cum.length - 1] ?? 0, loops,
    frameEnds: at.map((a) => cum[a.join]!),
    padLens: at.map((a) => a.pads.map((i) => cum[i]!)),
  }
}

/** Spine length lit once the charge has reached depth y (the spine only ever runs down). */
export function lengthAtY(t: Pick<Trace, 'points' | 'cum' | 'total'>, y: number): number {
  const p = t.points
  if (!p.length || y <= p[0]![1]) return 0
  for (let i = 1; i < p.length; i++) {
    const y0 = p[i - 1]![1], y1 = p[i]![1]
    if (y1 > y) return t.cum[i - 1]! + (y1 === y0 ? 0 : (y - y0) / (y1 - y0)) * (t.cum[i]! - t.cum[i - 1]!)
  }
  return t.total
}

/** How much of a loop's arm is lit at depth y: it races round while the spine runs from via to join. */
export function loopFraction(l: Pick<Loop, 'via' | 'join'>, y: number): number {
  const span = l.join[1] - l.via[1]
  return span <= 0 ? (y >= l.join[1] ? 1 : 0) : Math.min(1, Math.max(0, (y - l.via[1]) / span))
}
