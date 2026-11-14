import type { Content, Item } from '../types'
import { esc, renderBody, safeHref } from '../reader/card'

/** Plain, fast, accessible view of everything: no 3D, works without WebGL. */
export function renderList(root: HTMLElement, content: Content, opts: { backToBrain?: boolean } = {}): void {
  const { person } = content
  const links = (ls: { label: string; url: string }[]) =>
    ls.flatMap((l) => {
      const h = safeHref(l.url)
      return h ? [`<a href="${esc(h)}">${esc(l.label)}</a>`] : []
    }).join('')
  const article = (i: Item) => `
    <article id="${esc(i.id)}">
      <h3>${esc(i.title)}</h3>
      ${i.dates ? `<p class="list-dates">${esc(i.dates)}</p>` : ''}
      <p class="list-summary">${esc(i.summary)}</p>
      <div class="list-body">${renderBody(i.body)}</div>
      ${i.tags.length ? `<ul class="list-tags">${i.tags.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      ${i.links.length ? `<p class="list-links">${links(i.links)}</p>` : ''}
    </article>`
  const sections = content.sections.map((s) => {
    const items = content.items.filter((i) => i.section === s.id)
    if (!items.length) return ''
    const ordered = s.id === 'next'
      ? [...items.filter((i) => i.status === 'now'), ...items.filter((i) => i.status !== 'now')] : items
    return `<section aria-labelledby="sec-${s.id}"><h2 id="sec-${s.id}">${esc(s.title)}</h2>${ordered.map(article).join('')}</section>`
  }).join('')

  root.className = 'list-view'
  root.dataset.view = 'list'
  root.innerHTML = `
    <main class="list-main">
      <header>
        <h1>${esc(person.name)}</h1>
        <p class="list-tagline">${esc(person.tagline)}</p>
        <p class="list-contact">
          <span data-email>${esc(person.email)}</span>
          <button type="button" data-copy>Copy email</button>
          ${links(person.links)}
        </p>
        <a class="list-back" href="#" ${opts.backToBrain === false ? 'hidden' : ''}>Back to the brain</a>
      </header>
      ${sections}
    </main>`

  const email = root.querySelector<HTMLElement>('[data-email]')!
  const btn = root.querySelector<HTMLButtonElement>('[data-copy]')!
  btn.addEventListener('click', async () => {
    let ok = false
    try { await navigator.clipboard.writeText(person.email); ok = true } catch { ok = false }
    if (!ok) {
      const r = document.createRange()
      r.selectNodeContents(email)
      const sel = getSelection()
      sel?.removeAllRanges()
      sel?.addRange(r)
    }
    btn.textContent = ok ? 'Copied' : 'Press Ctrl/Cmd+C'
    setTimeout(() => { btn.textContent = 'Copy email' }, 1800)
  })
}
