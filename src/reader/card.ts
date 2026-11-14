import { Marked } from 'marked'

/** A node as seen on screen: CSS-px centre, on-screen radius, and its hue. */
export interface Anchor { x: number; y: number; r: number; color: string }
export interface Rect { x: number; y: number; w: number; h: number }
export type Side = 'left' | 'right'

/** Viewport margin the card never crosses. */
export const MARGIN = 16
/** Space between the node's rim and the card. */
export const GAP = 14
export const CARD_MAX_W = 420
/** Narrow screens settle the card as a bottom sheet of at most this share of the viewport height. */
export const SHEET_H = 0.62
export const NARROW = 600

export function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}

const SAFE = new Set(['https:', 'http:', 'mailto:'])
/** The URL if its scheme is https/http/mailto (relative URLs resolve against the page), else null. */
export function safeHref(url: string): string | null {
  try {
    const base = globalThis.location?.href ?? 'https://localhost/'
    return SAFE.has(new URL(url.trim(), base).protocol) ? url : null
  } catch {
    return null
  }
}

const md = new Marked({
  renderer: {
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens)
      const ok = safeHref(href)
      return ok ? `<a href="${esc(ok)}"${title ? ` title="${esc(title)}"` : ''}>${text}</a>` : text
    },
  },
})
export function renderBody(src: string): string {
  return md.parse(src, { async: false })
}

/** Beside the node (preferred side if it fits, else the other, else the roomier), clamped into the viewport. */
export function placeCard(a: { x: number; y: number; r: number }, size: { w: number; h: number },
  vp: { w: number; h: number }, prefer: Side = 'right'): Rect & { side: Side } {
  const { w, h } = size
  const right = a.x + a.r + GAP
  const left = a.x - a.r - GAP - w
  const fits = { right: right + w <= vp.w - MARGIN, left: left >= MARGIN }
  const other: Side = prefer === 'right' ? 'left' : 'right'
  const side: Side = fits[prefer] ? prefer : fits[other] ? other
    : vp.w - a.x >= a.x ? 'right' : 'left'
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
  const x = clamp(side === 'right' ? right : left, MARGIN, Math.max(MARGIN, vp.w - MARGIN - w))
  const y = clamp(a.y - h / 2, MARGIN, Math.max(MARGIN, vp.h - MARGIN - h))
  return { x, y, w, h, side }
}
