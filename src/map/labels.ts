import * as THREE from 'three'

export interface Labels {
  set(items: { id: string; text: string }[]): void
  /** Position each label beside its node; ids in `dim` fade to 0.15, the rest fade with camera distance. */
  update(camera: THREE.Camera, positions: Map<string, THREE.Vector3>, dim: Set<string> | null): void
  clear(): void
}

/** Distance (world units) at which labels are fully opaque, and where they bottom out. */
const NEAR = 16
const FAR = 36
const MIN_OPACITY = 0.25
const DIM_OPACITY = 0.15

export function createLabels(host: HTMLElement): Labels {
  const layer = document.createElement('div')
  layer.className = 'node-labels'
  host.append(layer)
  let els = new Map<string, HTMLElement>()
  const v = new THREE.Vector3()
  const camPos = new THREE.Vector3()

  return {
    set(items) {
      layer.replaceChildren()
      els = new Map()
      for (const it of items) {
        const el = document.createElement('div')
        el.className = 'node-label'
        el.dataset.nodeLabel = it.id
        el.textContent = it.text
        layer.append(el)
        els.set(it.id, el)
      }
    },
    update(camera, positions, dim) {
      const w = layer.clientWidth || host.clientWidth
      const h = layer.clientHeight || host.clientHeight
      camera.getWorldPosition(camPos)
      for (const [id, el] of els) {
        const p = positions.get(id)
        if (!p) continue
        v.copy(p).project(camera)
        if (v.z > 1 || v.z < -1) { el.style.visibility = 'hidden'; continue }
        el.style.visibility = ''
        const x = ((v.x + 1) / 2) * w
        const y = ((1 - v.y) / 2) * h
        el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
        const t = Math.min(1, Math.max(0, (p.distanceTo(camPos) - NEAR) / (FAR - NEAR)))
        const op = dim?.has(id) ? DIM_OPACITY : dim ? 1 : 1 - t * (1 - MIN_OPACITY)
        el.style.opacity = op.toFixed(3)
      }
    },
    clear() {
      layer.replaceChildren()
      els = new Map()
    },
  }
}
