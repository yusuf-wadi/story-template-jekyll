import { test, expect, type Page } from '@playwright/test'

const hash = (page: Page) => page.evaluate(() => location.hash)
const diving = (page: Page) => page.evaluate(() => (window as any).__cm.diving())
const reveal = (page: Page) => page.evaluate(() => (window as any).__cm.reveal())

test('dive: clicking a lobe pushes in, then the graph is fully revealed and the overlay is gone', async ({ page }) => {
  await page.goto('/?e2e')
  await page.waitForFunction(() => (window as any).__cm?.diving)
  await page.locator('#region-frontal').click()
  await expect(page).toHaveURL(/#projects$/)
  expect(await diving(page)).toBe('in')
  await expect(page.locator('[data-dive]')).toHaveCount(1)
  await expect.poll(() => diving(page), { timeout: 3000 }).toBe(null)
  await expect(page.locator('[data-dive]')).toHaveCount(0)
  expect(await reveal(page)).toBe(1)
  await expect(page.locator('canvas')).toBeVisible()
  await expect(page.locator('[data-view="profile"]')).toBeHidden()
})

test('interrupt: Escape mid-dive (~400ms) lands on the profile with no overlay or particles left', async ({ page }) => {
  await page.goto('/?e2e')
  await page.waitForFunction(() => (window as any).__cm?.diving)
  await page.locator('#region-frontal').click()
  await page.evaluate(() => (window as any).__cm.holdDive(0.33)) // pin the dive a third of the way in
  expect(await diving(page)).toBe('in') // still mid-dive
  await page.keyboard.press('Escape')
  await page.evaluate(() => (window as any).__cm.holdDive(null))
  // synchronous routing: the very next read already sees the route's state
  const now = await page.evaluate(() => ({
    hash: location.hash,
    overlay: document.querySelectorAll('[data-dive]').length,
    diving: (window as any).__cm.diving(),
    canvasHidden: !!document.querySelector('.scene-host')?.hasAttribute('hidden'),
    profileHidden: document.querySelector<HTMLElement>('[data-view="profile"]')!.hidden,
  }))
  expect(now).toEqual({ hash: '', overlay: 0, diving: null, canvasHidden: true, profileHidden: false })
  await expect(page.locator('[data-view="profile"]')).toBeVisible()
  await expect(page.locator('canvas')).toBeHidden()
  await expect(page.locator('[data-view="profile"]')).not.toHaveClass(/is-diving/)
})

test('interrupt: a click on the scene mid-dive finishes the dive at once', async ({ page }) => {
  await page.goto('/?e2e')
  await page.waitForFunction(() => (window as any).__cm?.diving)
  await page.locator('#region-frontal').click()
  await page.evaluate(() => (window as any).__cm.holdDive(0.25))
  expect(await diving(page)).toBe('in')
  await page.mouse.click(8, 8)
  await page.evaluate(() => (window as any).__cm.holdDive(null))
  expect(await diving(page)).toBe(null)
  expect(await reveal(page)).toBe(1)
  await expect(page.locator('[data-dive]')).toHaveCount(0)
  await expect(page).toHaveURL(/#projects$/)
})

test('exit reverses into the lobe; re-entering mid-reverse lands in the section', async ({ page }) => {
  await page.goto('/?e2e#projects')
  await page.waitForFunction(() => (window as any).__cm?.diving)
  await page.keyboard.press('Escape')
  expect(await hash(page)).toBe('')
  expect(await diving(page)).toBe('out')
  await expect(page.locator('[data-view="profile"]')).toBeVisible()
  await page.evaluate(() => (window as any).__cm.holdDive(0.25)) // mid-reverse
  await page.locator('#region-temporal').click({ force: true })
  await page.evaluate(() => (window as any).__cm.holdDive(null))
  await expect(page).toHaveURL(/#research$/)
  await expect(page.locator('[data-view="profile"]')).toBeHidden()
  await expect.poll(() => diving(page), { timeout: 3000 }).toBe(null)
  await expect(page.locator('canvas')).toBeVisible()
  // and a full reverse ends with the scene hidden
  await page.keyboard.press('Escape')
  await expect.poll(() => diving(page), { timeout: 3000 }).toBe(null)
  await expect(page.locator('canvas')).toBeHidden()
  await expect(page.locator('[data-view="profile"]')).not.toHaveClass(/is-diving/)
})

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })
  test('the dive is a short crossfade, no particles', async ({ page }) => {
    await page.goto('/?e2e')
    await page.waitForFunction(() => (window as any).__cm?.diving)
    await page.locator('#region-frontal').click()
    expect(await page.evaluate(() => (window as any).__cm.particles())).toBe(0)
    // 200ms fade; generous poll so a loaded CI box doesn't flake
    await expect.poll(() => diving(page), { timeout: 1000 }).toBe(null)
    await expect(page.locator('[data-dive]')).toHaveCount(0)
    await expect(page.locator('canvas')).toBeVisible()
  })
})

for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  test(`dive outline sits on its own lobe (${vp.width}x${vp.height})`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: vp, hasTouch: vp.width < 600, isMobile: vp.width < 600, deviceScaleFactor: vp.width < 600 ? 3 : 1 })
    const page = await ctx.newPage()
    for (const region of ['frontal', 'parietal', 'temporal', 'occipital', 'cerebellum']) {
      await page.goto('/?e2e')
      await page.waitForFunction(() => (window as any).__cm?.diving)
      const lobe = page.locator(`#region-${region}`)
      if (!(await lobe.count())) continue
      // The lobe's own rendered box, without its stroke (getBoundingClientRect includes it; the outline samples the path).
      const r = await lobe.evaluate((n: SVGGraphicsElement) => {
        const b = n.getBoundingClientRect(), g = n.getBBox()
        const half = ((parseFloat(getComputedStyle(n).strokeWidth) || 0) * b.width) / (g.width + parseFloat(getComputedStyle(n).strokeWidth)) / 2
        return { x: b.x + half, y: b.y + half, width: b.width - 2 * half, height: b.height - 2 * half }
      })
      await page.evaluate(() => (window as any).__cm.holdDive?.(null))
      await lobe.dispatchEvent('click')
      await page.evaluate(() => (window as any).__cm.holdDive(0)) // first frame of the dive
      await page.waitForFunction(() => (window as any).__cm.particles() > 0)
      const o = (await page.evaluate(() => (window as any).__cm.diveBounds()))!
      const w = Math.max(0, Math.min(o.x + o.width, r.x + r.width) - Math.max(o.x, r.x))
      const h = Math.max(0, Math.min(o.y + o.height, r.y + r.height) - Math.max(o.y, r.y))
      const iou = (w * h) / (o.width * o.height + r.width * r.height - w * h)
      expect(iou, `${region} outline ${JSON.stringify(o)} vs lobe ${JSON.stringify(r)}`).toBeGreaterThanOrEqual(0.9)
      await page.evaluate(() => (window as any).__cm.holdDive(null))
    }
    await ctx.close()
  })
}
