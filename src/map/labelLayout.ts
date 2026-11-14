// Screen-space label collision: higher-priority labels keep their place; a lower one is nudged vertically to the
// nearest free slot within a couple of line heights, or hidden if there is none. Pure, so it is unit-tested.

export interface LabelBox { id: string; x: number; y: number; w: number; h: number; priority: number }
export interface LabelPlacement { dy: number; hidden: boolean }

const PAD = 2

export function layoutLabels(boxes: LabelBox[]): Map<string, LabelPlacement> {
  const order = [...boxes].sort((a, b) => b.priority - a.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const placed: { x: number; y: number; w: number; h: number }[] = []
  const out = new Map<string, LabelPlacement>()
  const hits = (b: LabelBox, dy: number) => {
    const y = b.y + dy
    return placed.some((r) => b.x < r.x + r.w && r.x < b.x + b.w && y < r.y + r.h + PAD && r.y < y + b.h + PAD)
  }
  for (const b of order) {
    const max = 2 * b.h + 2 * PAD
    // candidate shifts: just below / just above every placed label in the same column band, nearest first
    const cands = [0]
    for (const r of placed) {
      if (!(b.x < r.x + r.w && r.x < b.x + b.w)) continue
      cands.push(r.y + r.h + PAD - b.y, r.y - PAD - b.h - b.y)
    }
    const ok = cands.filter((d) => Math.abs(d) <= max + 1e-9)
      .sort((p, q) => Math.abs(p) - Math.abs(q) || q - p)
      .find((d) => !hits(b, d))
    if (ok === undefined) { out.set(b.id, { dy: 0, hidden: true }); continue }
    const dy = ok === 0 ? 0 : ok // normalise -0
    out.set(b.id, { dy, hidden: false })
    placed.push({ x: b.x, y: b.y + dy, w: b.w, h: b.h })
  }
  return out
}
