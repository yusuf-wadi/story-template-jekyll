import { describe, it, expect } from 'vitest'
import { newestFirst, startKey } from '../../src/list/list'

describe('work timeline order', () => {
  it('reads the start of a free-text range', () => {
    expect(startKey('May – Aug 2024')).toBe(2024 * 12 + 4)
    expect(startKey('Jan 2025 – present')).toBe(2025 * 12)
    expect(startKey('Summers 2022 & 2023')).toBe(2022 * 12)
    expect(startKey('')).toBeNull()
  })
  it('sorts newest first and keeps undated roles beside their predecessor', () => {
    const d = (dates: string) => ({ dates })
    const out = newestFirst([d('Jan 2025 – present'), d('Mar 2026 – present'), d('Nov 2024 – Feb 2025'), d(''), d('May – Aug 2024')])
    expect(out.map((x) => x.dates)).toEqual(['Mar 2026 – present', 'Jan 2025 – present', 'Nov 2024 – Feb 2025', '', 'May – Aug 2024'])
  })
})
