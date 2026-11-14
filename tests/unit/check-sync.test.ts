import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
    l.sections.work.tour = ['monoware']
    expect(checkSync(c, l)).toEqual(['work: missing in layout: seeloz'])
  })
  it('reports an extra layout node', () => {
    const [c, l] = mk()
    l.sections.work.nodes.push({ id: 'ghost', pos: [0, 0, 0], cluster: null })
    l.sections.work.tour.push('ghost')
    expect(checkSync(c, l)).toEqual(['work: extra in layout: ghost'])
  })
  it('reports an edge referencing an unknown id', () => {
    const [c, l] = mk()
    l.sections.work.edges = [['monoware', 'seeloz'], ['ghost', 'seeloz']]
    expect(checkSync(c, l)).toEqual(['work: edge references unknown id: ghost'])
  })
  it('reports a tour that is not a permutation of the node ids', () => {
    const [c, l] = mk()
    l.sections.work.tour = ['seeloz', 'seeloz']
    expect(checkSync(c, l)).toEqual(['work: tour must list every node id exactly once (missing: monoware; duplicate: seeloz)'])
  })
  it('reports a tour id that is not a node', () => {
    const [c, l] = mk()
    l.sections.work.tour = ['seeloz', 'monoware', 'ghost']
    expect(checkSync(c, l)).toEqual(['work: tour must list every node id exactly once (unknown: ghost)'])
  })
  it('reports a node cluster that is not a known cluster id', () => {
    const [c, l] = mk()
    l.sections.work.clusters = [{ id: 0, label: 'a', centroid: [0, 0, 0], radius: 1 }]
    l.sections.work.nodes[0].cluster = 0
    l.sections.work.nodes[1].cluster = 3
    expect(checkSync(c, l)).toEqual(['work: node monoware references unknown cluster 3'])
  })
  it('CLI validates content.json and exits 1 with the validation message', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cs-'))
    const bad = JSON.parse(readFileSync('content/content.json', 'utf8'))
    delete bad.items[0].summary
    writeFileSync(join(dir, 'content.json'), JSON.stringify(bad))
    const r = spawnSync('npx', ['tsx', 'scripts/check-sync.ts', join(dir, 'content.json'), 'content/layout.json'], { encoding: 'utf8' })
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('content: items[0].summary must be a non-empty string')
  })
  it('CLI exits 0 on the real files', () => {
    const r = spawnSync('npx', ['tsx', 'scripts/check-sync.ts'], { encoding: 'utf8' })
    expect(r.stderr).toBe('')
    expect(r.status).toBe(0)
  })
  it('real files are in sync', () => {
    const c = JSON.parse(readFileSync('content/content.json', 'utf8'))
    const l = JSON.parse(readFileSync('content/layout.json', 'utf8'))
    expect(checkSync(c, l)).toEqual([])
  })
})
