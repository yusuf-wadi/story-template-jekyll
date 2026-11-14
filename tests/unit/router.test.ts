import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseRoute, toHash, type Route } from '../../src/router'
import { validateContent } from '../../src/content'

const c = validateContent(JSON.parse(readFileSync('content/content.json', 'utf8')))

describe('router', () => {
  it('parses hashes', () => {
    expect(parseRoute('', c)).toEqual({ view: 'profile' })
    expect(parseRoute('#projects', c)).toEqual({ view: 'section', section: 'projects' })
    expect(parseRoute('#projects/flowstate', c)).toEqual({ view: 'item', section: 'projects', item: 'flowstate' })
    expect(parseRoute('#projects/nope', c)).toEqual({ view: 'section', section: 'projects' })
    expect(parseRoute('#work/flowstate', c)).toEqual({ view: 'section', section: 'work' })
    expect(parseRoute('#bogus', c)).toEqual({ view: 'profile' })
    expect(parseRoute('#next', c)).toEqual({ view: 'profile' })
    expect(parseRoute('#list', c)).toEqual({ view: 'list' })
  })
  it('round-trips', () => {
    const routes: Route[] = [
      { view: 'profile' },
      { view: 'section', section: 'projects' },
      { view: 'item', section: 'projects', item: 'flowstate' },
      { view: 'list' },
    ]
    expect(routes.map(toHash)).toEqual(['', '#projects', '#projects/flowstate', '#list'])
    for (const r of routes) expect(parseRoute(toHash(r), c)).toEqual(r)
  })
})
