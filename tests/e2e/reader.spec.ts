import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
const layout = JSON.parse(readFileSync('content/layout.json', 'utf8'))
const content = JSON.parse(readFileSync('content/content.json', 'utf8'))
const tour: string[] = layout.sections.projects.tour
const title = (id: string) => content.items.find((i: any) => i.id === id).title
const hash = (page: any) => page.evaluate(() => location.hash)

test('reader shows title and position, arrows step and wrap', async ({ page }) => {
  await page.goto(`/?e2e#projects/${tour[0]}`)
  const dlg = page.getByRole('dialog')
  await expect(dlg).toBeVisible()
  await expect(dlg.getByRole('heading', { name: title(tour[0]) })).toBeFocused()
  await expect(dlg).toContainText(`1 / ${tour.length}`)
  await page.keyboard.press('ArrowRight')
  await expect(page).toHaveURL(new RegExp(`#projects/${tour[1]}$`))
  await expect(dlg.getByRole('heading', { name: title(tour[1]) })).toBeVisible()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await expect(page).toHaveURL(new RegExp(`#projects/${tour[tour.length - 1]}$`))
})

test('Escape goes item -> section -> profile', async ({ page }) => {
  await page.goto(`/?e2e#projects/${tour[0]}`)
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(/#projects$/)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect.poll(() => hash(page)).toBe('')
  await expect(page.locator('[data-view="profile"]')).toBeVisible()
})

test('visited node persists after reload', async ({ page }) => {
  await page.goto(`/?e2e#projects/${tour[0]}`)
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.reload()
  await page.evaluate(() => (location.hash = '#projects'))
  await page.waitForFunction(() => (window as any).__cm)
  await expect.poll(() => page.evaluate((i) => (window as any).__cm.nodeBrightness(i), tour[0])).toBeCloseTo(1, 2)
})

test('interrupt: region click then Escape within 100ms lands on profile', async ({ page }) => {
  await page.goto('/')
  await page.locator('#region-frontal').click()
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-view="profile"]')).toBeVisible()
  await expect(page.locator('canvas')).toBeHidden()
  await expect.poll(() => hash(page)).toBe('')
})

test('interrupt: node click then ArrowRight shows next tour item', async ({ page }) => {
  await page.goto('/?e2e#projects')
  await page.waitForFunction(() => (window as any).__cm)
  await page.waitForTimeout(300)
  const p = await page.evaluate((i) => (window as any).__cm.nodeScreenPos(i), tour[0])
  await page.mouse.click(p.x, p.y)
  await page.keyboard.press('ArrowRight')
  await expect(page).toHaveURL(new RegExp(`#projects/${tour[1]}$`))
  await expect(page.getByRole('dialog').getByRole('heading', { name: title(tour[1]) })).toBeVisible()
})

test('browser back from item returns to section', async ({ page }) => {
  await page.goto('/?e2e#projects')
  await page.evaluate((i) => (location.hash = `#projects/${i}`), tour[0])
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(/#projects$/)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('mobile: reader is a bottom sheet; screenshot', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await page.goto(`/?e2e#projects/${tour[0]}`)
  const box = await page.getByRole('dialog').boundingBox()
  expect(box!.y).toBeGreaterThan(100)
  expect(box!.width).toBeGreaterThan(380)
})
