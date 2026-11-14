import * as THREE from 'three'
import type { SectionLayout } from '../types'

type Cluster = SectionLayout['clusters'][number]

/** Obsidian-style "groups": restrained hues that read on black without going neon. */
const PALETTE = [0x86a8d8, 0xd9a47e, 0x8fc4a4, 0xbfa2d6]
/** Single hue for sections without clusters: a cool neutral. */
export const NEUTRAL = 0xb4bfcc
export const clusterColor = (id: number): number => PALETTE[id % PALETTE.length]
const REST = 0.1
const HOT = 0.22

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
      color: clusterColor(c.id),
      transparent: true,
      opacity: REST,
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
      for (const [id, s] of sprites) (s.material as THREE.SpriteMaterial).opacity = c && c.id === id ? HOT : REST
    },
    dispose() {
      for (const s of sprites.values()) s.material.dispose()
      tex.dispose()
    },
  }
}
