import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import matter from 'gray-matter'
import { publishNotes, firstParagraph, slugify } from '../../scripts/publish-notes'
import { buildWriting } from '../../scripts/build-writing'

let vault: string, blog: string, content: string, media: string
const run = (today = '2026-11-14') => publishNotes({ src: blog, contentDir: content, mediaDir: media, today })
const note = (name: string, text: string) => writeFileSync(join(blog, name), text)
const out = (slug: string) => matter(readFileSync(join(content, `${slug}.md`), 'utf8'))

beforeEach(() => {
  const root = mkdtempSync(join(tmpdir(), 'pn-'))
  vault = join(root, 'vault'); blog = join(vault, 'writing', 'blog')
  content = join(root, 'content'); media = join(root, 'media')
  mkdirSync(blog, { recursive: true }); mkdirSync(content, { recursive: true })
})

describe('publishNotes', () => {
  it('falls back: title from filename, date from first publish, summary from first paragraph', () => {
    note('My First Note.md', '# Heading\n\nThis is **the** first [para](https://x.com) of text.\n\nSecond.\n')
    const r = run()
    expect(r.published).toEqual(['my-first-note'])
    const p = out('my-first-note')
    expect(p.data.title).toBe('My First Note')
    expect((p.data.date as Date).toISOString().slice(0, 10)).toBe('2026-11-14')
    expect(p.data.summary).toBe('This is the first para of text.')
    expect(p.content).toContain('generated from ~/life/writing/blog')
  })

  it('trims long summaries at a word boundary', () => {
    const s = firstParagraph('word '.repeat(80))
    expect(s.length).toBeLessThanOrEqual(201)
    expect(s.endsWith('…')).toBe(true)
    expect(s).not.toMatch(/wor…$/)
  })

  it('explicit front matter overrides', () => {
    note('a.md', '---\ntitle: "Custom Title"\ndate: 2025-01-02\nsummary: "Mine."\n---\n\nBody paragraph.\n')
    run()
    const p = out('custom-title')
    expect(p.data.title).toBe('Custom Title')
    expect((p.data.date as Date).toISOString().slice(0, 10)).toBe('2025-01-02')
    expect(p.data.summary).toBe('Mine.')
  })

  it('keeps slug and first-published date stable across runs and title edits', () => {
    note('Idea.md', 'First text.\n')
    run('2026-11-14')
    note('Idea.md', '---\ntitle: Renamed Idea\n---\n\nEdited text.\n')
    const r = run('2026-12-25')
    expect(r.published).toEqual(['idea'])
    const p = out('idea')
    expect(p.data.title).toBe('Renamed Idea')
    expect((p.data.date as Date).toISOString().slice(0, 10)).toBe('2026-11-14')
    expect(JSON.parse(readFileSync(join(content, '.manifest.json'), 'utf8')).posts['Idea.md']).toEqual({ slug: 'idea', date: '2026-11-14' })
    expect(run().changed).toBe(0)
  })

  it('numbers colliding slugs and avoids hand-written posts', () => {
    note('Hello World.md', 'a text\n'); note('hello-world!.md', 'b text\n')
    writeFileSync(join(content, 'mine.md'), '---\ntitle: m\ndate: 2026-01-01\nsummary: s\n---\nx')
    note('Mine.md', 'c text\n')
    const slugs = run().published.sort()
    expect(slugs).toEqual(['hello-world', 'hello-world-2', 'mine-2'])
    expect(readFileSync(join(content, 'mine.md'), 'utf8')).toContain('title: m')
  })

  it('links wikilinks to published notes and flattens unpublished ones', () => {
    note('One.md', 'See [[Two]], [[two|the second]], [[Private Draft]] and [[Private Draft|alias]].\n')
    note('Two.md', 'Two text.\n')
    mkdirSync(join(vault, 'writing'), { recursive: true })
    writeFileSync(join(vault, 'writing', 'Private Draft.md'), 'secret')
    run()
    const body = out('one').content
    expect(body).toContain('[Two](/writing/two/)')
    expect(body).toContain('[the second](/writing/two/)')
    expect(body).toContain('Private Draft and alias.')
    expect(existsSync(join(content, 'private-draft.md'))).toBe(false)
  })

  it('copies embedded images and rewrites them; warns on missing; strips comments', () => {
    writeFileSync(join(blog, 'pic one.png'), 'PNG')
    writeFileSync(join(vault, 'writing', 'up.png'), 'UP')
    note('Pics.md', 'Intro.\n\n![[pic one.png|A cat]]\n\n![[up.png]]\n\n![[nope.png]]\n\n%% hidden\nmultiline %% shown\n\n> [!note] Callout\n> text\n')
    const r = run()
    const body = out('pics').content
    expect(body).toContain('![A cat](/writing/media/pics/pic-one.png)')
    expect(body).toContain('![up](/writing/media/pics/up.png)')
    expect(body).not.toMatch(/nope|hidden|%%/)
    expect(body).toContain('> [!note] Callout')
    expect(readFileSync(join(media, 'pics', 'pic-one.png'), 'utf8')).toBe('PNG')
    expect(r.warnings.some(w => w.includes('nope.png'))).toBe(true)
  })

  it('uses the vault attachment folder from app.json', () => {
    mkdirSync(join(vault, '.obsidian')); mkdirSync(join(vault, 'assets'))
    writeFileSync(join(vault, '.obsidian', 'app.json'), '{"attachmentFolderPath":"assets"}')
    writeFileSync(join(vault, 'assets', 'z.png'), 'Z')
    note('A.md', 'Text.\n\n![[z.png]]\n')
    run()
    expect(existsSync(join(media, 'a', 'z.png'))).toBe(true)
  })

  it('unpublishes when the source leaves the folder, and drops its media', () => {
    writeFileSync(join(blog, 'p.png'), 'P')
    note('Gone.md', 'Text.\n\n![[p.png]]\n'); note('Stay.md', 'Stay.\n')
    run()
    rmSync(join(blog, 'Gone.md'))
    const r = run()
    expect(r.removed).toEqual(['gone'])
    expect(existsSync(join(content, 'gone.md'))).toBe(false)
    expect(existsSync(join(media, 'gone'))).toBe(false)
    expect(existsSync(join(content, 'stay.md'))).toBe(true)
    expect(Object.keys(JSON.parse(readFileSync(join(content, '.manifest.json'), 'utf8')).posts)).toEqual(['Stay.md'])
  })

  it('skips a bad note, publishes the rest; a published note that breaks stays live', () => {
    note('Good.md', 'Good text.\n')
    note('Bad.md', '---\ndate: "13/45/2026"\n---\n\nBad text.\n')
    note('Empty.md', '# Only a heading\n')
    let r = run()
    expect(r.published).toEqual(['good'])
    expect(r.skipped.map(s => s.file).sort()).toEqual(['Bad.md', 'Empty.md'])
    expect(r.skipped.find(s => s.file === 'Bad.md')!.error).toMatch(/YYYY-MM-DD/)
    note('Good.md', '---\ndate: nonsense\n---\n\nGood text.\n')
    r = run()
    expect(r.skipped.map(s => s.file)).toContain('Good.md')
    expect(existsSync(join(content, 'good.md'))).toBe(true)
  })

  it('output passes the real site build', () => {
    note('Post.md', 'Hello **world**.\n')
    run()
    const { posts } = buildWriting(content, mkdtempSync(join(tmpdir(), 'pn-out-')), 'https://x.test')
    expect(posts.map(p => p.slug)).toEqual(['post'])
    expect(posts[0].title).toBe('Post')
  })

  it('ignores subfolders, dotfiles, non-md and symlinks; never reads outside the blog folder', () => {
    mkdirSync(join(blog, 'sub')); writeFileSync(join(blog, 'sub', 'Nested.md'), 'nested\n')
    note('.hidden.md', 'hidden\n'); note('notes.txt', 'txt\n')
    writeFileSync(join(vault, 'writing', 'Private.md'), 'private\n')
    writeFileSync(join(vault, 'Root.md'), 'root\n')
    symlinkSync(join(vault, 'Root.md'), join(blog, 'Link.md'))
    note('Real.md', 'Real text, see [[Private]] and [[Root]].\n')
    const r = run()
    expect(r.published).toEqual(['real'])
    expect(readdirSync(content).filter(f => f.endsWith('.md'))).toEqual(['real.md'])
    expect(out('real').content).not.toContain('](/writing/')
  })

  it('drafts are not published', () => {
    note('D.md', '---\ndraft: true\n---\n\nText.\n')
    expect(run().published).toEqual([])
  })
})

describe('slugify', () => {
  it('is ascii kebab-case', () => expect(slugify('Café  Déjà Vu!')).toBe('cafe-deja-vu'))
})
