export function step(tour: string[], current: string, dir: 1 | -1): string {
  if (tour.length <= 1) return current
  const i = tour.indexOf(current)
  const from = i === -1 ? 0 : i
  return tour[(from + dir + tour.length) % tour.length]
}
