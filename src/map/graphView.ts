import * as THREE from 'three'
import type { SectionLayout } from '../types'
import { clusterColor, NEUTRAL } from './clusterFields'

/** Opacity non-focused nodes/edges/labels fade to while a node is hovered. */
export const DIM = 0.15
const FADE_S = 0.15
const EDGE_ALPHA = 0.25
const EDGE_HOT = 0.7
const HALO_ALPHA = 0.22
const UNVISITED = 0.35
/** Unvisited nodes are hollow: a faint fill inside a ring of their hue. */
const HOLLOW_FILL = 0.22
/** Visited nodes wear a thin electric-blue "wired" ring just outside the sphere. */
export const WIRED = '#9be7ff'
const RING_SCALE = 2.25 // hue ring hugs the sphere (unit sphere -> sprite)
const WIRED_SCALE = 2.9 // wired ring sits a hair outside it

/** Obsidian-small nodes that grow only a little with degree. */
export const nodeRadius = (degree: number): number => Math.min(0.3, 0.14 + 0.025 * degree)

export interface GraphView {
  group: THREE.Group
  meshes: Map<string, THREE.Mesh>
  neighbors: Map<string, Set<string>>
  edges: [string, string][]
  /** Copy sim positions into meshes/edges and advance the focus fade (dt=Infinity snaps). */
  sync(positions: Map<string, THREE.Vector3>, dt: number): void
  setFocus(id: string | null): void
  /** Global fade (0..1) used while the dive brings the graph in or out. */
  setReveal(k: number): void
  reveal(): number
  refresh(isVisited: (id: string) => boolean): void
  brightness(id: string): number | null
  /** The node's ring: hue ring (unvisited) or the electric-blue wired ring (visited). */
  ring(id: string): { visited: boolean; wired: boolean; color: string } | null
  /** The node's cluster hue as #rrggbb. */
  colorOf(id: string): string | null
  dispose(): void
}

function haloTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.25, 'rgba(255,255,255,0.35)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

function ringTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  g.strokeStyle = '#fff'
  g.lineWidth = 10
  g.beginPath()
  g.arc(64, 64, 56, 0, 2 * Math.PI)
  g.stroke()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export function createGraphView(layout: SectionLayout): GraphView {
  const group = new THREE.Group()
  const geo = new THREE.SphereGeometry(1, 24, 16)
  const tex = haloTexture()
  const ringTex = ringTexture()
  const wired = new THREE.Color(WIRED)
  const meshes = new Map<string, THREE.Mesh>()
  const neighbors = new Map<string, Set<string>>(layout.nodes.map((n) => [n.id, new Set<string>()]))
  const edges = layout.edges.filter(([a, b]) => neighbors.has(a) && neighbors.has(b))
  for (const [a, b] of edges) { neighbors.get(a)!.add(b); neighbors.get(b)!.add(a) }
  const light = new THREE.HemisphereLight(0xffffff, 0x000000, 1.4)
  group.add(light)
  const hue = new Map<string, THREE.Color>()
  const state = new Map<string, { bright: number; vis: number; scale: number; radius: number; visited: boolean }>()

  for (const n of layout.nodes) {
    const color = new THREE.Color(n.cluster === null ? NEUTRAL : clusterColor(n.cluster))
    hue.set(n.id, color)
    const radius = nodeRadius(neighbors.get(n.id)!.size)
    // Soft-lit: mostly emissive (keeps the hue on black) with a gentle top light for roundness.
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, emissive: color, transparent: true }))
    mesh.scale.setScalar(radius)
    mesh.userData.id = n.id
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, color, transparent: true, opacity: HALO_ALPHA,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }))
    halo.scale.setScalar(5) // relative to the unit sphere -> ~5x node radius
    halo.raycast = () => {}
    mesh.add(halo)
    const ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, color, transparent: true, depthWrite: false }))
    ring.scale.setScalar(RING_SCALE)
    ring.raycast = () => {}
    mesh.add(ring)
    group.add(mesh)
    meshes.set(n.id, mesh)
    state.set(n.id, { bright: UNVISITED, vis: 1, scale: 1, radius, visited: false })
  }

  // Edges: one LineSegments, additive, per-vertex colors carry each endpoint's hue so links blend between groups.
  const ePos = new Float32Array(edges.length * 6)
  const eCol = new Float32Array(edges.length * 6)
  const eGeo = new THREE.BufferGeometry()
  eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3).setUsage(THREE.DynamicDrawUsage))
  eGeo.setAttribute('color', new THREE.BufferAttribute(eCol, 3).setUsage(THREE.DynamicDrawUsage))
  const lines = new THREE.LineSegments(eGeo, new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }))
  lines.raycast = () => {}
  group.add(lines)
  const edgeVis = edges.map(() => 1)
  const white = new THREE.Color(1, 1, 1)
  const tmp = new THREE.Color()

  let focus: string | null = null
  let reveal = 1
  const approach = (cur: number, to: number, dt: number) => {
    const step = dt === Infinity ? Infinity : dt / FADE_S
    return cur < to ? Math.min(to, cur + step) : Math.max(to, cur - step)
  }

  function sync(positions: Map<string, THREE.Vector3>, dt: number) {
    const lit = focus ? new Set([focus, ...neighbors.get(focus)!]) : null
    for (const [id, m] of meshes) {
      const s = state.get(id)!
      const p = positions.get(id)
      if (p) m.position.copy(p)
      s.vis = approach(s.vis, !lit || lit.has(id) ? 1 : DIM, dt)
      s.scale = approach(s.scale, id === focus ? 1.35 : 1, dt === Infinity ? dt : dt * 2)
      m.scale.setScalar(s.radius * s.scale)
      const mat = m.material as THREE.MeshLambertMaterial
      // visited: a solid, lit sphere; unvisited: hollow (faint fill) inside a ring of its hue
      mat.color.copy(hue.get(id)!).multiplyScalar(s.visited ? 0.6 : 0.4)
      mat.emissive.copy(hue.get(id)!).multiplyScalar(s.visited ? 0.55 : 0.35)
      mat.opacity = s.vis * reveal * (s.visited ? 1 : HOLLOW_FILL)
      const halo = m.children[0] as THREE.Sprite
      ;(halo.material as THREE.SpriteMaterial).opacity = HALO_ALPHA * s.vis * (0.4 + 0.6 * s.bright) * reveal
      const ring = m.children[1] as THREE.Sprite
      const rm = ring.material as THREE.SpriteMaterial
      rm.color.copy(s.visited ? wired : hue.get(id)!)
      rm.opacity = s.vis * reveal * (s.visited ? 0.95 : 1)
      ring.scale.setScalar(s.visited ? WIRED_SCALE : RING_SCALE)
    }
    edges.forEach(([a, b], i) => {
      const hot = focus !== null && (a === focus || b === focus)
      edgeVis[i] = approach(edgeVis[i], !focus ? 1 : hot ? EDGE_HOT / EDGE_ALPHA : DIM, dt)
      const k = EDGE_ALPHA * edgeVis[i] * reveal
      const pa = meshes.get(a)!.position
      const pb = meshes.get(b)!.position
      ePos.set([pa.x, pa.y, pa.z, pb.x, pb.y, pb.z], i * 6)
      tmp.copy(hue.get(a)!).lerp(white, 0.35).multiplyScalar(k)
      eCol.set([tmp.r, tmp.g, tmp.b], i * 6)
      tmp.copy(hue.get(b)!).lerp(white, 0.35).multiplyScalar(k)
      eCol.set([tmp.r, tmp.g, tmp.b], i * 6 + 3)
    })
    eGeo.attributes.position.needsUpdate = true
    eGeo.attributes.color.needsUpdate = true
    eGeo.computeBoundingSphere()
  }

  return {
    group, meshes, neighbors, edges, sync,
    setFocus(id) { focus = id && meshes.has(id) ? id : null },
    setReveal(k) { reveal = k; group.visible = k > 0.001 },
    reveal() { return reveal },
    refresh(isVisited) {
      for (const [id, s] of state) { s.visited = isVisited(id); s.bright = s.visited ? 1 : UNVISITED }
    },
    ring(id) {
      const s = state.get(id)
      const m = meshes.get(id)
      if (!s || !m) return null
      const c = ((m.children[1] as THREE.Sprite).material as THREE.SpriteMaterial).color
      return { visited: s.visited, wired: s.visited, color: `#${c.getHexString()}` }
    },
    brightness(id) { return state.get(id)?.bright ?? null },
    colorOf(id) { const c = hue.get(id); return c ? `#${c.getHexString()}` : null },
    dispose() {
      for (const m of meshes.values()) {
        ;(m.material as THREE.Material).dispose()
        ;((m.children[0] as THREE.Sprite).material as THREE.Material).dispose()
        ;((m.children[1] as THREE.Sprite).material as THREE.Material).dispose()
      }
      geo.dispose(); tex.dispose(); ringTex.dispose(); eGeo.dispose(); (lines.material as THREE.Material).dispose()
    },
  }
}
