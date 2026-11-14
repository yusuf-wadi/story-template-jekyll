import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

const content = JSON.parse(readFileSync('content/content.json', 'utf8'))
type It = { id: string; section: string; title: string; status: string | null }
const items: It[] = content.items
const mapped = new Set(content.sections.filter((s: { region: string | null }) => s.region).map((s: { id: string }) => s.id))
const allRegionIds = items.filter((i) => mapped.has(i.section)).map((i) => i.id)
const next = items.filter((i) => i.section === 'next')
const nowItems = next.filter((i) => i.status === 'now')
const laterItems = next.filter((i) => i.status !== 'now')

async function seed(page: Page, ids: string[], eggSeen: boolean) {
  await page.addInitScript(({ ids, eggSeen }) => {
    if (!sessionStorage.getItem('__seeded')) {
      localStorage.setItem('cm-progress-v1', JSON.stringify(ids))
      if (eggSeen) localStorage.setItem('cm-egg-seen-v1', '1')
      sessionStorage.setItem('__seeded', '1')
    }
  }, { ids, eggSeen })
}
/** Running sequence animations (the eye's idle glow is a CSS animation and does not count). */
const eggAnimations = (page: Page) => page.evaluate(() =>
  document.getAnimations().filter((a) => {
    if ((a as CSSAnimation).animationName) return false
    const t = (a.effect as KeyframeEffect | null)?.target as Element | null
    return a.playState === 'running' && !!t?.closest('[data-egg], .egg-pulse')
  }).length)
const eye = (page: Page) => page.locator('[data-egg-eye]')

test('completed circuit: links, two traces to an open eye; card lists Now/Next; rewire resets', async ({ page }) => {
  await seed(page, allRegionIds, true)
  await page.goto('/')
  await expect(eye(page)).toBeVisible()
  await expect(eye(page)).toHaveAttribute('data-state', 'open')
  await expect(eye(page)).toHaveAttribute('aria-label', "What I'm working on")
  expect(await eye(page).evaluate((e) => e.tagName)).toBe('BUTTON')
  await expect(page.locator('[data-egg-link]')).toHaveCount(7)
  await expect(page.locator('[data-egg-trace]')).toHaveCount(2)
  await expect(page.locator('.eye-rim.is-on')).toHaveCount(2) // head and bubble rims catch the eye's light

  await eye(page).click()
  const card = page.locator('[data-egg-card]')
  await expect(card).toBeVisible()
  if (nowItems.length) {
    const g = card.locator('[data-egg-group="now"]')
    await expect(g.locator('h3')).toHaveText('Now')
    for (const i of nowItems) await expect(g).toContainText(i.title)
  }
  if (laterItems.length) {
    const g = card.locator('[data-egg-group="next"]')
    await expect(g.locator('h3')).toHaveText('Next')
    for (const i of laterItems) await expect(g).toContainText(i.title)
  }
  await page.keyboard.press('Escape')
  await expect(card).toBeHidden()
  await expect(eye(page)).toBeFocused()
  await eye(page).click()
  await card.getByRole('button', { name: 'Close' }).click()
  await expect(card).toBeHidden()
  await expect(eye(page)).toBeFocused()

  await page.locator('[data-egg-rewire]').click()
  await expect(page.locator('[data-progress]')).toHaveText('0 / 5 regions wired')
  await expect(eye(page)).toHaveCount(0)
  await expect(page.locator('[data-egg-link], [data-egg-trace]')).toHaveCount(0)
  await expect(page.locator('.eye-rim.is-on')).toHaveCount(0)
  await expect(page.locator('.region.is-pcb')).toHaveCount(0)
  await expect(page.locator('.pcb-trace')).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('cm-egg-seen-v1'))).toBeNull()
})

test('the eye sits on the face: inside the silhouette, outside every lobe, at eye level', async ({ page }) => {
  await seed(page, allRegionIds, true)
  await page.goto('/')
  await expect(eye(page)).toBeVisible()
  const r = await page.evaluate(() => {
    const head = document.querySelector('.head-outline') as SVGPathElement
    const regions = [...document.querySelectorAll<SVGPathElement>('.region')]
    const shape = document.querySelector('.egg-eye-shape') as SVGPathElement // the symbol's outline: plates and curved plate
    const len = shape.getTotalLength()
    // eye-local → head source coordinates
    const m = (head.parentNode as SVGGraphicsElement).getCTM()!.inverse().multiply(shape.getCTM()!)
    let inHead = true, inLobe = false
    for (let s = 0; s < len; s += 1) {
      const p = shape.getPointAtLength(s)
      const q = new DOMPoint(p.x, p.y).matrixTransform(m)
      if (!head.isPointInFill(q)) inHead = false
      if (regions.some((g) => g.isPointInFill(q))) inLobe = true
    }
    return { inHead, inLobe }
  })
  expect(r).toEqual({ inHead: true, inLobe: false })
})

test('plays once with animation at completion, then loads in its final state instantly', async ({ page }) => {
  await seed(page, allRegionIds, false)
  await page.goto('/')
  await expect(page.locator('.egg-pulse').first()).toBeAttached({ timeout: 6000 })
  expect(await eggAnimations(page)).toBeGreaterThan(0)
  await expect(eye(page)).toHaveAttribute('data-state', 'open', { timeout: 10000 })
  await expect(page.locator('[data-egg-rewire]')).toBeVisible({ timeout: 4000 })
  expect(await page.evaluate(() => localStorage.getItem('cm-egg-seen-v1'))).toBe('1')
  await page.reload()
  await expect(eye(page)).toHaveAttribute('data-state', 'open')
  expect(await eggAnimations(page)).toBe(0)
  await expect(page.locator('.egg-pulse')).toHaveCount(0)
})

test('completing the last region in-session triggers the egg on return to the profile', async ({ page }) => {
  const last = allRegionIds[allRegionIds.length - 1]
  await seed(page, allRegionIds.filter((id) => id !== last), false)
  await page.goto('/')
  await expect(page.locator('[data-progress]')).toHaveText('4 / 5 regions wired')
  await expect(eye(page)).toHaveCount(0)
  const section = items.find((i) => i.id === last)!.section
  await page.goto(`/#${section}/${last}`)
  await expect(page.locator('.reader')).toBeVisible()
  await page.goto('/#')
  await expect(page.locator('.egg-pulse').first()).toBeAttached({ timeout: 6000 })
  await expect(eye(page)).toHaveAttribute('data-state', 'open', { timeout: 12000 })
})

test('leaving the profile mid-sequence settles the egg; the card never survives a hide', async ({ page }) => {
  const last = allRegionIds[allRegionIds.length - 1]
  const section = items.find((i) => i.id === last)!.section
  await seed(page, allRegionIds.filter((id) => id !== last), false)
  await page.goto(`/#${section}/${last}`) // completion happens here
  await expect(page.locator('.reader')).toBeVisible()
  await page.goto('/#')
  await expect(page.locator('.egg-pulse').first()).toBeAttached({ timeout: 6000 }) // sequence under way
  await page.goto(`/#${section}`)
  await expect(page.locator('[data-view="section"]')).toBeVisible()
  await page.goto('/#')
  await expect(eye(page)).toHaveAttribute('data-state', 'open')
  await expect(page.locator('.egg-pulse')).toHaveCount(0)
  expect(await eggAnimations(page)).toBe(0)
  await expect(page.locator('[data-egg-card]')).toBeHidden()

  // An open card closes when the profile hides, and Escape in a section doesn't reach it.
  await eye(page).click()
  await expect(page.locator('[data-egg-card]')).toBeVisible()
  await page.goto(`/#${section}`)
  await expect(page.locator('[data-view="section"]')).toBeVisible()
  await page.goto('/#')
  await expect(page.locator('[data-egg-card]')).toBeHidden()
  await expect(eye(page)).toHaveAttribute('aria-expanded', 'false')
})

test('storage that throws: the egg still plays and rewire still resets', async ({ page }) => {
  await page.addInitScript(() => {
    const boom = () => { throw new Error('denied') }
    Storage.prototype.getItem = boom
    Storage.prototype.setItem = boom
    Storage.prototype.removeItem = boom
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?e2e')
  await page.waitForFunction(() => (window as any).__cm?.visit)
  await page.evaluate((ids) => { for (const id of ids) (window as any).__cm.visit(id) }, allRegionIds)
  await expect(eye(page)).toHaveAttribute('data-state', 'open')
  await page.locator('[data-egg-rewire]').click()
  await expect(page.locator('[data-progress]')).toHaveText('0 / 5 regions wired')
  await expect(eye(page)).toHaveCount(0)
})

for (const vp of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test(`eye and card stay inside the viewport at ${vp.width}x${vp.height}; keyboard works`, async ({ page }) => {
    await page.setViewportSize(vp)
    await seed(page, allRegionIds, true)
    await page.goto('/')
    await expect(eye(page)).toBeVisible()
    const b = (await eye(page).boundingBox())!
    expect(b.x).toBeGreaterThanOrEqual(0)
    expect(b.x + b.width).toBeLessThanOrEqual(vp.width)
    expect(b.width).toBeGreaterThanOrEqual(24) // a usable hit target on phones too
    await eye(page).focus()
    await page.keyboard.press('Enter')
    const card = page.locator('[data-egg-card]')
    await expect(card).toBeVisible()
    const c = (await card.boundingBox())!
    expect(c.x).toBeGreaterThanOrEqual(0)
    expect(c.y).toBeGreaterThanOrEqual(0)
    expect(c.x + c.width).toBeLessThanOrEqual(vp.width)
    expect(c.y + c.height).toBeLessThanOrEqual(vp.height)
  })
}

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })
  test('first completion shows the final state instantly', async ({ page }) => {
    await seed(page, allRegionIds, false)
    await page.goto('/')
    await expect(eye(page)).toHaveAttribute('data-state', 'open')
    await expect(page.locator('[data-egg-rewire]')).toBeVisible()
    expect(await eggAnimations(page)).toBe(0)
    await expect(page.locator('.egg-pulse')).toHaveCount(0)
    const idle = await page.evaluate(() => document.getAnimations().filter((a) => (a as CSSAnimation).animationName).length)
    expect(idle).toBe(0) // no blink or glow pulse either
  })
})
