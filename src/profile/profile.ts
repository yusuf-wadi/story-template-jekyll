import type { Content, Region, SectionId } from '../types'
import type { Progress } from '../progress'
import { HEAD_SVG, REGION_IDS } from './head'

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
  const lit = new Set<Region>()

  const setComplete = (region: Region, animate: boolean) => {
    const p = paths.get(region)
    if (!p) return
    p.classList.add('is-complete')
    if (animate && !lit.has(region)) {
      p.classList.add('is-pulse')
      p.addEventListener('animationend', () => p.classList.remove('is-pulse'), { once: true })
    }
    lit.add(region)
  }
  const refresh = (animate: boolean) => {
    let n = 0
    for (const s of mapped) if (isDone(s.id)) { n++; setComplete(s.region!, animate) }
    readout.textContent = `${n} / ${mapped.length} regions wired`
  }

  for (const s of mapped) {
    const p = el.querySelector<SVGPathElement>(`#${REGION_IDS[s.region!]}`)!
    paths.set(s.region!, p)
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

  progress.onChange(() => refresh(true))
  refresh(false)
  root.append(el)

  return {
    show() { el.hidden = false },
    hide() { el.hidden = true },
    setComplete,
  }
}
