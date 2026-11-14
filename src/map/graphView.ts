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

export interface GraphView {
  group: THREE.Group
  meshes: Map<string, THREE.Mesh>
  neighbors: Map<string, Set<string>>
  edges: [string, string][]
  /** Copy sim positions into meshes/edges and advance the focus fade (dt=Infinity snaps). */
  sync(positions: Map<string, THREE.Vector3>, dt: number): void
  setFocus(id: string | null): void
  refresh(isVisited: (id: string) => boolean): void
  brightness(id: string): number | null
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

export function createGraphView(layout: SectionLayout): GraphView {
  const group = new THREE.Group()
  const geo = new THREE.SphereGeometry(1, 24, 16)
  const tex = haloTexture()
  const meshes = new Map<string, THREE.Mesh>()
  const neighbors = new Map<string, Set<string>>(layout.nodes.map((n) => [n.id, new Set<string>()]))
  const edges = layout.edges.filter(([a, b]) => neighbors.has(a) && neighbors.has(b))
  for (const [a, b] of edges) { neighbors.get(a)!.add(b); neighbors.get(b)!.add(a) }
  const light = new THREE.HemisphereLight(0xffffff, 0x000000, 1.4)
  group.add(light)
  const hue = new Map<string, THREE.Color>()
  const state = new Map<string, { bright: number; vis: number; scale: number; radius: number }>()

  for (const n of layout.nodes) {
    const color = new THREE.Color(n.cluster === null ? NEUTRAL : clusterColor(n.cluster))
    hue.set(n.id, color)
    const radius = 0.18 + 0.05 * neighbors.get(n.id)!.size
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
    group.add(mesh)
    meshes.set(n.id, mesh)
    state.set(n.id, { bright: UNVISITED, vis: 1, scale: 1, radius })
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
      mat.color.copy(hue.get(id)!).multiplyScalar(s.bright * 0.6)
      mat.emissive.copy(hue.get(id)!).multiplyScalar(s.bright * 0.55)
      mat.opacity = s.vis
      const halo = m.children[0] as THREE.Sprite
      ;(halo.material as THREE.SpriteMaterial).opacity = HALO_ALPHA * s.vis * (0.4 + 0.6 * s.bright)
    }
    edges.forEach(([a, b], i) => {
      const hot = focus !== null && (a === focus || b === focus)
      edgeVis[i] = approach(edgeVis[i], !focus ? 1 : hot ? EDGE_HOT / EDGE_ALPHA : DIM, dt)
      const k = EDGE_ALPHA * edgeVis[i]
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
    refresh(isVisited) { for (const [id, s] of state) s.bright = isVisited(id) ? 1 : UNVISITED },
    brightness(id) { return state.get(id)?.bright ?? null },
    colorOf(id) { const c = hue.get(id); return c ? `#${c.getHexString()}` : null },
    dispose() {
      for (const m of meshes.values()) {
        ;(m.material as THREE.Material).dispose()
        ;((m.children[0] as THREE.Sprite).material as THREE.Material).dispose()
      }
      geo.dispose(); tex.dispose(); eGeo.dispose(); (lines.material as THREE.Material).dispose()
    },
  }
}
