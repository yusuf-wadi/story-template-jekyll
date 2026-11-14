import type { Content, Region, SectionId } from '../types'
import type { Progress } from '../progress'
import { HEAD_SVG, REGION_IDS } from './head'
import { mountLight } from './light'
import { drawTraces, generatePcb, seedFor, type Pcb } from './pcb'

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
    `<div class="stage">${HEAD_SVG}<a class="writing-mark" data-writing-mark href="/writing/" aria-label="Writing"><svg viewBox="0 0 100 50" aria-hidden="true" focusable="false"><defs><linearGradient id="bubble-rim" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100" y2="50"><stop offset="0" stop-color="#fff" stop-opacity="0.5"/><stop offset="0.55" stop-color="#fff" stop-opacity="0.16"/><stop offset="1" stop-color="#fff" stop-opacity="0.06"/></linearGradient><linearGradient id="bubble-fill" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="42"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset="0.6" stop-color="#cfe4ff" stop-opacity="0.55"/><stop offset="1" stop-color="#fff" stop-opacity="0.08"/></linearGradient><radialGradient id="bubble-glow" cx="50%" cy="50%" r="60%"><stop offset="0.6" stop-color="#cfe4ff" stop-opacity="0"/><stop offset="1" stop-color="#cfe4ff" stop-opacity="0.07"/></radialGradient><linearGradient id="bubble-streak" gradientUnits="userSpaceOnUse" x1="14" y1="0" x2="70" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.4" stop-color="#fff" stop-opacity="0.2"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><path class="bubble-body" d="M14 2 H68 A12 12 0 0 1 80 14 V28 A12 12 0 0 1 68 40 L96 47 L52 40 H14 A12 12 0 0 1 2 28 V14 A12 12 0 0 1 14 2 Z"/><path class="bubble-glow" d="M14 2 H68 A12 12 0 0 1 80 14 V28 A12 12 0 0 1 68 40 H14 A12 12 0 0 1 2 28 V14 A12 12 0 0 1 14 2 Z"/><path class="bubble-streak" d="M16 5.5 H64 L62 8 H18 Z"/></svg><span class="bubble-text"><span class="bubble-title">Writing</span><span class="bubble-sub">thoughts</span></span></a></div>` +
    `<div class="region-label" data-region-label aria-live="polite"></div>` +
    `<div class="progress" data-progress></div>`
  el.querySelector('h1')!.textContent = content.person.name
  el.querySelector('header p')!.textContent = content.person.tagline
  const label = el.querySelector<HTMLElement>('[data-region-label]')!
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
    const pcb = generatePcb(p, ids, seedFor(REGION_IDS[region]))
    if (Object.keys(pcb.traces).length !== ids.length) return null
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
    p.addEventListener('focus', on)
    p.addEventListener('blur', off)
    p.addEventListener('click', () => onEnter(s.id))
    p.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); onEnter(s.id) }
    })
  }

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
    /** Resolves once pending trace animations have landed: true if every mapped region is a full PCB. */
    async whenWired(): Promise<boolean> {
      let p: Promise<unknown>
      do { p = pending; await p } while (p !== pending)
      return !el.hidden && mapped.every((s) => paths.get(s.region!)?.classList.contains('is-pcb'))
    },
    show() { if (el.hidden) { el.hidden = false; sync(true) } },
    hide() { el.hidden = true },
    setProgress,
  }
}
