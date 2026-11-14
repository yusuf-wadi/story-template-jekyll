import { describe, it, expect } from 'vitest'
import { bridge, EYE, EYE_O, EYE_TRACE, LOWER_LID, lidAt, upperLid, waveAt } from '../../src/egg/layout'

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

describe('profile eye', () => {
  it('hinges both lids at the outer corner, at the back; shut, the upper lid lies on the lower one', () => {
    expect(EYE_O[0]).toBeGreaterThan(0) // the head faces left: the corner is behind the eye's centre
    for (const t of [0, 0.5, 1]) expect(lidAt(upperLid(t), 0)).toEqual(EYE_O)
    for (const s of [0.25, 0.5, 0.75, 1]) {
      const shut = lidAt(upperLid(0), s), low = lidAt(LOWER_LID, s)
      expect(Math.hypot(shut[0] - low[0], shut[1] - low[1])).toBeLessThan(1.5)
    }
  })
  it('opens toward the front: the open upper lid ends above and in front of the lower lid’s end', () => {
    const up = lidAt(upperLid(1), 1), low = lidAt(LOWER_LID, 1)
    expect(up[0]).toBeLessThan(0)
    expect(low[1] - up[1]).toBeGreaterThan(EYE.ry * 1.5)
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
