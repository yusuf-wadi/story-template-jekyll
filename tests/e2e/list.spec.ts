import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

const content = JSON.parse(readFileSync('content/content.json', 'utf8'))

test('#list shows every section and item title, email and copy button', async ({ page }, info) => {
  await page.goto('/#list')
  await expect(page.locator('.list-main h1')).toHaveText(content.person.name)
  for (const s of content.sections) await expect(page.locator('h2', { hasText: s.title }).first()).toBeVisible()
  for (const i of content.items) await expect(page.locator('article h3', { hasText: i.title }).first()).toBeAttached()
  await expect(page.locator('article')).toHaveCount(content.items.length)
  await expect(page.locator('[data-email]')).toHaveText(content.person.email)
  await expect(page.locator('[data-copy]')).toBeVisible()
  if (info.project.name === 'chromium') await expect(page.getByRole('link', { name: /back to the brain/i })).toBeVisible()
  else await expect(page.getByRole('link', { name: /back to the brain/i })).toBeHidden()
})

test('copy button gives feedback', async ({ page, context }, info) => {
  void info
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/#list')
  await page.locator('[data-copy]').click()
  await expect(page.locator('[data-copy]')).toHaveText(/Copied/)
})

test('without WebGL, / ends on the list and other hashes stay on it', async ({ page }, info) => {
  test.skip(info.project.name !== 'no-webgl', 'WebGL-less project only')
  expect(await page.evaluate(() => {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  })).toBe(false)
  await page.goto('/')
  await expect(page).toHaveURL(/#list$/)
  await expect(page.locator('.list-main h1')).toHaveText(content.person.name)
  await expect(page.locator('article')).toHaveCount(content.items.length)
  await page.goto('/#projects')
  await expect(page.locator('article')).toHaveCount(content.items.length)
  await expect(page.getByRole('link', { name: /back to the brain/i })).toBeHidden()
})

test('back to the brain returns to the profile', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'needs WebGL')
  await page.goto('/#list')
  await page.getByRole('link', { name: /back to the brain/i }).click()
  await expect(page.locator('.profile')).toBeVisible()
})
