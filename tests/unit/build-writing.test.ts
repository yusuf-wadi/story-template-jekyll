import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildWriting } from '../../scripts/build-writing'

const SITE = 'https://ywadi-portfol.vercel.app'
const post = (fm: Record<string, string | boolean>, body = 'Body text.') =>
  `---\n${Object.entries(fm).map(([k, v]) => `${k}: ${typeof v === 'string' ? JSON.stringify(v) : v}`).join('\n')}\n---\n\n${body}\n`

let src: string, out: string
beforeEach(() => {
  src = mkdtempSync(join(tmpdir(), 'w-src-'))
  out = mkdtempSync(join(tmpdir(), 'w-out-'))
})
const add = (name: string, text: string) => writeFileSync(join(src, name), text)

describe('buildWriting', () => {
  it('lists the newer post first and writes post pages', () => {
    add('old.md', post({ title: 'Old one', date: '2026-01-02', summary: 's1' }))
    add('new.md', post({ title: 'New one', date: '2026-05-06', summary: 's2' }))
    const { posts } = buildWriting(src, out, SITE)
    expect(posts.map(p => p.slug)).toEqual(['new', 'old'])
    const idx = readFileSync(join(out, 'writing/index.html'), 'utf8')
    expect(idx.indexOf('New one')).toBeLessThan(idx.indexOf('Old one'))
    expect(idx).toContain('href="/writing/new/"')
    expect(existsSync(join(out, 'writing/new/index.html'))).toBe(true)
    const page = readFileSync(join(out, 'writing/old/index.html'), 'utf8')
    expect(page).toContain('href="/"')
    expect(page).toContain('Body text.')
  })

  it('rss has absolute item links', () => {
    add('a.md', post({ title: 'A', date: '2026-01-02', summary: 's' }))
    add('b.md', post({ title: 'B & C', date: '2026-02-02', summary: 's' }))
    buildWriting(src, out, SITE)
    const rss = readFileSync(join(out, 'writing/rss.xml'), 'utf8')
    expect(rss.match(/<item>/g)).toHaveLength(2)
    expect(rss).toContain(`<link>${SITE}/writing/a/</link>`)
    expect(rss).toContain('B &amp; C')
  })

  it('skips drafts', () => {
    add('a.md', post({ title: 'A', date: '2026-01-02', summary: 's' }))
    add('d.md', post({ title: 'Secret', date: '2026-01-03', summary: 's', draft: true }))
    const { posts } = buildWriting(src, out, SITE)
    expect(posts).toHaveLength(1)
    expect(existsSync(join(out, 'writing/d/index.html'))).toBe(false)
    expect(readFileSync(join(out, 'writing/index.html'), 'utf8')).not.toContain('Secret')
  })

  it('throws naming the file on missing/invalid fields', () => {
    add('hello.md', post({ date: '2026-01-02', summary: 's' }))
    expect(() => buildWriting(src, out, SITE)).toThrow(/hello\.md.*title/)
    add('hello.md', post({ title: 't', date: 'Jan 2', summary: 's' }))
    expect(() => buildWriting(src, out, SITE)).toThrow(/hello\.md.*date/)
  })

  it('escapes title and neutralises unsafe links and raw html', () => {
    add('x.md', post({ title: '<script>alert(1)</script>', date: '2026-01-02', summary: 'a "q" <b>' },
      '[bad](javascript:alert(1)) [ok](https://example.com)\n\n<script>alert(2)</script>'))
    buildWriting(src, out, SITE)
    const page = readFileSync(join(out, 'writing/x/index.html'), 'utf8')
    expect(page).not.toContain('<script>')
    expect(page).not.toContain('javascript:')
    expect(page).toContain('href="https://example.com"')
  })

  it('rejects unsafe slugs, suggesting kebab-case', () => {
    add('My Post.md', post({ title: 't', date: '2026-01-02', summary: 's' }))
    expect(() => buildWriting(src, out, SITE)).toThrow(/My Post\.md.*my-post\.md/)
  })

  it('rejects impossible dates and missing summary', () => {
    add('a.md', post({ title: 't', date: '2026-02-31', summary: 's' }))
    expect(() => buildWriting(src, out, SITE)).toThrow(/a\.md.*date/)
    add('a.md', post({ title: 't', date: '2026-02-03' }))
    expect(() => buildWriting(src, out, SITE)).toThrow(/a\.md.*summary/)
  })

  it('handles unquoted YAML dates (Date object) with the right day', () => {
    add('a.md', '---\ntitle: T\ndate: 2026-03-09\nsummary: S\n---\nbody\n')
    const { posts } = buildWriting(src, out, SITE)
    expect(posts[0].date).toBe('2026-03-09')
    expect(readFileSync(join(out, 'writing/a/index.html'), 'utf8')).toContain('March 9, 2026')
  })

  it('rss is well formed with channel metadata', () => {
    add('a.md', post({ title: 'A & B', date: '2026-03-09', summary: 'x < y' }))
    add('b.md', post({ title: 'B', date: '2026-01-01', summary: 's' }))
    buildWriting(src, out, SITE)
    const rss = readFileSync(join(out, 'writing/rss.xml'), 'utf8')
    expect(rss.match(/<pubDate>([^<]*)<\/pubDate>/)![1]).toMatch(/^\w{3}, \d{2} \w{3} \d{4} 00:00:00 GMT$/)
    for (const t of ['title', 'link', 'description']) expect(rss).toMatch(new RegExp(`<channel><title>[^]*<${t}>`))
    expect(rss).toContain('xmlns:atom="http://www.w3.org/2005/Atom"')
    expect(rss).toContain(`<atom:link href="${SITE}/writing/rss.xml" rel="self" type="application/rss+xml"/>`)
    expect(rss).toContain('<lastBuildDate>Mon, 09 Mar 2026 00:00:00 GMT</lastBuildDate>')
    expect(rss.replace(/&(amp|lt|gt|quot|apos);/g, '')).not.toMatch(/&/)
    expect(rss.match(/<item>/g)).toHaveLength(rss.match(/<\/item>/g)!.length)
  })
})
