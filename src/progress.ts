type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export class Progress {
  private visited = new Set<string>()
  private listeners = new Set<() => void>()
  private eggSeen = false
  private eggKey = 'cm-egg-seen-v1'

  constructor(private storage: Store | null, private key = 'cm-progress-v1') {
    try {
      const raw = storage?.getItem(key)
      if (raw) {
        const parsed: unknown = JSON.parse(raw)
        if (Array.isArray(parsed)) for (const id of parsed) if (typeof id === 'string') this.visited.add(id)
      }
    } catch {
      // unreadable or corrupt storage: start empty
    }
    try {
      this.eggSeen = storage?.getItem(this.eggKey) === '1'
    } catch {
      // unreadable storage: the egg plays again, harmlessly
    }
  }

  /** Whether the completed-circuit sequence has already played (later loads show its final state). */
  isEggSeen(): boolean {
    return this.eggSeen
  }

  markEggSeen(): void {
    this.eggSeen = true
    try {
      this.storage?.setItem(this.eggKey, '1')
    } catch {
      // storage unavailable: remembered for this session only
    }
  }

  visit(id: string): void {
    if (this.visited.has(id)) return
    this.visited.add(id)
    this.persist()
    this.emit()
  }

  isVisited(id: string): boolean {
    return this.visited.has(id)
  }

  isSectionComplete(itemIds: string[]): boolean {
    return itemIds.length > 0 && itemIds.every((id) => this.visited.has(id))
  }

  areAllComplete(sections: string[][]): boolean {
    return sections.length > 0 && sections.every((s) => this.isSectionComplete(s))
  }

  reset(): void {
    this.visited.clear()
    this.eggSeen = false
    try {
      this.storage?.removeItem(this.key)
      this.storage?.removeItem(this.eggKey)
    } catch {
      // storage unavailable: memory state still cleared
    }
    this.emit()
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  private persist(): void {
    try {
      this.storage?.setItem(this.key, JSON.stringify([...this.visited]))
    } catch {
      // storage unavailable: keep in-memory progress
    }
  }

  private emit(): void {
    for (const fn of this.listeners) fn()
  }
}
