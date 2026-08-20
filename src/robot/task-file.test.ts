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
    expect(getTaskCompatibilityError(file, [joint()])).toBe('')
  })

  it('拒绝缺少关节或关节限位不同的模型', () => {
    const file = createRobotTaskFile(task, {
      modelName: 'Test Robot',
      modelFileName: 'test.urdf',
      tcpLinkName: 'tool0',
      joints: [joint()],
    })

    expect(getTaskCompatibilityError(file, [])).toContain('缺少任务关节')
    expect(getTaskCompatibilityError(file, [joint({ max: 2 })])).toContain('关节类型或限位')
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
