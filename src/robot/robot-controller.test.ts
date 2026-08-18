import { describe, expect, it } from 'vitest'
import { isTargetWithinLimits } from './robot-controller'

describe('isTargetWithinLimits', () => {
  it('接受闭区间内的有限目标值', () => {
    expect(isTargetWithinLimits(-1, -1, 1)).toBe(true)
    expect(isTargetWithinLimits(0.25, -1, 1)).toBe(true)
    expect(isTargetWithinLimits(1, -1, 1)).toBe(true)
  })

  it('拒绝越界值和非有限值', () => {
    expect(isTargetWithinLimits(1.001, -1, 1)).toBe(false)
    expect(isTargetWithinLimits(Number.NaN, -1, 1)).toBe(false)
    expect(isTargetWithinLimits(Number.POSITIVE_INFINITY, -1, 1)).toBe(false)
  })
})
