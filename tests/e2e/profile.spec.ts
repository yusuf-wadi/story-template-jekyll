import { test, expect } from '@playwright/test'

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
  await page.screenshot({ path: '.superpowers/sdd/2026-11-13-portfolio-v2/task-5-profile.png' })
  await page.locator('#region-frontal').click()
  await expect(page).toHaveURL(/#projects$/)
  await expect(page.locator('[data-view="section"]')).toBeVisible()
  await page.goto('/#')
  await page.locator('#region-temporal').focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#research$/)
})
