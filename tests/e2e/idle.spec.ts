import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
const layout = JSON.parse(readFileSync('content/layout.json', 'utf8'))
const tour: string[] = layout.sections.projects.tour

/** Count every requestAnimationFrame callback the page runs. */
async function countFrames(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __rafTicks: number }
    w.__rafTicks = 0
    const raf = window.requestAnimationFrame.bind(window)
    window.requestAnimationFrame = (cb) => raf((t) => { w.__rafTicks++; cb(t) })
  })
}
/** rAF callbacks run during the next `ms`. */
const ticksOver = (page: Page, ms: number) => page.evaluate((ms) => new Promise<number>((res) => {
  const w = window as unknown as { __rafTicks: number }
  const t0 = w.__rafTicks
  setTimeout(() => res(w.__rafTicks - t0), ms)
}), ms)
/** Poll until a full second passes with no frames (or fail after `timeout`). */
const settlesToZero = (page: Page, timeout = 20000) =>
  expect.poll(() => ticksOver(page, 1000), { timeout, intervals: [0] }).toBe(0)

test('auto-rotating section keeps animating (sanity)', async ({ page }) => {
  await countFrames(page)
  await page.goto('/?e2e#projects')
  await expect(page.locator('canvas')).toBeVisible()
  expect(await ticksOver(page, 1000)).toBeGreaterThan(20)
})

test('section goes idle after an interaction settles, and wakes on input', async ({ page }) => {
  await countFrames(page)
  await page.goto('/?e2e#projects')
  await expect(page.locator('canvas')).toBeVisible()
  // One drag on empty space: stops auto-rotate (an orbit), then damping and the sim settle.
  await page.mouse.move(40, 300)
  await page.mouse.down()
  await page.mouse.move(120, 320, { steps: 5 })
  await page.mouse.up()
  await settlesToZero(page)
  // Input wakes it.
  await page.mouse.move(400, 300)
  await page.mouse.move(420, 310)
  await page.mouse.move(40, 300)
  await page.mouse.down()
  await page.mouse.move(140, 300, { steps: 5 })
  await page.mouse.up()
  expect(await ticksOver(page, 300)).toBeGreaterThan(3)
  await settlesToZero(page)
})

test('an open card on desktop stops ticking once the camera is idle', async ({ page }) => {
  await countFrames(page)
  await page.goto(`/?e2e#projects/${tour[0]}`)
  await expect(page.getByRole('dialog')).toBeVisible()
  await settlesToZero(page)
  // The card still sits next to its node.
  const a = await page.evaluate((i) => (window as any).__cm.nodeAnchor(i), tour[0])
  const box = (await page.getByRole('dialog').boundingBox())!
  expect(Math.min(Math.abs(box.x - a.x), Math.abs(box.x + box.width - a.x))).toBeLessThan(120)
})
