import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

test('profile shows name, five regions, progress, writing mark', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Yusuf Wadi').first()).toBeVisible()
  await expect(page.locator('[id^=region-]')).toHaveCount(5)
  await expect(page.locator('[data-progress]')).toHaveText('0 / 5 regions wired')
  await expect(page.locator('[data-writing-mark]')).toHaveAttribute('href', '/writing/')
})

test('hover shows label, click navigates, focus+Enter works', async ({ page }) => {
  await page.goto('/')
  await page.locator('#region-frontal').hover()
  await expect(page.locator('[data-region-label]')).toHaveText('Projects')
  await page.locator('#region-frontal').click()
  await expect(page).toHaveURL(/#projects$/)
  await expect(page.locator('[data-view="section"]')).toBeVisible()
  await page.goto('/#')
  await page.locator('#region-temporal').focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#research$/)
})

test('hovering a partly wired lobe lights a blue rim instead of greying the board', async ({ page }) => {
  const content = JSON.parse(readFileSync('content/content.json', 'utf8'))
  const id = content.items.find((i: any) => i.section === 'projects').id
  await page.goto('/?e2e')
  await page.waitForFunction(() => (window as any).__cm?.visit)
  await page.evaluate((i) => (window as any).__cm.visit(i), id) // the frontal board is now partly wired
  await expect(page.locator('[data-pcb-for="region-frontal"] .pcb-copper').first()).toBeAttached()
  const look = () => page.locator('#region-frontal').evaluate((el) => {
    const cs = getComputedStyle(el)
    return { fill: cs.fill, fillOpacity: Number(cs.fillOpacity), stroke: cs.stroke }
  })
  const rest = await look()
  await page.locator('#region-frontal').hover()
  await expect.poll(async () => (await look()).stroke).not.toBe(rest.stroke)
  const hot = await look()
  expect(hot.fill).toBe(rest.fill)
  expect(hot.fillOpacity).toBeLessThanOrEqual(rest.fillOpacity + 0.03)
  expect(hot.stroke).toMatch(/^rgb\((\d+), (\d+), 255\)$/) // electric blue, not white
})
