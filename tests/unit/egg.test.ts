import { describe, it, expect } from 'vitest'
import { bridge, BALL_BOTTOM, BALL_TOP, EYE, EYE_TRACES, LID_FRONT, LID_HINGE, LOWER_LID, LOWER_TRACE, UPPER_TRACE, lidY, onLid, waveAt } from '../../src/egg/layout'

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

describe('eye traces', () => {
  it('are two, orthogonal/45°, each leaving a board edge and staying clear of the temporal board in front', () => {
    expect(EYE_TRACES).toHaveLength(2)
    for (const t of EYE_TRACES) for (let k = 1; k < t.length; k++) expect(segOk(t[k - 1], t[k])).toBe(true)
    // frontal chamfer: (302,326)–(330,354), i.e. x - y = -24
    expect(UPPER_TRACE[0][0] - UPPER_TRACE[0][1]).toBe(-24)
    // temporal front chamfer: (330,422)–(370,462), i.e. x - y = -92
    expect(LOWER_TRACE[0][0] - LOWER_TRACE[0][1]).toBe(-92)
    expect(LOWER_TRACE[0][0]).toBeGreaterThan(330)
    expect(LOWER_TRACE[0][0]).toBeLessThan(370)
    for (const p of UPPER_TRACE.slice(1)) expect(p[0]).toBeLessThan(330)
  })
  it('the upper one drops onto the open upper lid where the C begins; the lower one climbs into the lower lid’s back end', () => {
    const up = UPPER_TRACE[UPPER_TRACE.length - 1]
    expect(up[0] - EYE.x).toBeCloseTo(BALL_TOP[0])
    expect(up[1] - EYE.y).toBeCloseTo(lidY(BALL_TOP[0]))
    const low = LOWER_TRACE[LOWER_TRACE.length - 1]
    expect([low[0] - EYE.x, low[1] - EYE.y]).toEqual(LOWER_LID[1])
    // a V below the eye: the lower trace dips below the lid before rising into it
    expect(Math.max(...LOWER_TRACE.map((p) => p[1]))).toBeGreaterThan(low[1] + 20)
  })
})

describe('profile eye', () => {
  it('is a C bulging toward the face between two lids that run back from it; the upper lid is longer', () => {
    expect(LID_HINGE[0]).toBeGreaterThan(0) // the head faces left: the lids run back, behind the eye's centre
    expect(LID_FRONT[0]).toBeLessThan(LOWER_LID[0][0]) // the upper lid overhangs the front
    expect(LID_HINGE[0] - LID_FRONT[0]).toBeGreaterThan(LOWER_LID[1][0] - LOWER_LID[0][0])
    expect(BALL_TOP[1]).toBeCloseTo(lidY(BALL_TOP[0]))
    expect(BALL_BOTTOM[1]).toBe(LOWER_LID[0][1])
    expect(LOWER_LID[1][1] - LID_HINGE[1]).toBeGreaterThan(EYE.ry * 1.5)
  })
  it('swings about its back end: open, it lies on its drawn line; shut, its front end rests on the lower lid', () => {
    for (const t of [0, 0.5, 1]) expect(onLid(LID_HINGE, t)).toEqual(LID_HINGE)
    const open = onLid(LID_FRONT, 1)
    expect(open[0]).toBeCloseTo(LID_FRONT[0])
    expect(open[1]).toBeCloseTo(LID_FRONT[1])
    const shut = onLid(LID_FRONT, 0)
    expect(shut[1]).toBeCloseTo(LOWER_LID[0][1])
    expect(shut[0]).toBeGreaterThan(LOWER_LID[0][0])
    expect(shut[0]).toBeLessThan(LOWER_LID[1][0])
    expect(onLid(LID_FRONT, 0.5)[1]).toBeGreaterThan(open[1]) // it rises as it opens
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
