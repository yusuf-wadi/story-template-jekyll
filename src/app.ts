import type { Content, Layout, SectionId } from './types'
import type { Progress } from './progress'
import { parseRoute, toHash } from './router'
import { mountProfile } from './profile/profile'
import { createSectionScene } from './map/sectionScene'

export function startApp(root: HTMLElement, content: Content, layout: Layout, progress: Progress): void {
  const profile = mountProfile(root, {
    content,
    progress,
    onEnter: (section) => { location.hash = toHash({ view: 'section', section }) },
  })
  // Placeholder for section/item/list views (replaced by Tasks 6/7/10).
  const placeholder = document.createElement('div')
  placeholder.hidden = true
  root.append(placeholder)

  const sceneHost = document.createElement('div')
  sceneHost.className = 'scene-host'
  sceneHost.hidden = true
  const hoverLabel = document.createElement('div')
  hoverLabel.className = 'hover-label'
  hoverLabel.dataset.hoverLabel = ''
  root.append(sceneHost, hoverLabel)
  const scene = createSectionScene(sceneHost, (id) => progress.isVisited(id))
  scene.onHover((l) => { hoverLabel.textContent = l ?? '' })
  scene.onNodeClick((id) => {
    if (currentSection) location.hash = toHash({ view: 'item', section: currentSection, item: id })
  })
  let currentSection: SectionId | null = null

  const render = () => {
    const route = parseRoute(location.hash, content)
    if (route.view === 'section' || route.view === 'item') {
      profile.hide()
      placeholder.hidden = true
      sceneHost.dataset.view = route.view
      if (currentSection !== route.section) {
        currentSection = route.section
        const items = content.items.filter((i) => i.section === route.section)
        void scene.enter(route.section, layout.sections[route.section], items)
      }
      return
    }
    if (currentSection) { currentSection = null; void scene.exit(); hoverLabel.textContent = '' }
    if (route.view === 'profile') {
      placeholder.hidden = true
      profile.show()
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
