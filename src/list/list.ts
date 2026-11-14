import type { Content, Item, SectionId } from '../types'
import type { Progress } from '../progress'
import { esc, renderBody, safeHref } from '../reader/card'

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** Start of a free-text date range as a sortable number (year*12 + month), or null if it names no year. */
export function startKey(dates: string): number | null {
  const y = /\b(\d{4})\b/.exec(dates)
  if (!y) return null
  const m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i.exec(dates)
  const month = m && m.index < y.index ? MONTHS.indexOf(m[1]!.toLowerCase()) : 0
  return Number(y[1]) * 12 + month
}

/** Newest first by start date; an undated item keeps its place right after the item before it in content order. */
export function newestFirst<T extends { dates: string }>(items: T[]): T[] {
  let prev = Infinity
  const keyed = items.map((it, i) => {
    const k = startKey(it.dates)
    if (k !== null) prev = k
    return { it, k: k ?? prev, i }
  })
  return keyed.sort((a, b) => b.k - a.k || a.i - b.i).map((x) => x.it)
}

/** The list never shows "Now & next": those are revealed only through the egg in the 3D view. */
const HIDDEN: SectionId[] = ['next']

/** Scannable, accessible view of everything: no 3D, works without WebGL. Shows (never earns) 3D progress. */
export function renderList(root: HTMLElement, content: Content,
  opts: { backToBrain?: boolean; progress?: Pick<Progress, 'isVisited' | 'onChange'> } = {}): void {
  const { person } = content
  const { progress } = opts
  const links = (ls: { label: string; url: string }[]) =>
    ls.flatMap((l) => {
      const h = safeHref(l.url)
      return h ? [`<a href="${esc(h)}">${esc(l.label)}</a>`] : []
    }).join('')

  const article = (i: Item, timeline: boolean) => {
    const bid = `li-body-${esc(i.id)}`
    return `
    <article id="${esc(i.id)}" class="li" data-item="${esc(i.id)}" data-read="false">
      ${timeline ? '<span class="tl-pad" aria-hidden="true"></span>' : ''}
      <div class="li-head">
        <span class="li-mark" aria-hidden="true"></span>
        <h3 class="li-title"><button type="button" class="li-toggle" aria-expanded="false" aria-controls="${bid}">${esc(i.title)}<span class="sr-only li-state"></span></button></h3>
        ${i.dates ? `<p class="li-dates">${esc(i.dates)}</p>` : ''}
        <span class="li-chev" aria-hidden="true"></span>
        <p class="li-summary">${esc(i.summary)}</p>
        ${i.tags.length ? `<ul class="li-tags" aria-label="Tags">${i.tags.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      </div>
      <div class="li-body" id="${bid}" hidden>
        <div class="li-prose">${renderBody(i.body)}</div>
        ${i.links.length ? `<p class="li-links">${links(i.links)}</p>` : ''}
      </div>
    </article>`
  }

  const shown = content.sections.flatMap((s) => {
    if (HIDDEN.includes(s.id)) return []
    const items = content.items.filter((i) => i.section === s.id)
    return items.length ? [{ s, items }] : []
  })
  const sections = shown.map(({ s, items }) => {
    const tl = s.id === 'work'
    const list = (tl ? newestFirst(items) : items).map((i) => article(i, tl)).join('')
    return `<section class="list-sec" data-section="${s.id}" aria-labelledby="sec-${s.id}">
      <h2 id="sec-${s.id}" tabindex="-1">${esc(s.title)}<span class="list-count" aria-hidden="true">${items.length}</span></h2>
      ${tl ? `<div class="tl">${list}</div>` : list}
    </section>`
  }).join('')
  const bar = shown.map(({ s }) => `<a href="#sec-${s.id}" data-jump="${s.id}">${esc(s.title)}</a>`).join('')

  root.className = 'list-view'
  root.dataset.view = 'list'
  root.innerHTML = `
    <main class="list-main">
      <header class="list-intro list-wrap">
        <h1>${esc(person.name)}</h1>
        <p class="list-tagline">${esc(person.tagline)}</p>
        <p class="list-contact">
          <span class="list-email"><span data-email>${esc(person.email)}</span><button type="button" data-copy>Copy</button></span>
          ${links(person.links)}
          <a href="/writing/">Writing</a>
          <a class="list-back" href="#" ${opts.backToBrain === false ? 'hidden' : ''}>Back to the brain</a>
        </p>
      </header>
      <nav class="list-bar" aria-label="Sections"><div class="list-bar-inner list-wrap">${bar}</div></nav>
      <div class="list-wrap">${sections}</div>
    </main>`

  // Copy email, with a select-the-text fallback when the clipboard is unavailable.
  const email = root.querySelector<HTMLElement>('[data-email]')!
  const btn = root.querySelector<HTMLButtonElement>('[data-copy]')!
  btn.addEventListener('click', async () => {
    let ok = false
    try { await navigator.clipboard.writeText(person.email); ok = true } catch { ok = false }
    if (!ok) {
      const r = document.createRange()
      r.selectNodeContents(email)
      const sel = getSelection()
      sel?.removeAllRanges()
      sel?.addRange(r)
    }
    btn.textContent = ok ? 'Copied' : 'Press Ctrl/Cmd+C'
    setTimeout(() => { btn.textContent = 'Copy' }, 1800)
  })

  // Expand / collapse in place. Reading here is free: progress is earned only in the 3D view.
  root.querySelectorAll<HTMLButtonElement>('.li-toggle').forEach((t) => {
    t.addEventListener('click', () => {
      const open = t.getAttribute('aria-expanded') !== 'true'
      t.setAttribute('aria-expanded', String(open))
      root.querySelector<HTMLElement>(`#${CSS.escape(t.getAttribute('aria-controls')!)}`)!.hidden = !open
      t.closest('.li')!.classList.toggle('is-open', open)
    })
  })

  // Read markers mirror the graph: hollow ring = unread, filled dot with a blue ring = read.
  const paint = () => {
    root.querySelectorAll<HTMLElement>('.li').forEach((a) => {
      const read = !!progress?.isVisited(a.dataset.item!)
      a.dataset.read = String(read)
      a.querySelector('.li-state')!.textContent = read ? ' (read)' : ''
    })
  }
  paint()
  progress?.onChange(paint)

  // Section bar: jump without touching the hash router; highlight whichever section is under the bar.
  const reduce = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  const barInner = root.querySelector<HTMLElement>('.list-bar-inner')!
  const jumps = [...root.querySelectorAll<HTMLAnchorElement>('[data-jump]')]
  const setActive = (id: string) => {
    for (const j of jumps) {
      const on = j.dataset.jump === id
      if (on) j.setAttribute('aria-current', 'true')
      else j.removeAttribute('aria-current')
      // Keep the active pill in view on narrow screens, scrolling only the bar itself.
      if (on && barInner.scrollWidth > barInner.clientWidth) {
        const left = j.offsetLeft - (barInner.clientWidth - j.offsetWidth) / 2
        barInner.scrollTo({ left: Math.max(0, left), behavior: reduce() ? 'auto' : 'smooth' })
      }
    }
  }
  let lockUntil = 0
  for (const j of jumps) {
    j.addEventListener('click', (e) => {
      e.preventDefault()
      const h = root.querySelector<HTMLElement>(`#sec-${j.dataset.jump}`)!
      setActive(j.dataset.jump!)
      lockUntil = performance.now() + (reduce() ? 100 : 900) // let a smooth jump land before the observer takes over
      h.closest('section')!.scrollIntoView({ behavior: reduce() ? 'auto' : 'smooth', block: 'start' })
      h.focus({ preventScroll: true })
    })
  }
  if (jumps[0]) setActive(jumps[0].dataset.jump!)
  const secs = [...root.querySelectorAll<HTMLElement>('.list-sec')]
  /** The section whose top has passed a line just under the bar; the first above it, the last at the very bottom. */
  const pick = () => {
    if (performance.now() < lockUntil || !secs.length) return
    const top = root.getBoundingClientRect().top
    const line = top + root.clientHeight * 0.2
    const atEnd = root.scrollTop > 0 && root.scrollTop + root.clientHeight >= root.scrollHeight - 2
    const cur = atEnd ? secs[secs.length - 1]! : [...secs].reverse().find((s) => s.getBoundingClientRect().top <= line) ?? secs[0]!
    setActive(cur.dataset.section!)
  }
  if (typeof IntersectionObserver === 'function') {
    // A thin band just under the sticky bar: a section crossing it changes which one is current.
    const io = new IntersectionObserver(pick, { root, rootMargin: '-15% 0px -80% 0px' })
    secs.forEach((s) => io.observe(s))
  }
  // The last sections may never reach the band, so the very bottom also counts; a finished jump re-reads once.
  root.addEventListener('scroll', () => { if (root.scrollTop + root.clientHeight >= root.scrollHeight - 2) pick() }, { passive: true })
  root.addEventListener('scrollend', () => { lockUntil = 0; pick() })
}
