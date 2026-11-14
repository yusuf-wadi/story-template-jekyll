// Per-lobe printed circuit board: one copper trace per section item, routed on a grid inside the region
// outline (orthogonal + 45° only, no crossings) from an edge pad to a pin of a central chip.

export interface Pt { x: number; y: number }
export interface EdgePad extends Pt { toward: string | null }
export interface Pcb {
  /** One SVG path `d` per item id: edge pad → … → chip pin. */
  traces: Record<string, string>
  /** Chip pins (component pads), one per item, in item order. */
  pads: Pt[]
  /** Connector pads on the boundary, facing neighboring regions (`toward` = neighbor region id). */
  edgePads: EdgePad[]
  starts: Record<string, Pt>
  pins: Record<string, Pt & { dir: number }>
  vias: Record<string, Pt[]>
  chip: { x: number; y: number; w: number; h: number; pin1: Pt }
  /** Small unpopulated two-pad footprints in free board space (decor). */
  parts: { x: number; y: number; horizontal: boolean }[]
  pitch: number
}

const P = 6 // grid pitch (source units)
const MARGIN = 7 // keep copper this far inside the outline
const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]] as const
const NEIGHBOR_DIST = 50
/** Routing cost of a 45° / 90° turn (in grid steps): high enough that traces run long and straight, no short jogs. */
const TURN_45 = 4
const TURN_90 = 8

export function seedFor(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const empty = (): Pcb => ({
  traces: {}, pads: [], edgePads: [], starts: {}, pins: {}, vias: {},
  chip: { x: 0, y: 0, w: 0, h: 0, pin1: { x: 0, y: 0 } }, parts: [], pitch: P,
})

export function generatePcb(regionPath: SVGPathElement, itemIds: string[], seed: number): Pcb {
  const box = regionPath.getBBox()
  if (!box.width || !box.height) return empty()
  const gx0 = Math.floor(box.x / P) * P, gy0 = Math.floor(box.y / P) * P
  const W = Math.ceil((box.x + box.width - gx0) / P) + 1, H = Math.ceil((box.y + box.height - gy0) / P) + 1
  const X = (i: number) => gx0 + i * P, Y = (j: number) => gy0 + j * P
  const idx = (i: number, j: number) => j * W + i
  const inGrid = (i: number, j: number) => i >= 0 && j >= 0 && i < W && j < H
  const pt = new DOMPoint()
  const inside = (x: number, y: number) => { pt.x = x; pt.y = y; return regionPath.isPointInFill(pt) }

  // Safe cells: the cell centre and a ring of radius MARGIN around it are all inside the outline.
  const safe = new Uint8Array(W * H)
  const ring = Array.from({ length: 16 }, (_, k) => [Math.cos((k * Math.PI) / 8) * MARGIN, Math.sin((k * Math.PI) / 8) * MARGIN])
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = X(i), y = Y(j)
    if (inside(x, y) && ring.every(([dx, dy]) => inside(x + dx, y + dy))) safe[idx(i, j)] = 1
  }
  const isSafe = (i: number, j: number) => inGrid(i, j) && safe[idx(i, j)] === 1
  const boundary = new Uint8Array(W * H)
  const boundaryCells: [number, number][] = []
  let sx = 0, sy = 0, sn = 0
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    if (!isSafe(i, j)) continue
    sx += i; sy += j; sn++
    if (!isSafe(i + 1, j) || !isSafe(i - 1, j) || !isSafe(i, j + 1) || !isSafe(i, j - 1)) {
      boundary[idx(i, j)] = 1
      boundaryCells.push([i, j])
    }
  }
  const n = itemIds.length
  if (!sn || !n) return empty()
  const cx = sx / sn, cy = sy / sn
  const rand = rng(seed)

  // ---- chip footprint: QFP (4 sides) for 8+ items, else a 2-sided package across the region's long axis
  const four = n >= 8
  const wide = box.width >= box.height
  const k = four ? Math.ceil(n / 4) : Math.ceil(n / 2)
  const span = 2 * k + 1
  const bw = four ? span : wide ? 4 : span // body size in cells
  const bh = four ? span : wide ? span : 4
  type Pin = { i: number; j: number; dir: number }
  const pinsFor = (bx: number, by: number): Pin[] => {
    const out: Pin[] = []
    const side = (count: number, f: (t: number) => Pin) => { for (let t = 0; t < count; t++) out.push(f(t)) }
    const offs = (len: number, count: number) => {
      const first = Math.floor((len - (2 * count - 1)) / 2) + 0
      return (t: number) => first + 2 * t
    }
    if (four) {
      const per = [0, 0, 0, 0]
      for (let t = 0; t < n; t++) per[t % 4]++
      const o = (c: number) => offs(span, c)
      // order around the chip counter-clockwise from pin 1 (top of left side)
      side(per[0], (t) => ({ i: bx - 1, j: by + o(per[0])(t), dir: 4 }))
      side(per[1], (t) => ({ i: bx + o(per[1])(t), j: by + bh, dir: 2 }))
      side(per[2], (t) => ({ i: bx + bw, j: by + bh - 1 - o(per[2])(t), dir: 0 }))
      side(per[3], (t) => ({ i: bx + bw - 1 - o(per[3])(t), j: by - 1, dir: 6 }))
    } else {
      const a = Math.ceil(n / 2), b = n - a
      if (wide) {
        side(a, (t) => ({ i: bx - 1, j: by + offs(bh, a)(t), dir: 4 }))
        side(b, (t) => ({ i: bx + bw, j: by + bh - 1 - offs(bh, b)(t), dir: 0 }))
      } else {
        side(a, (t) => ({ i: bx + offs(bw, a)(t), j: by + bh, dir: 2 }))
        side(b, (t) => ({ i: bx + bw - 1 - offs(bw, b)(t), j: by - 1, dir: 6 }))
      }
    }
    return out
  }
  const ESC = 2
  let best: { bx: number; by: number; score: number } | null = null
  const jx = (rand() - 0.5) * 2, jy = (rand() - 0.5) * 2
  for (let by = 1; by < H - bh - 1; by++) for (let bx = 1; bx < W - bw - 1; bx++) {
    let ok = true
    for (let j = by - 1; ok && j <= by + bh; j++) for (let i = bx - 1; i <= bx + bw; i++) if (!isSafe(i, j)) { ok = false; break }
    if (!ok) continue
    for (const p of pinsFor(bx, by)) {
      const [dx, dy] = DIRS[p.dir]
      for (let s = 0; s <= ESC + 1; s++) if (!isSafe(p.i + dx * s, p.j + dy * s)) { ok = false; break }
      if (!ok) break
    }
    if (!ok) continue
    const score = Math.hypot(bx + (bw - 1) / 2 - cx - jx, by + (bh - 1) / 2 - cy - jy)
    if (!best || score < best.score) best = { bx, by, score }
  }
  if (!best) return empty()
  const { bx, by } = best
  const pins = pinsFor(bx, by)
  const ccx = bx + (bw - 1) / 2, ccy = by + (bh - 1) / 2

  // ---- connector pads on the boundary facing each neighboring region
  const connectors: { i: number; j: number; toward: string | null }[] = []
  const siblings = [...(regionPath.parentNode?.querySelectorAll<SVGPathElement>('path.region') ?? [])].filter((p) => p !== regionPath)
  const tooClose = (i: number, j: number, d: number) => connectors.some((c) => Math.max(Math.abs(c.i - i), Math.abs(c.j - j)) < d)
  const nearChip = (i: number, j: number) => i >= bx - 2 && i <= bx + bw + 1 && j >= by - 2 && j <= by + bh + 1
  const candidates = boundaryCells.filter(([i, j]) => !nearChip(i, j))
  for (const sib of siblings) {
    const len = sib.getTotalLength()
    const samples: Pt[] = []
    for (let s = 0; s < len; s += 3) { const q = sib.getPointAtLength(s); samples.push({ x: q.x, y: q.y }) }
    const dist = candidates.map(([i, j]) => {
      let m = Infinity
      for (const q of samples) m = Math.min(m, Math.hypot(q.x - X(i), q.y - Y(j)))
      return m
    })
    const min = Math.min(...dist)
    if (!(min < NEIGHBOR_DIST)) continue
    const facing = candidates.filter((_, t) => dist[t] <= min + P * 1.5)
    const mx = facing.reduce((a, c) => a + c[0], 0) / facing.length
    const my = facing.reduce((a, c) => a + c[1], 0) / facing.length
    const ranked = facing.slice().sort((a, b) => Math.hypot(a[0] - mx, a[1] - my) - Math.hypot(b[0] - mx, b[1] - my))
    const pick = ranked.find(([i, j]) => !tooClose(i, j, 4))
    if (pick) connectors.push({ i: pick[0], j: pick[1], toward: sib.id || null })
  }
  while (connectors.length < 2 && candidates.length) {
    // no (or one) neighbor: add the free boundary cell farthest from the chip and the other pads
    let far: [number, number] | null = null, fd = -1
    for (const [i, j] of candidates) {
      if (tooClose(i, j, 4)) continue
      const d = Math.hypot(i - ccx, j - ccy) + connectors.reduce((a, c) => a + Math.hypot(c.i - i, c.j - j), 0)
      if (d > fd) { fd = d; far = [i, j] }
    }
    if (!far) break
    connectors.push({ i: far[0], j: far[1], toward: null })
  }

  // ---- routing
  const pinAngle = (p: Pin) => Math.atan2(p.j - ccy, p.i - ccx)
  const angDiff = (a: number, b: number) => { const d = Math.abs(a - b) % (2 * Math.PI); return d > Math.PI ? 2 * Math.PI - d : d }
  type Route = { cells: [number, number][] }

  const attempt = (order: number[], connFor: Map<number, number>): Map<number, Route> | null => {
    const owner = new Int16Array(W * H).fill(-1) // -1 free, -2 chip body, else trace/pin index
    for (let j = by; j < by + bh; j++) for (let i = bx; i < bx + bw; i++) owner[idx(i, j)] = -2
    // reserve every pin and its straight escape for its own trace
    pins.forEach((p, t) => {
      const [dx, dy] = DIRS[p.dir]
      for (let s = 0; s <= ESC; s++) owner[idx(p.i + dx * s, p.j + dy * s)] = t
    })
    // reserve connectors for the pin assigned to them (unassigned connectors stay bare pads)
    const connOwner = new Map<number, number>()
    connectors.forEach((c, ci) => {
      let t = -3
      for (const [pin, cc] of connFor) if (cc === ci) t = pin
      owner[idx(c.i, c.j)] = t
      connOwner.set(idx(c.i, c.j), t)
    })
    const blockedFor = (t: number, i: number, j: number) => {
      if (!isSafe(i, j)) return true
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!inGrid(i + di, j + dj)) continue
        const o = owner[idx(i + di, j + dj)]
        if (o === -2 && (di === 0 && dj === 0)) return true
        if (o !== -1 && o !== -2 && o !== t) return true
      }
      return false
    }
    const routes = new Map<number, Route>()
    for (const t of order) {
      const p = pins[t]
      const [dx, dy] = DIRS[p.dir]
      const head: [number, number][] = []
      for (let s = 0; s <= ESC; s++) head.push([p.i + dx * s, p.j + dy * s])
      const [si, sj] = head[head.length - 1]
      const target = connFor.has(t) ? connectors[connFor.get(t)!] : null
      const isGoal = (i: number, j: number) =>
        target ? i === target.i && j === target.j
          : boundary[idx(i, j)] === 1 && !connectors.some((c) => Math.max(Math.abs(c.i - i), Math.abs(c.j - j)) < 3)
      // Dijkstra over (cell, heading); turns cost extra so traces run in long straight/45° segments
      const S = W * H * 8
      const dist = new Float64Array(S).fill(Infinity)
      const prev = new Int32Array(S).fill(-1)
      const heap: [number, number][] = []
      const push = (d: number, s: number) => {
        heap.push([d, s]); let c = heap.length - 1
        while (c > 0) { const pa = (c - 1) >> 1; if (heap[pa][0] <= heap[c][0]) break; [heap[pa], heap[c]] = [heap[c], heap[pa]]; c = pa }
      }
      const pop = () => {
        const top = heap[0], last = heap.pop()!
        if (heap.length) {
          heap[0] = last; let c = 0
          for (;;) {
            const l = 2 * c + 1, r = l + 1; let m = c
            if (l < heap.length && heap[l][0] < heap[m][0]) m = l
            if (r < heap.length && heap[r][0] < heap[m][0]) m = r
            if (m === c) break
            ;[heap[m], heap[c]] = [heap[c], heap[m]]; c = m
          }
        }
        return top
      }
      const s0 = idx(si, sj) * 8 + p.dir
      dist[s0] = 0; push(0, s0)
      let goal = -1
      while (heap.length) {
        const [d, s] = pop()
        if (d > dist[s]) continue
        const cell = (s / 8) | 0, h = s % 8
        const ci = cell % W, cj = (cell / W) | 0
        if (s !== s0 && isGoal(ci, cj)) { goal = s; break }
        for (const turn of [0, 1, -1, 2, -2]) {
          const nh = (h + turn + 8) % 8
          const [ddx, ddy] = DIRS[nh]
          const ni = ci + ddx, nj = cj + ddy
          if (!inGrid(ni, nj) || blockedFor(t, ni, nj)) continue
          if (ddx && ddy && (!isSafe(ci + ddx, cj) || !isSafe(ci, cj + ddy))) continue
          const step = ddx && ddy ? Math.SQRT2 : 1
          const nd = d + step + (turn === 0 ? 0 : Math.abs(turn) === 1 ? TURN_45 : TURN_90)
          const ns = (nj * W + ni) * 8 + nh
          if (nd < dist[ns]) { dist[ns] = nd; prev[ns] = s; push(nd, ns) }
        }
      }
      if (goal < 0) return null
      const tail: [number, number][] = []
      for (let s = goal; s !== s0; s = prev[s]) { const c = (s / 8) | 0; tail.push([c % W, (c / W) | 0]) }
      tail.reverse()
      const cells = [...head, ...tail]
      for (const [i, j] of cells) owner[idx(i, j)] = t
      routes.set(t, { cells })
    }
    return routes
  }

  // assign connectors to pins by angle around the chip, then route; retry with shuffled orders if blocked
  const connFor = new Map<number, number>()
  const usedPins = new Set<number>()
  connectors
    .map((c, ci) => ({ ci, a: Math.atan2(c.j - ccy, c.i - ccx) }))
    .slice(0, n)
    .forEach(({ ci, a }) => {
      let bestPin = -1, bd = Infinity
      pins.forEach((p, t) => { if (!usedPins.has(t) && angDiff(pinAngle(p), a) < bd) { bd = angDiff(pinAngle(p), a); bestPin = t } })
      if (bestPin >= 0) { usedPins.add(bestPin); connFor.set(bestPin, ci) }
    })
  const base = [...connFor.keys(), ...pins.map((_, t) => t).filter((t) => !connFor.has(t))]
  let routes: Map<number, Route> | null = null
  for (let a = 0; a < 40 && !routes; a++) {
    let order = base
    if (a > 0) {
      const rest = base.slice(connFor.size)
      for (let i = rest.length - 1; i > 0; i--) { const r = Math.floor(rand() * (i + 1)); [rest[i], rest[r]] = [rest[r], rest[i]] }
      const conn = base.slice(0, connFor.size)
      order = a % 2 ? [...conn, ...rest] : [...rest, ...conn]
    }
    routes = attempt(order, connFor)
  }
  if (!routes) return empty()

  // ---- emit geometry: polylines from the edge pad inward to the pin, collinear points merged
  const out = empty()
  out.chip = { x: X(bx) - P / 2, y: Y(by) - P / 2, w: bw * P, h: bh * P, pin1: { x: X(bx) + 1, y: Y(by) + 1 } }
  const occupied = new Uint8Array(W * H)
  itemIds.forEach((id, t) => {
    const cells = routes!.get(t)!.cells.slice().reverse()
    const pts: [number, number][] = [cells[0]]
    for (let c = 1; c < cells.length - 1; c++) {
      const [a, b, d] = [cells[c - 1], cells[c], cells[c + 1]]
      if ((b[0] - a[0]) !== (d[0] - b[0]) || (b[1] - a[1]) !== (d[1] - b[1])) pts.push(b)
    }
    pts.push(cells[cells.length - 1])
    for (const [i, j] of cells) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++)
      if (inGrid(i + di, j + dj)) occupied[idx(i + di, j + dj)] = 1
    out.traces[id] = pts.map(([i, j], q) => `${q ? 'L' : 'M'}${X(i)} ${Y(j)}`).join(' ')
    out.starts[id] = { x: X(cells[0][0]), y: Y(cells[0][1]) }
    const pin = pins[t]
    out.pins[id] = { x: X(pin.i), y: Y(pin.j), dir: pin.dir }
    out.pads.push({ x: X(pin.i), y: Y(pin.j) })
    // a via midway along the longest run, on about half the traces
    let longest = 0, at: Pt | null = null
    for (let q = 1; q < pts.length; q++) {
      const L = Math.max(Math.abs(pts[q][0] - pts[q - 1][0]), Math.abs(pts[q][1] - pts[q - 1][1]))
      if (L > longest) {
        longest = L
        const m = Math.floor(L / 2)
        const sx2 = Math.sign(pts[q][0] - pts[q - 1][0]), sy2 = Math.sign(pts[q][1] - pts[q - 1][1])
        at = { x: X(pts[q - 1][0] + sx2 * m), y: Y(pts[q - 1][1] + sy2 * m) }
      }
    }
    out.vias[id] = longest >= 6 && at && rand() < 0.6 ? [at] : []
  })
  for (let j = by - 1; j <= by + bh; j++) for (let i = bx - 1; i <= bx + bw; i++) if (inGrid(i, j)) occupied[idx(i, j)] = 1
  pins.forEach((p) => { const [dx, dy] = DIRS[p.dir]; for (let s = 0; s <= ESC + 1; s++) if (inGrid(p.i + dx * s, p.j + dy * s)) occupied[idx(p.i + dx * s, p.j + dy * s)] = 1 })
  out.edgePads = connectors.map((c) => ({ x: X(c.i), y: Y(c.j), toward: c.toward }))
  for (const c of connectors) for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++)
    if (inGrid(c.i + di, c.j + dj)) occupied[idx(c.i + di, c.j + dj)] = 1

  // ---- decor: a few unpopulated two-pad footprints in free, interior board space
  const free = (i: number, j: number) => isSafe(i, j) && !boundary[idx(i, j)] && !occupied[idx(i, j)]
  const wantParts = Math.max(1, Math.round(n / 2))
  const spots: [number, number, boolean][] = []
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const horizontal = rand() < 0.5
    const ok = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]].every(([di, dj]) => free(i + di, j + dj)) &&
      free(i + (horizontal ? 2 : 0), j + (horizontal ? 0 : 2)) && free(i - (horizontal ? 2 : 0), j - (horizontal ? 0 : 2))
    if (ok) spots.push([i, j, horizontal])
  }
  for (let s = 0; s < wantParts && spots.length; s++) {
    const [i, j, horizontal] = spots.splice(Math.floor(rand() * spots.length), 1)[0]
    out.parts.push({ x: X(i), y: Y(j), horizontal })
    for (let r = spots.length - 1; r >= 0; r--) if (Math.max(Math.abs(spots[r][0] - i), Math.abs(spots[r][1] - j)) < 4) spots.splice(r, 1)
  }
  return out
}

// ---------------------------------------------------------------- drawing

const NS = 'http://www.w3.org/2000/svg'
const DRAW_MS = 900
const svg = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, cls?: string) => {
  const e = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v))
  if (cls) e.setAttribute('class', cls)
  return e
}
const PIN_SIZE: Record<number, [number, number]> = { 0: [4.4, 2.6], 4: [4.4, 2.6], 2: [2.6, 4.4], 6: [2.6, 4.4] }

/** Static board layer: chip, pins, connectors, footprints. Built once per group. */
function buildBoard(group: SVGGElement, pcb: Pcb) {
  const board = svg('g', {}, 'pcb-board')
  const c = pcb.chip
  board.append(svg('rect', { x: c.x, y: c.y, width: c.w, height: c.h, rx: 1.5 }, 'pcb-chip'))
  board.append(svg('circle', { cx: c.pin1.x, cy: c.pin1.y, r: 1.4 }, 'pcb-pin1'))
  for (const [id, p] of Object.entries(pcb.pins)) {
    const [w, h] = PIN_SIZE[p.dir] ?? [3, 3]
    const pad = svg('rect', { x: p.x - w / 2, y: p.y - h / 2, width: w, height: h, rx: 0.5 }, 'pcb-pin')
    pad.dataset.pin = id
    board.append(pad)
  }
  for (const part of pcb.parts) {
    const [dx, dy] = part.horizontal ? [3.6, 0] : [0, 3.6]
    const g = svg('g', {}, 'pcb-part')
    g.append(svg('rect', { x: part.x - (part.horizontal ? 7 : 4), y: part.y - (part.horizontal ? 4 : 7), width: part.horizontal ? 14 : 8, height: part.horizontal ? 8 : 14, rx: 1 }, 'pcb-silk'))
    for (const s of [-1, 1]) g.append(svg('rect', { x: part.x + s * dx - 1.8, y: part.y + s * dy - 1.8, width: 3.6, height: 3.6, rx: 0.4 }, 'pcb-smd'))
    board.append(g)
  }
  const edge = svg('g', {}, 'pcb-edge')
  for (const e of pcb.edgePads) {
    const pad = svg('g', { transform: `translate(${e.x} ${e.y})` }, 'pcb-edge-pad')
    if (e.toward) pad.dataset.toward = e.toward
    pad.append(svg('rect', { x: -4.2, y: -4.2, width: 8.4, height: 8.4, rx: 1.2 }, 'pcb-edge-copper'))
    pad.append(svg('circle', { cx: 0, cy: 0, r: 1.6 }, 'pcb-hole'))
    edge.append(pad)
  }
  const traces = svg('g', {}, 'pcb-traces')
  group.append(board, traces, edge)
}

function makeTrace(pcb: Pcb, id: string) {
  const g = svg('g', {}, 'pcb-trace')
  g.dataset.trace = id
  const d = pcb.traces[id]
  const relief = svg('path', { d }, 'pcb-relief')
  const copper = svg('path', { d }, 'pcb-copper')
  const s = pcb.starts[id]
  const start = svg('circle', { cx: s.x, cy: s.y, r: 3 }, 'pcb-pad')
  const vias = pcb.vias[id].map((v) => {
    const via = svg('g', { transform: `translate(${v.x} ${v.y})` }, 'pcb-via')
    via.append(svg('circle', { r: 3 }), svg('circle', { r: 1.2 }, 'pcb-hole'))
    return via
  })
  g.append(relief, copper, start, ...vias)
  return { g, relief, copper, vias }
}

/** Show traces for `visible` ids; ids in `animateIds` draw in with a stroke-dash sweep (instant under reduced motion). */
export function drawTraces(group: SVGGElement, pcb: Pcb, visible: Set<string>, animateIds: Set<string>): Promise<void> {
  if (!group.querySelector('.pcb-traces')) buildBoard(group, pcb)
  const layer = group.querySelector<SVGGElement>('.pcb-traces')!
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  for (const el of [...layer.querySelectorAll<SVGGElement>('.pcb-trace')])
    if (!visible.has(el.dataset.trace!)) el.remove()
  const done: Promise<unknown>[] = []
  let stagger = 0
  for (const id of Object.keys(pcb.traces)) {
    const pin = group.querySelector(`[data-pin="${CSS.escape(id)}"]`)
    if (!visible.has(id)) { pin?.classList.remove('is-on'); continue }
    if (layer.querySelector(`[data-trace="${CSS.escape(id)}"]`)) { pin?.classList.add('is-on'); continue }
    const t = makeTrace(pcb, id)
    layer.append(t.g)
    if (!animateIds.has(id) || reduced) { pin?.classList.add('is-on'); continue }
    const len = t.copper.getTotalLength()
    const delay = stagger++ * 180
    const opts = { duration: DRAW_MS, delay, easing: 'cubic-bezier(.45,0,.2,1)', fill: 'backwards' as const }
    const draw = t.copper.animate(
      [{ strokeDasharray: `${len} ${len}`, strokeDashoffset: len }, { strokeDasharray: `${len} ${len}`, strokeDashoffset: 0 }], opts)
    t.relief.animate([{ opacity: 0 }, { opacity: 1 }], opts)
    for (const v of t.vias) v.animate([{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1 }], opts)
    done.push(draw.finished.then(() => pin?.classList.add('is-on'), () => pin?.classList.add('is-on')))
  }
  return Promise.all(done).then(() => undefined)
}
