import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Item, SectionId, SectionLayout } from '../types'
import { createClusterFields, type ClusterFields } from './clusterFields'

export interface SectionScene {
  enter(section: SectionId, layout: SectionLayout, items: Item[]): Promise<void>
  exit(): Promise<void>
  focus(id: string | null): Promise<void>
  onNodeClick(fn: (id: string) => void): void
  onHover(fn: (label: string | null) => void): void
  refresh(): void
  cancelTransitions(): void
  dispose(): void
}

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
  controls.autoRotate = !reduced
  controls.autoRotateSpeed = 0.6

  const nodeGroup = new THREE.Group()
  scene.add(nodeGroup)
  let fields: ClusterFields | null = null
  let meshes = new Map<string, THREE.Mesh>()
  let titles = new Map<string, string>()
  let clusterLabels: SectionLayout['clusters'] = []
  let clickFn: (id: string) => void = () => {}
  let hoverFn: (label: string | null) => void = () => {}
  let lastLabel: string | null = null
  let raf = 0
  let running = false
  let focusTween: { from: THREE.Vector3; to: THREE.Vector3; t: number } | null = null
  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  let pointer: { x: number; y: number } | null = null
  let down: { x: number; y: number } | null = null

  const el = renderer.domElement
  const resize = () => {
    const w = host.clientWidth || window.innerWidth
    const h = host.clientHeight || window.innerHeight
    renderer.setSize(w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  window.addEventListener('resize', resize)

  function emitHover(label: string | null) {
    if (label === lastLabel) return
    lastLabel = label
    hoverFn(label)
  }

  function pick(): string | null {
    if (!pointer) return null
    const r = el.getBoundingClientRect()
    ndc.set(((pointer.x - r.left) / r.width) * 2 - 1, -((pointer.y - r.top) / r.height) * 2 + 1)
    raycaster.setFromCamera(ndc, camera)
    const hits = raycaster.intersectObjects([...meshes.values()], false)
    const nodeId = hits[0]?.object.userData.id as string | undefined
    if (nodeId) {
      fields?.setHighlight(null)
      emitHover(titles.get(nodeId) ?? null)
      el.style.cursor = 'pointer'
      return nodeId
    }
    el.style.cursor = ''
    const c = fields?.hit(raycaster.ray) ?? null
    fields?.setHighlight(c)
    emitHover(c ? c.label : null)
    return null
  }

  el.addEventListener('pointermove', (e) => { pointer = { x: e.clientX, y: e.clientY }; pick() })
  el.addEventListener('pointerleave', () => { pointer = null; fields?.setHighlight(null); emitHover(null) })
  el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; controls.autoRotate = false })
  el.addEventListener('pointerup', (e) => {
    if (!down) return
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y)
    down = null
    if (moved > 5) return
    pointer = { x: e.clientX, y: e.clientY }
    const id = pick()
    if (id) clickFn(id)
  })

  function clear() {
    for (const m of meshes.values()) { m.geometry.dispose(); (m.material as THREE.Material).dispose() }
    meshes = new Map()
    nodeGroup.clear()
    if (fields) { scene.remove(fields.group); fields.dispose(); fields = null }
  }

  function frame(dt: number) {
    if (focusTween) {
      focusTween.t = Math.min(1, focusTween.t + dt / 0.8)
      controls.target.lerpVectors(focusTween.from, focusTween.to, focusTween.t)
      if (focusTween.t >= 1) focusTween = null
    }
    controls.update()
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
      clusterLabels = layout.clusters
      for (const n of layout.nodes) {
        const mat = new THREE.MeshBasicMaterial({ color: 0xffffff })
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.35, 24, 16), mat)
        mesh.position.set(...n.pos)
        mesh.userData.id = n.id
        nodeGroup.add(mesh)
        meshes.set(n.id, mesh)
      }
      api.refresh()
      fields = createClusterFields(clusterLabels)
      scene.add(fields.group)
      host.hidden = false
      controls.target.set(0, 0, 0)
      camera.position.set(0, 4, 20)
      controls.autoRotate = !reduced
      resize()
      lastLabel = null
      hoverFn(null)
      start()
    },
    async exit() {
      stop()
      host.hidden = true
      emitHover(null)
    },
    async focus(id) {
      const m = id ? meshes.get(id) : null
      focusTween = { from: controls.target.clone(), to: m ? m.position.clone() : new THREE.Vector3(), t: 0 }
    },
    onNodeClick(fn) { clickFn = fn },
    onHover(fn) { hoverFn = fn },
    refresh() {
      for (const [id, m] of meshes) (m.material as THREE.MeshBasicMaterial).color.setScalar(isVisited(id) ? 1 : 0.35)
    },
    cancelTransitions() { focusTween = null },
    dispose() {
      stop()
      window.removeEventListener('resize', resize)
      clear()
      controls.dispose()
      renderer.dispose()
      el.remove()
      delete (window as unknown as { __cm?: unknown }).__cm
    },
  }

  if (import.meta.env.DEV || location.search.includes('e2e')) {
    ;(window as unknown as { __cm: unknown }).__cm = {
      nodeBrightness(id: string) {
        const m = meshes.get(id)
        return m ? (m.material as THREE.MeshBasicMaterial).color.r : null
      },
      nodeScreenPos(id: string) {
        const m = meshes.get(id)
        if (!m) return null
        const p = m.getWorldPosition(new THREE.Vector3()).project(camera)
        const r = el.getBoundingClientRect()
        return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height }
      },
    }
  }
  return api
}
