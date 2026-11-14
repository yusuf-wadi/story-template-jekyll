// Pure geometry for the completed-circuit easter egg (head `<g>` source coordinates; the head faces left).

export type UV = [number, number]

const dedupe = (pts: UV[]): UV[] =>
  pts.filter((p, i) => i === 0 || Math.abs(p[0] - pts[i - 1][0]) > 1e-9 || Math.abs(p[1] - pts[i - 1][1]) > 1e-9)

/** Join two facing edge pads: straight, one 45° jog in the middle, straight. */
export function bridge(a: UV, b: UV): UV[] {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const sx = Math.sign(dx), sy = Math.sign(dy)
  if (Math.abs(dx) >= Math.abs(dy)) {
    const h = (Math.abs(dx) - Math.abs(dy)) / 2
    return dedupe([a, [a[0] + sx * h, a[1]], [a[0] + sx * (h + Math.abs(dy)), b[1]], b])
  }
  const h = (Math.abs(dy) - Math.abs(dx)) / 2
  return dedupe([a, [a[0], a[1] + sy * h], [b[0], a[1] + sy * (h + Math.abs(dx))], b])
}

/**
 * The eye, as Yusuf sketched it and drawn as a tiny working circuit: in profile (the face is toward −x). The lids
 * are a battery: a long upper plate (+) and a short lower plate (−), level, running back from the eye. The eyeball
 * between them is a diode: an outline triangle pointing at the face (anode behind, cathode in front) with the
 * cathode bar across its tip. Two short wires close the loop: + plate → anode, cathode → − plate, so the battery
 * powers the diode. Each plate also takes a feed lead square-on at its middle. `rx` is half the eye's depth.
 */
export const EYE = { x: 274, y: 420, rx: 22, ry: 19 }

/** Local coordinates, origin at EYE. */
export const UPPER_PLATE: [UV, UV] = [[-20, -17], [24, -17]]
export const LOWER_PLATE: [UV, UV] = [[-12, 15], [16, 15]]
/** Both leads land on their plate's middle, one above the other. */
export const LEAD_X = 2
/** The diode's triangle: its anode side (the base) behind, its tip toward the face; the cathode bar crosses the tip. */
export const DIODE = { tip: [-6, -1] as UV, baseX: 10, half: 9 }
export const DIODE_TRI: UV[] = [[DIODE.baseX, DIODE.tip[1] - DIODE.half], [DIODE.baseX, DIODE.tip[1] + DIODE.half], DIODE.tip]
export const DIODE_BAR: [UV, UV] = [[DIODE.tip[0], DIODE.tip[1] - DIODE.half], [DIODE.tip[0], DIODE.tip[1] + DIODE.half]]
/** The circuit's wires, each from its battery plate to the diode (the way current runs): + → anode, cathode → −. */
export const ANODE_WIRE: UV[] = [[16, UPPER_PLATE[0][1]], [16, DIODE.tip[1]], [DIODE.baseX, DIODE.tip[1]]]
export const CATHODE_WIRE: UV[] = [DIODE.tip, [-10, DIODE.tip[1]], [-10, LOWER_PLATE[0][1]]]
/** The battery's polarity mark, above the long plate's back end. */
export const PLUS = { x: 19, y: -23, r: 2.4 }

/**
 * Shut, the plates lie together (shorted): the upper one rests just above the lower. Returns the upper plate's
 * drop (local units, +y) at openness t: 0 shut, 1 open; values a little past 1 overshoot.
 */
export const SHUT_DROP = LOWER_PLATE[0][1] - UPPER_PLATE[0][1] - 3
export const plateDrop = (t: number) => SHUT_DROP * (1 - t)
export const plateTransform = (t: number) => `translate(0 ${+plateDrop(t).toFixed(3)})`

const f = (p: UV) => `${+p[0].toFixed(2)} ${+p[1].toFixed(2)}`
/** The upper plate in its open position (it is lowered by plateTransform). */
export const UPPER_D = `M${f(UPPER_PLATE[0])} L${f(UPPER_PLATE[1])}`
export const LOWER_D = `M${f(LOWER_PLATE[0])} L${f(LOWER_PLATE[1])}`
export const PLUS_D = `M${PLUS.x - PLUS.r} ${PLUS.y} h${PLUS.r * 2} M${PLUS.x} ${PLUS.y - PLUS.r} v${PLUS.r * 2}`
/** The upper lead's tail inside the eye: from the open plate down to wherever the plate is (empty when open). */
export const leadTailD = (t: number) => `M${LEAD_X} ${UPPER_PLATE[0][1]} V${+(UPPER_PLATE[0][1] + plateDrop(t)).toFixed(3)}`
/** Everything below the open upper plate; carried by the plate, it is what the plate uncovers as it lifts. */
export const PLATE_MASK = { x: -60, y: UPPER_PLATE[0][1], width: 120, height: 80 }
/** The diode's body: the triangle, then the cathode bar. */
export const DIODE_D = `M${DIODE_TRI.map(f).join(' L')} Z M${f(DIODE_BAR[0])} L${f(DIODE_BAR[1])}`
export const ANODE_WIRE_D = `M${ANODE_WIRE.map(f).join(' L')}`
export const CATHODE_WIRE_D = `M${CATHODE_WIRE.map(f).join(' L')}`
/** The open eye's outline: the battery's plates and everything between them (the diode and its wires). */
export const EYE_SHAPE = `M${f(UPPER_PLATE[0])} L${f(UPPER_PLATE[1])} L${f(LOWER_PLATE[1])} L${f(LOWER_PLATE[0])} Z`

/**
 * Two traces feed the eye (head source coordinates). The upper one leaves the frontal board's lower-front
 * chamfer, runs down-left under it and drops straight onto the upper plate's middle. The lower one leaves the
 * temporal board's front chamfer down-left to a chamfered V under the eye, then rises straight into the lower plate.
 */
const LX = EYE.x + LEAD_X
export const UPPER_TRACE: UV[] = [[326, 350], [306, 370], [LX + 6, 370], [LX, 376], [LX, EYE.y + UPPER_PLATE[0][1]]]
const LOW_END: UV = [LX, EYE.y + LOWER_PLATE[0][1]]
export const LOWER_TRACE: UV[] = [[355, 447], [334, 468], [LX + 24, 468], [LX, 444], LOW_END]
export const EYE_TRACES: UV[][] = [UPPER_TRACE, LOWER_TRACE]

/** Delay (0..1) for the current wave at horizontal position x: the back of the head first, the face last. */
export const waveAt = (x: number, front: number, back: number) =>
  Math.max(0, Math.min(1, (back - x) / Math.max(1e-6, back - front)))

export const toD = (pts: [number, number][]) =>
  pts.map((p, i) => `${i ? 'L' : 'M'}${+p[0].toFixed(2)} ${+p[1].toFixed(2)}`).join(' ')
