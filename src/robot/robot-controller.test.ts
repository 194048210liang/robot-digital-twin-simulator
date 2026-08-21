import { describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { isTargetWithinLimits, RobotController } from './robot-controller'
import type { RobotSimulator } from './robot-simulator'
import type { RobotCommand } from './types'
import { useRobotStore } from '@/stores/robot'
import type { RobotTransport } from '@/transport/robot-transport'

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

  it('任务姿态作为一条批量命令提交，避免逐关节通信和日志突发', () => {
    setActivePinia(createPinia())
    const store = useRobotStore()
    store.connectionState = 'connected'
    const commands: RobotCommand[] = []
    const transport: RobotTransport = {
      connect: async () => undefined,
      disconnect: async () => undefined,
      send: async (command) => {
        commands.push(command)
        return { accepted: true, latency: 20, message: 'accepted' }
      },
    }
    const controller = new RobotController(store, transport, {} as RobotSimulator)

    expect(
      controller.setJointTargets([
        { jointId: 'shoulder_pan_joint', target: 0.5 },
        { jointId: 'elbow_flex_joint', target: 1 },
      ]),
    ).toBe(true)
    expect(store.findJoint('shoulder_pan_joint')?.target).toBe(0.5)
    expect(store.findJoint('elbow_flex_joint')?.target).toBe(1)
    expect(commands).toEqual([
      {
        type: 'SET_JOINT_TARGETS',
        targets: [
          { jointId: 'shoulder_pan_joint', target: 0.5 },
          { jointId: 'elbow_flex_joint', target: 1 },
        ],
      },
    ])
  })
})
