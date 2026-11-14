import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
const layout = JSON.parse(readFileSync('content/layout.json', 'utf8'))
const content = JSON.parse(readFileSync('content/content.json', 'utf8'))

const title = (id: string) => (content as any).items.find((i: any) => i.id === id).title

test('projects map: canvas, node hover label, click navigates', async ({ page }) => {
  await page.goto('/?e2e#projects')
  await expect(page.locator('canvas')).toBeVisible()
  const id = (layout as any).sections.projects.nodes[0].id
  await page.waitForFunction(() => (window as any).__cm)
  await page.waitForTimeout(300)
  const p = await page.evaluate((i) => (window as any).__cm.nodeScreenPos(i), id)
  await page.mouse.move(p.x, p.y)
  await expect(page.locator('[data-hover-label]')).toHaveText(title(id))
  await page.mouse.click(p.x, p.y)
  await expect(page).toHaveURL(new RegExp(`#projects/${id}$`))
})

test('research map: empty space shows no cluster label', async ({ page }) => {
  await page.goto('/?e2e#research')
  await expect(page.locator('canvas')).toBeVisible()
  await page.mouse.move(5, 5)
  await expect(page.locator('[data-hover-label]')).toHaveText('')
})

test('visited node brightens after returning from item route', async ({ page }) => {
  await page.goto('/?e2e#projects')
  const id = layout.sections.projects.nodes[0].id
  await page.waitForFunction(() => (window as any).__cm?.visit)
  const b = () => page.evaluate((i) => (window as any).__cm.nodeBrightness(i), id)
  expect(await b()).toBeCloseTo(0.35, 2)
  await page.evaluate((i) => location.hash = `#projects/${i}`, id)
  await page.evaluate((i) => (window as any).__cm.visit(i), id)
  await page.evaluate(() => location.hash = '#projects')
  await expect.poll(b).toBeCloseTo(1, 2)
})
