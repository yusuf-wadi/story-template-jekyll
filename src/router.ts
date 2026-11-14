import type { Content, SectionId } from './types'

export type Route =
  | { view: 'profile' }
  | { view: 'section'; section: SectionId }
  | { view: 'item'; section: SectionId; item: string }
  | { view: 'list' }

const MAPPED: SectionId[] = ['projects', 'work', 'research', 'worlds', 'craft']

export function parseRoute(hash: string, content: Content): Route {
  const h = hash.replace(/^#/, '')
  if (h === 'list') return { view: 'list' }
  const [sec, item] = h.split('/')
  if (!MAPPED.includes(sec as SectionId)) return { view: 'profile' }
  const section = sec as SectionId
  if (item && content.items.some((i) => i.id === item && i.section === section))
    return { view: 'item', section, item }
  return { view: 'section', section }
}

export function toHash(r: Route): string {
  switch (r.view) {
    case 'profile': return ''
    case 'list': return '#list'
    case 'section': return `#${r.section}`
    case 'item': return `#${r.section}/${r.item}`
  }
}
