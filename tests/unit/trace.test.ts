import { describe, it, expect } from 'vitest'
import { buildTrace, lengthAtY, loopFraction } from '../../src/list/trace'

const secs = [
  { head: { top: 40, bottom: 52, left: 19, right: 120 }, pads: [100, 200, 300] },
  { head: { top: 380, bottom: 392, left: 19, right: 90 }, pads: [440, 540] },
]
const is45 = (pts: number[][]) => {
  for (let i = 1; i < pts.length; i++) {
    const dx = Math.abs(pts[i]![0]! - pts[i - 1]![0]!), dy = Math.abs(pts[i]![1]! - pts[i - 1]![1]!)
    if (!(dx === 0 || dy === 0 || Math.abs(dx - dy) < 1e-9)) return false
  }
  return true
}
const pts = (d: string) => [...d.matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)].map((m) => [Number(m[1]), Number(m[2])])

describe('list trace', () => {
  const t = buildTrace(9, secs)
  it('spine runs straight down through vias, joins and pads', () => {
    for (let i = 1; i < t.points.length; i++) {
      expect(t.points[i]![0]).toBe(9)
      expect(t.points[i]![1]).toBeGreaterThanOrEqual(t.points[i - 1]![1])
    }
  })
  it('each title is ringed by a closed chamfered loop with one clearance all round', () => {
    for (const [i, l] of t.loops.entries()) {
      const p = pts(l.d)
      expect(is45(p)).toBe(true)
      // the arm starts at the via and ends at the join, both on the spine: with the spine between them the ring closes
      expect(p[0]).toEqual(l.via)
      expect(p[p.length - 1]).toEqual(l.join)
      expect(l.via[0]).toBe(9)
      const g = secs[i]!.head.left - 9
      const xs = p.map((q) => q[0]!), ys = p.map((q) => q[1]!)
      expect(Math.max(...xs)).toBe(secs[i]!.head.right + g)
      expect(Math.min(...ys)).toBe(secs[i]!.head.top - g)
      expect(Math.max(...ys)).toBe(secs[i]!.head.bottom + g)
    }
  })
  it('orders ring, pads, next ring along the spine; the last pad is inside it', () => {
    expect(t.padLens[0]![0]).toBeGreaterThan(t.frameEnds[0]!)
    expect(t.frameEnds[1]).toBeGreaterThan(t.padLens[0]![2]!)
    expect(t.padLens[1]![1]).toBeLessThan(t.total)
  })
  it('lit length and ring fraction grow with depth; the ring completes as the spine reaches the join', () => {
    let prev = -1, prevF = -1
    for (let y = 0; y <= 700; y += 5) {
      const l = lengthAtY(t, y); expect(l).toBeGreaterThanOrEqual(prev); prev = l
      const f = loopFraction(t.loops[1]!, y); expect(f).toBeGreaterThanOrEqual(prevF); prevF = f
    }
    expect(lengthAtY(t, 300)).toBeCloseTo(t.padLens[0]![2]!, 5)
    expect(loopFraction(t.loops[0]!, t.loops[0]!.join[1])).toBe(1)
    expect(loopFraction(t.loops[0]!, t.loops[0]!.via[1])).toBe(0)
    expect(lengthAtY(t, 10_000)).toBe(t.total)
  })
})
