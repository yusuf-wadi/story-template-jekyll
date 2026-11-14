// Cursor-as-light: a radial rim gradient on each glass outline follows the pointer, easing back to the static rim on leave.
// The eye is a second light: once the egg's eye is open, the rim nearest it picks up a faint, static electric-blue fill
// (the cursor stays the neutral key light). It breathes with the eye in CSS only, so it costs nothing per frame.
import { EYE } from '../egg/layout'
const SVG_NS = 'http://www.w3.org/2000/svg'

interface Lit { grad: SVGRadialGradientElement; path: SVGElement; toLocal(sx: number, sy: number): [number, number] }

/** How far the eye's light reaches, in head units. */
const EYE_REACH = 260

export function mountLight(stage: HTMLElement): void {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  const headSvg = stage.querySelector<SVGSVGElement>(':scope > svg')
  const bubble = stage.querySelector<SVGSVGElement>('.writing-mark svg')
  const headG = headSvg?.querySelector<SVGGElement>(':scope > g')
  if (!headSvg || !bubble || !headG) return
  // Head source coordinates <-> stage fraction, from the head <g>'s own transform (so re-placing the head can't drift).
  const m = headG.transform.baseVal.consolidate()?.matrix ?? new DOMMatrix()
  const hm = new DOMMatrix([m.a, m.b, m.c, m.d, m.e, m.f])
  const inv = hm.inverse()
  const vbW = headSvg.viewBox.baseVal.width || 800, vbH = headSvg.viewBox.baseVal.height || 800
  const headToStage = (x: number, y: number): [number, number] =>
    [(hm.a * x + hm.c * y + hm.e) / vbW, (hm.b * x + hm.d * y + hm.f) / vbH]
  const stageToHead = (sx: number, sy: number): [number, number] => {
    const X = sx * vbW, Y = sy * vbH
    return [inv.a * X + inv.c * Y + inv.e, inv.b * X + inv.d * Y + inv.f]
  }

  const lit: Lit[] = []
  const eyeLit: Lit[] = []
  const rim = (svg: SVGSVGElement, src: SVGPathElement, id: string, r: number, color: string, stops: number[][], cls: string, host: Element) => {
    const defs = svg.querySelector('defs')!
    const grad = document.createElementNS(SVG_NS, 'radialGradient')
    grad.id = id
    grad.setAttribute('gradientUnits', 'userSpaceOnUse')
    grad.setAttribute('r', String(r))
    for (const [o, a] of stops) {
      const s = document.createElementNS(SVG_NS, 'stop')
      s.setAttribute('offset', String(o)); s.setAttribute('stop-color', color); s.setAttribute('stop-opacity', String(a))
      grad.append(s)
    }
    defs.append(grad)
    const path = src.cloneNode() as SVGPathElement
    path.setAttribute('class', cls); path.removeAttribute('id'); path.style.stroke = `url(#${id})`
    host.insertBefore(path, src.nextSibling)
    return { grad, path }
  }
  const add = (svg: SVGSVGElement, src: SVGPathElement, id: string, r: number, toLocal: Lit['toLocal'], host: Element) => {
    // The eye's cool fill sits under the cursor's key light.
    eyeLit.push({ ...rim(svg, src, `${id}-eye`, 1, '#6fd8ff', [[0, 0.7], [0.3, 0.38], [0.7, 0.1], [1, 0]], 'eye-rim', host), toLocal })
    if (!reduced) lit.push({ ...rim(svg, src, id, r, '#fff', [[0, 0.95], [0.3, 0.45], [0.7, 0.1], [1, 0]], 'lit-rim', host), toLocal })
  }

  const headOutline = headG.querySelector<SVGPathElement>('.head-outline')!
  const bubbleBody = bubble.querySelector<SVGPathElement>('.bubble-body')!
  // Head: stage fraction -> viewBox -> source coords (inverse of the head transform).
  add(headSvg, headOutline, 'head-light', 320 / (Math.hypot(hm.a, hm.b) || 1), stageToHead, headG)
  // Bubble: stage fraction -> its viewBox (100x50), from where it sits on the stage (measured, so CSS can move it).
  let rect = stage.getBoundingClientRect()
  let bub = bubble.getBoundingClientRect()
  add(bubble, bubbleBody, 'bubble-light', 260, (sx, sy) => {
    if (!bub.width) measure() // first measured while the profile was hidden
    return [
      ((rect.left + sx * rect.width - bub.left) / bub.width) * 100,
      ((rect.top + sy * rect.height - bub.top) / bub.height) * 50,
    ]
  }, bubble)
  const measure = () => { rect = stage.getBoundingClientRect(); bub = bubble.getBoundingClientRect() }
  addEventListener('resize', measure)
  addEventListener('scroll', measure, { passive: true })

  // The eye light: centred on the eye, with the same reach in every outline's own units. Placed once per show/resize.
  let eyeOn = false
  function placeEye() {
    if (!eyeOn) return
    measure()
    if (!bub.width) return // hidden: placed when it shows (the observer below)
    const [ex, ey] = headToStage(EYE.x, EYE.y)
    const [rx] = headToStage(EYE.x + EYE_REACH, EYE.y)
    for (const l of eyeLit) {
      const [x, y] = l.toLocal(ex, ey)
      const r = Math.hypot(l.toLocal(rx, ey)[0] - x, l.toLocal(rx, ey)[1] - y)
      l.grad.setAttribute('cx', x.toFixed(1)); l.grad.setAttribute('cy', y.toFixed(1)); l.grad.setAttribute('r', r.toFixed(1))
    }
  }
  addEventListener('egg-eye', (e) => {
    eyeOn = !!(e as CustomEvent<{ open: boolean }>).detail?.open
    placeEye()
    for (const l of eyeLit) l.path.classList.toggle('is-on', eyeOn)
  })
  // Showing the profile (or resizing) changes the bubble's box: re-place the eye light then.
  new ResizeObserver(placeEye).observe(bubble)
  if (reduced) return

  let tx = 0, ty = 0, cx = 0, cy = 0, on = false, raf = 0
  const frame = () => {
    raf = 0
    cx += (tx - cx) * 0.2; cy += (ty - cy) * 0.2
    for (const l of lit) {
      const [x, y] = l.toLocal(cx, cy)
      l.grad.setAttribute('cx', x.toFixed(1)); l.grad.setAttribute('cy', y.toFixed(1))
    }
    if (on && Math.hypot(tx - cx, ty - cy) > 0.0005) raf = requestAnimationFrame(frame)
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame) }
  const setOn = (v: boolean) => { on = v; for (const l of lit) l.path.style.opacity = v ? '1' : '0' }

  document.addEventListener('pointermove', (e) => {
    // No work while a section or the list covers the profile; the light re-seeds from the next move once it shows.
    if (e.pointerType === 'touch' || stage.closest('[hidden]')) { if (on) setOn(false); return }
    const x = (e.clientX - rect.left) / rect.width, y = (e.clientY - rect.top) / rect.height
    if (!on) { cx = tx = x; cy = ty = y; setOn(true) }
    tx = x; ty = y
    kick()
  })
  document.documentElement.addEventListener('pointerleave', () => setOn(false))
  addEventListener('blur', () => setOn(false))
}
