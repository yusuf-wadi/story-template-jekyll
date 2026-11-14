import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { checkSync } from '../../scripts/check-sync'
import type { Content, Layout } from '../../src/types'

const item = (id: string, section: string) => ({ id, section, title: id, dates: '', summary: '', body: '', tags: [], links: [], status: null })
const mk = (): [Content, Layout] => {
  const content = { person: {}, sections: [], clusterLabelOverrides: {},
    items: [item('seeloz', 'work'), item('monoware', 'work'), item('nx', 'next')] } as unknown as Content
  const sec = (ids: string[]) => ({ nodes: ids.map(id => ({ id, pos: [0, 0, 0], cluster: null })), clusters: [], tour: ids, edges: [] as [string, string][] })
  const layout = { sections: { work: sec(['seeloz', 'monoware']) } } as unknown as Layout
  return [content, layout]
}

describe('checkSync', () => {
  it('passes when in sync (next ignored)', () => {
    const [c, l] = mk()
    expect(checkSync(c, l)).toEqual([])
  })
  it('reports an item missing from layout', () => {
    const [c, l] = mk()
    l.sections.work.nodes = l.sections.work.nodes.filter(n => n.id !== 'seeloz')
    expect(checkSync(c, l)).toEqual(['work: missing in layout: seeloz'])
  })
  it('reports an extra layout node', () => {
    const [c, l] = mk()
    l.sections.work.nodes.push({ id: 'ghost', pos: [0, 0, 0], cluster: null })
    expect(checkSync(c, l)).toEqual(['work: extra in layout: ghost'])
  })
  it('reports an edge referencing an unknown id', () => {
    const [c, l] = mk()
    l.sections.work.edges = [['monoware', 'seeloz'], ['ghost', 'seeloz']]
    expect(checkSync(c, l)).toEqual(['work: edge references unknown id: ghost'])
  })
  it('real files are in sync', () => {
    const c = JSON.parse(readFileSync('content/content.json', 'utf8'))
    const l = JSON.parse(readFileSync('content/layout.json', 'utf8'))
    expect(checkSync(c, l)).toEqual([])
  })
})
