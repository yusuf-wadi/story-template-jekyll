// The circuit closes. Once every lobe is a full PCB:
//   (1) the facing edge pads of neighbouring lobes are bridged,
//   (2) current runs through the whole board as a wave from the back of the head to the front,
//   (3) two glowing traces leave the frontal and temporal lobes and run down to the face,
//   (4) where an eye, seen in profile and drawn as a schematic symbol, opens: its plates start shorted together, the
//       upper plate lifts, the curved plate charges, a faint glow settles on it.
// The eye is a button: it opens one card with what he's working on now and what's next. "rewire" resets.

import type { Item } from '../types'
import { esc, placeCard, renderBody, safeHref, MARGIN, NARROW } from '../reader/card'
import { bridge, ARC_D, EYE, EYE_SHAPE, EYE_TRACES, LOWER_D, PLATE_MASK, PLUS_D, UPPER_D, leadTailD, plateTransform, toD, waveAt, type UV } from './layout'
import './egg.css'

export interface EggProfile {
  /** Head `<g>`: source coordinates of region outlines, PCBs and edge pads. */
  head: SVGGElement
}

export const TIMING = {
  settle: 900, // the last board's mask fill lands before anything moves
  link: 520, linkStagger: 90, // bridges between lobes draw in
  wave: 900, spike: 1100, // current: the wave front crosses the head in `wave`; each trace carries spikes for `spike`
  trace: 950, traceStagger: 140, // the traces to the eye draw in as the wave reaches the front
  lids: 750, charge: 650, // the upper plate lifts, then the curved plate charges
}

const NS = 'http://www.w3.org/2000/svg'
// Front (frontal's leading edge) and back (occipital's trailing edge) of the boards, for the wave.
const FRONT_X = 302, BACK_X = 736
const GROUP_TITLES: Record<'now' | 'next', string> = { now: 'Now', next: 'Next' }

const svg = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, cls?: string) => {
  const e = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v))
  if (cls) e.setAttribute('class', cls)
  return e
}
const pathLen = (p: SVGGeometryElement) => { try { return p.getTotalLength() } catch { return 0 } }
/** Centre x of an element's box, or null when it isn't rendered (getBBox throws in Firefox, is zero in Chrome). */
const centreX = (e: SVGGraphicsElement): number | null => {
  try {
    const b = e.getBBox()
    return b.width || b.height ? b.x + b.width / 2 : null
  } catch {
    return null
  }
}
const drawIn = (len: number): Keyframe[] =>
  [{ strokeDasharray: `${len} ${len}`, strokeDashoffset: len }, { strokeDasharray: `${len} ${len}`, strokeDashoffset: 0 }]

export function playEgg(root: HTMLElement, profile: EggProfile, nextItems: Item[], animate: boolean,
  onRewire: () => void = () => {}): { reset(): void } {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  const anim = animate && !reduced
  const head = profile.head
  const anims: Animation[] = []
  const timers: number[] = []
  let alive = true

  const play = (el: Element, frames: Keyframe[], opts: KeyframeAnimationOptions) => {
    const a = el.animate(frames, opts)
    anims.push(a)
    return a
  }
  const at = (ms: number, fn: () => void) => { timers.push(window.setTimeout(() => { if (alive) fn() }, ms)) }
  // The plate moves its transform every frame (path morphing isn't animatable everywhere), so it runs on rAF.
  const frames = new Set<number>()
  const tween = (ms: number, fn: (k: number) => void) => {
    const t0 = performance.now()
    const step = (now: number) => {
      frames.delete(id)
      const k = Math.min(1, (now - t0) / ms)
      fn(k)
      if (k < 1) { id = requestAnimationFrame(step); frames.add(id) }
    }
    let id = requestAnimationFrame(step)
    frames.add(id)
  }
  const stopFrames = () => { for (const f of frames) cancelAnimationFrame(f); frames.clear() }

  // ---------------------------------------------------------------- board layer (head source coordinates)
  const board = svg('g', { 'aria-hidden': 'true' }, 'egg-board')
  board.dataset.egg = ''
  const bridges = svg('g', {}, 'egg-bridges')
  board.append(bridges)

  const padAt = (el: Element): UV | null => {
    const m = /translate\(\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/.exec(el.getAttribute('transform') ?? '')
    return m ? [+m[1], +m[2]] : null
  }
  const pairs: [UV, UV][] = []
  const seen = new Set<string>()
  for (const pad of head.querySelectorAll('[data-pcb-for] .pcb-edge-pad[data-toward]')) {
    const from = pad.closest<SVGGElement>('[data-pcb-for]')!.dataset.pcbFor!
    const to = (pad as SVGGElement).dataset.toward!
    const key = [from, to].sort().join('|')
    if (seen.has(key)) continue
    const other = head.querySelector(`[data-pcb-for="${CSS.escape(to)}"] .pcb-edge-pad[data-toward="${CSS.escape(from)}"]`)
    const a = padAt(pad), b = other && padAt(other)
    if (!a || !b) continue
    seen.add(key)
    // Current flows forward: each bridge draws from its back pad to its front pad.
    pairs.push(a[0] >= b[0] ? [a, b] : [b, a])
  }
  const links = pairs.map(([a, b]) => {
    const d = toD(bridge(a, b))
    const g = svg('g', {}, 'egg-link')
    g.dataset.eggLink = ''
    const glow = svg('path', { d }, 'egg-link-glow')
    const copper = svg('path', { d }, 'egg-link-copper')
    g.append(glow, copper)
    bridges.append(g)
    return { g, glow, copper }
  })

  // The traces to the eye.
  const traces = EYE_TRACES.map((pts) => {
    const d = toD(pts)
    const g = svg('g', {}, 'egg-trace')
    g.dataset.eggTrace = ''
    const glow = svg('path', { d }, 'egg-trace-glow')
    const copper = svg('path', { d }, 'egg-trace-copper')
    const [sx, sy] = pts[0]
    const pad = svg('rect', { x: sx - 3.4, y: sy - 3.4, width: 6.8, height: 6.8, rx: 1, transform: `rotate(45 ${sx} ${sy})` }, 'egg-trace-pad')
    g.append(glow, copper, pad)
    board.append(g)
    return { g, glow, copper, pad }
  })

  // The eye, in profile, as a schematic symbol: long upper plate, short lower plate, and the curved plate of a
  // polarized capacitor at the front. The curved plate is clipped to everything below the upper plate, so the
  // plate uncovers it as it lifts; the upper lead's tail stretches down to the plate while it is lowered.
  const uid = Math.random().toString(36).slice(2, 8)
  const maskId = `egg-eye-mask-${uid}`
  const eye = svg('g', { transform: `translate(${EYE.x} ${EYE.y})` }, 'egg-eye')
  const maskClip = svg('clipPath', { id: maskId })
  const mask = svg('rect', PLATE_MASK)
  maskClip.append(mask)
  const shape = svg('path', { d: EYE_SHAPE, fill: 'none', stroke: 'none' }, 'egg-eye-shape') // the outline the e2e checks
  const ball = svg('g', { 'clip-path': `url(#${maskId})` }, 'egg-sym-ball')
  const arcGlow = svg('path', { d: ARC_D }, 'egg-sym-glow')
  const arc = svg('path', { d: ARC_D }, 'egg-sym-arc')
  const charge = svg('path', { d: ARC_D }, 'egg-sym-charge')
  ball.append(arcGlow, arc, charge)
  const lower = svg('path', { d: LOWER_D }, 'egg-sym-plate')
  const tail = svg('path', { d: leadTailD(0) }, 'egg-sym-plate egg-sym-tail')
  const upper = svg('g', {}, 'egg-sym-upper')
  upper.append(svg('path', { d: UPPER_D }, 'egg-sym-plate'), svg('path', { d: PLUS_D }, 'egg-sym-plus'))
  /** Openness: 0 shut (plates together), 1 open. */
  const setLid = (t: number) => {
    const tf = plateTransform(t)
    mask.setAttribute('transform', tf)
    upper.setAttribute('transform', tf)
    tail.setAttribute('d', leadTailD(Math.min(1, t)))
  }
  setLid(0)
  eye.append(maskClip, shape, ball, tail, lower, upper)
  board.append(eye)
  head.append(board)
  const announce = (open: boolean) => window.dispatchEvent(new CustomEvent('egg-eye', { detail: { open } }))

  // ---------------------------------------------------------------- HTML: eye button, rewire, card
  const stage = head.ownerSVGElement?.parentElement ?? root
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'egg-eye-btn'
  button.dataset.eggEye = ''
  button.dataset.state = 'closed'
  button.dataset.egg = ''
  button.setAttribute('aria-label', "What I'm working on")
  button.setAttribute('aria-haspopup', 'dialog')
  button.setAttribute('aria-expanded', 'false')
  button.hidden = true
  // Placed over the eye in viewBox percentages, so it tracks the stage at every size with no listeners.
  const m = head.transform.baseVal.consolidate()?.matrix ?? new DOMMatrix()
  const vbW = head.ownerSVGElement?.viewBox.baseVal.width || 800
  const vbH = head.ownerSVGElement?.viewBox.baseVal.height || 800
  const c = new DOMPoint(EYE.x, EYE.y).matrixTransform(m)
  button.style.left = `${(c.x / vbW) * 100}%`
  button.style.top = `${(c.y / vbH) * 100}%`
  button.style.setProperty('--eye-w', `${(((EYE.rx * 2 + 10) * m.a) / vbW) * 100}%`)

  const rewire = document.createElement('button')
  rewire.type = 'button'
  rewire.className = 'egg-rewire'
  rewire.dataset.eggRewire = ''
  rewire.textContent = 'rewire'
  rewire.title = 'Reset progress and unwire the head'
  rewire.hidden = true
  const card = document.createElement('div')
  card.className = 'egg-card'
  card.dataset.eggCard = ''
  card.setAttribute('role', 'dialog')
  card.setAttribute('aria-labelledby', 'egg-card-title')
  card.hidden = true
  stage.append(button)
  root.append(rewire, card)

  // ---------------------------------------------------------------- card
  let isOpen = false
  const onDocDown = (e: PointerEvent) => {
    const t = e.target as Node
    if (isOpen && !card.contains(t) && !button.contains(t)) closeCard(false)
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && isOpen && !root.hidden) { e.preventDefault(); closeCard(true) }
  }
  const onResize = () => { if (isOpen) closeCard(false) }
  document.addEventListener('pointerdown', onDocDown)
  document.addEventListener('keydown', onKey)
  window.addEventListener('resize', onResize)

  const itemHtml = (item: Item) => {
    const links = item.links.map((l) => [l.label, safeHref(l.url)] as const).filter(([, h]) => h)
      .map(([label, h]) => `<a href="${esc(h!)}" target="_blank" rel="noopener">${esc(label)}</a>`).join('')
    return `<li class="egg-item"><h4>${esc(item.title)}</h4>` +
      (item.dates ? `<p class="egg-item-dates">${esc(item.dates)}</p>` : '') +
      `<div class="egg-item-body">${renderBody(item.body)}</div>` +
      (links ? `<p class="egg-item-links">${links}</p>` : '') + `</li>`
  }
  const groups = (['now', 'next'] as const).map((k) => ({
    k, items: nextItems.filter((i) => (k === 'now' ? i.status === 'now' : i.status !== 'now')),
  })).filter((g) => g.items.length)

  function openCard() {
    isOpen = true
    button.setAttribute('aria-expanded', 'true')
    card.innerHTML =
      `<div class="egg-card-bar"><span class="egg-card-kicker">circuit closed</span>` +
      `<button type="button" class="egg-close" aria-label="Close">×</button></div>` +
      `<h2 id="egg-card-title" tabindex="-1">What I'm working on</h2>` +
      groups.map((g) => `<section class="egg-group is-${g.k}" data-egg-group="${g.k}"><h3>${GROUP_TITLES[g.k]}</h3>` +
        `<ul>${g.items.map(itemHtml).join('')}</ul></section>`).join('')
    card.querySelector('.egg-close')!.addEventListener('click', () => closeCard(true))
    card.hidden = false
    const box = root.getBoundingClientRect()
    const eb = button.getBoundingClientRect()
    const w = Math.min(360, box.width - 2 * MARGIN)
    card.style.width = `${w}px`
    card.style.maxHeight = `${box.height - 2 * MARGIN}px`
    const h = card.offsetHeight
    const a = { x: eb.left + eb.width / 2 - box.left, y: eb.top + eb.height / 2 - box.top, r: eb.width / 2 }
    // Narrow screens: hang the card under the eye so the open eye stays in view; else beside it.
    const p = box.width < NARROW
      ? { x: Math.max(MARGIN, Math.min(box.width - MARGIN - w, a.x - w / 2)),
          y: Math.max(MARGIN, Math.min(box.height - MARGIN - h, a.y + a.r + 14)) }
      : placeCard(a, { w, h }, { w: box.width, h: box.height }, 'left')
    card.style.left = `${p.x}px`
    card.style.top = `${p.y}px`
    if (!reduced) card.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'ease-out' })
    card.querySelector<HTMLElement>('h2')!.focus({ preventScroll: true })
  }
  function closeCard(refocus: boolean) {
    if (!isOpen) return
    isOpen = false
    card.hidden = true
    card.replaceChildren()
    button.setAttribute('aria-expanded', 'false')
    if (refocus) button.focus()
  }
  button.addEventListener('click', () => (isOpen ? closeCard(true) : openCard()))

  rewire.addEventListener('click', () => {
    onRewire()
    reset()
    head.querySelector<SVGElement>('.region')?.focus()
  })

  // ---------------------------------------------------------------- final state
  const showFinal = () => {
    for (const l of links) l.g.classList.add('is-on')
    for (const t of traces) t.g.classList.add('is-on')
    eye.classList.add('is-open')
    eye.style.visibility = ''
    setLid(1)
    announce(true)
    button.hidden = false
    button.dataset.state = 'open'
    rewire.hidden = false
    root.classList.add('is-booted')
  }
  // The profile hiding (entering a section) closes the card without moving focus, and settles a running
  // sequence at once: its timers must not keep working against a display:none SVG.
  let playing = false
  const hideWatch = new MutationObserver(() => {
    if (!root.hidden) return
    closeCard(false)
    if (playing) finish()
  })
  hideWatch.observe(root, { attributes: true, attributeFilter: ['hidden'] })
  function finish() {
    playing = false
    for (const t of timers) clearTimeout(t)
    timers.length = 0
    stopFrames()
    for (const a of anims) a.cancel()
    anims.length = 0
    head.querySelector('.egg-pulse')?.remove()
    showFinal()
  }
  if (!anim || root.hidden) {
    showFinal()
    return { reset }
  }
  playing = true

  // ---------------------------------------------------------------- the sequence
  const T = TIMING
  eye.style.visibility = 'hidden' // no hint of the eye until the trace reaches the face
  const t0 = T.settle
  links.forEach((l, i) => at(t0 + i * T.linkStagger, () => {
    const len = pathLen(l.copper)
    l.g.classList.add('is-on')
    const o = { duration: T.link, easing: 'cubic-bezier(.5,0,.2,1)', fill: 'backwards' as const }
    play(l.copper, drawIn(len), o)
    play(l.glow, [{ opacity: 0 }, { opacity: 0, offset: 0.6 }, { opacity: 1 }], o)
  }))

  const t1 = t0 + (links.length - 1) * T.linkStagger + T.link + 140
  at(t1, () => {
    // Current: spike trains in every trace and bridge, each starting as the wave front (back → front) reaches it.
    const pulse = svg('g', { 'aria-hidden': 'true' }, 'egg-pulse')
    head.append(pulse)
    for (const src of head.querySelectorAll<SVGPathElement>('.pcb-copper, .egg-link-copper')) {
      const x = centreX(src)
      if (x === null) continue
      const delay = waveAt(x, FRONT_X, BACK_X) * T.wave
      const p = svg('path', { d: src.getAttribute('d')! }, 'egg-spike')
      pulse.append(p)
      const phase = Math.random() * 30
      play(p, [{ strokeDashoffset: phase, opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.75 }, { strokeDashoffset: phase - 110, opacity: 0 }],
        { duration: T.spike, delay, easing: 'linear', fill: 'both' })
    }
    for (const r of head.querySelectorAll<SVGPathElement>('.region.is-pcb')) {
      const x = centreX(r)
      if (x === null) continue
      play(r, [{ fillOpacity: 0.55 }, { fillOpacity: 0.8, offset: 0.3 }, { fillOpacity: 0.55 }],
        { duration: T.spike, delay: waveAt(x, FRONT_X, BACK_X) * T.wave, easing: 'ease-in-out' })
    }
    root.classList.add('is-booted')
    at(T.wave + T.spike + 60, () => pulse.remove())
  })

  // The wave reaches the front and keeps going: out of the frontal and temporal lobes, down to the face.
  const t2 = t1 + T.wave + T.spike * 0.35
  traces.forEach((tr, i) => at(t2 + i * T.traceStagger, () => {
    tr.g.classList.add('is-on')
    const len = pathLen(tr.copper)
    const o = { duration: T.trace, easing: 'cubic-bezier(.45,0,.25,1)', fill: 'backwards' as const }
    play(tr.pad, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, fill: 'backwards' })
    play(tr.copper, drawIn(len), o)
    play(tr.glow, drawIn(len).map((k, j) => ({ ...k, opacity: j ? 1 : 0.3 })), o)
  }))

  const t3 = t2 + (traces.length - 1) * T.traceStagger + T.trace
  at(t3 - T.trace * 0.45, () => {
    // The shut eye fades in as the traces arrive: both plates together, shorted.
    eye.style.visibility = ''
    play(eye, [{ opacity: 0 }, { opacity: 1 }], { duration: T.trace * 0.45, easing: 'ease-in' })
  })
  at(t3, () => {
    // The upper plate lifts off the lower one (a touch past open, then settles); the curved plate it uncovers
    // charges from top to bottom; then its faint glow comes up and the glass rims catch it.
    eye.classList.add('is-open')
    const ease = (k: number) => 1 - Math.pow(1 - k, 3)
    tween(T.lids, (k) => setLid(k < 0.8 ? 1.06 * ease(k / 0.8) : 1.06 - 0.06 * ((k - 0.8) / 0.2)))
    const len = pathLen(charge)
    const o = { duration: T.charge, delay: T.lids * 0.55, easing: 'cubic-bezier(.4,0,.3,1)', fill: 'backwards' as const }
    play(charge, drawIn(len), o)
    play(arcGlow, [{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1 }], { ...o, duration: T.charge + 300 })
    at(T.lids * 0.55 + T.charge * 0.6, () => announce(true))
  })
  at(t3 + T.lids * 0.6, () => { button.hidden = false; button.dataset.state = 'open' })
  at(t3 + T.lids + T.charge + 300, () => {
    rewire.hidden = false
    play(rewire, [{ opacity: 0 }, { opacity: 1 }], { duration: 600 })
    playing = false
  })

  function reset() {
    if (!alive) return
    alive = false
    for (const t of timers) clearTimeout(t)
    stopFrames()
    for (const a of anims) a.cancel()
    document.removeEventListener('pointerdown', onDocDown)
    document.removeEventListener('keydown', onKey)
    window.removeEventListener('resize', onResize)
    hideWatch.disconnect()
    head.querySelector('.egg-pulse')?.remove()
    board.remove()
    announce(false)
    button.remove()
    rewire.remove()
    card.remove()
    root.classList.remove('is-booted')
  }
  return { reset }
}
