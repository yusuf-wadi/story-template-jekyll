import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { byTime, parseDates } from '../../src/list/list'

const NOW = new Date(2026, 10, 14) // Nov 2026
const k = (y: number, m: number) => y * 12 + (m - 1)
const now = k(2026, 11)

// Every distinct `dates` string in content.json, with its expected [start, end] (or null).
const expected: Record<string, [number, number] | null> = {
  '': null,
  'Aug 2024': [k(2024, 8), k(2024, 8)],
  'May 2023': [k(2023, 5), k(2023, 5)],
  'May 2026': [k(2026, 5), k(2026, 5)],
  'May – Oct 2026': [k(2026, 5), k(2026, 10)],
  'Aug 2023': [k(2023, 8), k(2023, 8)],
  'Mar 2026': [k(2026, 3), k(2026, 3)],
  'Aug 2022 – Jan 2023': [k(2022, 8), k(2023, 1)],
  'May – Sep 2023': [k(2023, 5), k(2023, 9)],
  'Oct 2022 – Dec 2023': [k(2022, 10), k(2023, 12)],
  'Jun 2024': [k(2024, 6), k(2024, 6)],
  'Sep 2025': [k(2025, 9), k(2025, 9)],
  'Oct 2026': [k(2026, 10), k(2026, 10)],
  'Jan 2025 – present': [k(2025, 1), now],
  'Mar 2026 – present': [k(2026, 3), now],
  'Nov 2024 – Feb 2025': [k(2024, 11), k(2025, 2)],
  'May – Aug 2024': [k(2024, 5), k(2024, 8)],
  'Summers 2022 & 2023': [k(2022, 1), k(2023, 12)],
  'Jul 2024': [k(2024, 7), k(2024, 7)],
  'Jan – May 2023': [k(2023, 1), k(2023, 5)],
  '2022 – 2026': [k(2022, 1), k(2026, 12)],
  '2014 – 2022': [k(2014, 1), k(2022, 12)],
  'Nov 2024': [k(2024, 11), k(2024, 11)],
  '2023 – 2024': [k(2023, 1), k(2024, 12)],
  'Aug 2020 – Dec 2023': [k(2020, 8), k(2023, 12)],
  'Ongoing': [now, now],
  '2026': [k(2026, 1), k(2026, 12)],
  'Dec 2026': [k(2026, 12), k(2026, 12)],
}

describe('list date parsing', () => {
  const content = JSON.parse(readFileSync('content/content.json', 'utf8')) as { items: { dates: string }[] }
  const real = [...new Set(content.items.map((i) => i.dates))]
  it('covers every real dates string', () => {
    for (const d of real) expect(Object.keys(expected), `add "${d}" to the table`).toContain(d)
  })
  for (const [d, want] of Object.entries(expected)) {
    it(`parses "${d}"`, () => {
      const got = parseDates(d, NOW)
      expect(got ? [got.start, got.end] : null).toEqual(want)
    })
  }
})

describe('byTime', () => {
  it('sorts by end desc, then start desc; undated last in content order', () => {
    const d = (dates: string, id: string) => ({ dates, id })
    const out = byTime([d('', 'u1'), d('Jan 2025 – present', 'a'), d('Mar 2026 – present', 'b'),
      d('Nov 2024 – Feb 2025', 'c'), d('', 'u2'), d('May – Aug 2024', 'e'), d('Aug 2024', 'f')], NOW)
    expect(out.map((x) => x.id)).toEqual(['b', 'a', 'c', 'f', 'e', 'u1', 'u2'])
  })
})
