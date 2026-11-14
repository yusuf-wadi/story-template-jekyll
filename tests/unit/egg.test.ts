import { describe, it, expect } from 'vitest'
import { bridge, EYE, EYE_TRACE, waveAt } from '../../src/egg/layout'

type P = [number, number]
const segOk = (a: P, b: P) => {
  const du = Math.abs(b[0] - a[0]), dv = Math.abs(b[1] - a[1])
  return du < 1e-6 || dv < 1e-6 || Math.abs(du - dv) < 1e-6
}

describe('bridge', () => {
  it('joins two pads with orthogonal/45° segments', () => {
    for (const [a, b] of [[[462, 264], [498, 258]], [[432, 360], [426, 402]], [[666, 444], [648, 492]], [[0, 0], [10, 0]]] as [P, P][]) {
      const l = bridge(a, b)
      expect(l[0]).toEqual(a)
      expect(l[l.length - 1]).toEqual(b)
      for (let k = 1; k < l.length; k++) expect(segOk(l[k - 1], l[k])).toBe(true)
    }
  })
})

describe('eye trace', () => {
  it('is orthogonal/45°, starts on the frontal chamfer and ends at the eye’s back corner', () => {
    for (let k = 1; k < EYE_TRACE.length; k++) expect(segOk(EYE_TRACE[k - 1], EYE_TRACE[k])).toBe(true)
    // frontal chamfer: (302,326)–(330,354), i.e. x - y = -24
    expect(EYE_TRACE[0][0] - EYE_TRACE[0][1]).toBe(-24)
    expect(EYE_TRACE[EYE_TRACE.length - 1]).toEqual([EYE.x + EYE.rx, EYE.y])
    // stays in front of the temporal board (its front edge is x = 330)
    for (const p of EYE_TRACE) if (p[1] >= 380) expect(p[0]).toBeLessThan(330 - 20)
  })
})

describe('waveAt', () => {
  it('runs back (0) to front (1), clamped', () => {
    expect(waveAt(736, 302, 736)).toBe(0)
    expect(waveAt(302, 302, 736)).toBe(1)
    expect(waveAt(100, 302, 736)).toBe(1)
    expect(waveAt(519, 302, 736)).toBeCloseTo(0.5)
  })
})
