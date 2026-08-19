import { describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { advancePosition, RobotSimulator } from './robot-simulator'
import { useRobotStore } from '@/stores/robot'

describe('advancePosition', () => {
  it('按最大步长逼近目标且不越过目标', () => {
    expect(advancePosition(0, 1, 0.2)).toBeCloseTo(0.2)
    expect(advancePosition(0.9, 1, 0.2)).toBe(1)
  })

  it('支持负方向运动', () => {
    expect(advancePosition(0, -1, 0.25)).toBeCloseTo(-0.25)
    expect(advancePosition(-0.9, -1, 0.25)).toBe(-1)
  })

  it('示教位置同时更新当前值和目标值', () => {
    setActivePinia(createPinia())
    const store = useRobotStore()
    store.motionState = 'stopped'
    const simulator = new RobotSimulator(store)

    expect(simulator.setJointPosition('shoulder_pan_joint', 0.4)).toBe(true)
    const joint = store.findJoint('shoulder_pan_joint')
    expect(joint?.current).toBe(0.4)
    expect(joint?.target).toBe(0.4)
    expect(store.motionState).toBe('idle')
  })
})
