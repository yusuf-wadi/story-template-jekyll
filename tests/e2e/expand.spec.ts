import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
const layout = JSON.parse(readFileSync('content/layout.json', 'utf8'))
const tour: string[] = layout.sections.projects.tour

/** Record the card's rect (and the node's anchor) at the moment it first becomes visible: its first painted frame. */
async function armFirstFrame(page: Page, id: string) {
  await page.evaluate((nodeId) => {
    const w = window as any
    const el = document.querySelector('.reader')!
    const obs = new MutationObserver(() => {
      if ((el as HTMLElement).hidden || w.__first) return
      const r = el.getBoundingClientRect()
      w.__first = { x: r.x, y: r.y, w: r.width, h: r.height, node: w.__cm.nodeScreenPos(nodeId), anchor: w.__cm.nodeAnchor(nodeId) }
      obs.disconnect()
    })
    obs.observe(el, { attributes: true, attributeFilter: ['hidden'] })
  }, id)
}

async function clickNode(page: Page, id: string) {
  await page.goto('/?e2e#projects')
  await page.waitForFunction(() => (window as any).__cm?.nodeAnchor)
  await page.waitForTimeout(1500) // let the sim settle so the click lands
  await armFirstFrame(page, id)
  const p = await page.evaluate((i) => (window as any).__cm.nodeScreenPos(i), id)
  await page.mouse.click(p.x, p.y)
}

test('clicking a node grows the card out of the node, then it settles beside it', async ({ page }) => {
  const id = tour[0]
  await clickNode(page, id)
  await expect(page).toHaveURL(new RegExp(`#projects/${id}$`))
  const f = await page.evaluate(() => (window as any).__first)
  expect(f, 'card became visible').toBeTruthy()
  expect(f.anchor.r).toBeGreaterThan(2)
  expect(Math.abs(f.x + f.w / 2 - f.node.x)).toBeLessThanOrEqual(8)
  expect(Math.abs(f.y + f.h / 2 - f.node.y)).toBeLessThanOrEqual(8)
  expect(f.w).toBeLessThanOrEqual(4 * f.anchor.r)
  // the start circle carries the node's colour
  expect(f.anchor.color).toMatch(/^#[0-9a-f]{6}$/)

  await page.waitForTimeout(600)
  const s = await page.evaluate((i) => {
    const r = document.querySelector('.reader')!.getBoundingClientRect()
    return { r: { x: r.x, y: r.y, w: r.width, h: r.height }, node: (window as any).__cm.nodeScreenPos(i), vw: innerWidth, vh: innerHeight }
  }, id)
  expect(s.r.w).toBeGreaterThanOrEqual(280)
  expect(s.r.w).toBeLessThanOrEqual(420)
  expect(s.r.x).toBeGreaterThanOrEqual(0)
  expect(s.r.y).toBeGreaterThanOrEqual(0)
  expect(s.r.x + s.r.w).toBeLessThanOrEqual(s.vw)
  expect(s.r.y + s.r.h).toBeLessThanOrEqual(s.vh)
  expect(s.r.h).toBeLessThanOrEqual(s.vh * 0.7 + 1)
  const dx = Math.max(s.r.x - s.node.x, 0, s.node.x - (s.r.x + s.r.w))
  const dy = Math.max(s.r.y - s.node.y, 0, s.node.y - (s.r.y + s.r.h))
  expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(48)
  // a11y contract survives
  const dlg = page.getByRole('dialog')
  await expect(dlg).toHaveAttribute('aria-modal', 'false')
  await expect(dlg.getByRole('heading', { level: 2 })).toBeFocused()
  await expect(dlg.getByRole('button', { name: /Back/ })).toBeVisible()
})

test('the card follows its node while the camera eases', async ({ page }) => {
  const id = tour[0]
  await clickNode(page, id)
  const gaps: number[] = []
  for (let k = 0; k < 4; k++) {
    await page.waitForTimeout(150)
    gaps.push(await page.evaluate((i) => {
      const r = document.querySelector('.reader')!.getBoundingClientRect()
      const n = (window as any).__cm.nodeScreenPos(i)
      return Math.hypot(Math.max(r.x - n.x, 0, n.x - r.right), Math.max(r.y - n.y, 0, n.y - r.bottom))
    }, id))
  }
  for (const g of gaps.slice(2)) expect(g).toBeLessThanOrEqual(48)
})

test('closing collapses the card back and returns focus to the graph', async ({ page }) => {
  const id = tour[0]
  await clickNode(page, id)
  await page.waitForTimeout(600)
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(/#projects$/)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.scene-host')).toBeFocused()
})

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })
  test('card appears without a morph', async ({ page }) => {
    const id = tour[0]
    await clickNode(page, id)
    await expect(page).toHaveURL(new RegExp(`#projects/${id}$`))
    const f = await page.evaluate(() => (window as any).__first)
    expect(f.w).toBeGreaterThanOrEqual(280)
    const anim = await page.evaluate(() => {
      const el = document.querySelector('.reader')!
      return {
        transition: getComputedStyle(el).transitionDuration,
        props: el.getAnimations().flatMap((a) => ((a.effect as KeyframeEffect).getKeyframes()).flatMap((k) => Object.keys(k))),
      }
    })
    expect(anim.transition.split(',').every((d) => parseFloat(d) === 0)).toBe(true) // no CSS transitions at all
    for (const p of anim.props) expect(['opacity', 'offset', 'easing', 'composite', 'computedOffset']).toContain(p)
  })
})

test('links with unsafe schemes are rendered as plain text', async ({ page }) => {
  await page.goto(`/?e2e#projects/${tour[0]}`)
  const hrefs = await page.getByRole('dialog').locator('a[href]').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).protocol))
  for (const p of hrefs) expect(['https:', 'http:', 'mailto:']).toContain(p)
})
