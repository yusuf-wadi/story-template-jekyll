import { Marked } from 'marked'
import matter from 'gray-matter'
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { esc, safeHref } from '../src/reader/card'

export const SITE_URL = 'https://ywadi-portfol.vercel.app'
const CSS_PATH = fileURLToPath(new URL('../src/writing.css', import.meta.url))

interface Post { slug: string; title: string; date: string; summary: string; html: string }

// Raw HTML in markdown is shown as text, never passed through; links/images keep only http/https/mailto.
const md = new Marked({
  renderer: {
    html({ text }) { return esc(text) },
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens)
      const ok = safeHref(href)
      return ok ? `<a href="${esc(ok)}"${title ? ` title="${esc(title)}"` : ''}>${text}</a>` : text
    },
    image({ href, title, text }) {
      const ok = safeHref(href)
      return ok ? `<img src="${esc(ok)}" alt="${esc(text)}"${title ? ` title="${esc(title)}"` : ''} loading="lazy">` : esc(text)
    },
  },
})

const xml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!)
const fmtDate = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })

function readPost(dir: string, file: string): Post | null {
  const { data, content } = matter(readFileSync(join(dir, file), 'utf8'))
  if (data.draft === true) return null
  const need = (k: string) => {
    const v = data[k] instanceof Date ? data[k].toISOString().slice(0, 10) : data[k]
    if (typeof v !== 'string' || !v.trim()) throw new Error(`${file}: missing front-matter "${k}"`)
    return v.trim()
  }
  const title = need('title'), date = need('date'), summary = need('summary')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) throw new Error(`${file}: "date" must be YYYY-MM-DD, got "${date}"`)
  return { slug: basename(file, '.md'), title, date, summary, html: md.parse(content, { async: false }) }
}

const page = (css: string, o: { title: string; desc: string; path: string; body: string; site: string; current?: boolean }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.desc)}">
<link rel="canonical" href="${esc(o.site + o.path)}">
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

  const items = posts.map(p => `<item><title>${xml(p.title)}</title><link>${site}/writing/${p.slug}/</link><guid isPermaLink="true">${site}/writing/${p.slug}/</guid><pubDate>${new Date(p.date + 'T00:00:00Z').toUTCString()}</pubDate><description>${xml(p.summary)}</description></item>`).join('\n')
  writeFileSync(join(root, 'rss.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Yusuf Wadi: Writing</title><link>${site}/writing/</link><description>Notes and essays by Yusuf Wadi.</description><language>en</language>
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
