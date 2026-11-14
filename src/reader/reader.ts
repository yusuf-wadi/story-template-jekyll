import type { Item } from '../types'
import { type Anchor, type Rect, type Side, esc, safeHref, renderBody, placeCard, MARGIN, CARD_MAX_W as MAX_W, SHEET_H, NARROW } from './card'

export type { Anchor }

export interface Reader {
  /** Grow a card out of the node at `anchor` (or the tracked node); an open card first collapses into its own node. */
  open(item: Item, pos: { index: number; total: number }, anchor?: Anchor): void
  /** Collapse the card back into its node. */
  close(): void
  isOpen(): boolean
  onNav(fn: (dir: 1 | -1) => void): void
  onBack(fn: () => void): void
}

export interface ReaderOptions {
  /** Live anchor of a node, read every frame so the card follows it while the camera eases. */
  track?: (id: string) => Anchor | null
  /** Where focus goes once the card closes. */
  returnFocus?: () => HTMLElement | null
}

const OPEN_MS = 350
/** Narrow screens: grow beside the node (first 60%), then settle into the bottom sheet. */
const SHEET_MS = 600
const SHEET_SPLIT = 0.6
const CLOSE_MS = 280
/** Collapse before the next node opens (←/→): a beat shorter so the tour keeps its pace. */
const SWAP_MS = 200
const FADE_MS = 120
const MAX_H = 0.7
const RADIUS = 14
const CARD_BG: [number, number, number] = [10, 11, 13]

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const easeOut = (t: number) => 1 - (1 - t) ** 3
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const mix = (a: number, b: number, k: number) => a + (b - a) * k
const mixRect = (a: Rect, b: Rect, k: number): Rect =>
  ({ x: mix(a.x, b.x, k), y: mix(a.y, b.y, k), w: mix(a.w, b.w, k), h: mix(a.h, b.h, k) })
function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [160, 160, 160]
}

export function mountReader(root: HTMLElement, opts: ReaderOptions = {}): Reader {
  const el = document.createElement('aside')
  el.className = 'reader'
  el.hidden = true
  el.setAttribute('role', 'dialog')
  el.setAttribute('aria-modal', 'false')
  el.setAttribute('aria-labelledby', 'reader-title')
  root.append(el)
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  let navFn: (dir: 1 | -1) => void = () => {}
  let backFn: () => void = () => {}
  let opened = false

  type Entry = { item: Item; pos: { index: number; total: number }; anchor?: Anchor }
  let cur: Entry | null = null
  let pending: Entry | null = null
  let phase: 'closed' | 'opening' | 'open' | 'closing' = 'closed'
  let p = 0
  let raf = 0
  let last = 0
  let side: Side = 'right'
  let lastAnchor: Anchor | null = null
  let size = { w: MAX_W, h: 0, natural: 0 }
  let inner: HTMLElement | null = null
  let fade: Animation | null = null

  const typing = (t: EventTarget | null) => {
    const n = t as HTMLElement | null
    return !!n && (n.tagName === 'INPUT' || n.tagName === 'TEXTAREA' || n.tagName === 'SELECT' || n.isContentEditable)
  }
  document.addEventListener('keydown', (e) => {
    if (!opened || typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
    if (e.key === 'ArrowRight') { e.preventDefault(); navFn(1) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); navFn(-1) }
    else if (e.key === 'Escape') { e.preventDefault(); backFn() }
  })

  let sx = 0, sy = 0
  el.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY }, { passive: true })
  el.addEventListener('touchend', (e) => {
    const t = e.changedTouches[0]
    const dx = t.clientX - sx
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(t.clientY - sy)) navFn(dx < 0 ? 1 : -1)
  }, { passive: true })

  const narrow = () => window.innerWidth <= NARROW
  const vp = () => ({ w: window.innerWidth, h: window.innerHeight })

  function anchorNow(): Anchor {
    const live = cur ? opts.track?.(cur.item.id) : null
    const a = live ?? lastAnchor ?? cur?.anchor
    if (a) lastAnchor = a
    return a ?? { x: vp().w / 2, y: vp().h / 2, r: 8, color: '#a0a0a0' }
  }

  function render(e: Entry) {
    const { item, pos } = e
    const links = item.links.map((l) => {
      const href = safeHref(l.url)
      return href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(l.label)}</a>` : `<span>${esc(l.label)}</span>`
    }).join('')
    el.innerHTML =
      `<div class="reader-inner">` +
      `<div class="reader-bar"><button type="button" data-back>&larr; Back</button>` +
      `<span class="reader-pos">${pos.index + 1} / ${pos.total}</span>` +
      `<span class="reader-nav"><button type="button" data-prev aria-label="Previous">&lsaquo;</button>` +
      `<button type="button" data-next aria-label="Next">&rsaquo;</button></span></div>` +
      `<h2 id="reader-title" tabindex="-1">${esc(item.title)}</h2>` +
      (item.dates ? `<p class="reader-dates">${esc(item.dates)}</p>` : '') +
      (item.summary ? `<p class="reader-summary">${esc(item.summary)}</p>` : '') +
      (item.tags.length ? `<p class="reader-tags">${item.tags.map((t) => `<span>${esc(t)}</span>`).join('')}</p>` : '') +
      `<div class="reader-body">${renderBody(item.body)}</div>` +
      (links ? `<p class="reader-links">${links}</p>` : '') +
      `</div>`
    inner = el.querySelector<HTMLElement>('.reader-inner')
    el.querySelector('[data-back]')!.addEventListener('click', () => backFn())
    el.querySelector('[data-prev]')!.addEventListener('click', () => navFn(-1))
    el.querySelector('[data-next]')!.addEventListener('click', () => navFn(1))
    el.scrollTop = 0
    cur = e
    lastAnchor = e.anchor ?? null
    side = 'right'
    el.inert = false
    el.removeAttribute('aria-hidden')
  }

  /** Card size at its final width; needs the element displayed. */
  function measure() {
    if (!inner) return
    const v = vp()
    const w = narrow() ? v.w : Math.min(MAX_W, v.w - 2 * MARGIN)
    inner.style.width = `${w}px`
    const natural = inner.offsetHeight
    size = { w, natural, h: Math.min(natural, Math.round(v.h * (narrow() ? SHEET_H : MAX_H))) }
  }

  function focusTitle() { el.querySelector<HTMLElement>('#reader-title')?.focus({ preventScroll: true }) }

  /** Lay the card out for anchor `a` at morph progress `t` (0 = the node itself, 1 = the settled card). */
  function apply(a: Anchor, t: number) {
    const v = vp()
    const circle: Rect = { x: a.x - a.r, y: a.y - a.r, w: 2 * a.r, h: 2 * a.r }
    let rect: Rect
    let k: number // 0..1: how far from "node" to "card" the surface has come
    let radii: string
    let content: number
    if (narrow()) {
      const card = placeCard(a, { w: v.w - 2 * MARGIN, h: Math.min(size.natural, v.h * 0.45) }, v)
      const sheet: Rect = { x: 0, y: v.h - size.h, w: v.w, h: size.h }
      const e1 = easeOut(clamp01(t / SHEET_SPLIT))
      const e2 = easeInOut(clamp01((t - SHEET_SPLIT) / (1 - SHEET_SPLIT)))
      rect = t <= SHEET_SPLIT ? mixRect(circle, card, e1) : mixRect(card, sheet, e2)
      k = e1
      const top = Math.min(mix(a.r, RADIUS, e1), rect.w / 2, rect.h / 2)
      const bottom = Math.min(mix(top, 0, e2), rect.h / 2)
      radii = `${top}px ${top}px ${bottom}px ${bottom}px`
      content = clamp01((t - 0.7) / 0.3)
    } else {
      const card = placeCard(a, size, v, side)
      side = card.side
      k = easeOut(t)
      rect = mixRect(circle, card, k)
      radii = `${Math.min(mix(a.r, RADIUS, k), rect.w / 2, rect.h / 2)}px`
      content = clamp01((k - 0.55) / 0.45)
    }
    const [nr, ng, nb] = rgb(a.color)
    const bg = clamp01((k - 0.08) / 0.5)
    const s = el.style
    s.left = `${rect.x}px`
    s.top = `${rect.y}px`
    s.width = `${rect.w}px`
    s.height = `${rect.h}px`
    s.borderRadius = radii
    s.backgroundColor = `rgba(${mix(nr, CARD_BG[0], bg)},${mix(ng, CARD_BG[1], bg)},${mix(nb, CARD_BG[2], bg)},${mix(1, 0.95, bg)})`
    s.borderColor = `rgba(${nr},${ng},${nb},${mix(0, 0.32, bg)})`
    s.boxShadow = `0 0 ${mix(18, 48, k)}px rgba(${nr},${ng},${nb},${mix(0.55, 0.14, k)}), 0 24px 60px rgba(0,0,0,${0.55 * k})`
    s.overflowY = t >= 1 ? 'auto' : 'hidden'
    if (inner) {
      inner.style.opacity = `${content}`
      inner.style.transform = content < 1 ? `translateY(${(1 - content) * 8}px)` : ''
    }
  }

  function finishClose() {
    phase = 'closed'
    p = 0
    stopLoop()
    el.hidden = true
    el.innerHTML = ''
    el.inert = false
    el.removeAttribute('aria-hidden')
    inner = null
    cur = null
    lastAnchor = null
  }

  function stopLoop() { if (raf) cancelAnimationFrame(raf); raf = 0 }
  function startLoop() {
    if (raf || reduced) return
    last = performance.now()
    raf = requestAnimationFrame(tick)
  }
  function tick(now: number) {
    raf = 0
    const dt = Math.min(50, Math.max(0, now - last))
    last = now
    if (phase === 'opening') {
      p = Math.min(1, p + dt / (narrow() ? SHEET_MS : OPEN_MS))
      if (p >= 1) phase = 'open'
    } else if (phase === 'closing') {
      p = Math.max(0, p - dt / (pending ? SWAP_MS : CLOSE_MS))
      if (p <= 0) {
        if (!pending) { finishClose(); return }
        const next = pending
        pending = null
        render(next)
        measure()
        phase = 'opening'
        focusTitle()
      }
    }
    apply(anchorNow(), p)
    // Settled sheets don't move; settled desktop cards keep following their node.
    if (phase !== 'open' || !narrow()) raf = requestAnimationFrame(tick)
  }

  function showReduced(e: Entry) {
    fade?.cancel()
    render(e)
    el.hidden = false
    measure()
    apply(e.anchor ?? anchorNow(), 1)
    phase = 'open'
    p = 1
    fade = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: 'ease-out' })
    focusTitle()
  }

  window.addEventListener('resize', () => {
    if (phase === 'closed') return
    measure()
    apply(anchorNow(), p)
    startLoop()
  })

  return {
    open(item, pos, anchor) {
      opened = true
      const e: Entry = { item, pos, anchor }
      if (reduced) { pending = null; showReduced(e); return }
      if (phase === 'closed') {
        render(e)
        apply(anchorNow(), 0) // the node itself, before the first paint
        el.hidden = false
        measure()
        phase = 'opening'
        p = 0
        focusTitle()
        startLoop()
        return
      }
      if (cur?.item.id === item.id) {
        // Same node (e.g. reopened mid-collapse): grow back out from wherever the surface is.
        pending = null
        el.querySelector('.reader-pos')!.textContent = `${pos.index + 1} / ${pos.total}`
        el.inert = false
        el.removeAttribute('aria-hidden')
        if (phase === 'closing') phase = 'opening'
        focusTitle()
        startLoop()
        return
      }
      // Another node: collapse into the current one first; the next grows once it has gone.
      pending = e
      phase = 'closing'
      el.inert = true
      el.setAttribute('aria-hidden', 'true')
      startLoop()
    },
    close() {
      const was = opened
      opened = false
      pending = null
      if (was) {
        const a = document.activeElement
        if (!a || a === document.body || el.contains(a)) opts.returnFocus?.()?.focus({ preventScroll: true })
      }
      if (phase === 'closed') return
      el.inert = true
      el.setAttribute('aria-hidden', 'true')
      if (reduced) {
        phase = 'closing'
        fade?.cancel()
        fade = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: 'ease-in', fill: 'forwards' })
        const f = fade
        f.finished.then(() => { if (fade === f && !opened) { f.cancel(); finishClose() } }, () => {})
        return
      }
      phase = 'closing'
      startLoop()
    },
    isOpen: () => opened,
    onNav(fn) { navFn = fn },
    onBack(fn) { backFn = fn },
  }
}
