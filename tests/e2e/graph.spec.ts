import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
const layout = JSON.parse(readFileSync('content/layout.json', 'utf8'))
const content = JSON.parse(readFileSync('content/content.json', 'utf8'))
const proj = layout.sections.projects
const title = (id: string) => content.items.find((i: any) => i.id === id).title

test('projects graph: a label per node with its title, edges match layout', async ({ page }) => {
  await page.goto('/?e2e#projects')
  await page.waitForFunction(() => (window as any).__cm?.edges)
  for (const n of proj.nodes) {
    expect(await page.evaluate((i) => (window as any).__cm.labelText(i), n.id)).toBe(title(n.id))
    await expect(page.locator(`[data-node-label="${n.id}"]`)).toHaveText(title(n.id))
  }
  expect(await page.evaluate(() => (window as any).__cm.edges().length)).toBe(proj.edges.length)
})

test('hovering a node dims non-neighbors and keeps neighbors lit', async ({ page }) => {
  await page.goto('/?e2e#projects')
  await page.waitForFunction(() => (window as any).__cm?.edges)
  await page.waitForTimeout(2000) // let the sim settle
  const nb = (id: string) => new Set(proj.edges.filter((e: string[]) => e.includes(id)).flat())
  const id = proj.nodes.map((n: any) => n.id).find((i: string) => nb(i).size - 1 < proj.nodes.length - 1)
  const near = [...nb(id)].find((i) => i !== id) as string
  const far = proj.nodes.map((n: any) => n.id).find((i: string) => !nb(id).has(i))
  const p = await page.evaluate((i) => (window as any).__cm.nodeScreenPos(i), id)
  await page.mouse.move(p.x, p.y)
  await expect(page.locator('[data-hover-label]')).toHaveText(title(id))
  const op = (i: string) => page.locator(`[data-node-label="${i}"]`).evaluate((el) => Number(getComputedStyle(el).opacity))
  await expect.poll(() => op(far)).toBeLessThan(0.3)
  await expect.poll(() => op(near)).toBeGreaterThan(0.6)
})
