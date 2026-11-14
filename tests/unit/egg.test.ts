import { describe, it, expect } from 'vitest'
import { bridge, ANODE_WIRE, CATHODE_WIRE, DIODE, DIODE_BAR, DIODE_TRI, EYE, EYE_TRACES, LEAD_X, LOWER_PLATE, LOWER_TRACE, SHUT_DROP, UPPER_PLATE, UPPER_TRACE, leadTailD, plateDrop, waveAt } from '../../src/egg/layout'

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
  it('land square-on at the middle of their plates, like schematic leads; the lower one comes up out of a V', () => {
    const up = UPPER_TRACE[UPPER_TRACE.length - 1], upPrev = UPPER_TRACE[UPPER_TRACE.length - 2]
    expect([up[0] - EYE.x, up[1] - EYE.y]).toEqual([LEAD_X, UPPER_PLATE[0][1]])
    expect(upPrev[0]).toBe(up[0]) // drops vertically onto the plate
    const low = LOWER_TRACE[LOWER_TRACE.length - 1], lowPrev = LOWER_TRACE[LOWER_TRACE.length - 2]
    expect([low[0] - EYE.x, low[1] - EYE.y]).toEqual([LEAD_X, LOWER_PLATE[0][1]])
    expect(lowPrev[0]).toBe(low[0])
    expect(lowPrev[1]).toBeGreaterThan(low[1]) // rises into it from below
    for (const pl of [UPPER_PLATE, LOWER_PLATE]) {
      expect(LEAD_X).toBeGreaterThan(pl[0][0])
      expect(LEAD_X).toBeLessThan(pl[1][0])
    }
    expect(Math.max(...LOWER_TRACE.map((p) => p[1]))).toBeGreaterThan(low[1] + 20)
  })
})

describe('profile eye (schematic symbol)', () => {
  it('battery lids: long upper plate, short lower plate, both level and running back; a diode eyeball between them', () => {
    const len = (p: [P, P]) => p[1][0] - p[0][0]
    expect(UPPER_PLATE[0][1]).toBe(UPPER_PLATE[1][1])
    expect(LOWER_PLATE[0][1]).toBe(LOWER_PLATE[1][1])
    expect(len(UPPER_PLATE)).toBeGreaterThan(len(LOWER_PLATE) * 1.3)
    expect(UPPER_PLATE[1][0]).toBeGreaterThan(0) // the head faces left: the plates run back
    expect(UPPER_PLATE[0][0]).toBeLessThan(LOWER_PLATE[0][0])
    // the diode sits between the plates without touching them, its tip (and cathode bar) toward the face
    const ys = DIODE_TRI.map((p) => p[1])
    expect(Math.min(...ys)).toBeGreaterThan(UPPER_PLATE[0][1] + 4)
    expect(Math.max(...ys)).toBeLessThan(LOWER_PLATE[0][1] - 4)
    expect(DIODE.tip[0]).toBeLessThan(DIODE.baseX)
    expect(DIODE_BAR[0][0]).toBe(DIODE.tip[0])
    expect(DIODE_BAR[1][1] - DIODE_BAR[0][1]).toBe(2 * DIODE.half)
    expect(LOWER_PLATE[0][1] - UPPER_PLATE[0][1]).toBeGreaterThan(EYE.ry * 1.5)
  })
  it('opens from shorted: shut, the upper plate rests just above the lower; open, on its drawn line', () => {
    expect(plateDrop(1)).toBe(0)
    const shutY = UPPER_PLATE[0][1] + plateDrop(0)
    expect(shutY).toBe(UPPER_PLATE[0][1] + SHUT_DROP)
    expect(LOWER_PLATE[0][1] - shutY).toBeGreaterThan(0)
    expect(LOWER_PLATE[0][1] - shutY).toBeLessThanOrEqual(4)
    expect(shutY).toBeGreaterThan(Math.max(...DIODE_TRI.map((p) => p[1]))) // shut, the diode is all covered
    expect(plateDrop(0.5)).toBeLessThan(plateDrop(0))
    // the upper lead's tail follows the plate down and vanishes when open
    expect(leadTailD(1)).toBe(`M${LEAD_X} ${UPPER_PLATE[0][1]} V${UPPER_PLATE[0][1]}`)
    expect(leadTailD(0)).toBe(`M${LEAD_X} ${UPPER_PLATE[0][1]} V${shutY}`)
  })
})

describe('eye circuit', () => {
  it('wires + plate → anode and cathode → − plate, orthogonal, within the plates', () => {
    const on = (p: P, pl: [P, P]) => p[1] === pl[0][1] && p[0] > pl[0][0] && p[0] < pl[1][0]
    expect(on(ANODE_WIRE[0], UPPER_PLATE)).toBe(true)
    expect(ANODE_WIRE[ANODE_WIRE.length - 1]).toEqual([DIODE.baseX, DIODE.tip[1]])
    expect(CATHODE_WIRE[0]).toEqual(DIODE.tip)
    expect(on(CATHODE_WIRE[CATHODE_WIRE.length - 1], LOWER_PLATE)).toBe(true)
    for (const w of [ANODE_WIRE, CATHODE_WIRE]) for (let k = 1; k < w.length; k++) {
      expect(w[k][0] === w[k - 1][0] || w[k][1] === w[k - 1][1]).toBe(true)
    }
    // the wires stay clear of the feed leads at LEAD_X
    expect(ANODE_WIRE[0][0]).not.toBe(LEAD_X)
    expect(CATHODE_WIRE[CATHODE_WIRE.length - 1][0]).not.toBe(LEAD_X)
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
