import type { Content, Region, SectionId } from '../types'
import type { Progress } from '../progress'
import { HEAD_SVG, REGION_IDS } from './head'
import { mountLight } from './light'
import { usingKeyboard } from '../modality'
import { drawTraces, fitPcb, seedFor, type Pcb } from './pcb'
import { DIVE_MS, EASE_CSS, FADE_MS, PARTICLES, diveZoom, type DiveFrom } from '../dive'

/** A dive measured while the profile was still on screen: the outline, and a frozen copy of the profile to push into. */
export interface PreparedDive { from: DiveFrom; ghost: HTMLElement }

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/** A static, inert copy of the profile for the push: no ids, hooks or focusables, paint servers renamed so they resolve. */
function ghostOf(el: HTMLElement): HTMLElement {
  const g = el.cloneNode(true) as HTMLElement
  const src = [el, ...el.querySelectorAll('*')]
  const dst = [g, ...g.querySelectorAll('*')]
  const urlRe = /url\("?[^"#)]*#([^")]+)"?\)/g
  src.forEach((s, i) => {
    const d = dst[i] as HTMLElement | SVGElement
    if (s instanceof SVGElement && !s.closest('defs')) {
      const cs = getComputedStyle(s)
      for (const prop of ['fill', 'stroke'] as const) {
        const v = cs[prop]
        if (v.includes('url(')) d.style[prop] = v.replace(urlRe, 'url("#dive-$1")')
      }
    }
    if (d.id) d.id = `dive-${d.id}`
    for (const a of [...d.attributes]) {
      if (a.name.startsWith('data-') || a.name === 'tabindex' || a.name === 'href' || a.name === 'role') d.removeAttribute(a.name)
    }
  })
  g.querySelectorAll('.egg-pulse').forEach((n) => n.remove())
  g.className = `dive-ghost${el.classList.contains('is-booted') ? ' is-booted' : ''}`
  g.dataset.dive = ''
  g.setAttribute('aria-hidden', 'true')
  g.inert = true
  return g
}

export interface ProfileOpts {
  content: Content
  progress: Progress
  onEnter(section: SectionId): void
}

export function mountProfile(root: HTMLElement, opts: ProfileOpts) {
  const { content, progress, onEnter } = opts
  const mapped = content.sections.filter((s) => s.region)
  const el = document.createElement('div')
  el.className = 'profile'
  el.dataset.view = 'profile'
  el.innerHTML =
    `<header class="profile-name"><h1></h1><p></p></header>` +
    `<a class="corner-link" href="#list">List view</a>` +
    `<div class="stage">${HEAD_SVG}<a class="writing-mark" data-writing-mark href="/writing/" aria-label="Writing"><svg viewBox="0 0 100 50" aria-hidden="true" focusable="false"><defs><linearGradient id="bubble-rim" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100" y2="50"><stop offset="0" stop-color="#fff" stop-opacity="0.5"/><stop offset="0.55" stop-color="#fff" stop-opacity="0.16"/><stop offset="1" stop-color="#fff" stop-opacity="0.06"/></linearGradient><linearGradient id="bubble-fill" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="42"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset="0.6" stop-color="#cfe4ff" stop-opacity="0.55"/><stop offset="1" stop-color="#fff" stop-opacity="0.08"/></linearGradient><radialGradient id="bubble-glow" cx="50%" cy="50%" r="60%"><stop offset="0.6" stop-color="#cfe4ff" stop-opacity="0"/><stop offset="1" stop-color="#cfe4ff" stop-opacity="0.07"/></radialGradient><linearGradient id="bubble-streak" gradientUnits="userSpaceOnUse" x1="14" y1="0" x2="70" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.4" stop-color="#fff" stop-opacity="0.2"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><path class="bubble-body" d="M14 2 H68 A12 12 0 0 1 80 14 V17 L97 21 L80 25 V28 A12 12 0 0 1 68 40 H14 A12 12 0 0 1 2 28 V14 A12 12 0 0 1 14 2 Z"/><path class="bubble-glow" d="M14 2 H68 A12 12 0 0 1 80 14 V28 A12 12 0 0 1 68 40 H14 A12 12 0 0 1 2 28 V14 A12 12 0 0 1 14 2 Z"/><path class="bubble-streak" d="M16 5.5 H64 L62 8 H18 Z"/></svg><span class="bubble-text"><span class="bubble-title">Writing</span><span class="bubble-sub">thoughts</span></span></a></div>` +
    `<div class="region-label" data-region-label aria-live="polite"></div>` +
    `<div class="progress" data-progress></div>`
  el.querySelector('h1')!.textContent = content.person.name
  el.querySelector('header p')!.textContent = content.person.tagline
  const label = el.querySelector<HTMLElement>('[data-region-label]')!
  const regionOf = new Map(mapped.map((s) => [s.id, s.region!]))
  const readout = el.querySelector<HTMLElement>('[data-progress]')!

  const itemIds = (id: SectionId) => content.items.filter((i) => i.section === id).map((i) => i.id)
  const isDone = (id: SectionId) => progress.isSectionComplete(itemIds(id))
  const paths = new Map<Region, SVGPathElement>()
  const groups = new Map<Region, SVGGElement>()
  const boards = new Map<Region, Pcb>()
  const itemsOf = new Map<Region, string[]>()
  // Trace ids already drawn this session: only ids visited since then animate when the profile shows again.
  const drawn = new Set<string>()

  const pcbFor = (region: Region): Pcb | null => {
    const cached = boards.get(region)
    if (cached) return cached
    const p = paths.get(region)
    if (!p || el.hidden || !p.isConnected) return null // geometry queries need a rendered path
    const ids = itemsOf.get(region) ?? []
    // Degrades (tighter grid, then a partial board) rather than failing, so content growth never strands a lobe.
    const pcb = fitPcb(p, ids, seedFor(REGION_IDS[region]))
    boards.set(region, pcb)
    return pcb
  }

  /** Wire a region's traces for `visitedIds`; `newlyVisited` ids draw in. Region becomes `.is-pcb` when every item is wired. */
  const setProgress = async (region: Region, visitedIds: Set<string>, newlyVisited: Set<string>) => {
    const p = paths.get(region), g = groups.get(region), pcb = pcbFor(region)
    if (!p || !g || !pcb) return
    const ids = itemsOf.get(region) ?? []
    const complete = ids.length > 0 && ids.every((id) => visitedIds.has(id))
    if (!complete) { p.classList.remove('is-pcb'); g.classList.remove('is-pcb') }
    await drawTraces(g, pcb, visitedIds, newlyVisited)
    // the last trace lands, then the mask fills and the edge pads light
    const still = ids.length > 0 && ids.every((id) => progress.isVisited(id))
    p.classList.toggle('is-pcb', still)
    g.classList.toggle('is-pcb', still)
  }

  // The latest sync's trace work; `whenWired` waits for it to settle.
  let pending: Promise<unknown> = Promise.resolve()
  const sync = (animate: boolean) => {
    let n = 0
    for (const s of mapped) if (isDone(s.id)) n++
    readout.textContent = `${n} / ${mapped.length} regions wired`
    if (el.hidden) return
    const work: Promise<void>[] = []
    for (const s of mapped) {
      const region = s.region!
      if (!pcbFor(region)) continue
      const visited = new Set(itemIds(s.id).filter((id) => progress.isVisited(id)))
      const fresh = new Set(animate ? [...visited].filter((id) => !drawn.has(id)) : [])
      for (const id of itemIds(s.id)) if (visited.has(id)) drawn.add(id); else drawn.delete(id)
      work.push(setProgress(region, visited, fresh))
    }
    pending = Promise.all(work)
  }

  for (const s of mapped) {
    const p = el.querySelector<SVGPathElement>(`#${REGION_IDS[s.region!]}`)!
    paths.set(s.region!, p)
    itemsOf.set(s.region!, itemIds(s.id))
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    g.setAttribute('class', 'pcb')
    g.setAttribute('aria-hidden', 'true')
    g.dataset.pcbFor = REGION_IDS[s.region!]
    p.parentNode!.append(g)
    groups.set(s.region!, g)
    p.setAttribute('tabindex', '0')
    p.setAttribute('role', 'link')
    p.setAttribute('aria-label', s.title)
    const on = () => { p.classList.add('is-hover'); label.textContent = s.title; label.classList.add('is-on') }
    const off = () => { p.classList.remove('is-hover'); label.classList.remove('is-on') }
    p.addEventListener('pointerenter', on)
    p.addEventListener('pointerleave', off)
    // Keyboard focus shows the label; focus from a click or from code after a pointer action doesn't add a hover.
    p.addEventListener('focus', () => { if (usingKeyboard()) on() })
    p.addEventListener('blur', off)
    p.addEventListener('click', () => onEnter(s.id))
    p.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); onEnter(s.id) }
    })
  }

  // ---- the dive's 2D half: a ghost of the profile pushes into the lobe; on the way back the profile pulls out of it
  let motion: { anims: Animation[]; ghost: HTMLElement | null } | null = null
  const settleMotion = () => {
    if (!motion) return
    const m = motion
    motion = null
    for (const a of m.anims) a.cancel()
    m.ghost?.remove()
    el.classList.remove('is-diving')
  }
  const track = (anims: Animation[], ghost: HTMLElement | null) => {
    const m = { anims, ghost }
    motion = m
    anims[0].onfinish = () => { if (motion === m) settleMotion() }
  }
  /** The lobe outline in viewport px (profile must be on screen and unmoved). */
  const diveFrom = (section: SectionId): DiveFrom | null => {
    const region = regionOf.get(section)
    const p = region ? paths.get(region) : null
    if (!p || el.hidden) return null
    settleMotion()
    const m = p.getScreenCTM()
    const len = p.getTotalLength()
    if (!m || !len) return null
    const pts = Array.from({ length: PARTICLES }, (_, i) => {
      const q = p.getPointAtLength((len * i) / PARTICLES)
      return { x: m.a * q.x + m.c * q.y + m.e, y: m.b * q.x + m.d * q.y + m.f }
    })
    const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y)
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
    const view = { w: window.innerWidth, h: window.innerHeight }
    return {
      pts,
      origin: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 },
      center: { x: view.w / 2, y: view.h / 2 },
      zoom: diveZoom({ w: x1 - x0, h: y1 - y0 }, view),
    }
  }
  const pushed = (from: DiveFrom) =>
    `translate(${(from.center.x - from.origin.x).toFixed(1)}px, ${(from.center.y - from.origin.y).toFixed(1)}px) scale(${from.zoom.toFixed(3)})`

  progress.onChange(() => sync(true))
  root.append(el)
  sync(false)

  const head = el.querySelector<SVGGElement>('.stage svg > g')!
  mountLight(el.querySelector<HTMLElement>('.stage')!)

  return {
    el,
    /** The head `<g>`: source coordinates shared by region outlines, PCBs and edge pads. */
    head,
    isHidden: () => el.hidden,
    /** Resolves once pending trace animations have landed: true if every mapped region is complete (from progress). */
    async whenWired(): Promise<boolean> {
      let p: Promise<unknown>
      do { p = pending; await p } while (p !== pending)
      return !el.hidden && mapped.every((s) => isDone(s.id))
    },
    show() { if (el.hidden) { el.hidden = false; sync(true) } },
    hide() {
      el.hidden = true
      for (const p of paths.values()) p.classList.remove('is-hover')
      label.classList.remove('is-on')
    },
    diveFrom,
    /** Put focus back on a section's lobe (after leaving that section). */
    focusRegion(section: SectionId) {
      const region = regionOf.get(section)
      const p = region ? paths.get(region) : null
      if (p && !el.hidden) p.focus({ preventScroll: true })
    },
    /** Measure a dive into `section`'s lobe and freeze a ghost of the profile, before the route hides it. */
    prepareDive(section: SectionId): PreparedDive | null {
      const from = diveFrom(section)
      return from ? { from, ghost: ghostOf(el) } : null
    },
    /** Push the ghost into the lobe and fade it (reduced motion: a 200ms fade). It removes itself when done. */
    playGhost(d: PreparedDive) {
      settleMotion()
      const g = d.ghost
      g.style.transformOrigin = `${d.from.origin.x}px ${d.from.origin.y}px`
      el.after(g)
      const anims = reducedMotion()
        ? [g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, fill: 'forwards' })]
        : [
            g.animate([{ transform: 'none' }, { transform: pushed(d.from) }], { duration: DIVE_MS, easing: EASE_CSS, fill: 'forwards' }),
            g.animate([{ opacity: 1 }, { opacity: 1, offset: 0.3 }, { opacity: 0, offset: 0.8 }, { opacity: 0 }], { duration: DIVE_MS, fill: 'forwards' }),
          ]
      track(anims, g)
    },
    /** The reverse: the (shown) profile pulls back out of the lobe while the nodes dissolve into its outline. */
    pullBack(from: DiveFrom) {
      settleMotion()
      el.classList.add('is-diving')
      el.style.transformOrigin = `${from.origin.x}px ${from.origin.y}px`
      const anims = reducedMotion()
        ? [el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS })]
        : [
            el.animate([{ transform: pushed(from) }, { transform: 'none' }], { duration: DIVE_MS, easing: EASE_CSS }),
            el.animate([{ opacity: 0 }, { opacity: 0, offset: 0.2 }, { opacity: 1, offset: 0.75 }, { opacity: 1 }], { duration: DIVE_MS }),
          ]
      track(anims, null)
    },
    /** End any push/pull at once (every route change does this before it renders). */
    settleMotion,
    setProgress,
  }
}
