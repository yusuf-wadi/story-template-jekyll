import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createForceSim } from '../../src/map/forceSim'

type N = { id: string; anchor: [number, number, number] }
const nodes: N[] = [
  { id: 'a', anchor: [0, 0, 0] },
  { id: 'b', anchor: [3, 0, 0] },
  { id: 'c', anchor: [0, 3, 0] },
  { id: 'd', anchor: [-2, -2, 1] },
]

describe('forceSim', () => {
  it('without edges, nodes settle onto their anchors', () => {
    const sim = createForceSim(nodes, [], { anchorK: 2 })
    sim.settle(500)
    for (const n of nodes) expect(sim.positions.get(n.id)!.distanceTo(new THREE.Vector3(...n.anchor))).toBeLessThan(0.05)
  })

  it('pinning moves the node to the pin and pulls its edge neighbor toward it', () => {
    const sim = createForceSim(nodes, [['a', 'b']])
    sim.settle(300)
    const b0 = sim.positions.get('b')!.clone()
    const pin = new THREE.Vector3(10, 0, 0)
    sim.pin('a', pin)
    sim.settle(300)
    expect(sim.positions.get('a')!.distanceTo(pin)).toBeLessThan(1e-6)
    expect(sim.positions.get('b')!.distanceTo(pin)).toBeLessThan(b0.distanceTo(pin))
    sim.pin('a', null)
    sim.settle(500)
    expect(sim.positions.get('a')!.distanceTo(pin)).toBeGreaterThan(3)
  })

  it('energy decreases over settle', () => {
    const sim = createForceSim(nodes, [['a', 'b'], ['b', 'c'], ['c', 'd']])
    sim.step(1 / 60)
    const e0 = sim.energy()
    sim.settle(200)
    const e1 = sim.energy()
    expect(e1).toBeLessThan(e0)
  })
})
