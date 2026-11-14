import type { Content, Layout, SectionId } from './types'
import type { Progress } from './progress'
import { DIVE_MS, FADE_MS } from './dive'
import { parseRoute, toHash, type Route } from './router'
import { mountProfile, type PreparedDive } from './profile/profile'
import { fitPcb, generatePcb, seedFor } from './profile/pcb'
import { createSectionScene } from './map/sectionScene'
import { mountReader } from './reader/reader'
import { step } from './tour'
import { mountEyeHint, playEgg, type EyeHint } from './egg/egg'
import { renderList } from './list/list'

export function startApp(root: HTMLElement, content: Content, layout: Layout, progress: Progress, opts: { webgl?: boolean } = {}): void {
  if (opts.webgl === false) {
    // No WebGL: every route is the plain list, and it stays there.
    // Replace, never push: a pushed #list would make Back land on the old hash and get forced forward again.
    const force = () => { if (location.hash !== '#list') history.replaceState(null, '', '#list') }
    force()
    renderList(root, content, { backToBrain: false })
    window.addEventListener('hashchange', force)
    return
  }
  // Navigate and render synchronously so rapid input (click then key) never sees a stale route.
  let lastHash: string | null = null
  // A lobe click measures its dive before navigating; the render that enters the section plays it.
  let pendingDive: { section: SectionId; dive: PreparedDive | null } | null = null
  function go(hash: string) {
    if (location.hash !== hash && !(hash === '' && location.hash === '')) location.hash = hash
    render()
  }
  const profile = mountProfile(root, {
    content,
    progress,
    onEnter: (section) => {
      pendingDive = { section, dive: profile.prepareDive(section) }
      go(toHash({ view: 'section', section }))
    },
    // Each lobe wired short of the last charges the closed eye a little.
    onLobeWired: (wired, total) => { if (wired < total) hint?.flicker(wired, total) },
  })
  const listHost = document.createElement('div')
  listHost.hidden = true
  root.append(listHost)
  let listRendered = false

  const sceneHost = document.createElement('div')
  sceneHost.className = 'scene-host'
  sceneHost.hidden = true
  sceneHost.tabIndex = -1 // focus returns here when a card closes
  const hoverLabel = document.createElement('div')
  hoverLabel.className = 'hover-label'
  hoverLabel.dataset.hoverLabel = ''
  // Always-visible way back to the head (Escape and browser back still work). Lives in the scene host, so it is
  // only on screen with a section; with a card open it still goes straight home.
  const back = document.createElement('button')
  back.type = 'button'
  back.className = 'section-back'
  back.setAttribute('aria-label', 'Back to the brain')
  back.innerHTML = '<span aria-hidden="true">←</span> Back'
  back.addEventListener('click', () => go(''))
  sceneHost.append(back)
  root.append(sceneHost, hoverLabel)
  const scene = createSectionScene(sceneHost, (id) => progress.isVisited(id))
  scene.onHover((l) => { hoverLabel.textContent = l ?? '' })
  scene.onNodeClick((id) => {
    if (currentSection) go(toHash({ view: 'item', section: currentSection, item: id }))
  })
  let currentSection: SectionId | null = null
  let currentRoute: Route = parseRoute(location.hash, content)
  /** The item whose card is (or was last) open: closing the card returns focus to its node button. */
  let openItem: string | null = null
  const reader = mountReader(root, {
    track: (id) => scene.nodeAnchor(id),
    returnFocus: () => (sceneHost.hidden ? null : (openItem ? scene.nodeButton(openItem) : null) ?? sceneHost),
  })
  scene.onFrame(() => reader.follow())
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

  // Easter egg: once every lobe is complete (from progress) and its traces have landed, the circuit closes. Plays animated once; later loads show it settled.
  const regionItemIds = content.sections.filter((s) => s.region)
    .map((s) => content.items.filter((i) => i.section === s.id).map((i) => i.id))
  const nextItems = content.items.filter((i) => i.section === 'next')
  let egg: { reset(): void } | null = null
  // Until the circuit closes, the eye is there, shut and faint; the egg opens that same eye.
  let hint: EyeHint | null = progress.areAllComplete(regionItemIds) ? null : mountEyeHint(profile.head)
  let eggPending = false
  const maybeEgg = async () => {
    if (egg || eggPending || profile.isHidden() || !progress.areAllComplete(regionItemIds)) return
    eggPending = true
    try {
      const wired = await profile.whenWired()
      if (!wired || egg || profile.isHidden() || !progress.areAllComplete(regionItemIds)) return
      egg = playEgg(profile.el, profile, nextItems, !progress.isEggSeen(), () => progress.reset(), hint)
      hint = null
      progress.markEggSeen()
    } finally {
      eggPending = false
    }
  }
  progress.onChange(() => {
    if (egg && !progress.areAllComplete(regionItemIds)) { egg.reset(); egg = null }
    if (!egg && !hint && !progress.areAllComplete(regionItemIds)) hint = mountEyeHint(profile.head)
    void maybeEgg()
  })
  if (import.meta.env.DEV || location.search.includes('e2e')) {
    const w = window as unknown as { __cm?: object }
    w.__cm = Object.assign(w.__cm ?? {}, { visit: (id: string) => progress.visit(id), generatePcb, fitPcb, seedFor })
  }

  const render = () => {
    const pend = pendingDive
    pendingDive = null
    if (location.hash === lastHash) return
    lastHash = location.hash
    const route = parseRoute(location.hash, content)
    currentRoute = route
    // Every route change first settles whatever was moving, so an interrupt always lands in the new route's state.
    const interrupted = scene.cancelTransitions()
    back.getAnimations().forEach((a) => a.cancel())
    profile.settleMotion()
    if (route.view !== 'item') reader.close()
    if (route.view !== 'list') listHost.hidden = true
    if (route.view === 'section' || route.view === 'item') {
      profile.hide()
      listHost.hidden = true
      sceneHost.dataset.view = route.view
      if (route.view === 'item') progress.visit(route.item)
      scene.refresh()
      if (currentSection !== route.section) {
        currentSection = route.section
        const items = content.items.filter((i) => i.section === route.section)
        const dive = route.view === 'section' && pend?.section === route.section ? pend.dive : null
        void scene.enter(route.section, layout.sections[route.section], items, dive?.from)
        if (dive) {
          profile.playGhost(dive)
          // The profile header fades with the ghost; keep the Back pill out until it has gone so they never overlap.
          const ms = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? FADE_MS : DIVE_MS
          back.animate([{ opacity: 0 }, { opacity: 0, offset: 0.8 }, { opacity: 1 }], { duration: ms })
        }
        // Keyboard path: entering a section lands on its first node (the card takes focus itself on an item route).
        if (route.view === 'section' && !scene.focusFirstNode()) back.focus({ preventScroll: true })
      }
      if (route.view === 'item') {
        openItem = route.item
        const tour = layout.sections[route.section].tour
        const item = content.items.find((i) => i.id === route.item)!
        // Focus first: under reduced motion it jumps, and the card is placed against the final camera.
        void scene.focus(route.item)
        reader.open(item, { index: Math.max(0, tour.indexOf(route.item)), total: tour.length },
          scene.nodeAnchor(route.item) ?? undefined)
      } else void scene.focus(null)
      return
    }
    const left = currentSection
    if (left) { currentSection = null; openItem = null; hoverLabel.textContent = '' }
    if (route.view === 'profile') {
      listHost.hidden = true
      profile.show()
      // Back on the head, focus the lobe that was left so the keyboard path continues from there.
      if (left) profile.focusRegion(left)
      if (left) {
        // Reverse the dive back into the lobe, unless this exit itself cut a dive short (then land at once).
        const from = interrupted ? null : profile.diveFrom(left)
        void scene.exit(from ?? undefined)
        if (from) profile.pullBack(from)
      }
      void maybeEgg()
      return
    }
    if (left) void scene.exit()
    profile.hide()
    if (!listRendered) { renderList(listHost, content); listRendered = true }
    listHost.hidden = false
  }
  window.addEventListener('hashchange', render)
  render()
}
