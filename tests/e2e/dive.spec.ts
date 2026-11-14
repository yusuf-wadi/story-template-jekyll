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
  await page.waitForTimeout(400)
  expect(await diving(page)).toBe('in') // still mid-dive
  await page.keyboard.press('Escape')
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
  await page.waitForTimeout(300)
  await page.mouse.click(8, 8)
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
  await page.waitForTimeout(300)
  await page.locator('#region-temporal').click({ force: true })
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
