import type { Content } from './types'

const SECTIONS = ['projects', 'work', 'research', 'worlds', 'craft', 'next']
const REGIONS = ['frontal', 'parietal', 'temporal', 'occipital', 'cerebellum']

function fail(path: string, why: string): never {
  throw new Error(`content: ${path} ${why}`)
}
function obj(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(path, 'must be an object')
  return v as Record<string, unknown>
}
function str(v: unknown, path: string, allowEmpty = false): string {
  if (typeof v !== 'string' || (!allowEmpty && v.trim() === '')) fail(path, 'must be a non-empty string')
  return v as string
}
function arr(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) fail(path, 'must be an array')
  return v as unknown[]
}
function links(v: unknown, path: string) {
  return arr(v, path).map((l, i) => {
    const o = obj(l, `${path}[${i}]`)
    return { label: str(o.label, `${path}[${i}].label`), url: str(o.url, `${path}[${i}].url`) }
  })
}

export function validateContent(raw: unknown): Content {
  const r = obj(raw, 'root')
  const p = obj(r.person, 'person')
  const person = {
    name: str(p.name, 'person.name'),
    tagline: str(p.tagline, 'person.tagline'),
    links: links(p.links, 'person.links'),
    email: str(p.email, 'person.email'),
  }

  const sectionIds = new Set<string>()
  const sections = arr(r.sections, 'sections').map((s, i) => {
    const o = obj(s, `sections[${i}]`)
    const id = str(o.id, `sections[${i}].id`)
    if (!SECTIONS.includes(id)) fail(`sections[${i}].id`, `unknown section "${id}"`)
    if (sectionIds.has(id)) fail(`sections[${i}].id`, `duplicate id "${id}"`)
    sectionIds.add(id)
    const region = o.region
    if (region !== null && !(typeof region === 'string' && REGIONS.includes(region)))
      fail(`sections[${i}].region`, 'must be a region or null')
    return { id, title: str(o.title, `sections[${i}].title`), region }
  })

  const ids = new Set<string>()
  const items = arr(r.items, 'items').map((it, i) => {
    const path = `items[${i}]`
    const o = obj(it, path)
    const id = str(o.id, `${path}.id`)
    if (ids.has(id)) fail(`${path}.id`, `duplicate id "${id}"`)
    ids.add(id)
    const section = str(o.section, `${path}.section`)
    if (!sectionIds.has(section)) fail(`${path}.section`, `unknown section "${section}"`)
    const status = o.status ?? null
    if (section === 'next') {
      if (status !== 'now' && status !== 'upcoming') fail(`${path}.status`, 'must be "now" or "upcoming" in next')
    } else if (status !== null) fail(`${path}.status`, 'must be null outside next')
    const tags = arr(o.tags, `${path}.tags`).map((t, j) => str(t, `${path}.tags[${j}]`))
    return {
      id, section, status,
      title: str(o.title, `${path}.title`),
      dates: str(o.dates, `${path}.dates`, true),
      summary: str(o.summary, `${path}.summary`),
      body: str(o.body, `${path}.body`),
      tags,
      links: links(o.links, `${path}.links`),
    }
  })

  const ov = obj(r.clusterLabelOverrides ?? {}, 'clusterLabelOverrides')
  const clusterLabelOverrides: Record<string, string> = {}
  for (const k of Object.keys(ov)) clusterLabelOverrides[k] = str(ov[k], `clusterLabelOverrides.${k}`)

  return { person, sections, items, clusterLabelOverrides } as Content
}
