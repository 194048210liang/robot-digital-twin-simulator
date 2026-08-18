import { describe, expect, it } from 'vitest'
import { advancePosition } from './robot-simulator'

describe('advancePosition', () => {
  it('按最大步长逼近目标且不越过目标', () => {
    expect(advancePosition(0, 1, 0.2)).toBeCloseTo(0.2)
    expect(advancePosition(0.9, 1, 0.2)).toBe(1)
  })

  it('支持负方向运动', () => {
    expect(advancePosition(0, -1, 0.25)).toBeCloseTo(-0.25)
    expect(advancePosition(-0.9, -1, 0.25)).toBe(-1)
  })
})
