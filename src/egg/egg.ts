// The circuit closes. Once every lobe is a full PCB:
//   (1) the facing edge pads of neighbouring lobes are bridged,
//   (2) current runs through the whole board as a wave from the back of the head to the front,
//   (3) two glowing traces leave the frontal and temporal lobes and run down to the face,
//   (4) where an eye, seen in profile and drawn as a tiny schematic circuit, opens: its lids are a battery whose
//       plates start shorted together; the upper plate lifts, current runs down the short wires into the diode
//       that is the eyeball, and the diode lights with a faint glow.
// The eye is a button: it opens one card with what he's working on now and what's next. "rewire" resets.

import type { Item } from '../types'
import { esc, placeCard, renderBody, safeHref, MARGIN, NARROW } from '../reader/card'
import { bridge, ANODE_WIRE_D, CATHODE_WIRE_D, DIODE_D, EYE, EYE_SHAPE, EYE_TRACES, LOWER_D, PLATE_MASK, PLUS_D, UPPER_D, leadTailD, plateTransform, toD, waveAt, type UV } from './layout'
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
  lids: 750, wire: 280, light: 520, // the upper plate lifts, current runs a wire into the diode, the diode lights
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
  onRewire: () => void = () => {}, hint: EyeHint | null = null): { reset(): void } {
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

  // The eye: adopted from the faint closed hint when there is one (the same element opens), else built here.
  const parts = hint?.adopt() ?? buildEye()
  const { eye, setLid, currents, diodeGlow, diodeLit } = parts
  const fromHint = eye.classList.contains('is-hint')
  board.append(eye)
  head.append(board)
  const unhint = () => { eye.classList.remove('is-hint'); delete eye.dataset.eggEyeClosed }
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
    unhint()
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
  // Built fresh, no sign of the eye until the trace reaches the face; adopted, the faint closed eye waits there.
  if (!fromHint) eye.style.visibility = 'hidden'
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
    // The shut eye fades in (or up, from the faint hint) as the traces arrive: both plates together, shorted.
    const from = fromHint ? +getComputedStyle(eye).opacity : 0
    unhint()
    eye.style.visibility = ''
    play(eye, [{ opacity: from }, { opacity: 1 }], { duration: T.trace * 0.45, easing: 'ease-in' })
  })
  at(t3, () => {
    // The battery connects: the upper plate lifts off the lower one (a touch past open, then settles). Current
    // runs from + down the anode wire, the diode lights (triangle and bar brighten, a faint glow comes up and the
    // glass rims catch it), and the current carries on out of the cathode back to −.
    eye.classList.add('is-open')
    const ease = (k: number) => 1 - Math.pow(1 - k, 3)
    tween(T.lids, (k) => setLid(k < 0.8 ? 1.06 * ease(k / 0.8) : 1.06 - 0.06 * ((k - 0.8) / 0.2)))
    const t = T.lids * 0.6
    const wireIn = (p: SVGPathElement, delay: number) =>
      play(p, drawIn(pathLen(p)), { duration: T.wire, delay, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'backwards' })
    wireIn(currents[0], t)
    const lit = { duration: T.light, delay: t + T.wire, easing: 'cubic-bezier(.3,0,.2,1)', fill: 'backwards' as const }
    play(diodeLit, [{ opacity: 0 }, { opacity: 1 }], lit)
    play(diodeGlow, [{ opacity: 0 }, { opacity: 0, offset: 0.3 }, { opacity: 1 }], { ...lit, duration: T.light + 300 })
    wireIn(currents[1], t + T.wire + T.light * 0.4)
    at(t + T.wire + T.light * 0.5, () => announce(true))
  })
  at(t3 + T.lids * 0.6, () => { button.hidden = false; button.dataset.state = 'open' })
  at(t3 + T.lids * 0.6 + T.wire * 2 + T.light + 300, () => {
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

// ---------------------------------------------------------------- the eye itself, and the hint
interface EyeParts {
  eye: SVGGElement
  /** Openness: 0 shut (plates together), 1 open. */
  setLid(t: number): void
  currents: SVGPathElement[]
  diodeGlow: SVGPathElement
  diodeLit: SVGPathElement
}

/**
 * The eye, in profile, as a tiny circuit: battery plates for lids (long +, short −) powering a diode eyeball.
 * The diode and its wires are clipped to everything below the upper plate, so the plate uncovers them as it
 * lifts; the upper lead's tail stretches down to the plate while it is lowered. Built shut.
 */
function buildEye(): EyeParts {
  const uid = Math.random().toString(36).slice(2, 8)
  const maskId = `egg-eye-mask-${uid}`
  const eye = svg('g', { transform: `translate(${EYE.x} ${EYE.y})` }, 'egg-eye')
  const maskClip = svg('clipPath', { id: maskId })
  const mask = svg('rect', PLATE_MASK)
  maskClip.append(mask)
  const shape = svg('path', { d: EYE_SHAPE, fill: 'none', stroke: 'none' }, 'egg-eye-shape') // the outline the e2e checks
  const ball = svg('g', { 'clip-path': `url(#${maskId})` }, 'egg-sym-ball')
  const wires = [ANODE_WIRE_D, CATHODE_WIRE_D].map((d) => svg('path', { d }, 'egg-sym-wire'))
  const currents = [ANODE_WIRE_D, CATHODE_WIRE_D].map((d) => svg('path', { d }, 'egg-sym-current'))
  const diodeGlow = svg('path', { d: DIODE_D }, 'egg-sym-glow')
  const diode = svg('path', { d: DIODE_D }, 'egg-sym-diode')
  const diodeLit = svg('path', { d: DIODE_D }, 'egg-sym-lit')
  ball.append(...wires, ...currents, diodeGlow, diode, diodeLit)
  const lower = svg('path', { d: LOWER_D }, 'egg-sym-plate')
  const tail = svg('path', { d: leadTailD(0) }, 'egg-sym-plate egg-sym-tail')
  const upper = svg('g', {}, 'egg-sym-upper')
  upper.append(svg('path', { d: UPPER_D }, 'egg-sym-plate'), svg('path', { d: PLUS_D }, 'egg-sym-plus'))
  const setLid = (t: number) => {
    const tf = plateTransform(t)
    mask.setAttribute('transform', tf)
    upper.setAttribute('transform', tf)
    tail.setAttribute('d', leadTailD(Math.min(1, t)))
  }
  setLid(0)
  eye.append(maskClip, shape, ball, tail, lower, upper)
  return { eye, setLid, currents, diodeGlow, diodeLit }
}

export interface EyeHint {
  /** One brief faint pulse as a lobe is wired; `wired` of `total` lobes sets its strength. No-op under reduced motion. */
  flicker(wired: number, total: number): void
  /** Hand the eye to the egg (it opens this same element); the hint is spent. */
  adopt(): EyeParts
  remove(): void
}

/** Before the circuit closes: the eye, shut (plates shorted, diode dark, no feed), barely there. Inert. */
export function mountEyeHint(head: SVGGElement): EyeHint {
  const parts = buildEye()
  const { eye } = parts
  eye.classList.add('is-hint')
  eye.dataset.eggEyeClosed = ''
  eye.setAttribute('aria-hidden', 'true')
  head.append(eye)
  let flick: Animation | null = null
  let spent = false
  return {
    flicker(wired, total) {
      if (spent || (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)) return
      const base = +getComputedStyle(eye).opacity
      const k = Math.max(0, Math.min(1, (wired - 1) / Math.max(1, total - 2))) // 1/5 → 0 … 4/5 → 1
      const peak = 0.26 + 0.14 * k
      flick?.cancel()
      flick = eye.animate([{ opacity: base }, { opacity: peak, offset: 0.3 }, { opacity: base }],
        { duration: 250, easing: 'ease-out', id: 'egg-flicker' })
      eye.classList.add('is-flicker')
      flick.onfinish = flick.oncancel = () => eye.classList.remove('is-flicker')
    },
    adopt() {
      spent = true
      flick?.cancel()
      return parts
    },
    remove() {
      spent = true
      flick?.cancel()
      eye.remove()
    },
  }
}
