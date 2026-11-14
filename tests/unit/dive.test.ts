import { describe, it, expect } from 'vitest'
import { assignParticles, diveZoom, easeInOutCubic, zoomAt, type DiveFrom } from '../../src/dive'

const ring = (n: number, cx: number, cy: number, r: number, ccw = true) =>
  Array.from({ length: n }, (_, i) => {
    const a = (ccw ? 1 : -1) * (i / n) * 2 * Math.PI
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
  })

describe('easeInOutCubic', () => {
  it('pins the ends and the midpoint, and is monotone', () => {
    expect(easeInOutCubic(0)).toBe(0)
    expect(easeInOutCubic(1)).toBe(1)
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5)
    let prev = -1
    for (let t = 0; t <= 1; t += 0.05) { const e = easeInOutCubic(t); expect(e).toBeGreaterThanOrEqual(prev); prev = e }
    expect(easeInOutCubic(-1)).toBe(0)
    expect(easeInOutCubic(2)).toBe(1)
  })
})

describe('diveZoom', () => {
  it('zooms so the region fills most of the view, clamped', () => {
    expect(diveZoom({ w: 200, h: 100 }, { w: 1000, h: 800 })).toBeCloseTo(4)
    expect(diveZoom({ w: 900, h: 700 }, { w: 1000, h: 800 })).toBe(1.5)
    expect(diveZoom({ w: 10, h: 10 }, { w: 1000, h: 800 })).toBe(6)
  })
})

describe('zoomAt', () => {
  const from: DiveFrom = { pts: [], origin: { x: 100, y: 100 }, center: { x: 400, y: 300 }, zoom: 3 }
  it('is the identity at e=0', () => {
    expect(zoomAt({ x: 120, y: 90 }, from, 0)).toEqual({ x: 120, y: 90 })
  })
  it('at e=1 the origin lands on the centre and offsets scale by zoom', () => {
    expect(zoomAt({ x: 100, y: 100 }, from, 1)).toEqual({ x: 400, y: 300 })
    expect(zoomAt({ x: 110, y: 100 }, from, 1)).toEqual({ x: 430, y: 300 })
  })
})

describe('assignParticles', () => {
  const origin = { x: 0, y: 0 }
  it('gives every node a contiguous, balanced run of particles', () => {
    const samples = ring(400, 0, 0, 50)
    const nodes = ring(7, 0, 0, 10)
    const a = assignParticles(samples, nodes, origin)
    expect(a).toHaveLength(400)
    const counts = new Map<number, number>()
    let runs = 1
    for (let i = 0; i < a.length; i++) {
      counts.set(a[i], (counts.get(a[i]) ?? 0) + 1)
      if (i > 0 && a[i] !== a[i - 1]) runs++
    }
    expect(counts.size).toBe(7)
    for (const c of counts.values()) expect(c).toBeGreaterThanOrEqual(57)
    expect(runs).toBeLessThanOrEqual(8) // one run per node, plus at most one wrap-around split
  })
  it('sends particles to the node in their own direction', () => {
    const samples = ring(400, 0, 0, 50)
    const nodes = [{ x: 10, y: 0 }, { x: 0, y: 10 }, { x: -10, y: 0 }, { x: 0, y: -10 }]
    const a = assignParticles(samples, nodes, origin)
    // sample 50 sits at 45°, between node 0 (0°) and node 1 (90°)
    expect([0, 1]).toContain(a[50])
    expect([2, 1]).toContain(a[150]) // 135°
    expect(a[200]).toBe(2) // 180°
  })
  it('follows a clockwise outline too', () => {
    const samples = ring(400, 0, 0, 50, false)
    const nodes = [{ x: 10, y: 0 }, { x: 0, y: 10 }, { x: -10, y: 0 }, { x: 0, y: -10 }]
    const a = assignParticles(samples, nodes, origin)
    expect(a[200]).toBe(2)
    expect([3, 0]).toContain(a[50]) // -45°
  })
  it('is deterministic and handles no nodes', () => {
    const s = ring(40, 0, 0, 5)
    const n = ring(3, 1, 1, 2)
    expect(assignParticles(s, n, origin)).toEqual(assignParticles(s, n, origin))
    expect(assignParticles(s, [], origin)).toEqual([])
  })
})
