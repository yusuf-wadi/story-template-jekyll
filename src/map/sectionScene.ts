import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Item, SectionId, SectionLayout } from '../types'
import { createClusterFields, type ClusterFields } from './clusterFields'
import { createForceSim, type ForceSim } from './forceSim'
import { createGraphView, type GraphView } from './graphView'
import { createLabels } from './labels'
import { GAP, CARD_MAX_W, SHEET_H, NARROW } from '../reader/card'

export interface SectionScene {
  enter(section: SectionId, layout: SectionLayout, items: Item[]): Promise<void>
  exit(): Promise<void>
  focus(id: string | null): Promise<void>
  onNodeClick(fn: (id: string) => void): void
  onHover(fn: (label: string | null) => void): void
  refresh(): void
  cancelTransitions(): void
  /** CSS-px centre, on-screen radius and hue of a node at its current sim position (null when not shown). */
  nodeAnchor(id: string): { x: number; y: number; r: number; color: string } | null
  dispose(): void
}

const CLICK_PX = 5
/** Min screen-space pick radius so small nodes stay easy to hover. */
const PICK_PX = 14
/** Sim sleeps once kinetic energy per node drops below this (and nothing is pinned). */
const SLEEP_E = 1e-5

export function createSectionScene(host: HTMLElement, isVisited: (id: string) => boolean = () => false): SectionScene {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  host.append(renderer.domElement)
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200)
  camera.position.set(0, 4, 20)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.minDistance = 6
  controls.maxDistance = 40
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  controls.autoRotateSpeed = 0.4
  const labels = createLabels(host)

  let fields: ClusterFields | null = null
  let view: GraphView | null = null
  let sim: ForceSim | null = null
  let awake = false
  let titles = new Map<string, string>()
  let clickFn: (id: string) => void = () => {}
  let hoverFn: (label: string | null) => void = () => {}
  let lastLabel: string | null = null
  let hoverId: string | null = null
  /** The open node: stays lit (rest of the graph dimmed) whenever nothing is hovered. */
  let selected: string | null = null
  let interacted = false
  let raf = 0
  let running = false
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

  const el = renderer.domElement
  const resize = () => {
    const w = host.clientWidth || window.innerWidth
    const h = host.clientHeight || window.innerHeight
    renderer.setSize(w, h)
    camera.aspect = w / h
    applyShift()
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
      const reach = Math.max(PICK_PX, (m.scale.x * pxPerUnit) / camera.position.distanceTo(m.position) + 4)
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
    if (down?.id && down.plane && sim) {
      if (!dragging && Math.hypot(e.clientX - down.x, e.clientY - down.y) <= CLICK_PX) return
      dragging = true
      setRay(e.clientX, e.clientY)
      if (raycaster.ray.intersectPlane(down.plane, v)) { sim.pin(down.id, v); awake = true }
      return
    }
    pick()
  })
  el.addEventListener('pointerleave', () => {
    if (down?.id) return
    pointer = null; fields?.setHighlight(null); setHoverNode(null); emitHover(null)
  })
  el.addEventListener('pointerup', (e) => {
    if (!down) return
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
    if (id) clickFn(id)
  })

  function clear() {
    if (view) { scene.remove(view.group); view.dispose(); view = null }
    if (fields) { scene.remove(fields.group); fields.dispose(); fields = null }
    sim = null
    hoverId = null
    selected = null
    labels.clear()
  }

  function frame(dt: number) {
    if (sim && awake && !reduced) {
      sim.step(dt)
      if (!sim.pinned() && sim.energy() < SLEEP_E * sim.positions.size) awake = false
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
    }
    controls.autoRotate = !reduced && !interacted && hoverId === null && selected === null
    controls.update()
    if (sim && view) {
      view.sync(sim.positions, reduced ? Infinity : dt)
      const lit = hoverId ? new Set([hoverId, ...view.neighbors.get(hoverId)!]) : null
      labels.update(camera, sim.positions, lit ? new Set([...view.meshes.keys()].filter((i) => !lit.has(i))) : null)
    }
    renderer.render(scene, camera)
  }
  let prev = 0
  function loop(now: number) {
    if (!running) return
    frame(Math.min(0.05, (now - prev) / 1000))
    prev = now
    raf = requestAnimationFrame(loop)
  }
  function start() {
    if (running) return
    running = true
    prev = performance.now()
    raf = requestAnimationFrame(loop)
  }
  function stop() { running = false; cancelAnimationFrame(raf) }

  const api: SectionScene = {
    async enter(_section, layout, items) {
      clear()
      titles = new Map(items.map((i) => [i.id, i.title]))
      view = createGraphView(layout)
      scene.add(view.group)
      sim = createForceSim(layout.nodes.map((n) => ({ id: n.id, anchor: n.pos })), view.edges)
      if (reduced) sim.settle(300)
      awake = !reduced
      labels.set(layout.nodes.map((n) => ({ id: n.id, text: titles.get(n.id) ?? n.id })))
      api.refresh()
      view.sync(sim.positions, Infinity)
      fields = createClusterFields(layout.clusters)
      scene.add(fields.group)
      host.hidden = false
      controls.target.set(0, 0, 0)
      camera.position.set(0, 4, 20)
      interacted = false
      shift = { x: 0, y: 0 }
      resize()
      controls.update() // orient the camera now so anchors read before the first frame are right
      lastLabel = null
      hoverFn(null)
      start()
    },
    async exit() {
      stop()
      host.hidden = true
      setHoverNode(null)
      emitHover(null)
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
        return
      }
      focusTween = { from: controls.target.clone(), to, s0: { ...shift }, s1, t: 0 }
    },
    onNodeClick(fn) { clickFn = fn },
    onHover(fn) { hoverFn = fn },
    refresh() { view?.refresh(isVisited) },
    cancelTransitions() { focusTween = null },
    nodeAnchor(id) {
      const m = view?.meshes.get(id)
      const s = screenPos(id)
      if (!m || !s || host.hidden) return null
      const pxPerUnit = el.getBoundingClientRect().height / (2 * Math.tan((camera.fov * Math.PI) / 360))
      const r = (m.scale.x * pxPerUnit) / Math.max(1e-3, camera.position.distanceTo(sim!.positions.get(id)!))
      return { x: s.x, y: s.y, r, color: view!.colorOf(id)! }
    },
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
      nodeScreenPos: (id: string) => screenPos(id),
      nodeAnchor: (id: string) => api.nodeAnchor(id),
      edges: () => view?.edges.map((e) => [...e]) ?? [],
      labelText: (id: string) => host.querySelector<HTMLElement>(`[data-node-label="${CSS.escape(id)}"]`)?.textContent ?? null,
    }
  }
  return api
}
