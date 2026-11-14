import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
const layout = JSON.parse(readFileSync('content/layout.json', 'utf8'))
const content = JSON.parse(readFileSync('content/content.json', 'utf8'))
const tour: string[] = layout.sections.projects.tour
const title = (id: string) => content.items.find((i: { id: string }) => i.id === id).title
const activeId = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (document.activeElement as HTMLElement | null)?.id || (document.activeElement as HTMLElement | null)?.dataset?.nodeLabel || document.activeElement?.tagName)

test('keyboard path: profile → lobe → node → card → back to node → back to lobe', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#region-frontal')).toBeVisible()
  // Tab from the top of the page until the frontal lobe has focus.
  for (let i = 0; i < 12 && (await activeId(page)) !== 'region-frontal'; i++) await page.keyboard.press('Tab')
  expect(await activeId(page)).toBe('region-frontal')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#projects$/)
  // Entering a section focuses its first node in tour order; nodes are buttons.
  const node = (id: string) => page.locator(`[data-node-label="${id}"]`)
  await expect(node(tour[0])).toBeFocused()
  expect(await node(tour[0]).evaluate((e) => e.tagName)).toBe('BUTTON')
  await page.keyboard.press('Tab')
  await expect(node(tour[1])).toBeFocused()
  await expect(page.locator('[data-hover-label]')).toHaveText(title(tour[1]))
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(new RegExp(`#projects/${tour[1]}$`))
  const dlg = page.getByRole('dialog')
  await expect(dlg.getByRole('heading', { name: title(tour[1]) })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(/#projects$/)
  await expect(node(tour[1])).toBeFocused()
  await page.keyboard.press('Escape')
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('')
  await expect(page.locator('#region-frontal')).toBeFocused()
})

test('node buttons are in tour order; Shift+Tab from the first node reaches the Back pill', async ({ page }) => {
  await page.goto('/#projects')
  const order = await page.locator('[data-node-label]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.nodeLabel))
  expect(order).toEqual(tour)
  await expect(page.locator(`[data-node-label="${tour[0]}"]`)).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(page.getByRole('button', { name: 'Back to the brain' })).toBeFocused()
})

test('labels never block the pointer: a node under another node\'s label is still hovered', async ({ page }) => {
  await page.goto('/?e2e#projects')
  await expect(page.locator('[data-node-label]').first()).toBeAttached()
  expect(await page.locator('[data-node-label]').first().evaluate((e) => getComputedStyle(e).pointerEvents)).toBe('none')
})
