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
