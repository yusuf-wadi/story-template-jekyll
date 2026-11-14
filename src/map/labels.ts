import * as THREE from 'three'
import { layoutLabels, type LabelBox } from './labelLayout'

export interface Labels {
  set(items: { id: string; text: string }[]): void
  /**
   * Position each label beside its node; ids in `dim` fade to 0.15, the rest fade with camera distance. Overlapping
   * labels are nudged apart (or the lower `priority` one hidden) so the ones that matter stay readable.
   */
  update(camera: THREE.Camera, positions: Map<string, THREE.Vector3>, dim: Set<string> | null, priority?: (id: string) => number): void
  clear(): void
  /** Whole-layer fade (0..1) for the dive. */
  setReveal(k: number): void
  /** Visited labels read at full brightness; the rest stay muted. */
  setVisited(isVisited: (id: string) => boolean): void
}

/** Distance (world units) at which labels are fully opaque, and where they bottom out. */
const NEAR = 16
const FAR = 36
const MIN_OPACITY = 0.25
const DIM_OPACITY = 0.15
/** CSS margin of .node-label: the box starts this far right/below the node centre. */
const OFF_X = 9
const OFF_Y = 5
/** Per-frame easing of a label toward its nudged slot. */
const NUDGE_EASE = 0.25

export function createLabels(host: HTMLElement): Labels {
  const layer = document.createElement('div')
  layer.className = 'node-labels'
  host.append(layer)
  let els = new Map<string, HTMLElement>()
  const size = new Map<string, { w: number; h: number }>()
  const nudge = new Map<string, { dy: number; hidden: boolean }>()
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
      size.clear()
      nudge.clear()
    },
    update(camera, positions, dim, priority) {
      const w = layer.clientWidth || host.clientWidth
      const h = layer.clientHeight || host.clientHeight
      camera.getWorldPosition(camPos)
      const shown: { id: string; el: HTMLElement; x: number; y: number; op: number }[] = []
      const boxes: LabelBox[] = []
      for (const [id, el] of els) {
        const p = positions.get(id)
        if (!p) continue
        v.copy(p).project(camera)
        if (v.z > 1 || v.z < -1) { el.style.visibility = 'hidden'; continue }
        el.style.visibility = ''
        const x = ((v.x + 1) / 2) * w
        const y = ((1 - v.y) / 2) * h
        const t = Math.min(1, Math.max(0, (p.distanceTo(camPos) - NEAR) / (FAR - NEAR)))
        const op = dim?.has(id) ? DIM_OPACITY : dim ? 1 : 1 - t * (1 - MIN_OPACITY)
        let sz = size.get(id)
        if (!sz || !sz.w) { sz = { w: el.offsetWidth, h: el.offsetHeight }; size.set(id, sz) }
        shown.push({ id, el, x, y, op })
        // a label already showing gets a small bonus, so near-ties don't flicker as the graph drifts
        const pr = (priority?.(id) ?? 0) + (dim?.has(id) ? -100 : 0) + (nudge.get(id)?.hidden ? 0 : 0.5)
        if (sz.w) boxes.push({ id, x: x + OFF_X, y: y + OFF_Y, w: sz.w, h: sz.h, priority: pr })
      }
      const place = layoutLabels(boxes)
      for (const s of shown) {
        const target = place.get(s.id) ?? { dy: 0, hidden: false }
        const cur = nudge.get(s.id) ?? { dy: target.dy, hidden: false }
        cur.dy += (target.dy - cur.dy) * NUDGE_EASE
        if (Math.abs(target.dy - cur.dy) < 0.1) cur.dy = target.dy
        cur.hidden = target.hidden
        nudge.set(s.id, cur)
        s.el.style.transform = `translate(${s.x.toFixed(1)}px, ${(s.y + cur.dy).toFixed(1)}px)`
        s.el.style.opacity = (cur.hidden ? 0 : s.op).toFixed(3)
      }
    },
    clear() {
      layer.replaceChildren()
      els = new Map()
      size.clear()
      nudge.clear()
    },
    setVisited(isVisited) { for (const [id, el] of els) el.classList.toggle('is-visited', isVisited(id)) },
    setReveal(k) { layer.style.opacity = k >= 1 ? '' : k.toFixed(3) },
  }
}
