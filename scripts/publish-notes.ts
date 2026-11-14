import matter from 'gray-matter'
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, lstatSync, rmSync, statSync, copyFileSync } from 'node:fs'
import { join, basename, dirname, extname, resolve, sep } from 'node:path'
import { homedir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { validateMeta, checkSlugFile } from './build-writing'

/**
 * Publishes every .md directly inside the Obsidian folder ~/life/writing/blog to content/writing/*.md
 * (plus attachments in public/writing/media/<slug>/). Only that folder is ever read for notes; the
 * attachment lookup is limited to the spots listed in the task (blog/, writing/, the vault attachment folder).
 */

export const DEFAULT_SRC = join(homedir(), 'life', 'writing', 'blog')
const HEADER = '<!-- generated from ~/life/writing/blog; edit the note, not this file -->'
const TRAILER = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_016sd3RDaAPPjaKqXDN4LUGB'
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif'])
const SUMMARY_MAX = 200

export interface Options {
  src: string            // the blog folder
  vault?: string         // vault root (default: two levels above src)
  contentDir: string     // content/writing
  mediaDir: string       // public/writing/media
  today?: string         // YYYY-MM-DD, for tests
}
export interface Result {
  changed: number
  published: string[]    // slugs written or kept
  added: string[]; updated: string[]; removed: string[]
  skipped: { file: string; error: string }[]
  warnings: string[]
}
type Manifest = { version: 1; posts: Record<string, { slug: string; date: string }> }

export const slugify = (s: string): string =>
  s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

const localToday = () => new Date().toLocaleDateString('en-CA')

/** Plain-text first paragraph, trimmed to ~200 chars at a word boundary. */
export function firstParagraph(body: string): string {
  for (const block of body.split(/\n\s*\n/)) {
    const b = block.trim()
    if (!b || /^(#|>|```|~~~|---|\*\*\*|\||[-*+] |\d+[.)] )/.test(b)) continue
    const t = b
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/[*`]+|~~/g, '')
      .replace(/(^|\W)_+|_+(?=\W|$)/g, '$1')
      .replace(/\s+/g, ' ').trim()
    if (!t) continue
    if (t.length <= SUMMARY_MAX) return t
    const cut = t.slice(0, SUMMARY_MAX + 1)
    const at = cut.lastIndexOf(' ')
    return cut.slice(0, at > 40 ? at : SUMMARY_MAX).replace(/[\s,;:.\-–—]+$/, '') + '…'
  }
  return ''
}

interface Ctx {
  slug: string
  linkFor: (name: string) => string | null   // slug of a published note, by (case-insensitive) name
  findAttachment: (target: string) => string | null
}
interface Converted { text: string; attachments: { from: string; name: string }[]; warnings: string[] }

const safeName = (n: string) => n.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+/, '') || 'file'

function convertSegment(seg: string, ctx: Ctx, out: Converted): string {
  return seg
    .replace(/!\[\[([^\]\n]+?)\]\]/g, (_m, inner: string) => {
      const [targetRaw, alias] = inner.split('|', 2).map(x => x?.trim())
      const target = targetRaw.split('#')[0].trim()
      if (!IMAGE_EXT.has(extname(target).toLowerCase())) { out.warnings.push(`${ctx.slug}: embed "${inner}" is not an image; dropped`); return '' }
      const from = ctx.findAttachment(target)
      if (!from) { out.warnings.push(`${ctx.slug}: image "${target}" not found; dropped`); return '' }
      let name = safeName(basename(target))
      const prior = out.attachments.find(a => a.name === name)
      if (prior && prior.from !== from) { name = safeName(`${Math.abs([...from].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7))}-${name}`) }
      if (!out.attachments.some(a => a.name === name)) out.attachments.push({ from, name })
      const alt = alias && !/^\d+(x\d+)?$/.test(alias) ? alias : basename(target, extname(target))
      return `![${alt.replace(/[\][]/g, '')}](/writing/media/${ctx.slug}/${name})`
    })
    .replace(/\[\[([^\]\n|]+?)(?:\|([^\]\n]+?))?\]\]/g, (_m, targetRaw: string, alias?: string) => {
      const [name, heading] = targetRaw.split('#', 2).map(x => x?.trim())
      const display = (alias?.trim() || name || heading || '').replace(/[\][]/g, '')
      const slug = name ? ctx.linkFor(name) : null
      return slug ? `[${display}](/writing/${slug}/)` : display
    })
}

/** Obsidian syntax to plain Markdown; fenced and inline code are left untouched. */
export function convert(body: string, ctx: Ctx): Converted {
  const out: Converted = { text: '', attachments: [], warnings: [] }
  const cleaned = body.replace(/%%[\s\S]*?%%/g, '')
  const lines = cleaned.split('\n')
  const res: string[] = []
  let fence: string | null = null, buf: string[] = []
  const flush = () => {
    if (!buf.length) return
    res.push(buf.join('\n').split(/(`[^`\n]*`)/).map((p, i) => i % 2 ? p : convertSegment(p, ctx, out)).join(''))
    buf = []
  }
  for (const line of lines) {
    const f = /^\s*(```+|~~~+)/.exec(line)
    if (fence) { res.push(line); if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null; continue }
    if (f) { flush(); fence = f[1]; res.push(line); continue }
    buf.push(line)
  }
  flush()
  out.text = res.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  return out
}

function readManifest(path: string): Manifest {
  if (!existsSync(path)) return { version: 1, posts: {} }
  const m = JSON.parse(readFileSync(path, 'utf8'))
  return { version: 1, posts: m.posts ?? {} }
}

function sameFile(a: string, b: string): boolean {
  return existsSync(b) && readFileSync(a).equals(readFileSync(b))
}

const within = (root: string, p: string) => { const r = resolve(root); const q = resolve(p); return q === r || q.startsWith(r + sep) }

function attachmentFinder(src: string, vault: string): (target: string) => string | null {
  const dirs = [src, dirname(src)]
  const appJson = join(vault, '.obsidian', 'app.json')
  try {
    const f = JSON.parse(readFileSync(appJson, 'utf8')).attachmentFolderPath
    if (typeof f === 'string' && f && f !== '/') dirs.push(f.startsWith('./') ? join(src, f) : join(vault, f))
  } catch { /* no config, or unreadable: ignore */ }
  return (target: string) => {
    if (!target || target.startsWith('/') || target.split(/[\\/]/).includes('..')) return null
    for (const d of dirs) {
      for (const cand of [join(d, target), join(d, basename(target))]) {
        if (!within(d, cand)) continue
        try { if (lstatSync(cand).isFile() && !lstatSync(cand).isSymbolicLink()) return cand } catch { /* next */ }
      }
    }
    return null
  }
}

export function publishNotes(opts: Options): Result {
  const { src, contentDir, mediaDir } = opts
  const vault = opts.vault ?? dirname(dirname(src))
  const today = opts.today ?? localToday()
  const manifestPath = join(contentDir, '.manifest.json')
  const manifest = readManifest(manifestPath)
  const result: Result = { changed: 0, published: [], added: [], updated: [], removed: [], skipped: [], warnings: [] }
  mkdirSync(contentDir, { recursive: true })

  // 1. the notes: regular, non-hidden .md files directly in src (symlinks are not followed)
  const files = existsSync(src)
    ? readdirSync(src).filter(f => f.endsWith('.md') && !f.startsWith('.') && lstatSync(join(src, f)).isFile()).sort()
    : []
  if (!existsSync(src)) result.warnings.push(`source folder not found: ${src}`)

  interface Note { file: string; data: Record<string, unknown>; body: string; title: string }
  const notes: Note[] = []
  const drafts = new Set<string>()
  for (const file of files) {
    try {
      const { data, content } = matter(readFileSync(join(src, file), 'utf8'))
      if (data.draft === true) { drafts.add(file); continue }
      const t = typeof data.title === 'string' && data.title.trim() ? data.title.trim() : basename(file, '.md').trim()
      notes.push({ file, data, body: content, title: t })
    } catch (e) { result.skipped.push({ file, error: `${file}: ${(e as Error).message}` }) }
  }

  const find = attachmentFinder(src, vault)
  const nameKey = (n: string) => n.trim().toLowerCase()

  // 2. pass one: which notes are valid? (links resolve to a placeholder; summary text is link-independent)
  const allNames = new Map(notes.map(n => [nameKey(basename(n.file, '.md')), n.file]))
  const valid: { note: Note; summary: string; date: string | undefined }[] = []
  for (const n of notes) {
    try {
      const c = convert(n.body, { slug: 'x', linkFor: nm => (allNames.has(nameKey(nm)) ? 'x' : null), findAttachment: () => null })
      const slugBase = slugify(n.title)
      if (!slugBase && !manifest.posts[n.file]) throw new Error(`${n.file}: title "${n.title}" has no ASCII letters or digits for a URL slug; add an ASCII "title" in the front matter`)
      const summary = typeof n.data.summary === 'string' && n.data.summary.trim() ? n.data.summary : firstParagraph(c.text)
      if (!summary) throw new Error(`${n.file}: no first paragraph to use as summary; add "summary" to the front matter`)
      const probe = validateMeta(n.file, { title: n.title, date: n.data.date ?? today, summary })
      valid.push({ note: n, summary: probe.summary, date: n.data.date === undefined ? undefined : probe.date })
    } catch (e) { result.skipped.push({ file: n.file, error: (e as Error).message }) }
  }

  // 3. slugs: stable via manifest; new ones avoid every taken slug, including hand-written posts
  const owned = new Set(Object.values(manifest.posts).map(p => p.slug))
  const handWritten = new Set(readdirSync(contentDir).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)).filter(s => !owned.has(s)))
  const taken = new Set([...owned, ...handWritten])
  const slugOf = new Map<string, string>()
  const newDates = new Map<string, string>()
  for (const { note } of valid) {
    const known = manifest.posts[note.file]
    if (known) { slugOf.set(note.file, known.slug); continue }
    const base = slugify(note.title) || 'post'
    let s = base, i = 2
    while (taken.has(s)) s = `${base}-${i++}`
    taken.add(s)
    slugOf.set(note.file, s)
    newDates.set(note.file, today)
    try { checkSlugFile(`${s}.md`) } catch (e) { slugOf.delete(note.file); result.skipped.push({ file: note.file, error: (e as Error).message }) }
  }
  // Notes that fail now but were published before stay live (and linkable) until fixed or removed.
  const keptFailed = new Set(result.skipped.map(s => s.file).filter(f => manifest.posts[f] && files.includes(f)))
  const linkable = new Map<string, string>()
  for (const { note } of valid) if (slugOf.has(note.file)) linkable.set(nameKey(basename(note.file, '.md')), slugOf.get(note.file)!)
  for (const f of keptFailed) linkable.set(nameKey(basename(f, '.md')), manifest.posts[f].slug)

  // 4. final conversion and writes
  const next: Manifest = { version: 1, posts: {} }
  const wasChanged = new Set<string>()
  for (const { note, summary, date } of valid) {
    const slug = slugOf.get(note.file)
    if (!slug) continue
    const first = manifest.posts[note.file]?.date ?? newDates.get(note.file)!
    next.posts[note.file] = { slug, date: first }
    const c = convert(note.body, { slug, linkFor: nm => linkable.get(nameKey(nm)) ?? null, findAttachment: find })
    result.warnings.push(...c.warnings)
    const fm = `---\ntitle: ${JSON.stringify(note.title)}\ndate: ${date ?? first}\nsummary: ${JSON.stringify(summary)}\n---\n\n${HEADER}\n\n${c.text}\n`
    const outFile = join(contentDir, `${slug}.md`)
    const had = existsSync(outFile)
    let changed = !had || readFileSync(outFile, 'utf8') !== fm
    if (changed) writeFileSync(outFile, fm)

    const dest = join(mediaDir, slug)
    const wanted = new Set(c.attachments.map(a => a.name))
    for (const a of c.attachments) {
      const to = join(dest, a.name)
      if (sameFile(a.from, to)) continue
      mkdirSync(dest, { recursive: true }); copyFileSync(a.from, to); changed = true
    }
    if (existsSync(dest)) {
      for (const f of readdirSync(dest)) if (!wanted.has(f)) { rmSync(join(dest, f), { force: true, recursive: true }); changed = true }
      if (!readdirSync(dest).length) rmSync(dest, { recursive: true })
    }
    if (changed) { wasChanged.add(slug); (had ? result.updated : result.added).push(slug) }
    result.published.push(slug)
  }
  for (const f of keptFailed) { next.posts[f] = manifest.posts[f]; result.published.push(manifest.posts[f].slug) }

  // 5. unpublish: manifest entries whose source left the folder (or became a draft)
  for (const [file, p] of Object.entries(manifest.posts)) {
    if (next.posts[file]) continue
    rmSync(join(contentDir, `${p.slug}.md`), { force: true })
    rmSync(join(mediaDir, p.slug), { recursive: true, force: true })
    result.removed.push(p.slug)
  }

  const sorted: Manifest = { version: 1, posts: Object.fromEntries(Object.entries(next.posts).sort(([a], [b]) => a.localeCompare(b))) }
  const manifestText = JSON.stringify(sorted, null, 2) + '\n'
  if (!existsSync(manifestPath) || readFileSync(manifestPath, 'utf8') !== manifestText) writeFileSync(manifestPath, manifestText)
  result.changed = wasChanged.size + result.removed.length
  return result
}

function git(repo: string, args: string[]) {
  const r = spawnSync('git', args, { cwd: repo, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr || r.stdout}`)
  return r.stdout
}

export function pushChanges(repo: string, n: number): boolean {
  const paths = ['content/writing', 'public/writing/media', 'content/writing/.manifest.json'].filter(p => existsSync(join(repo, p)))
  git(repo, ['add', '--', ...paths])
  if (spawnSync('git', ['diff', '--cached', '--quiet', '--', ...paths], { cwd: repo }).status === 0) return false
  git(repo, ['commit', '-m', `post: sync from Obsidian (${n} changed)\n\n${TRAILER}`, '--', ...paths])
  git(repo, ['push', 'origin', 'v2'])
  return true
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repo = fileURLToPath(new URL('..', import.meta.url))
  const src = process.env.BLOG_SRC || DEFAULT_SRC
  const r = publishNotes({ src, contentDir: join(repo, 'content/writing'), mediaDir: join(repo, 'public/writing/media') })
  for (const w of r.warnings) console.warn(`warning: ${w}`)
  for (const s of r.skipped) console.error(`skipped: ${s.error}`)
  console.log(`publish-notes: ${r.published.length} published (${r.added.length} new, ${r.updated.length} updated), ${r.removed.length} removed, ${r.skipped.length} skipped; src ${src}${existsSync(src) && statSync(src).isDirectory() ? '' : ' (missing)'}`)
  if (process.argv.includes('--push')) {
    if (r.changed === 0) console.log('nothing changed; not pushing')
    else console.log(pushChanges(repo, r.changed) ? `pushed ${r.changed} change(s) to origin v2` : 'nothing to commit')
  }
}
