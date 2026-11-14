import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { validateContent } from '../src/content'
import type { Content, Layout, SectionLayout } from '../src/types'

export function checkSync(content: Content, layout: Layout): string[] {
  const problems: string[] = []
  const sections = new Set<string>()
  for (const it of content.items) if (it.section !== 'next') sections.add(it.section)
  for (const s of Object.keys(layout.sections)) sections.add(s)
  for (const sec of sections) {
    const want = new Set(content.items.filter(i => i.section === sec).map(i => i.id))
    const lay = (layout.sections as Record<string, Partial<SectionLayout> | undefined>)[sec]
    const nodes = lay?.nodes ?? []
    const have = new Set(nodes.map(n => n.id))
    const missing = [...want].filter(id => !have.has(id))
    const extra = [...have].filter(id => !want.has(id))
    if (missing.length) problems.push(`${sec}: missing in layout: ${missing.join(', ')}`)
    if (extra.length) problems.push(`${sec}: extra in layout: ${extra.join(', ')}`)
    const unknown = [...new Set((lay?.edges ?? []).flat().filter(id => !have.has(id)))]
    if (unknown.length) problems.push(`${sec}: edge references unknown id: ${unknown.join(', ')}`)
    if (lay) {
      // The tour drives ←/→ and keyboard order: it must be a permutation of the node ids.
      const tour = lay.tour ?? []
      const seen = new Set<string>()
      const dup = new Set<string>()
      for (const id of tour) (seen.has(id) ? dup : seen).add(id)
      const tMissing = [...have].filter(id => !seen.has(id))
      const tUnknown = [...seen].filter(id => !have.has(id))
      if (tMissing.length || tUnknown.length || dup.size) {
        const why = [
          tMissing.length ? `missing: ${tMissing.join(', ')}` : '',
          dup.size ? `duplicate: ${[...dup].join(', ')}` : '',
          tUnknown.length ? `unknown: ${tUnknown.join(', ')}` : '',
        ].filter(Boolean).join('; ')
        problems.push(`${sec}: tour must list every node id exactly once (${why})`)
      }
      const clusterIds = new Set((lay.clusters ?? []).map(c => c.id))
      for (const n of nodes)
        if (n.cluster !== null && !clusterIds.has(n.cluster))
          problems.push(`${sec}: node ${n.id} references unknown cluster ${n.cluster}`)
    }
  }
  return problems
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [contentPath = 'content/content.json', layoutPath = 'content/layout.json'] = process.argv.slice(2)
  let content: Content
  try {
    content = validateContent(JSON.parse(readFileSync(contentPath, 'utf8')))
  } catch (e) {
    console.error((e as Error).message)
    console.error(`${contentPath} is invalid; fix it before building.`)
    process.exit(1)
  }
  const layout = JSON.parse(readFileSync(layoutPath, 'utf8')) as Layout
  const problems = checkSync(content, layout)
  if (problems.length) {
    console.error(problems.join('\n'))
    console.error('content/layout.json is out of sync. Run: pipeline/.venv/bin/python pipeline/build_layout.py')
    process.exit(1)
  }
}
