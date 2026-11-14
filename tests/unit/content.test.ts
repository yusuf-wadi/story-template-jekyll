import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { validateContent } from '../../src/content'

const raw = () => JSON.parse(readFileSync('content/content.json', 'utf8'))

describe('validateContent', () => {
  it('accepts the real content', () => {
    const c = validateContent(raw())
    expect(c.items.length).toBeGreaterThan(0)
  })
  it('rejects duplicate ids', () => {
    const r = raw(); r.items[1].id = r.items[0].id
    expect(() => validateContent(r)).toThrow(/duplicate id/)
  })
  it('rejects unknown section', () => {
    const r = raw(); r.items[0].section = 'zzz'
    expect(() => validateContent(r)).toThrow(/unknown section/)
  })
  it('rejects status outside next', () => {
    const r = raw(); r.items[0].status = 'now'
    expect(() => validateContent(r)).toThrow(/status/)
  })
  it('names the bad field', () => {
    const r = raw(); delete r.person.name
    expect(() => validateContent(r)).toThrow(/person\.name/)
  })
})
