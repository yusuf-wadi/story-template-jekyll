import * as THREE from 'three'

export interface ForceSimOpts {
  /** Spring toward each node's embedding position (per unit distance). */
  anchorK?: number
  /** Spring along each edge toward `edgeLen`. */
  edgeK?: number
  edgeLen?: number
  /** Short-range repulsion strength; only acts within REPULSE_RANGE. */
  repulse?: number
  /** Velocity drag per second (v *= exp(-damping * dt)). */
  damping?: number
}

export interface ForceSim {
  step(dt: number): void
  positions: Map<string, THREE.Vector3>
  pin(id: string, p: THREE.Vector3 | null): void
  settle(steps: number): void
  /** Kinetic energy of the free (unpinned) nodes. */
  energy(): number
  pinned(): boolean
}

const REPULSE_RANGE = 3.5
const MAX_DT = 1 / 30
/** Nodes start pulled in toward the centroid so they glide out to their anchors on enter. */
const START_SCALE = 0.85

export function createForceSim(
  nodes: { id: string; anchor: [number, number, number] }[],
  edges: [string, string][],
  opts: ForceSimOpts = {},
): ForceSim {
  // Near-critically damped (anchorK=3, damping=3.5 -> slowest mode tau ~0.7s): settles in ~2s, no wobble.
  const { anchorK = 3, edgeK = 0.6, edgeLen = 2.5, repulse = 0.6, damping = 3.5 } = opts
  const n = nodes.length
  const index = new Map(nodes.map((nd, i) => [nd.id, i]))
  const anchors = nodes.map((nd) => new THREE.Vector3(...nd.anchor))
  const pos = anchors.map((a) => a.clone().multiplyScalar(START_SCALE))
  const vel = nodes.map(() => new THREE.Vector3())
  const force = nodes.map(() => new THREE.Vector3())
  const pins: (THREE.Vector3 | null)[] = nodes.map(() => null)
  const links = edges
    .map(([a, b]) => [index.get(a), index.get(b)] as const)
    .filter((e): e is readonly [number, number] => e[0] !== undefined && e[1] !== undefined)
  const positions = new Map(nodes.map((nd, i) => [nd.id, pos[i]]))
  const d = new THREE.Vector3()

  function step(dt: number) {
    dt = Math.min(dt, MAX_DT)
    if (dt <= 0) return
    for (let i = 0; i < n; i++) force[i].subVectors(anchors[i], pos[i]).multiplyScalar(anchorK)
    for (const [a, b] of links) {
      d.subVectors(pos[b], pos[a])
      const len = d.length()
      if (len < 1e-6) continue
      d.multiplyScalar((edgeK * (len - edgeLen)) / len)
      force[a].add(d)
      force[b].sub(d)
    }
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        d.subVectors(pos[i], pos[j])
        const len = d.length()
        if (len >= REPULSE_RANGE) continue
        if (len < 1e-6) d.set(1e-3 * (i - j), 1e-3, 0)
        const taper = (1 - len / REPULSE_RANGE) ** 2
        d.normalize().multiplyScalar((repulse * taper) / (len * len + 0.25))
        force[i].add(d)
        force[j].sub(d)
      }
    }
    const drag = Math.exp(-damping * dt)
    for (let i = 0; i < n; i++) {
      const p = pins[i]
      if (p) { pos[i].copy(p); vel[i].set(0, 0, 0); continue }
      vel[i].addScaledVector(force[i], dt).multiplyScalar(drag)
      pos[i].addScaledVector(vel[i], dt)
    }
  }

  return {
    step,
    positions,
    pin(id, p) {
      const i = index.get(id)
      if (i === undefined) return
      pins[i] = p ? p.clone() : null
      if (p) { pos[i].copy(p); vel[i].set(0, 0, 0) }
    },
    settle(steps) { for (let s = 0; s < steps; s++) step(1 / 60) },
    energy() {
      let e = 0
      for (let i = 0; i < n; i++) if (!pins[i]) e += 0.5 * vel[i].lengthSq()
      return e
    },
    pinned() { return pins.some(Boolean) },
  }
}
