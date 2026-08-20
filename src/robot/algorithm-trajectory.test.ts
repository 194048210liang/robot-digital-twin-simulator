import { describe, expect, it } from 'vitest'
import {
  algorithmTrajectoryToTaskInput,
  createAlgorithmTrajectoryTemplate,
  getAlgorithmTrajectoryCompatibilityError,
  parseAlgorithmTrajectoryFile,
} from './algorithm-trajectory'
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
  displayScale: 180 / Math.PI,
  displayUnit: '°',
  displayDecimals: 2,
  current: 0.25,
  target: 0.25,
  velocity: 0,
  ...overrides,
})

function template(joints = [joint()]) {
  return createAlgorithmTrajectoryTemplate({
    modelName: 'Test Robot',
    modelFileName: 'test.urdf',
    tcpLinkName: 'tool0',
    joints,
    tcpPose: { x: 0.4, y: 0.1, z: 0.3, rx: 0, ry: 45, rz: 0 },
    speedScale: 0.5,
  })
}

describe('external algorithm trajectory', () => {
  it('生成当前模型模板并转换为带 TCP 目标的机器人任务', () => {
    const joints = [joint()]
    const file = parseAlgorithmTrajectoryFile(JSON.parse(JSON.stringify(template(joints))))

    expect(file).not.toBeNull()
    if (!file) return
    expect(getAlgorithmTrajectoryCompatibilityError(file, joints, 'tool0')).toBeNull()

    const task = algorithmTrajectoryToTaskInput(file, joints)
    expect(task.steps).toHaveLength(1)
    expect(task.steps[0]?.targets).toEqual([{ jointId: 'joint-a', position: 0.25 }])
    expect(task.steps[0]?.targetTcpPose).toEqual(file.trajectory[0]?.targetPose)
  })

  it('拒绝未知格式、单位和空轨迹', () => {
    const file = template()
    expect(parseAlgorithmTrajectoryFile({ ...file, version: 2 })).toBeNull()
    expect(
      parseAlgorithmTrajectoryFile({ ...file, units: { ...file.units, revolute: 'deg' } }),
    ).toBeNull()
    expect(parseAlgorithmTrajectoryFile({ ...file, trajectory: [] })).toBeNull()
  })

  it('拒绝 TCP、关节全集和限位不兼容的算法结果', () => {
    const joints = [joint()]
    const wrongTcp = template(joints)
    expect(getAlgorithmTrajectoryCompatibilityError(wrongTcp, joints, 'other-tool')?.key).toBe(
      'task.fileErrors.trajectoryTcpMismatch',
    )

    const missingJoint = template(joints)
    missingJoint.trajectory[0]!.joints = {}
    expect(getAlgorithmTrajectoryCompatibilityError(missingJoint, joints, 'tool0')?.key).toBe(
      'task.fileErrors.missingSolutions',
    )

    const outOfLimit = template(joints)
    outOfLimit.trajectory[0]!.joints['joint-a'] = 2
    expect(getAlgorithmTrajectoryCompatibilityError(outOfLimit, joints, 'tool0')?.key).toBe(
      'task.fileErrors.outOfLimit',
    )
  })
})
