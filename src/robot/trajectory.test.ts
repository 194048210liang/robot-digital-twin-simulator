import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { MAX_TRAJECTORY_POINTS } from './trajectory'
import type { TcpState } from './types'
import { useTrajectoryStore } from '@/stores/trajectory'

const state = (x: number, timestamp: number, y = 0, z = 0): TcpState => ({
  pose: { x, y, z, rx: 0, ry: 0, rz: 0 },
  sourceLink: 'gripper_link',
  timestamp,
})

describe('trajectory store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('只在运动时记录，并忽略重复位置', () => {
    const store = useTrajectoryStore()

    expect(store.sample(state(0, 0), false)).toBe(false)
    expect(store.sample(state(0, 0), true)).toBe(true)
    expect(store.sample(state(0, 200), true)).toBe(false)
    expect(store.pointCount).toBe(1)
  })

  it('达到距离阈值或采样间隔时记录实际位置', () => {
    const store = useTrajectoryStore()

    expect(store.sample(state(0, 0), true)).toBe(true)
    expect(store.sample(state(0.001, 40), true)).toBe(false)
    expect(store.sample(state(0.004, 50), true)).toBe(true)
    expect(store.sample(state(0.0045, 150), true)).toBe(true)
    expect(store.points.map((point) => point.x)).toEqual([0, 0.004, 0.0045])
  })

  it('限制轨迹点数量并保留最新数据', () => {
    const store = useTrajectoryStore()

    for (let index = 0; index < MAX_TRAJECTORY_POINTS + 5; index += 1) {
      store.sample(state(index * 0.004, index * 10), true)
    }

    expect(store.pointCount).toBe(MAX_TRAJECTORY_POINTS)
    expect(store.points[0]?.x).toBeCloseTo(0.02)
    expect(store.points.at(-1)?.x).toBeCloseTo((MAX_TRAJECTORY_POINTS + 4) * 0.004)
  })

  it('清空轨迹时保留显示设置', () => {
    const store = useTrajectoryStore()
    store.sample(state(0, 0), true)
    store.toggleTcpFrame()
    store.toggleTrajectory()

    store.clear()

    expect(store.pointCount).toBe(0)
    expect(store.tcpFrameVisible).toBe(false)
    expect(store.trajectoryVisible).toBe(false)
  })
})
