import { describe, it, expect } from 'vitest'
import { layoutLabels, type LabelBox } from '../../src/map/labelLayout'
import { nodeRadius } from '../../src/map/graphView'

const box = (id: string, x: number, y: number, priority = 0, w = 80, h = 14): LabelBox => ({ id, x, y, w, h, priority })
const overlap = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

describe('layoutLabels', () => {
  it('leaves labels that do not touch alone', () => {
    const out = layoutLabels([box('a', 0, 0), box('b', 0, 40), box('c', 200, 0)])
    for (const id of ['a', 'b', 'c']) expect(out.get(id)).toEqual({ dy: 0, hidden: false })
  })
  it('nudges the lower-priority label vertically clear of the other', () => {
    const a = box('a', 0, 0, 5), b = box('b', 20, 6, 1)
    const out = layoutLabels([b, a])
    expect(out.get('a')).toEqual({ dy: 0, hidden: false })
    const nb = out.get('b')!
    expect(nb.hidden).toBe(false)
    expect(nb.dy).not.toBe(0)
    expect(overlap(a, { ...b, y: b.y + nb.dy })).toBe(false)
    expect(Math.abs(nb.dy)).toBeLessThanOrEqual(2 * 14 + 4)
  })
  it('hides the lowest-priority label when there is no room to nudge', () => {
    const stack = [box('a', 0, 0, 3), box('b', 0, -16, 2), box('c', 0, 16, 2), box('d', 0, -32, 2), box('e', 0, 32, 2), box('z', 0, 2, 0)]
    const out = layoutLabels(stack)
    expect(out.get('z')!.hidden).toBe(true)
    // nothing visible overlaps
    const vis = stack.filter((s) => !out.get(s.id)!.hidden).map((s) => ({ ...s, y: s.y + out.get(s.id)!.dy }))
    for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) expect(overlap(vis[i], vis[j])).toBe(false)
  })
  it('is deterministic: ties break by id', () => {
    const a = layoutLabels([box('b', 0, 0), box('a', 0, 3)])
    const b = layoutLabels([box('a', 0, 3), box('b', 0, 0)])
    expect(a).toEqual(b)
    expect(a.get('a')!.dy).toBe(0)
  })
})

describe('nodeRadius', () => {
  it('is small and only gently degree-driven, capped', () => {
    expect(nodeRadius(0)).toBeCloseTo(0.14)
    expect(nodeRadius(2)).toBeCloseTo(0.19)
    expect(nodeRadius(4)).toBeCloseTo(0.24)
    expect(nodeRadius(20)).toBe(0.3)
  })
})
