import type { Content, Layout, SectionId } from './types'
import type { Progress } from './progress'
import { parseRoute, toHash, type Route } from './router'
import { mountProfile } from './profile/profile'
import { generatePcb, seedFor } from './profile/pcb'
import { createSectionScene } from './map/sectionScene'
import { mountReader } from './reader/reader'
import { step } from './tour'
import { playEgg } from './egg/egg'

export function startApp(root: HTMLElement, content: Content, layout: Layout, progress: Progress): void {
  // Navigate and render synchronously so rapid input (click then key) never sees a stale route.
  let lastHash: string | null = null
  function go(hash: string) {
    if (location.hash !== hash && !(hash === '' && location.hash === '')) location.hash = hash
    render()
  }
  const profile = mountProfile(root, {
    content,
    progress,
    onEnter: (section) => go(toHash({ view: 'section', section })),
  })
  // Placeholder for section/item/list views (replaced by Tasks 6/7/10).
  const placeholder = document.createElement('div')
  placeholder.hidden = true
  root.append(placeholder)

  const sceneHost = document.createElement('div')
  sceneHost.className = 'scene-host'
  sceneHost.hidden = true
  sceneHost.tabIndex = -1 // focus returns here when a card closes
  const hoverLabel = document.createElement('div')
  hoverLabel.className = 'hover-label'
  hoverLabel.dataset.hoverLabel = ''
  root.append(sceneHost, hoverLabel)
  const scene = createSectionScene(sceneHost, (id) => progress.isVisited(id))
  scene.onHover((l) => { hoverLabel.textContent = l ?? '' })
  scene.onNodeClick((id) => {
    if (currentSection) go(toHash({ view: 'item', section: currentSection, item: id }))
  })
  let currentSection: SectionId | null = null
  let currentRoute: Route = parseRoute(location.hash, content)
  const reader = mountReader(root, {
    track: (id) => scene.nodeAnchor(id),
    returnFocus: () => (sceneHost.hidden ? null : sceneHost),
  })
  reader.onNav((dir) => {
    if (currentRoute.view !== 'item') return
    const next = step(layout.sections[currentRoute.section].tour, currentRoute.item, dir)
    go(toHash({ view: 'item', section: currentRoute.section, item: next }))
  })
  reader.onBack(() => {
    if (currentRoute.view === 'item') go(toHash({ view: 'section', section: currentRoute.section }))
  })
  document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement | null
    if (e.defaultPrevented || e.key !== 'Escape' || currentRoute.view !== 'section' || reader.isOpen()) return
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
    go('')
  })
  progress.onChange(() => scene.refresh())

  // Easter egg: once every lobe is a full PCB the circuit closes. Plays animated once; later loads show it settled.
  const regionItemIds = content.sections.filter((s) => s.region)
    .map((s) => content.items.filter((i) => i.section === s.id).map((i) => i.id))
  const nextItems = content.items.filter((i) => i.section === 'next')
  let egg: { reset(): void } | null = null
  let eggPending = false
  const maybeEgg = async () => {
    if (egg || eggPending || profile.isHidden() || !progress.areAllComplete(regionItemIds)) return
    eggPending = true
    try {
      const wired = await profile.whenWired()
      if (!wired || egg || profile.isHidden() || !progress.areAllComplete(regionItemIds)) return
      egg = playEgg(profile.el, profile, nextItems, !progress.isEggSeen(), () => progress.reset())
      progress.markEggSeen()
    } finally {
      eggPending = false
    }
  }
  progress.onChange(() => {
    if (egg && !progress.areAllComplete(regionItemIds)) { egg.reset(); egg = null }
    void maybeEgg()
  })
  if (import.meta.env.DEV || location.search.includes('e2e')) {
    const w = window as unknown as { __cm?: object }
    w.__cm = Object.assign(w.__cm ?? {}, { visit: (id: string) => progress.visit(id), generatePcb, seedFor })
  }

  const render = () => {
    if (location.hash === lastHash) return
    lastHash = location.hash
    const route = parseRoute(location.hash, content)
    currentRoute = route
    scene.cancelTransitions()
    if (route.view !== 'item') reader.close()
    if (route.view === 'section' || route.view === 'item') {
      profile.hide()
      placeholder.hidden = true
      sceneHost.dataset.view = route.view
      if (route.view === 'item') progress.visit(route.item)
      scene.refresh()
      if (currentSection !== route.section) {
        currentSection = route.section
        const items = content.items.filter((i) => i.section === route.section)
        void scene.enter(route.section, layout.sections[route.section], items)
      }
      if (route.view === 'item') {
        const tour = layout.sections[route.section].tour
        const item = content.items.find((i) => i.id === route.item)!
        // Focus first: under reduced motion it jumps, and the card is placed against the final camera.
        void scene.focus(route.item)
        reader.open(item, { index: Math.max(0, tour.indexOf(route.item)), total: tour.length },
          scene.nodeAnchor(route.item) ?? undefined)
      } else void scene.focus(null)
      return
    }
    if (currentSection) { currentSection = null; void scene.exit(); hoverLabel.textContent = '' }
    if (route.view === 'profile') {
      placeholder.hidden = true
      profile.show()
      void maybeEgg()
      return
    }
    profile.hide()
    placeholder.dataset.view = route.view
    placeholder.textContent = route.view
    placeholder.hidden = false
  }
  window.addEventListener('hashchange', render)
  render()
}
