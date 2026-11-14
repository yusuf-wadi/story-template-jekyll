import { Marked } from 'marked'
import matter from 'gray-matter'
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { esc, SAFE_RENDERER } from '../src/reader/card'

export const SITE_URL = 'https://ywadi-portfol.vercel.app'
const CSS_PATH = fileURLToPath(new URL('../src/writing.css', import.meta.url))

interface Post { slug: string; title: string; date: string; summary: string; html: string }

// Raw HTML in markdown is shown as text, never passed through; links/images keep only http/https/mailto (shared with the cards).
const md = new Marked({ renderer: SAFE_RENDERER as never })

const xml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!)
const fmtDate = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })

/** Front-matter rules shared by the build and the Obsidian publisher. Throws with a message naming `file`. */
export function validateMeta(file: string, data: Record<string, unknown>): { title: string; date: string; summary: string } {
  const need = (k: string) => {
    const v = data[k] instanceof Date ? (data[k] as Date).toISOString().slice(0, 10) : data[k]
    if (typeof v !== 'string' || !v.trim()) throw new Error(`${file}: missing front-matter "${k}"`)
    return v.trim()
  }
  const title = need('title'), date = need('date'), summary = need('summary')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(+new Date(date + 'T00:00:00Z')) || new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date) throw new Error(`${file}: "date" must be YYYY-MM-DD, got "${date}"`)
  return { title, date, summary }
}

export function checkSlugFile(file: string): void {
  if (!/^[a-z0-9][a-z0-9-]*\.md$/.test(file)) {
    const k = basename(file, '.md').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'post'
    throw new Error(`${file}: filename becomes the URL slug; rename to kebab-case, e.g. "${k}.md"`)
  }
}

// Posts written by scripts/publish-notes.ts carry this marker after the front matter; it is not rendered.
const GENERATED_RE = /^\s*<!-- generated from [^>]*-->\s*/

function readPost(dir: string, file: string): Post | null {
  checkSlugFile(file)
  const { data, content } = matter(readFileSync(join(dir, file), 'utf8'))
  if (data.draft === true) return null
  const { title, date, summary } = validateMeta(file, data)
  return { slug: basename(file, '.md'), title, date, summary, html: md.parse(content.replace(GENERATED_RE, ''), { async: false }) }
}

const page = (css: string, o: { title: string; desc: string; path: string; body: string; site: string; current?: boolean }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.desc)}">
<link rel="canonical" href="${esc(o.site + o.path)}">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="alternate" type="application/rss+xml" title="Yusuf Wadi: Writing" href="/writing/rss.xml">
<style>${css}</style>
</head>
<body>
<header class="site"><a href="/">Yusuf Wadi</a><a href="/writing/"${o.current ? ' aria-current="page"' : ''}>Writing</a></header>
<main>
${o.body}
</main>
</body>
</html>
`

export function buildWriting(srcDir: string, outDir: string, siteUrl: string = SITE_URL): { posts: { slug: string; title: string; date: string }[] } {
  const site = siteUrl.replace(/\/$/, '')
  const css = readFileSync(CSS_PATH, 'utf8')
  const posts = readdirSync(srcDir).filter(f => f.endsWith('.md')).sort()
    .map(f => readPost(srcDir, f)).filter((p): p is Post => p !== null)
    .sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug))

  const root = join(outDir, 'writing')
  mkdirSync(root, { recursive: true })

  for (const p of posts) {
    mkdirSync(join(root, p.slug), { recursive: true })
    writeFileSync(join(root, p.slug, 'index.html'), page(css, {
      title: `${p.title} | Yusuf Wadi`, desc: p.summary, path: `/writing/${p.slug}/`, site,
      body: `<article>\n<h1>${esc(p.title)}</h1>\n<p class="meta"><time datetime="${p.date}">${fmtDate(p.date)}</time></p>\n<p class="summary">${esc(p.summary)}</p>\n${p.html}</article>\n<a class="back" href="/writing/">&larr; All writing</a>`,
    }))
  }

  const list = posts.map(p => `<li><a class="card" href="/writing/${esc(p.slug)}/"><h2>${esc(p.title)}</h2><p class="meta"><time datetime="${p.date}">${fmtDate(p.date)}</time></p><p class="summary">${esc(p.summary)}</p></a></li>`).join('\n')
  writeFileSync(join(root, 'index.html'), page(css, {
    title: 'Writing | Yusuf Wadi', desc: 'Notes and essays by Yusuf Wadi.', path: '/writing/', site, current: true,
    body: `<h1>Writing</h1>\n${posts.length ? `<ul class="posts">\n${list}\n</ul>` : '<p class="summary">Nothing here yet.</p>'}\n<a class="back" href="/">&larr; Home</a>`,
  }))

  const items = posts.map(p => `<item><title>${xml(p.title)}</title><link>${xml(`${site}/writing/${p.slug}/`)}</link><guid isPermaLink="true">${xml(`${site}/writing/${p.slug}/`)}</guid><pubDate>${new Date(p.date + 'T00:00:00Z').toUTCString()}</pubDate><description>${xml(p.summary)}</description></item>`).join('\n')
  writeFileSync(join(root, 'rss.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>Yusuf Wadi: Writing</title><link>${xml(site)}/writing/</link><description>Notes and essays by Yusuf Wadi.</description><language>en</language>
<atom:link href="${xml(site)}/writing/rss.xml" rel="self" type="application/rss+xml"/>${posts.length ? `\n<lastBuildDate>${new Date(posts[0].date + 'T00:00:00Z').toUTCString()}</lastBuildDate>` : ''}
${items}
</channel></rss>
`)

  return { posts: posts.map(({ slug, title, date }) => ({ slug, title, date })) }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const src = 'content/writing'
  if (!existsSync(src)) { console.error(`${src} not found`); process.exit(1) }
  const { posts } = buildWriting(src, 'dist', SITE_URL)
  console.log(`writing: ${posts.length} post(s)`)
}
