// Cursor-as-light: a radial rim gradient on each glass outline follows the pointer, easing back to the static rim on leave.
const SVG_NS = 'http://www.w3.org/2000/svg'

interface Lit { grad: SVGRadialGradientElement; path: SVGElement; toLocal(sx: number, sy: number): [number, number] }

export function mountLight(stage: HTMLElement): void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const headSvg = stage.querySelector<SVGSVGElement>(':scope > svg')
  const bubble = stage.querySelector<SVGSVGElement>('.writing-mark svg')
  const headG = headSvg?.querySelector<SVGGElement>(':scope > g')
  if (!headSvg || !bubble || !headG) return

  const lit: Lit[] = []
  const add = (svg: SVGSVGElement, src: SVGPathElement, id: string, r: number, toLocal: Lit['toLocal'], host: Element) => {
    const defs = svg.querySelector('defs')!
    const grad = document.createElementNS(SVG_NS, 'radialGradient')
    grad.id = id
    grad.setAttribute('gradientUnits', 'userSpaceOnUse')
    grad.setAttribute('r', String(r))
    for (const [o, a] of [[0, 0.95], [0.3, 0.45], [0.7, 0.1], [1, 0]]) {
      const s = document.createElementNS(SVG_NS, 'stop')
      s.setAttribute('offset', String(o)); s.setAttribute('stop-color', '#fff'); s.setAttribute('stop-opacity', String(a))
      grad.append(s)
    }
    defs.append(grad)
    const path = src.cloneNode() as SVGPathElement
    path.setAttribute('class', 'lit-rim'); path.removeAttribute('id'); path.style.stroke = `url(#${id})`
    host.insertBefore(path, src.nextSibling)
    lit.push({ grad, path, toLocal })
  }

  const headOutline = headG.querySelector<SVGPathElement>('.head-outline')!
  const bubbleBody = bubble.querySelector<SVGPathElement>('.bubble-body')!
  // Head: stage px -> viewBox (800) -> source coords (inverse of HEAD_TRANSFORM, scale .88).
  add(headSvg, headOutline, 'head-light', 320 / 0.88, (sx, sy) => [(sx * 800 + 74.8) / 0.88, (sy * 800 + 38.3) / 0.88], headG)
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
    if (e.pointerType === 'touch') return
    const x = (e.clientX - rect.left) / rect.width, y = (e.clientY - rect.top) / rect.height
    if (!on) { cx = tx = x; cy = ty = y; setOn(true) }
    tx = x; ty = y
    kick()
  })
  document.documentElement.addEventListener('pointerleave', () => setOn(false))
  addEventListener('blur', () => setOn(false))
}
