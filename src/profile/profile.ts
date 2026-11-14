import type { Content, Region, SectionId } from '../types'
import type { Progress } from '../progress'
import { HEAD_SVG, REGION_IDS } from './head'
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
    `<div class="stage">${HEAD_SVG}<a class="writing-mark" data-writing-mark href="/writing/">Writing</a></div>` +
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

  const sync = (animate: boolean) => {
    let n = 0
    for (const s of mapped) if (isDone(s.id)) n++
    readout.textContent = `${n} / ${mapped.length} regions wired`
    if (el.hidden) return
    for (const s of mapped) {
      const region = s.region!
      if (!pcbFor(region)) continue
      const visited = new Set(itemIds(s.id).filter((id) => progress.isVisited(id)))
      const fresh = new Set(animate ? [...visited].filter((id) => !drawn.has(id)) : [])
      for (const id of visited) drawn.add(id)
      void setProgress(region, visited, fresh)
    }
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

  return {
    show() { if (el.hidden) { el.hidden = false; sync(true) } },
    hide() { el.hidden = true },
    setProgress,
  }
}
