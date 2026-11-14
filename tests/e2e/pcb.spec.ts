import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

const content = JSON.parse(readFileSync('content/content.json', 'utf8'))
const REGION_OF: Record<string, string> = {
  projects: 'frontal', work: 'parietal', research: 'temporal', worlds: 'occipital', craft: 'cerebellum',
}
const idsOf = (section: string): string[] =>
  content.items.filter((i: { section: string }) => i.section === section).map((i: { id: string }) => i.id)

async function seed(page: Page, ids: string[]) {
  await page.addInitScript((v) => {
    if (!sessionStorage.getItem('__seeded')) {
      localStorage.setItem('cm-progress-v1', JSON.stringify(v))
      sessionStorage.setItem('__seeded', '1')
    }
  }, ids)
}

const traceCount = (page: Page, region: string) =>
  page.locator(`[data-pcb-for="region-${region}"] .pcb-trace`)

test('generatePcb: one in-region, orthogonal/45°, non-crossing trace per item; deterministic; ≥2 edge pads', async ({ page }) => {
  await page.goto('/?e2e')
  await page.waitForFunction(() => (window as any).__cm?.generatePcb)
  for (const [section, region] of Object.entries(REGION_OF)) {
    const ids = idsOf(section)
    const r = await page.evaluate(({ rid, ids }) => {
      const cm = (window as any).__cm
      const path = document.getElementById(rid) as unknown as SVGPathElement
      const a = cm.generatePcb(path, ids, 1234)
      const b = cm.generatePcb(path, ids, 1234)
      const probe = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      path.parentNode!.append(probe)
      const outside: string[] = []
      const badAngle: string[] = []
      const polys: Record<string, number[][]> = {}
      for (const [id, d] of Object.entries(a.traces as Record<string, string>)) {
        const pts = [...d.matchAll(/(-?[\d.]+)[ ,](-?[\d.]+)/g)].map((m) => [+m[1], +m[2]])
        polys[id] = pts
        for (let i = 1; i < pts.length; i++) {
          const dx = Math.abs(pts[i][0] - pts[i - 1][0]), dy = Math.abs(pts[i][1] - pts[i - 1][1])
          if (!(dx < 1e-6 || dy < 1e-6 || Math.abs(dx - dy) < 1e-3)) badAngle.push(id)
        }
        probe.setAttribute('d', d)
        const len = probe.getTotalLength()
        for (let s = 0; s <= len; s += 1) {
          const p = probe.getPointAtLength(s)
          if (!path.isPointInFill(new DOMPoint(p.x, p.y))) { outside.push(`${id}@${p.x.toFixed(1)},${p.y.toFixed(1)}`); break }
        }
      }
      probe.remove()
      const cross = (p: number[], q: number[], r: number[], s: number[]) => {
        const o = (a: number[], b: number[], c: number[]) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]))
        const on = (a: number[], b: number[], c: number[]) =>
          Math.min(a[0], b[0]) <= c[0] && c[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= c[1] && c[1] <= Math.max(a[1], b[1])
        const o1 = o(p, q, r), o2 = o(p, q, s), o3 = o(r, s, p), o4 = o(r, s, q)
        if (o1 !== o2 && o3 !== o4) return true
        return (o1 === 0 && on(p, q, r)) || (o2 === 0 && on(p, q, s)) || (o3 === 0 && on(r, s, p)) || (o4 === 0 && on(r, s, q))
      }
      const crossings: string[] = []
      const keys = Object.keys(polys)
      for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
        const A = polys[keys[i]], B = polys[keys[j]]
        for (let m = 1; m < A.length; m++) for (let n = 1; n < B.length; n++)
          if (cross(A[m - 1], A[m], B[n - 1], B[n])) crossings.push(`${keys[i]}x${keys[j]}`)
      }
      const starts = new Set(Object.values(polys).map((p) => p[0].join(',')))
      const edgeIn = (a.edgePads as { x: number; y: number }[]).every((p) => path.isPointInFill(new DOMPoint(p.x, p.y)))
      return {
        keys, outside, badAngle, crossings, distinctStarts: starts.size, edgePads: a.edgePads.length, edgeIn,
        same: JSON.stringify(a) === JSON.stringify(b),
      }
    }, { rid: `region-${region}`, ids })
    expect(r.keys.sort(), region).toEqual([...ids].sort())
    expect(r.outside, region).toEqual([])
    expect(r.badAngle, region).toEqual([])
    expect(r.crossings, region).toEqual([])
    expect(r.distinctStarts, region).toBe(ids.length)
    expect(r.edgePads, region).toBeGreaterThanOrEqual(2)
    expect(r.edgeIn, region).toBe(true)
    expect(r.same, region).toBe(true)
  }
})

test('one visited research item → exactly one trace on the temporal PCB', async ({ page }) => {
  await seed(page, [idsOf('research')[0]])
  await page.goto('/')
  await expect(traceCount(page, 'temporal')).toHaveCount(1)
  await expect(traceCount(page, 'frontal')).toHaveCount(0)
  await expect(page.locator('#region-temporal')).not.toHaveClass(/is-pcb/)
})

test('all research items visited → temporal is a complete PCB and progress reads 1 / 5', async ({ page }) => {
  await seed(page, idsOf('research'))
  await page.goto('/')
  await expect(traceCount(page, 'temporal')).toHaveCount(idsOf('research').length)
  await expect(page.locator('#region-temporal')).toHaveClass(/is-pcb/)
  await expect(page.locator('[data-progress]')).toHaveText('1 / 5 regions wired')
})

test('an item visited in a section animates exactly its trace when back on the profile', async ({ page }) => {
  const [first, second] = idsOf('research')
  await seed(page, [first])
  await page.goto('/')
  await expect(traceCount(page, 'temporal')).toHaveCount(1)
  await page.goto(`/#research/${second}`)
  await expect(page.locator('.reader')).toBeVisible()
  await page.goto('/#')
  await expect(traceCount(page, 'temporal')).toHaveCount(2)
  const animating = await page.evaluate(() =>
    [...document.querySelectorAll('.pcb-trace')]
      .filter((t) => t.querySelector('.pcb-copper')!.getAnimations().some((a) => a.playState === 'running'))
      .map((t) => (t as HTMLElement).dataset.trace))
  expect(animating).toEqual([second])
})

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })
  test('traces appear instantly', async ({ page }) => {
    const [first, second] = idsOf('research')
    await seed(page, [first])
    await page.goto('/')
    await page.goto(`/#research/${second}`)
    await page.goto('/#')
    await expect(traceCount(page, 'temporal')).toHaveCount(2)
    const n = await page.evaluate(() => document.querySelectorAll('.pcb-copper').length &&
      [...document.querySelectorAll('.pcb-copper')].filter((c) => c.getAnimations().length).length)
    expect(n).toBe(0)
  })
})

test('capacity: every lobe fully routes its current item count + 2 (see README "Per-lobe item limits")', async ({ page }) => {
  await page.goto('/?e2e')
  await page.waitForFunction(() => (window as any).__cm?.fitPcb)
  for (const [section, region] of Object.entries(REGION_OF)) {
    const want = idsOf(section).length + 2
    const got = await page.evaluate(({ rid, want }) => {
      const cm = (window as any).__cm
      const path = document.getElementById(rid) as unknown as SVGPathElement
      const ids = Array.from({ length: want }, (_, i) => `extra-${i}`)
      return Object.keys(cm.fitPcb(path, ids, cm.seedFor(rid)).traces).length
    }, { rid: `region-${region}`, want })
    expect(got, `${region} (${section}) routed only ${got} of ${want} traces at current count + 2: ` +
      'the lobe is near its PCB capacity; see README "Per-lobe item limits"').toBe(want)
  }
})

test('over capacity: a lobe with far too many items still wires from progress and the egg still opens', async ({ page }) => {
  // Serve content with 40 extra Craft items (far past the cerebellum's routing capacity).
  const extra = Array.from({ length: 40 }, (_, i) => ({
    id: `extra-craft-${i}`, section: 'craft', title: `Extra ${i}`, dates: '', summary: 's', body: 'b', tags: [], links: [], status: null,
  }))
  const big = { ...content, items: [...content.items, ...extra] }
  await page.route(/\/content\/content\.json/, (route) =>
    route.fulfill({ contentType: 'text/javascript', body: `export default ${JSON.stringify(big)}` }))
  const all = big.items.filter((i: { section: string }) => i.section !== 'next').map((i: { id: string }) => i.id)
  await seed(page, all)
  await page.addInitScript(() => localStorage.setItem('cm-egg-seen-v1', '1'))
  await page.goto('/')
  await expect(page.locator('[data-progress]')).toHaveText('5 / 5 regions wired')
  await expect(page.locator('#region-cerebellum')).toHaveClass(/is-pcb/)
  const traces = await traceCount(page, 'cerebellum').count()
  expect(traces).toBeGreaterThan(0)
  expect(traces).toBeLessThan(idsOf('craft').length + 40)
  await expect(page.locator('[data-egg-eye]')).toBeVisible()
})
