import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

const content = JSON.parse(readFileSync('content/content.json', 'utf8'))
// "Now & next" is revealed only through the egg in the 3D view, never in the list.
const shownSections = content.sections.filter((s: any) => s.id !== 'next')
const shownItems = content.items.filter((i: any) => i.section !== 'next')

test('#list shows every section and item title, email and copy button', async ({ page }, info) => {
  await page.goto('/#list')
  await expect(page.locator('.list-main h1')).toHaveText(content.person.name)
  for (const s of shownSections) await expect(page.locator('h2', { hasText: s.title }).first()).toBeVisible()
  for (const i of shownItems) await expect(page.locator('article h3', { hasText: i.title }).first()).toBeAttached()
  await expect(page.locator('section[data-section="next"]')).toHaveCount(0)
  for (const i of content.items.filter((x: any) => x.section === 'next')) await expect(page.locator(`article[data-item="${i.id}"]`)).toHaveCount(0)
  await expect(page.locator('article')).toHaveCount(shownItems.length)
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
  await expect(page.locator('article')).toHaveCount(shownItems.length)
  await page.goto('/#projects')
  await expect(page.locator('article')).toHaveCount(shownItems.length)
  await expect(page.getByRole('link', { name: /back to the brain/i })).toBeHidden()
})

test('back to the brain returns to the profile', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'needs WebGL')
  await page.goto('/#list')
  await page.getByRole('link', { name: /back to the brain/i }).click()
  await expect(page.locator('.profile')).toBeVisible()
})

test('if the app throws while starting, the list renders instead of a blank page', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'needs a WebGL-capable browser to break')
  // A context that claims WebGL but is unusable makes three throw inside startApp.
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (type.startsWith('webgl')) return {} as RenderingContext
      return (orig as (...a: unknown[]) => RenderingContext | null).call(this, type, ...rest)
    } as typeof orig
  })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await expect(page.locator('.list-main h1')).toHaveText(content.person.name)
  await expect(page.locator('article')).toHaveCount(shownItems.length)
  await expect(page.locator('.profile')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('without WebGL, Back leaves the site instead of bouncing back to #list', async ({ page }, info) => {
  test.skip(info.project.name !== 'no-webgl', 'WebGL-less project only')
  await page.goto('about:blank')
  await page.goto('/')
  await expect(page).toHaveURL(/#list$/)
  // In-page hash changes are forced back to #list by replacing the entry, not pushing a new one.
  const len = await page.evaluate(() => history.length)
  await page.evaluate(() => { location.hash = '#work' })
  await expect(page).toHaveURL(/#list$/)
  expect(await page.evaluate(() => history.length)).toBe(len + 1)
  await page.goBack() // #work was replaced by #list; Back returns to the first #list
  await expect(page).toHaveURL(/#list$/)
  await page.goBack() // and Back from there leaves the site
  await expect(page).toHaveURL('about:blank')
})

const items = shownItems as { id: string; section: string; title: string; dates: string; body: string }[]
const art = (page: any, id: string) => page.locator(`article[data-item="${id}"]`)
const toggle = (page: any, id: string) => art(page, id).locator('button[aria-expanded]')

test('items are collapsed by default and expand/collapse in place', async ({ page }) => {
  await page.goto('/#list')
  await expect(page.locator('button[aria-expanded="true"]')).toHaveCount(0)
  await expect(page.locator('button[aria-expanded="false"]')).toHaveCount(items.length)
  const id = items.find((i) => i.section === 'projects')!.id
  const btn = toggle(page, id)
  const body = page.locator(`#${await btn.getAttribute('aria-controls')}`)
  await expect(body).toBeHidden()
  await btn.click()
  await expect(btn).toHaveAttribute('aria-expanded', 'true')
  await expect(body).toBeVisible()
  await expect(body.locator('p').first()).toBeVisible()
  await btn.click()
  await expect(btn).toHaveAttribute('aria-expanded', 'false')
  await expect(body).toBeHidden()
  // keyboard: Enter and Space both toggle
  await btn.focus()
  await page.keyboard.press('Enter')
  await expect(btn).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('Space')
  await expect(btn).toHaveAttribute('aria-expanded', 'false')
})

test('expanding in the list does not earn progress (the 3D view is the only way in)', async ({ page }) => {
  await page.goto('/#list')
  const id = items.find((i) => i.section === 'projects')!.id
  await toggle(page, id).click()
  await expect(toggle(page, id)).toHaveAttribute('aria-expanded', 'true')
  await expect(art(page, id)).toHaveAttribute('data-read', 'false')
  expect(await page.evaluate(() => localStorage.getItem('cm-progress-v1'))).toBeNull()
  await page.reload()
  await expect(art(page, id)).toHaveAttribute('data-read', 'false')
})

test('progress earned in the graph shows on the list', async ({ page }) => {
  const id = items.find((i) => i.section === 'research')!.id
  await page.addInitScript((v) => localStorage.setItem('cm-progress-v1', JSON.stringify([v])), id)
  await page.goto('/#list')
  await expect(art(page, id)).toHaveAttribute('data-read', 'true')
})

test('section bar jumps to a section and highlights the current one', async ({ page }) => {
  await page.goto('/#list')
  const bar = page.getByRole('navigation', { name: 'Sections' })
  for (const s of shownSections) await expect(bar.getByRole('link', { name: s.title })).toBeVisible()
  await expect(bar.getByRole('link')).toHaveCount(shownSections.length)
  await bar.getByRole('link', { name: 'Research' }).click()
  await expect(page).toHaveURL(/#list$/)
  await expect(bar.getByRole('link', { name: 'Research' })).toHaveAttribute('aria-current', 'true')
  await expect(page.locator('#sec-research')).toBeInViewport()
  await expect(bar.locator('[aria-current="true"]')).toHaveCount(1)
  // the bar stays on screen while scrolling
  await expect(bar).toBeInViewport()
  // scrolling back to the top highlights the first section again
  await page.locator('.list-view').evaluate((el) => { el.scrollTop = 0 })
  await page.locator('#sec-projects').scrollIntoViewIfNeeded()
  await expect(bar.getByRole('link', { name: 'Projects' })).toHaveAttribute('aria-current', 'true')
})

test('work is a timeline with one pad per role', async ({ page }) => {
  await page.goto('/#list')
  const work = page.locator('section[data-section="work"]')
  await expect(work.locator('.tl')).toHaveCount(1)
  await expect(work.locator('.tl-pad')).toHaveCount(items.filter((i) => i.section === 'work').length)
})

test('mobile 390px: no horizontal page overflow, bar scrolls on its own', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#list')
  const id = items.find((i) => i.section === 'projects')!.id
  await toggle(page, id).click()
  const over = await page.evaluate(() => {
    const v = document.querySelector('.list-view')!
    return Math.max(document.documentElement.scrollWidth, v.scrollWidth) - window.innerWidth
  })
  expect(over).toBeLessThanOrEqual(0)
})
