import * as THREE from 'three'
import type { SectionLayout } from '../types'

type Cluster = SectionLayout['clusters'][number]

const PALETTE = [0x6aa5ff, 0xff8a65, 0x7fe3a6, 0xd39bff, 0xffd166]

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,255,255,0.5)')
  grad.addColorStop(0.5, 'rgba(255,255,255,0.18)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(c)
}

export interface ClusterFields {
  group: THREE.Group
  /** Cluster label whose centroid is nearest the ray, among clusters the ray passes within radius*0.6 of. */
  hit(ray: THREE.Ray): Cluster | null
  setHighlight(c: Cluster | null): void
  dispose(): void
}

export function createClusterFields(clusters: Cluster[]): ClusterFields {
  const group = new THREE.Group()
  const tex = glowTexture()
  const sprites = new Map<number, THREE.Sprite>()
  for (const c of clusters) {
    const mat = new THREE.SpriteMaterial({
      map: tex,
      color: PALETTE[c.id % PALETTE.length],
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const s = new THREE.Sprite(mat)
    s.position.set(...c.centroid)
    s.scale.setScalar(c.radius * 2)
    s.raycast = () => {} // never block node picking
    group.add(s)
    sprites.set(c.id, s)
  }
  const v = new THREE.Vector3()
  return {
    group,
    hit(ray) {
      let best: Cluster | null = null
      let bestD = Infinity
      for (const c of clusters) {
        v.set(...c.centroid)
        const d = ray.distanceToPoint(v)
        if (d <= c.radius * 0.6 && d < bestD) { best = c; bestD = d }
      }
      return best
    },
    setHighlight(c) {
      for (const [id, s] of sprites) (s.material as THREE.SpriteMaterial).opacity = c && c.id === id ? 0.6 : 0.35
    },
    dispose() {
      for (const s of sprites.values()) s.material.dispose()
      tex.dispose()
    },
  }
}
