import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import type { RobotTask } from './task'
import { createRobotTaskFile, getTaskCompatibilityError, parseRobotTaskFile } from './task-file'
import type { JointState } from './types'

const joint = (overrides: Partial<JointState> = {}): JointState => ({
  id: 'joint-a',
  urdfNames: ['joint-a'],
  displayName: 'Joint A',
  group: 'arm',
  kind: 'revolute',
  min: -1,
  max: 1,
  home: 0,
  maxVelocity: 1,
  displayScale: 1,
  displayUnit: '°',
  displayDecimals: 2,
  current: 0,
  target: 0,
  velocity: 0,
  ...overrides,
})

const task: RobotTask = {
  id: 'task-1',
  name: '测试任务',
  description: '',
  steps: [
    {
      id: 'step-1',
      speedScale: 0.5,
      targets: [{ jointId: 'joint-a', position: 0.5 }],
    },
  ],
  createdAt: 1,
  updatedAt: 1,
}

describe('robot task file', () => {
  it('创建并解析带模型绑定的版本化任务文件', () => {
    const file = createRobotTaskFile(reactive(task), {
      modelName: 'Test Robot',
      modelFileName: 'test.urdf',
      tcpLinkName: 'tool0',
      joints: [joint()],
    })

    expect(parseRobotTaskFile(JSON.parse(JSON.stringify(file)))).toEqual(file)
    expect(getTaskCompatibilityError(file, [joint()])).toBeNull()
  })

  it('拒绝缺少关节或关节限位不同的模型', () => {
    const file = createRobotTaskFile(task, {
      modelName: 'Test Robot',
      modelFileName: 'test.urdf',
      tcpLinkName: 'tool0',
      joints: [joint()],
    })

    expect(getTaskCompatibilityError(file, [])?.key).toBe('task.fileErrors.missingJoints')
    expect(getTaskCompatibilityError(file, [joint({ max: 2 })])?.key).toBe(
      'task.fileErrors.modelMismatch',
    )
  })

  it('带 TCP 目标的任务必须匹配末端 Link', () => {
    const file = createRobotTaskFile(
      {
        ...task,
        steps: [
          {
            ...task.steps[0]!,
            targetTcpPose: { x: 0.4, y: 0, z: 0.3, rx: 0, ry: 0, rz: 0 },
          },
        ],
      },
      {
        modelName: 'Test Robot',
        modelFileName: 'test.urdf',
        tcpLinkName: 'tool0',
        joints: [joint()],
      },
    )

    expect(getTaskCompatibilityError(file, [joint()], 'other-tool')?.key).toBe(
      'task.fileErrors.tcpMismatch',
    )
  })

  it('拒绝未知格式和版本', () => {
    expect(parseRobotTaskFile({ format: 'other', version: 1 })).toBeNull()
    expect(
      parseRobotTaskFile({
        ...createRobotTaskFile(task, {
          modelName: 'Test Robot',
          modelFileName: 'test.urdf',
          tcpLinkName: 'tool0',
          joints: [joint()],
        }),
        version: 2,
      }),
    ).toBeNull()
  })
})
