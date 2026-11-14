import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Content, Layout } from '../src/types'

export function checkSync(content: Content, layout: Layout): string[] {
  const problems: string[] = []
  const sections = new Set<string>()
  for (const it of content.items) if (it.section !== 'next') sections.add(it.section)
  for (const s of Object.keys(layout.sections)) sections.add(s)
  for (const sec of sections) {
    const want = new Set(content.items.filter(i => i.section === sec).map(i => i.id))
    const lay = (layout.sections as Record<string, { nodes: { id: string }[]; edges?: [string, string][] }>)[sec]
    const have = new Set(lay?.nodes.map(n => n.id) ?? [])
    const missing = [...want].filter(id => !have.has(id))
    const extra = [...have].filter(id => !want.has(id))
    if (missing.length) problems.push(`${sec}: missing in layout: ${missing.join(', ')}`)
    if (extra.length) problems.push(`${sec}: extra in layout: ${extra.join(', ')}`)
    const unknown = [...new Set((lay?.edges ?? []).flat().filter(id => !have.has(id)))]
    if (unknown.length) problems.push(`${sec}: edge references unknown id: ${unknown.join(', ')}`)
  }
  return problems
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const content = JSON.parse(readFileSync('content/content.json', 'utf8')) as Content
  const layout = JSON.parse(readFileSync('content/layout.json', 'utf8')) as Layout
  const problems = checkSync(content, layout)
  if (problems.length) {
    console.error(problems.join('\n'))
    console.error('content/layout.json is out of sync. Run: pipeline/.venv/bin/python pipeline/build_layout.py')
    process.exit(1)
  }
}
