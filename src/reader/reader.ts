import { marked } from 'marked'
import type { Item } from '../types'

export interface Reader {
  open(item: Item, pos: { index: number; total: number }): void
  close(): void
  isOpen(): boolean
  onNav(fn: (dir: 1 | -1) => void): void
  onBack(fn: () => void): void
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}

export function mountReader(root: HTMLElement): Reader {
  const el = document.createElement('aside')
  el.className = 'reader'
  el.hidden = true
  el.setAttribute('role', 'dialog')
  el.setAttribute('aria-modal', 'false')
  el.setAttribute('aria-labelledby', 'reader-title')
  root.append(el)
  let navFn: (dir: 1 | -1) => void = () => {}
  let backFn: () => void = () => {}
  let opened = false

  const typing = (t: EventTarget | null) => {
    const n = t as HTMLElement | null
    return !!n && (n.tagName === 'INPUT' || n.tagName === 'TEXTAREA' || n.tagName === 'SELECT' || n.isContentEditable)
  }
  document.addEventListener('keydown', (e) => {
    if (!opened || typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
    if (e.key === 'ArrowRight') { e.preventDefault(); navFn(1) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); navFn(-1) }
    else if (e.key === 'Escape') { e.preventDefault(); backFn() }
  })

  let sx = 0, sy = 0
  el.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY }, { passive: true })
  el.addEventListener('touchend', (e) => {
    const t = e.changedTouches[0]
    const dx = t.clientX - sx
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(t.clientY - sy)) navFn(dx < 0 ? 1 : -1)
  }, { passive: true })

  return {
    open(item, pos) {
      const links = item.links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)}</a>`).join('')
      el.innerHTML =
        `<div class="reader-bar"><button type="button" data-back>&larr; Back</button>` +
        `<span class="reader-pos">${pos.index + 1} / ${pos.total}</span>` +
        `<span class="reader-nav"><button type="button" data-prev aria-label="Previous">&lsaquo;</button>` +
        `<button type="button" data-next aria-label="Next">&rsaquo;</button></span></div>` +
        `<h2 id="reader-title" tabindex="-1">${esc(item.title)}</h2>` +
        (item.dates ? `<p class="reader-dates">${esc(item.dates)}</p>` : '') +
        (item.tags.length ? `<p class="reader-tags">${item.tags.map((t) => `<span>${esc(t)}</span>`).join('')}</p>` : '') +
        `<div class="reader-body">${marked.parse(item.body, { async: false })}</div>` +
        (links ? `<p class="reader-links">${links}</p>` : '')
      el.querySelector('[data-back]')!.addEventListener('click', () => backFn())
      el.querySelector('[data-prev]')!.addEventListener('click', () => navFn(-1))
      el.querySelector('[data-next]')!.addEventListener('click', () => navFn(1))
      el.scrollTop = 0
      el.hidden = false
      opened = true
      el.querySelector<HTMLElement>('#reader-title')!.focus({ preventScroll: true })
    },
    close() { opened = false; el.hidden = true; el.innerHTML = '' },
    isOpen: () => opened,
    onNav(fn) { navFn = fn },
    onBack(fn) { backFn = fn },
  }
}
