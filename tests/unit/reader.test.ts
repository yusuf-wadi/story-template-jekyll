import { describe, it, expect } from 'vitest'
import { placeCard, safeHref, renderBody, MARGIN } from '../../src/reader/card'

describe('safeHref', () => {
  it('allows https, http and mailto', () => {
    expect(safeHref('https://github.com/x')).toBe('https://github.com/x')
    expect(safeHref('http://example.com')).toBe('http://example.com')
    expect(safeHref('mailto:a@b.c')).toBe('mailto:a@b.c')
  })
  it('rejects other schemes', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull()
    expect(safeHref(' JavaScript:alert(1)')).toBeNull()
    expect(safeHref('data:text/html,hi')).toBeNull()
    expect(safeHref('vbscript:x')).toBeNull()
  })
})

describe('renderBody', () => {
  it('keeps safe links and renders unsafe ones as plain text', () => {
    const html = renderBody('[ok](https://a.dev) and [bad](javascript:alert(1))')
    expect(html).toContain('<a href="https://a.dev">ok</a>')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('bad')
  })
})

describe('placeCard', () => {
  const vp = { w: 1280, h: 720 }
  const size = { w: 420, h: 300 }
  it('goes right of the node when there is room, vertically centred on it', () => {
    const p = placeCard({ x: 640, y: 360, r: 20 }, size, vp)
    expect(p.side).toBe('right')
    expect(p.x).toBeGreaterThan(660)
    expect(p.x - 660).toBeLessThan(28)
    expect(p.y).toBe(360 - 150)
  })
  it('goes left when the right has no room', () => {
    const p = placeCard({ x: 1100, y: 360, r: 20 }, size, vp)
    expect(p.side).toBe('left')
    expect(p.x + p.w).toBeLessThan(1080)
  })
  it('keeps the preferred side while it still fits', () => {
    expect(placeCard({ x: 700, y: 360, r: 20 }, size, vp, 'left').side).toBe('left')
  })
  it('clamps inside the viewport with a 16px margin', () => {
    const p = placeCard({ x: 200, y: 10, r: 20 }, { w: 420, h: 600 }, { w: 500, h: 700 })
    expect(p.x).toBeGreaterThanOrEqual(MARGIN)
    expect(p.x + p.w).toBeLessThanOrEqual(500 - MARGIN)
    expect(p.y).toBe(MARGIN)
    expect(p.y + p.h).toBeLessThanOrEqual(700 - MARGIN)
  })
})
