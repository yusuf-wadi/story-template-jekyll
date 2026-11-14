import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
const layout = JSON.parse(readFileSync('content/layout.json', 'utf8'))
const content = JSON.parse(readFileSync('content/content.json', 'utf8'))
const title = (id: string) => content.items.find((i: any) => i.id === id).title
const regionIds: string[] = content.items
  .filter((i: any) => content.sections.find((s: any) => s.id === i.section)?.region)
  .map((i: any) => i.id)

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true })

const settle = async (page: Page) => {
  await page.waitForFunction(() => (window as any).__cm?.pixelRatio)
  await expect.poll(() => page.evaluate(() => (window as any).__cm.settled()), { timeout: 15000 }).toBe(true)
}

test('phone: renderer pixel ratio is capped at 1.5', async ({ page }) => {
  await page.goto('/?e2e#projects')
  await settle(page)
  expect(await page.evaluate(() => (window as any).__cm.pixelRatio())).toBe(1.5)
})

test('phone: first tap on a node shows its label, the second opens it', async ({ page }) => {
  await page.goto('/?e2e#projects')
  await settle(page)
  const id = layout.sections.projects.nodes[0].id
  const p = await page.evaluate((i) => (window as any).__cm.nodeScreenPos(i), id)
  await page.touchscreen.tap(p.x, p.y)
  await expect(page.locator('[data-hover-label]')).toHaveText(title(id))
  await page.waitForTimeout(150)
  expect(await page.evaluate(() => location.hash)).toBe('#projects')
  const q = await page.evaluate((i) => (window as any).__cm.nodeScreenPos(i), id)
  await page.touchscreen.tap(q.x, q.y)
  await expect(page).toHaveURL(new RegExp(`#projects/${id}$`))
})

test('phone: tapping empty space clears an armed label', async ({ page }) => {
  await page.goto('/?e2e#projects')
  await settle(page)
  const id = layout.sections.projects.nodes[0].id
  const p = await page.evaluate((i) => (window as any).__cm.nodeScreenPos(i), id)
  await page.touchscreen.tap(p.x, p.y)
  await expect(page.locator('[data-hover-label]')).toHaveText(title(id))
  await page.touchscreen.tap(195, 120)
  await expect(page.locator('[data-hover-label]')).toHaveText('')
  expect(await page.evaluate(() => location.hash)).toBe('#projects')
})

test('phone: the eye and the Writing bubble are comfortable tap targets (>= 44px)', async ({ page }) => {
  await page.addInitScript((ids) => {
    localStorage.setItem('cm-progress-v1', JSON.stringify(ids))
    localStorage.setItem('cm-egg-seen-v1', '1')
  }, regionIds)
  await page.goto('/')
  const eye = page.locator('.egg-eye-btn')
  await expect(eye).toBeVisible()
  for (const loc of [eye, page.locator('[data-writing-mark]')]) {
    const b = (await loc.boundingBox())!
    expect(b.width).toBeGreaterThanOrEqual(44)
    expect(b.height).toBeGreaterThanOrEqual(44)
  }
})

/** Arm a node with a first tap, open it with a second; returns the point of the opening tap. */
const tapOpen = async (page: Page, id: string) => {
  const p = await page.evaluate((i) => (window as any).__cm.nodeScreenPos(i), id)
  await page.touchscreen.tap(p.x, p.y)
  await expect(page.locator('[data-hover-label]')).toHaveText(title(id))
  const q = await page.evaluate((i) => (window as any).__cm.nodeScreenPos(i), id)
  await page.touchscreen.tap(q.x, q.y)
  return q as { x: number; y: number }
}

// Regression: the tap that opens a card used to have its compatibility mousedown/click retargeted onto the card that
// had just appeared under the finger (the card opens on pointerup, the click follows the touchend).
for (const motion of ['no-preference', 'reduce'] as const)
test(`phone: the tap that opens a card sends no mouse events or click into the card (motion: ${motion})`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: motion })
  await page.addInitScript(() => {
    ;(window as any).__cardHits = []
    for (const t of ['mousedown', 'mouseup', 'click'])
      document.addEventListener(t, (e) => {
        if ((e.target as Element).closest?.('.reader')) (window as any).__cardHits.push(t)
      }, true)
  })
  await page.goto('/?e2e#projects')
  await settle(page)
  for (const id of layout.sections.projects.nodes.slice(0, 3).map((n: any) => n.id)) {
    await tapOpen(page, id)
    await expect(page).toHaveURL(new RegExp(`#projects/${id}$`))
    await page.waitForTimeout(150)
    expect(await page.evaluate(() => (window as any).__cardHits)).toEqual([])
    await page.goBack()
    await expect(page).toHaveURL(/#projects$/)
  }
})

// Regression ("a white rectangle flashes and the card doesn't load"): on a real phone the tap's click can land a few
// frames late; the morphing card's still-invisible Back button sweeps under the finger, so that click collapsed the card.
test('phone: a click under the finger on any frame of the morph does not close the opening card', async ({ page }) => {
  await page.goto('/?e2e#projects')
  await settle(page)
  for (const id of layout.sections.projects.nodes.slice(0, 4).map((n: any) => n.id)) {
    const p = await page.evaluate((i) => (window as any).__cm.nodeScreenPos(i), id)
    await page.touchscreen.tap(p.x, p.y)
    await expect(page.locator('[data-hover-label]')).toHaveText(title(id))
    const q = await page.evaluate((i) => (window as any).__cm.nodeScreenPos(i), id)
    // Every frame until the card's content is shown, click whatever sits under the finger (a late click on that frame).
    await page.evaluate(({ x, y }) => {
      ;(window as any).__lateHits = []
      const t0 = performance.now()
      const tick = () => {
        const inner = document.querySelector<HTMLElement>('.reader-inner')
        if (inner && inner.style.opacity === '1') return
        const el = document.elementFromPoint(x, y) as HTMLElement | null
        if (el?.closest('.reader')) (window as any).__lateHits.push(el.tagName)
        el?.click()
        if (performance.now() - t0 < 1500) requestAnimationFrame(tick)
      }
      addEventListener('pointerup', () => requestAnimationFrame(tick), { once: true })
    }, q)
    await page.touchscreen.tap(q.x, q.y)
    await expect(page.locator('.reader-inner')).toHaveCSS('opacity', '1')
    await expect(page).toHaveURL(new RegExp(`#projects/${id}$`))
    expect(await page.evaluate(() => (window as any).__lateHits)).toEqual([])
    await page.goBack()
    await expect(page).toHaveURL(/#projects$/)
  }
})
