import { describe, it, expect } from 'vitest'
import { Progress } from '../../src/progress'

function memStorage() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, v) },
    removeItem: (k: string) => { m.delete(k) },
  }
}
const throwingStorage = {
  getItem: (): string | null => { throw new Error('denied') },
  setItem: (): void => { throw new Error('denied') },
  removeItem: (): void => { throw new Error('denied') },
}

describe('Progress', () => {
  it('still works in memory when storage throws', () => {
    const p = new Progress(throwingStorage)
    p.visit('a')
    expect(p.isVisited('a')).toBe(true)
  })
  it('works with null storage', () => {
    expect(() => new Progress(null).visit('a')).not.toThrow()
    expect(new Progress(null).isVisited('a')).toBe(false)
  })
  it('persists visits across instances', () => {
    const s = memStorage()
    new Progress(s).visit('a')
    expect(new Progress(s).isVisited('a')).toBe(true)
  })
  it('corrupt JSON in storage starts empty', () => {
    const s = memStorage()
    s.setItem('cm-progress-v1', '{not json')
    const p = new Progress(s)
    expect(p.isVisited('a')).toBe(false)
  })
  it('non-array JSON in storage starts empty', () => {
    const s = memStorage()
    s.setItem('cm-progress-v1', JSON.stringify({ a: 1 }))
    expect(new Progress(s).isVisited('a')).toBe(false)
  })
  it('stale ids are tolerated for section completion', () => {
    const s = memStorage()
    s.setItem('cm-progress-v1', JSON.stringify(['gone', 'a']))
    const q = new Progress(s)
    expect(q.isSectionComplete(['a'])).toBe(true)
    expect(q.isSectionComplete(['a', 'new'])).toBe(false)
    expect(q.isSectionComplete([])).toBe(false)
  })
  it('areAllComplete requires every section complete and a non-empty outer list', () => {
    const q = new Progress(null)
    q.visit('a'); q.visit('b')
    expect(q.areAllComplete([['a'], ['b']])).toBe(true)
    expect(q.areAllComplete([['a'], ['b', 'c']])).toBe(false)
    expect(q.areAllComplete([])).toBe(false)
  })
  it('reset clears visits and persists the clear', () => {
    const s = memStorage()
    const p = new Progress(s)
    p.visit('a')
    p.reset()
    expect(p.isVisited('a')).toBe(false)
    expect(new Progress(s).isVisited('a')).toBe(false)
  })
  it('onChange fires once per new id on visit and on reset, and unsubscribes', () => {
    const p = new Progress(null)
    let n = 0
    const off = p.onChange(() => { n++ })
    p.visit('a')
    expect(n).toBe(1)
    p.visit('a')
    expect(n).toBe(1)
    p.visit('b')
    expect(n).toBe(2)
    p.reset()
    expect(n).toBe(3)
    off()
    p.visit('c')
    p.reset()
    expect(n).toBe(3)
  })
})
