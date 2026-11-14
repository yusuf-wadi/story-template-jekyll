import type { Content, Item, SectionId } from '../types'
import { esc, renderBody, safeHref } from '../reader/card'
import { buildTrace, lengthAtY, loopFraction, type Trace } from './trace'

const MONTH = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?![a-z])/i
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const NOW = /\b(present|now|ongoing|current)\b/i
const monthKey = (d: Date) => d.getFullYear() * 12 + d.getMonth()

/**
 * A free-text date range as month keys (year*12 + month, Jan = 0), or null when it names no year and no "present".
 * Ranges split on – — & or " - "/" to "; a side without a year borrows the other side's ("May – Aug 2024");
 * a missing month means Jan for a start and Dec for an end ("2014 – 2022", "2026"); "present"/"Ongoing" is now.
 */
export function parseDates(dates: string, now: Date = new Date()): { start: number; end: number } | null {
  const parts = dates.trim().split(/\s*[–—&]\s*|\s+-\s+|\s+to\s+/i).filter(Boolean)
  if (!parts.length) return null
  const first = parts[0]!, last = parts[parts.length - 1]!
  const year = (p: string) => { const y = /\b(\d{4})\b/.exec(p); return y ? Number(y[1]) : null }
  const month = (p: string) => { const m = MONTH.exec(p); return m ? MONTHS.indexOf(m[1]!.toLowerCase()) : null }
  const nowK = monthKey(now)
  const endIsNow = NOW.test(last)
  const sy = year(first) ?? (endIsNow ? null : year(last))
  if (sy === null) return endIsNow ? { start: nowK, end: nowK } : null
  const start = sy * 12 + (month(first) ?? 0)
  const end = endIsNow ? nowK : (year(last) ?? sy) * 12 + (month(last) ?? 11)
  return { start, end: Math.max(start, end) }
}

/** Newest first: end date desc, then start date desc; undated items last, in content order. */
export function byTime<T extends { dates: string }>(items: T[], now: Date = new Date()): T[] {
  const keyed = items.map((it, i) => ({ it, i, d: parseDates(it.dates, now) }))
  return keyed.sort((a, b) => {
    if (!a.d || !b.d) return a.d ? -1 : b.d ? 1 : a.i - b.i
    return b.d.end - a.d.end || b.d.start - a.d.start || a.i - b.i
  }).map((x) => x.it)
}

/** The list never shows "Now & next": those are revealed only through the egg in the 3D view. */
const HIDDEN: SectionId[] = ['next']

/** Scannable, accessible view of everything: no 3D, works without WebGL, and no tie to the 3D view's progress. */
export function renderList(root: HTMLElement, content: Content, opts: { backToBrain?: boolean } = {}): void {
  const { person } = content
  const links = (ls: { label: string; url: string }[]) =>
    ls.flatMap((l) => {
      const h = safeHref(l.url)
      return h ? [`<a href="${esc(h)}">${esc(l.label)}</a>`] : []
    }).join('')

  const article = (i: Item) => {
    const bid = `li-body-${esc(i.id)}`
    return `
    <article id="${esc(i.id)}" class="li" data-item="${esc(i.id)}" data-lit="false">
      <span class="tl-pad" aria-hidden="true"></span>
      <div class="li-head">
        <h3 class="li-title"><button type="button" class="li-toggle" aria-expanded="false" aria-controls="${bid}">${esc(i.title)}</button></h3>
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
    const list = byTime(items).map(article).join('')
    return `<section class="list-sec" data-section="${s.id}" aria-labelledby="sec-${s.id}">
      <h2 id="sec-${s.id}" tabindex="-1" data-lit="false"><span class="list-h-title">${esc(s.title)}</span><span class="list-count" aria-hidden="true">${items.length}</span></h2>
      <div class="tl">${list}</div>
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
      <div class="list-wrap"><div class="list-traces">
        <svg class="trace" aria-hidden="true" focusable="false"><path class="trace-base"/><path class="trace-lit"/><g class="trace-loops"></g><rect class="trace-end" width="10" height="10" rx="2"/></svg>
        ${sections}
      </div></div>
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

  // Expand / collapse in place; the trace fill re-measures since pads move.
  root.querySelectorAll<HTMLButtonElement>('.li-toggle').forEach((t) => {
    t.addEventListener('click', () => {
      const open = t.getAttribute('aria-expanded') !== 'true'
      t.setAttribute('aria-expanded', String(open))
      root.querySelector<HTMLElement>(`#${CSS.escape(t.getAttribute('aria-controls')!)}`)!.hidden = !open
      t.closest('.li')!.classList.toggle('is-open', open)
      fill()
    })
  })

  // One continuous trace: down the spine, around each title, through every pad. Its lit length follows the
  // deepest scroll reached (a line 80% down the viewport), so it charges as you read and stays charged.
  const box = root.querySelector<HTMLElement>('.list-traces')!
  const svg = box.querySelector<SVGSVGElement>('svg.trace')!
  const base = svg.querySelector<SVGPathElement>('.trace-base')!
  const lit = svg.querySelector<SVGPathElement>('.trace-lit')!
  const end = svg.querySelector<SVGRectElement>('.trace-end')!
  const loopsG = svg.querySelector<SVGGElement>('.trace-loops')!
  const secEls = [...box.querySelectorAll<HTMLElement>('.list-sec')]
  const atBottom = () => root.scrollTop + root.clientHeight >= root.scrollHeight - 4
  let trace: Trace | null = null
  let reached = -Infinity // deepest line reached, in container px (Infinity once the bottom is hit)
  const layout = () => {
    const c = box.getBoundingClientRect()
    if (!c.height) return // hidden: measure once shown
    const firstPad = box.querySelector<HTMLElement>('.tl-pad')
    if (!firstPad) return
    const pr = firstPad.getBoundingClientRect()
    const x = pr.left + pr.width / 2 - c.left
    trace = buildTrace(x, secEls.map((sec) => {
      const t = sec.querySelector('.list-h-title')!.getBoundingClientRect()
      return {
        head: { top: t.top - c.top, bottom: t.bottom - c.top, left: t.left - c.left, right: t.right - c.left },
        pads: [...sec.querySelectorAll('.tl-pad')].map((p) => { const r = p.getBoundingClientRect(); return r.top + r.height / 2 - c.top }),
      }
    }))
    svg.setAttribute('viewBox', `0 0 ${c.width} ${c.height}`)
    svg.setAttribute('width', String(c.width))
    svg.setAttribute('height', String(c.height))
    base.setAttribute('d', trace.d)
    lit.setAttribute('d', trace.d)
    lit.style.strokeDasharray = `${trace.total} ${trace.total}`
    const last = trace.points[trace.points.length - 1]
    if (last) { end.setAttribute('x', String(last[0] - 5)); end.setAttribute('y', String(last[1])) }
    // Each title's ring: a dim arm, its lit copy, and the entry via drawn over both.
    loopsG.innerHTML = trace.loops.map((l) => `<path class="trace-base" d="${l.d}"/><path class="trace-lit loop-lit" d="${l.d}" style="stroke-dasharray:${l.length} ${l.length};stroke-dashoffset:${l.length}"/><circle class="trace-via" cx="${l.via[0]}" cy="${l.via[1]}" r="3.2"/>`).join('')
    paintTrace()
  }
  const paintTrace = () => {
    if (!trace) return
    const len = reached === Infinity ? trace.total : Math.min(trace.total, lengthAtY(trace, reached))
    lit.style.strokeDashoffset = String(trace.total - len)
    svg.dataset.litLength = len.toFixed(1)
    svg.dataset.total = trace.total.toFixed(1)
    const on = (at: number) => len >= at - 0.5
    secEls.forEach((sec, i) => {
      sec.querySelector('h2')!.dataset.lit = String(on(trace!.frameEnds[i]!))
      sec.querySelectorAll<HTMLElement>('.li').forEach((li, j) => { li.dataset.lit = String(on(trace!.padLens[i]![j]!)) })
    })
    end.classList.toggle('is-lit', on(trace.total))
    const depth = reached === Infinity ? Infinity : reached
    const arms = loopsG.querySelectorAll<SVGPathElement>('.loop-lit')
    const vias = loopsG.querySelectorAll<SVGCircleElement>('.trace-via')
    trace.loops.forEach((l, i) => {
      arms[i]!.style.strokeDashoffset = String(l.length * (1 - loopFraction(l, depth)))
      vias[i]!.classList.toggle('is-lit', depth >= l.via[1])
    })
  }
  const advance = () => {
    const c = box.getBoundingClientRect()
    if (!c.height) return
    const line = atBottom() && root.scrollTop > 0 ? Infinity : root.getBoundingClientRect().top + root.clientHeight * 0.8 - c.top
    if (line > reached) { reached = line; paintTrace() }
  }
  let frame = 0
  root.addEventListener('scroll', () => {
    if (frame) return
    frame = requestAnimationFrame(() => { frame = 0; advance() })
  }, { passive: true })
  // Expand/collapse, resize, fonts and being un-hidden all change the geometry: re-route the path.
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => { layout(); advance() }).observe(box)
  else window.addEventListener('resize', () => { layout(); advance() }, { passive: true })
  layout()
  advance()
  const fill = () => { layout(); advance() }

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
  const barEl = root.querySelector<HTMLElement>('.list-bar')!
  /** At the very bottom the last section; otherwise the one whose heading is nearest the top under the bar. */
  const pick = () => {
    if (performance.now() < lockUntil || !secs.length) return
    if (root.scrollTop > 0 && atBottom()) return setActive(secs[secs.length - 1]!.dataset.section!)
    const line = barEl.getBoundingClientRect().bottom + root.clientHeight * 0.15
    const cur = [...secs].reverse().find((s) => s.querySelector('h2')!.getBoundingClientRect().top <= line) ?? secs[0]!
    setActive(cur.dataset.section!)
  }
  if (typeof IntersectionObserver === 'function') {
    // A thin band just under the sticky bar: a section crossing it changes which one is current.
    const io = new IntersectionObserver(pick, { root, rootMargin: '-10% 0px -75% 0px' })
    secs.forEach((s) => io.observe(s))
  }
  // The last sections may never reach the band, so reaching the bottom also picks the last.
  root.addEventListener('scroll', () => { if (atBottom() && root.scrollTop > 0) pick() }, { passive: true })
  // A jump keeps its own target as current once it lands; the next scroll re-reads.
  root.addEventListener('scrollend', () => { lockUntil = 0 })
}
