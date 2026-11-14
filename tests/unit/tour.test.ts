import { describe, it, expect } from 'vitest'
import { step } from '../../src/tour'

describe('step', () => {
  it('wraps forward and backward', () => {
    expect(step(['a', 'b', 'c'], 'c', 1)).toBe('a')
    expect(step(['a', 'b', 'c'], 'a', -1)).toBe('c')
    expect(step(['a', 'b', 'c'], 'a', 1)).toBe('b')
  })
  it('a tour of length 1 returns current', () => {
    expect(step(['a'], 'a', 1)).toBe('a')
    expect(step(['a'], 'a', -1)).toBe('a')
  })
})
