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
  await expect.poll(() => page.evaluate(() => (window as any).__cm.settled()), { timeout: 15000 }).toBe(true)
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
  const ring = () => page.evaluate((i) => (window as any).__cm.nodeRing(i), id)
  const label = () => page.locator(`[data-node-label="${id}"]`)
  // unvisited: hollow node, ring in its own cluster hue, muted label
  expect(await ring()).toMatchObject({ visited: false, wired: false })
  await expect(label()).not.toHaveClass(/is-visited/)
  await page.evaluate((i) => location.hash = `#projects/${i}`, id)
  await page.evaluate((i) => (window as any).__cm.visit(i), id)
  await page.evaluate(() => location.hash = '#projects')
  await expect.poll(b).toBeCloseTo(1, 2)
  // visited: solid node with the electric-blue "wired" ring, full-brightness label
  expect(await ring()).toMatchObject({ visited: true, wired: true, color: '#9be7ff' })
  await expect(label()).toHaveClass(/is-visited/)
})

test('the section Back control returns to the head, even with a card open', async ({ page }) => {
  await page.goto('/?e2e#projects')
  const back = page.getByRole('button', { name: 'Back to the brain' })
  await expect(back).toBeVisible()
  await back.click()
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('')
  await expect(page.locator('[data-view="profile"]')).toBeVisible()
  await expect(back).toBeHidden()
  const id = layout.sections.projects.nodes[0].id
  await page.evaluate((i) => (location.hash = `#projects/${i}`), id)
  await expect(page.getByRole('dialog')).toBeVisible()
  await back.focus()
  await page.keyboard.press('Enter')
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('[data-view="profile"]')).toBeVisible()
})
