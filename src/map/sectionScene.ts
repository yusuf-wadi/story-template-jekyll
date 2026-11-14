import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Item, SectionId, SectionLayout } from '../types'
import { createClusterFields, type ClusterFields } from './clusterFields'
import { createForceSim, type ForceSim } from './forceSim'
import { createGraphView, type GraphView } from './graphView'
import { createLabels } from './labels'
import { GAP, CARD_MAX_W, SHEET_H, NARROW } from '../reader/card'
import { DIVE_MS, FADE_MS, assignParticles, easeInOutCubic, smoothstep, zoomAt, type DiveFrom } from '../dive'

export interface SectionScene {
  /** Show a section; with `from`, dive in from that lobe outline (particles become the nodes). */
  enter(section: SectionId, layout: SectionLayout, items: Item[], from?: DiveFrom): Promise<void>
  /** Hide the scene; with `from`, first reverse the dive (nodes dissolve back into the outline). */
  exit(from?: DiveFrom): Promise<void>
  focus(id: string | null): Promise<void>
  onNodeClick(fn: (id: string) => void): void
  onHover(fn: (label: string | null) => void): void
  refresh(): void
  /** Snap every running tween (focus, dive) to its end state. True if a dive was cut short. */
  cancelTransitions(): boolean
  /** The running dive's direction, if any. */
  diving(): 'in' | 'out' | null
  /** CSS-px centre, on-screen radius and hue of a node at its current sim position (null when not shown). */
  nodeAnchor(id: string): { x: number; y: number; r: number; color: string } | null
  /** Called after every rendered frame (the camera or nodes may have moved). Frames stop when the scene is idle. */
  onFrame(fn: () => void): void
  /** Focus the first node button in tour order; false if the section has none. */
  focusFirstNode(): boolean
  /** The focusable button of a node (its label). */
  nodeButton(id: string): HTMLElement | null
  dispose(): void
}

const CLICK_PX = 5
/** Min screen-space pick radius so small nodes stay easy to hover. */
const PICK_PX = 14
/** Fingers are blunter: a 44px-wide target around every node. */
const TOUCH_PICK_PX = 22
/** Sim sleeps once kinetic energy per node drops below this (and nothing is pinned). */
const SLEEP_E = 1e-5
/** The dive starts (in) / ends (out) this much farther from the target: the camera pushes in as the nodes form. */
const DOLLY = 1.5
const MAX_DISTANCE = 40
const SPARK = new THREE.Color(0x6fd8ff)
/** Phones render at most 1.5 device px per CSS px: fill-rate, battery and heat over the last bit of crispness. */
const PHONE = '(max-width: 600px)'
const pixelRatio = () => Math.min(window.devicePixelRatio || 1, window.matchMedia?.(PHONE).matches ? 1.5 : 2)

function dotTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 32
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.4, 'rgba(255,255,255,0.5)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 32, 32)
  return new THREE.CanvasTexture(c)
}

type Dive = {
  dir: 'in' | 'out'
  t0: number
  dur: number
  from: DiveFrom | null
  cam0: THREE.Vector3
  cam1: THREE.Vector3
  points: THREE.Points | null
  /** Node id per particle, the particle's offset inside its node, and when it leaves the outline (0.15..0.3). */
  ids: string[]
  jitter: Float32Array
  delay: Float32Array
  /** Each particle's node hue, resolved once when the dive starts. */
  hues: THREE.Color[]
  fade: Animation | null
}

export function createSectionScene(host: HTMLElement, isVisited: (id: string) => boolean = () => false): SectionScene {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(pixelRatio())
  host.append(renderer.domElement)
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200)
  camera.position.set(0, 4, 20)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.minDistance = 6
  controls.maxDistance = MAX_DISTANCE
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  controls.autoRotateSpeed = 0.4
  const labels = createLabels(host, {
    hover(id) {
      fields?.setHighlight(null)
      setHoverNode(id)
      emitHover(id ? titles.get(id) ?? null : null)
      invalidate()
    },
    open(id) { clickFn(id) },
  })

  let fields: ClusterFields | null = null
  let view: GraphView | null = null
  let sim: ForceSim | null = null
  let awake = false
  let titles = new Map<string, string>()
  let clickFn: (id: string) => void = () => {}
  let frameFn: () => void = () => {}
  let hoverFn: (label: string | null) => void = () => {}
  let lastLabel: string | null = null
  let hoverId: string | null = null
  /** The open node: stays lit (rest of the graph dimmed) whenever nothing is hovered. */
  let selected: string | null = null
  let interacted = false
  let raf = 0
  /** The scene is shown; frames are drawn only while something changes (see `loop`). */
  let running = false
  /** Something changed that needs a frame drawn (input, resize, focus, refresh...). */
  let dirty = false
  type Shift = { x: number; y: number }
  let focusTween: { from: THREE.Vector3; to: THREE.Vector3; s0: Shift; s1: Shift; t: number } | null = null
  /** Screen-space framing (px): moves the focused node off-centre so it and its card read as one composition. */
  let shift: Shift = { x: 0, y: 0 }
  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const v = new THREE.Vector3()
  let pointer: { x: number; y: number } | null = null
  let down: { x: number; y: number; id: string | null; plane: THREE.Plane | null } | null = null
  let dragging = false
  let dive: Dive | null = null
  /** Touch has no hover: the first tap on a node arms it (label shown), a second tap on it opens. */
  let armed: string | null = null
  let touching = false
  /** e2e/screenshots only: pin the dive clock at this progress. */
  let heldT: number | null = null
  let dots: THREE.CanvasTexture | null = null
  const plane = new THREE.Plane()
  const a3 = new THREE.Vector3()
  const b3 = new THREE.Vector3()
  const col = new THREE.Color()

  const el = renderer.domElement
  const resize = () => {
    const w = host.clientWidth || window.innerWidth
    const h = host.clientHeight || window.innerHeight
    if (renderer.getPixelRatio() !== pixelRatio()) renderer.setPixelRatio(pixelRatio())
    renderer.setSize(w, h)
    camera.aspect = w / h
    // Keep the open node clear of the card/sheet when the viewport changes shape.
    if (selected) {
      const s1 = framing(true)
      if (focusTween) focusTween.s1 = s1
      else shift = s1
    }
    applyShift()
    invalidate()
  }
  function applyShift() {
    const w = host.clientWidth || window.innerWidth
    const h = host.clientHeight || window.innerHeight
    if (Math.abs(shift.x) < 0.5 && Math.abs(shift.y) < 0.5) camera.clearViewOffset()
    else camera.setViewOffset(w, h, shift.x, shift.y, w, h)
    camera.updateProjectionMatrix()
  }
  /** Where the open node should sit: left of centre by half a card (desktop), or centred above the sheet (narrow). */
  function framing(open: boolean): Shift {
    const w = host.clientWidth || window.innerWidth
    const h = host.clientHeight || window.innerHeight
    if (!open) return { x: 0, y: 0 }
    if (w <= NARROW) return { x: 0, y: (h * SHEET_H) / 2 }
    return w >= 2 * (CARD_MAX_W + GAP) + 64 ? { x: (CARD_MAX_W + GAP) / 2, y: 0 } : { x: 0, y: 0 }
  }
  window.addEventListener('resize', resize)

  function emitHover(label: string | null) {
    if (label === lastLabel) return
    lastLabel = label
    hoverFn(label)
  }
  function setHoverNode(id: string | null) {
    if (id === hoverId) return
    hoverId = id
    view?.setFocus(id ?? selected)
    awake = true
    invalidate()
  }
  function screenPos(id: string): { x: number; y: number } | null {
    const p = sim?.positions.get(id)
    if (!p) return null
    camera.updateMatrixWorld()
    v.copy(p).project(camera)
    const r = el.getBoundingClientRect()
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }
  }
  function setRay(x: number, y: number) {
    const r = el.getBoundingClientRect()
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1)
    raycaster.setFromCamera(ndc, camera)
  }

  /** Nearest node on screen within its projected radius (min PICK_PX), front-most on ties. */
  function nodeAt(x: number, y: number): string | null {
    if (!view || !sim) return null
    const pxPerUnit = el.getBoundingClientRect().height / (2 * Math.tan((camera.fov * Math.PI) / 360))
    let best: string | null = null
    let bestD = Infinity
    for (const [id, m] of view.meshes) {
      const s = screenPos(id)
      if (!s) continue
      const dist = Math.hypot(s.x - x, s.y - y)
      const reach = Math.max(touching ? TOUCH_PICK_PX : PICK_PX, (m.scale.x * pxPerUnit) / camera.position.distanceTo(m.position) + 4)
      if (dist <= reach && dist < bestD) { best = id; bestD = dist }
    }
    return best
  }

  function pick(): string | null {
    if (!pointer) return null
    const nodeId = nodeAt(pointer.x, pointer.y)
    if (nodeId) {
      fields?.setHighlight(null)
      setHoverNode(nodeId)
      emitHover(titles.get(nodeId) ?? null)
      el.style.cursor = 'pointer'
      return nodeId
    }
    if (!dragging) setHoverNode(null)
    el.style.cursor = ''
    setRay(pointer.x, pointer.y)
    const c = fields?.hit(raycaster.ray) ?? null
    fields?.setHighlight(c)
    emitHover(c ? c.label : null)
    return null
  }

  // Capture phase on the host runs before OrbitControls' canvas listener, so a node press never starts an orbit.
  const onDown = (e: PointerEvent) => {
    if (e.target !== el) return
    invalidate()
    if (dive) { finishDive(); return } // a click mid-dive skips to the end
    touching = e.pointerType === 'touch'
    interacted = true
    const id = nodeAt(e.clientX, e.clientY)
    let plane: THREE.Plane | null = null
    if (id && sim) {
      plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
        camera.getWorldDirection(new THREE.Vector3()), sim.positions.get(id)!.clone())
      controls.enabled = false
      el.setPointerCapture?.(e.pointerId)
    }
    down = { x: e.clientX, y: e.clientY, id, plane }
  }
  host.addEventListener('pointerdown', onDown, true)
  el.addEventListener('pointermove', (e) => {
    pointer = { x: e.clientX, y: e.clientY }
    invalidate()
    if (down?.id && down.plane && sim) {
      if (!dragging && Math.hypot(e.clientX - down.x, e.clientY - down.y) <= CLICK_PX) return
      dragging = true
      setRay(e.clientX, e.clientY)
      if (raycaster.ray.intersectPlane(down.plane, v)) { sim.pin(down.id, v); awake = true }
      return
    }
    if (!dive) pick()
  })
  /** Drop any press/drag: release the pinned node and give orbit back. */
  function resetDrag() {
    if (down?.id) { sim?.pin(down.id, null); awake = true; invalidate() }
    down = null
    dragging = false
    controls.enabled = true
  }
  // A tap on the canvas is fully handled by the pointer events above. Cancel the touch's compatibility mouse events
  // and click: a tap that opens a card would otherwise have them land on the card that just grew under the finger.
  el.addEventListener('touchend', (e) => { if (e.cancelable) e.preventDefault() }, { passive: false })
  // The OS can take the pointer mid-drag (touch scroll, alt-tab, capture loss): never leave a node pinned.
  el.addEventListener('pointercancel', resetDrag)
  el.addEventListener('lostpointercapture', resetDrag)
  el.addEventListener('pointerleave', (e) => {
    if (down?.id || e.pointerType === 'touch') return // a lifted finger "leaves"; keep the tapped label up
    pointer = null; fields?.setHighlight(null); setHoverNode(null); emitHover(null); invalidate()
  })
  el.addEventListener('pointerup', (e) => {
    if (!down) return
    invalidate()
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y)
    const pressed = down.id
    down = null
    controls.enabled = true
    if (pressed) { sim?.pin(pressed, null); awake = true }
    const wasDrag = dragging
    dragging = false
    pointer = { x: e.clientX, y: e.clientY }
    const id = pick()
    if (moved > CLICK_PX || wasDrag) return
    if (e.pointerType === 'touch') {
      if (id && id === armed) { armed = null; clickFn(id); return }
      armed = id
      if (!id) { fields?.setHighlight(null); setHoverNode(null); emitHover(null) }
      return
    }
    if (id) clickFn(id)
  })

  function clear() {
    if (view) { scene.remove(view.group); view.dispose(); view = null }
    if (fields) { scene.remove(fields.group); fields.dispose(); fields = null }
    sim = null
    hoverId = null
    selected = null
    armed = null
    labels.clear()
  }

  function setReveal(k: number) {
    view?.setReveal(k)
    fields?.setReveal(k)
    labels.setReveal(k)
  }
  /** Screen px -> the plane through the orbit target, facing the camera. */
  function toWorld(x: number, y: number, out: THREE.Vector3) {
    setRay(x, y)
    if (!raycaster.ray.intersectPlane(plane, out)) out.copy(controls.target)
  }
  function startDive(dir: 'in' | 'out', from: DiveFrom | null) {
    const target = controls.target
    const near = camera.position.clone()
    const far = near.clone().sub(target).multiplyScalar(DOLLY).add(target)
    // The pulled-back camera must not be clamped by OrbitControls (phones fit the graph from farther out), or the
    // particles are unprojected for one camera and drawn from another: the outline would no longer match the lobe.
    controls.maxDistance = Math.max(MAX_DISTANCE, far.distanceTo(target) + 1)
    const d: Dive = {
      dir, t0: performance.now(), dur: reduced ? FADE_MS : DIVE_MS, from,
      cam0: dir === 'in' ? far : near, cam1: dir === 'in' ? near : far,
      points: null, ids: [], jitter: new Float32Array(0), delay: new Float32Array(0), hues: [], fade: null,
    }
    if (reduced || !from || !from.pts.length || !sim) {
      if (dir === 'in') d.fade = host.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS })
      dive = d
      return
    }
    camera.position.copy(d.cam0)
    controls.update()
    camera.updateMatrixWorld()
    // particles head for the node on their own side of the outline
    const nodeIds = [...sim.positions.keys()]
    const dx = from.origin.x - from.center.x, dy = from.origin.y - from.center.y
    const nodePx = nodeIds.map((id) => { const p = screenPos(id) ?? { x: from.center.x, y: from.center.y }; return { x: p.x + dx, y: p.y + dy } })
    d.ids = assignParticles(from.pts, nodePx, from.origin).map((i) => nodeIds[i])
    const hueOf = new Map(nodeIds.map((id) => [id, new THREE.Color(view!.colorOf(id)!)]))
    d.hues = d.ids.map((id) => hueOf.get(id)!)
    const n = d.ids.length
    d.jitter = new Float32Array(n * 3)
    d.delay = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 * Math.PI, w = Math.acos(2 * Math.random() - 1), r = 0.7 * Math.cbrt(Math.random())
      d.jitter.set([r * Math.sin(w) * Math.cos(u), r * Math.sin(w) * Math.sin(u), r * Math.cos(w)], i * 3)
      d.delay[i] = 0.15 + Math.random() * 0.15 // hold the outline a moment, then dissolve
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage))
    dots ??= dotTexture()
    d.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 3, sizeAttenuation: false, map: dots, vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }))
    d.points.frustumCulled = false
    d.points.raycast = () => {}
    scene.add(d.points)
    dive = d
    stepDive(0)
  }
  function stepDive(t: number) {
    const d = dive!
    const e = easeInOutCubic(t)
    camera.position.lerpVectors(d.cam0, d.cam1, e)
    if (d.dir === 'in') setReveal(d.points ? smoothstep(0.6, 0.95, t) : 1)
    else setReveal(1 - smoothstep(0, 0.35, t))
    if (!d.points || !d.from || !sim || !view) return
    camera.updateMatrixWorld()
    plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(a3), controls.target)
    const pos = d.points.geometry.attributes.position as THREE.BufferAttribute
    const cols = d.points.geometry.attributes.color as THREE.BufferAttribute
    const ez = d.dir === 'in' ? e : 1 - e
    for (let i = 0; i < d.ids.length; i++) {
      const sp = zoomAt(d.from.pts[i], d.from, ez)
      toWorld(sp.x, sp.y, a3)
      const id = d.ids[i]
      const m = view.meshes.get(id)!
      const r = m.scale.x
      b3.set(d.jitter[i * 3], d.jitter[i * 3 + 1], d.jitter[i * 3 + 2]).multiplyScalar(r).add(sim.positions.get(id)!)
      const k = easeInOutCubic((t - d.delay[i]) / 0.6)
      if (d.dir === 'in') a3.lerp(b3, k); else a3.copy(b3.lerp(a3, k))
      pos.setXYZ(i, a3.x, a3.y, a3.z)
      col.copy(SPARK).lerp(d.hues[i], d.dir === 'in' ? k : 1 - k)
      cols.setXYZ(i, col.r, col.g, col.b)
    }
    pos.needsUpdate = true
    cols.needsUpdate = true
    const mat = d.points.material as THREE.PointsMaterial
    mat.opacity = d.dir === 'in' ? 1 - smoothstep(0.8, 1, t) : smoothstep(0, 0.08, t) * (1 - smoothstep(0.85, 1, t))
  }
  function finishDive(): boolean {
    const d = dive
    if (!d) return false
    dive = null
    controls.maxDistance = MAX_DISTANCE
    d.fade?.cancel()
    if (d.points) {
      scene.remove(d.points)
      d.points.geometry.dispose()
      ;(d.points.material as THREE.Material).dispose()
    }
    setReveal(1)
    if (d.dir === 'in') { camera.position.copy(d.cam1); controls.update(); invalidate() }
    else { stop(); host.hidden = true }
    return true
  }

  /** Draw one frame; returns true if something is still moving and another frame is needed. */
  function frame(dt: number): boolean {
    let more = false
    if (sim && awake && !reduced) {
      sim.step(dt)
      if (!sim.pinned() && sim.energy() < SLEEP_E * sim.positions.size) awake = false
      else more = true
    }
    if (focusTween) {
      focusTween.t = Math.min(1, focusTween.t + dt / 0.8)
      const t = focusTween.t
      const k = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2 // ease in-out cubic
      controls.target.lerpVectors(focusTween.from, focusTween.to, k)
      const { s0, s1 } = focusTween
      shift = { x: s0.x + (s1.x - s0.x) * k, y: s0.y + (s1.y - s0.y) * k }
      applyShift()
      if (focusTween.t >= 1) focusTween = null
      else more = true
    }
    if (dive) {
      const t = heldT ?? Math.min(1, (performance.now() - dive.t0) / dive.dur)
      stepDive(t)
      if (t >= 1) { finishDive(); if (!running) return false }
      else more = true
    }
    controls.autoRotate = !reduced && !interacted && hoverId === null && selected === null && !dive
    // true while orbiting, auto-rotating or damping out
    if (controls.update()) more = true
    if (sim && view) {
      if (view.sync(sim.positions, reduced ? Infinity : dt)) more = true
      const lit = hoverId ? new Set([hoverId, ...view.neighbors.get(hoverId)!]) : null
      const v0 = view
      if (labels.update(camera, sim.positions, lit ? new Set([...view.meshes.keys()].filter((i) => !lit.has(i))) : null,
        (id) => (id === hoverId ? 1000 : id === selected ? 900 : lit?.has(id) ? 100 : 0) + v0.neighbors.get(id)!.size)) more = true
    }
    renderer.render(scene, camera)
    frameFn()
    return more
  }
  let prev = 0
  /** e2e/perf only: CPU ms spent in the last 240 frames (render submit included). */
  const work: number[] = []
  const probe = import.meta.env.DEV || location.search.includes('e2e')
  /** e2e only: frames drawn since the scene was created. */
  let frames = 0
  function loop(now: number) {
    raf = 0
    if (!running) return
    const t0 = probe ? performance.now() : 0
    dirty = false
    const more = frame(Math.min(0.05, Math.max(0, now - prev) / 1000))
    frames++
    if (probe) { work.push(performance.now() - t0); if (work.length > 240) work.shift() }
    prev = now
    // Render on demand: keep going only while something moves or changed during this frame; input restarts it.
    if (running && (more || dirty) && !raf) raf = requestAnimationFrame(loop)
  }
  /** Ask for a frame (no-op while hidden; restarts an idle loop). */
  function invalidate() {
    dirty = true
    if (!running || raf) return
    prev = performance.now()
    raf = requestAnimationFrame(loop)
  }
  function start() {
    if (running) return
    running = true
    invalidate()
  }
  function stop() { running = false; cancelAnimationFrame(raf); raf = 0 }
  controls.addEventListener('change', invalidate)
  controls.addEventListener('start', invalidate)

  const api: SectionScene = {
    async enter(_section, layout, items, from) {
      finishDive()
      clear()
      titles = new Map(items.map((i) => [i.id, i.title]))
      view = createGraphView(layout)
      scene.add(view.group)
      sim = createForceSim(layout.nodes.map((n) => ({ id: n.id, anchor: n.pos })), view.edges)
      if (reduced) sim.settle(300)
      awake = !reduced
      // Label buttons in tour order: Tab walks the section the way ←/→ does.
      const order = [...layout.tour.filter((id) => layout.nodes.some((n) => n.id === id)),
        ...layout.nodes.map((n) => n.id).filter((id) => !layout.tour.includes(id))]
      labels.set(order.map((id) => ({ id, text: titles.get(id) ?? id })))
      api.refresh()
      view.sync(sim.positions, Infinity)
      fields = createClusterFields(layout.clusters)
      scene.add(fields.group)
      host.hidden = false
      controls.target.set(0, 0, 0)
      // Portrait phones see a narrow slice horizontally: back the camera off so the whole graph fits.
      const w = host.clientWidth || window.innerWidth, h = host.clientHeight || window.innerHeight
      const fit = Math.min(1.8, Math.max(1, (1.1 * h) / w))
      camera.position.set(0, 4 * fit, 20 * fit)
      labels.setDepthScale(fit)
      interacted = false
      shift = { x: 0, y: 0 }
      resize()
      controls.update() // orient the camera now so anchors read before the first frame are right
      lastLabel = null
      hoverFn(null)
      start()
      invalidate()
      if (from) startDive('in', from)
    },
    async exit(from) {
      finishDive()
      setHoverNode(null)
      emitHover(null)
      resetDrag()
      armed = null
      selected = null
      view?.setFocus(null)
      if (from && !reduced && !host.hidden && sim) { focusTween = null; startDive('out', from); invalidate(); return }
      stop()
      host.hidden = true
    },
    async focus(id) {
      const p = id ? sim?.positions.get(id) : null
      selected = p ? id : null
      view?.setFocus(hoverId ?? selected)
      awake = true
      const to = p ? p.clone() : new THREE.Vector3()
      const s1 = framing(!!p)
      if (reduced) {
        // Jump, don't tween: the card is placed once against the final camera.
        focusTween = null
        controls.target.copy(to)
        shift = s1
        applyShift()
        controls.update()
        invalidate()
        return
      }
      focusTween = { from: controls.target.clone(), to, s0: { ...shift }, s1, t: 0 }
      invalidate()
    },
    onNodeClick(fn) { clickFn = fn },
    onHover(fn) { hoverFn = fn },
    refresh() {
      view?.refresh(isVisited)
      labels.setVisited(isVisited)
      invalidate()
    },
    cancelTransitions() { focusTween = null; invalidate(); return finishDive() },
    diving() { return dive?.dir ?? null },
    nodeAnchor(id) {
      const m = view?.meshes.get(id)
      const s = screenPos(id)
      if (!m || !s || host.hidden) return null
      const pxPerUnit = el.getBoundingClientRect().height / (2 * Math.tan((camera.fov * Math.PI) / 360))
      const r = (m.scale.x * pxPerUnit) / Math.max(1e-3, camera.position.distanceTo(sim!.positions.get(id)!))
      return { x: s.x, y: s.y, r, color: view!.colorOf(id)! }
    },
    onFrame(fn) { frameFn = fn },
    focusFirstNode() { return labels.focusFirst() },
    nodeButton(id) { return host.hidden ? null : labels.button(id) },
    dispose() {
      stop()
      window.removeEventListener('resize', resize)
      host.removeEventListener('pointerdown', onDown, true)
      clear()
      controls.dispose()
      renderer.dispose()
      el.remove()
      delete (window as unknown as { __cm?: unknown }).__cm
    },
  }

  if (import.meta.env.DEV || location.search.includes('e2e')) {
    ;(window as unknown as { __cm: unknown }).__cm = {
      nodeBrightness: (id: string) => view?.brightness(id) ?? null,
      nodeRing: (id: string) => view?.ring(id) ?? null,
      pixelRatio: () => renderer.getPixelRatio(),
      frameWork: () => work.slice(),
      nodeScreenPos: (id: string) => screenPos(id),
      nodeAnchor: (id: string) => api.nodeAnchor(id),
      edges: () => view?.edges.map((e) => [...e]) ?? [],
      diving: () => api.diving(),
      holdDive: (t: number | null) => { heldT = t; invalidate() },
      frames: () => frames,
      idle: () => running && !raf,
      /** The sim is asleep and no focus tween or dive is running (auto-rotate may still turn the camera). */
      settled: () => (reduced || !awake) && !focusTween && !dive,
      reveal: () => view?.reveal() ?? null,
      /** Screen-px bounding box of the dive particles as the current camera draws them. */
      diveBounds: () => {
        const pos = dive?.points?.geometry.attributes.position as THREE.BufferAttribute | undefined
        if (!pos) return null
        camera.updateMatrixWorld()
        const r = el.getBoundingClientRect()
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
        for (let i = 0; i < pos.count; i++) {
          v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).project(camera)
          const x = r.left + ((v.x + 1) / 2) * r.width, y = r.top + ((1 - v.y) / 2) * r.height
          x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
        }
        return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
      },
      particles: () => dive?.points ? dive.ids.length : 0,
      dragState: () => ({ dragging, pressed: !!down, orbit: controls.enabled, pinned: sim?.pinned() ?? false }),
      labelText: (id: string) => host.querySelector<HTMLElement>(`[data-node-label="${CSS.escape(id)}"]`)?.textContent ?? null,
    }
  }
  return api
}
