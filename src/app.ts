import type { Content, Layout } from './types'
import type { Progress } from './progress'
import { parseRoute, toHash } from './router'
import { mountProfile } from './profile/profile'

export function startApp(root: HTMLElement, content: Content, _layout: Layout, progress: Progress): void {
  const profile = mountProfile(root, {
    content,
    progress,
    onEnter: (section) => { location.hash = toHash({ view: 'section', section }) },
  })
  // Placeholder for section/item/list views (replaced by Tasks 6/7/10).
  const placeholder = document.createElement('div')
  placeholder.hidden = true
  root.append(placeholder)

  const render = () => {
    const route = parseRoute(location.hash, content)
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
