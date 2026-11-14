import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

test('profile shows name, five regions, progress, writing mark', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Yusuf Wadi').first()).toBeVisible()
  await expect(page.locator('[id^=region-]')).toHaveCount(5)
  await expect(page.locator('[data-progress]')).toHaveText('0 / 5 regions wired')
  await expect(page.locator('[data-writing-mark]')).toHaveAttribute('href', '/writing/')
})

test('hover shows label, click navigates, focus+Enter works', async ({ page }) => {
  await page.goto('/')
  await page.locator('#region-frontal').hover()
  await expect(page.locator('[data-region-label]')).toHaveText('Projects')
  await page.locator('#region-frontal').click()
  await expect(page).toHaveURL(/#projects$/)
  await expect(page.locator('[data-view="section"]')).toBeVisible()
  await page.goto('/#')
  await page.locator('#region-temporal').focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#research$/)
})

test('hovering a partly wired lobe lights a blue rim instead of greying the board', async ({ page }) => {
  const content = JSON.parse(readFileSync('content/content.json', 'utf8'))
  const id = content.items.find((i: any) => i.section === 'projects').id
  await page.goto('/?e2e')
  await page.waitForFunction(() => (window as any).__cm?.visit)
  await page.evaluate((i) => (window as any).__cm.visit(i), id) // the frontal board is now partly wired
  await expect(page.locator('[data-pcb-for="region-frontal"] .pcb-copper').first()).toBeAttached()
  const look = () => page.locator('#region-frontal').evaluate((el) => {
    const cs = getComputedStyle(el)
    return { fill: cs.fill, fillOpacity: Number(cs.fillOpacity), stroke: cs.stroke }
  })
  const rest = await look()
  await page.locator('#region-frontal').hover()
  await expect.poll(async () => (await look()).stroke).not.toBe(rest.stroke)
  const hot = await look()
  expect(hot.fill).toBe(rest.fill)
  expect(hot.fillOpacity).toBeLessThanOrEqual(rest.fillOpacity + 0.03)
  expect(hot.stroke).toMatch(/^rgb\((\d+), (\d+), 255\)$/) // electric blue, not white
})

test('cursor light does no work while the profile is hidden, and tracks the pointer when shown', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#region-frontal')).toBeVisible()
  const cx = () => page.evaluate(() => document.getElementById('head-light')!.getAttribute('cx'))
  const frames = (n: number) => page.evaluate((n) => new Promise<void>((res) => {
    const step = (k: number) => (k ? requestAnimationFrame(() => step(k - 1)) : res())
    step(n)
  }), n)
  await page.mouse.move(300, 300)
  await page.mouse.move(310, 305)
  await expect.poll(cx).not.toBeNull()
  // The light's gradient centre is in head source units: the inverse of the head <g> transform.
  const expected = await page.evaluate(() => {
    const stage = document.querySelector('.stage')!.getBoundingClientRect()
    const svg = document.querySelector<SVGSVGElement>('.stage > svg')!
    const g = svg.querySelector<SVGGElement>(':scope > g')!
    const m = g.transform.baseVal.consolidate()!.matrix
    const vb = svg.viewBox.baseVal
    const X = ((310 - stage.left) / stage.width) * vb.width, Y = ((305 - stage.top) / stage.height) * vb.height
    const inv = new DOMMatrix([m.a, m.b, m.c, m.d, m.e, m.f]).inverse()
    return inv.a * X + inv.c * Y + inv.e
  })
  await expect.poll(async () => Math.abs(Number(await cx()) - expected), { timeout: 3000 }).toBeLessThan(1)
  await page.evaluate(() => { location.hash = '#projects' })
  await expect(page.locator('canvas')).toBeVisible()
  const before = await cx()
  await page.mouse.move(900, 600)
  await page.mouse.move(950, 650)
  await frames(5)
  expect(await cx()).toBe(before)
})

test('share and crawler metadata come from content.json; noscript has the plain links', async ({ page }) => {
  const c = JSON.parse(readFileSync('content/content.json', 'utf8'))
  await page.goto('/')
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', c.person.tagline)
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', c.person.name)
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', c.person.tagline)
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary')
  const ns = await page.locator('noscript').innerHTML()
  expect(ns).toContain(c.person.name)
  for (const l of c.person.links) expect(ns).toContain(l.url)
  expect(ns).toContain('/writing/')
})
