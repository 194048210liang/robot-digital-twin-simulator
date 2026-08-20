import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import type { URDFJoint } from 'urdf-loader'
import { createJointDefinitions } from './urdf-model'

function joint(
  jointType: URDFJoint['jointType'],
  lower: number,
  upper: number,
  velocity = 0,
  mimic = false,
) {
  const value = new THREE.Object3D() as URDFJoint
  value.jointType = jointType
  value.limit = { lower, upper, velocity, effort: 0 }
  value.urdfNode = null
  value.mimicJoint = mimic ? 'source' : undefined
  return value
}

describe('URDF 关节解析', () => {
  it('生成旋转和移动关节并保留 URDF 限位', () => {
    const definitions = createJointDefinitions({
      fixed_joint: joint('fixed', 0, 0),
      shoulder_pan_joint: joint('revolute', -1.2, 1.4, 0.8),
      lift_joint: joint('prismatic', 0.1, 0.6, 0.2),
    })

    expect(definitions).toHaveLength(2)
    expect(definitions[0]).toMatchObject({
      id: 'shoulder_pan_joint',
      displayName: 'Shoulder Pan',
      kind: 'revolute',
      min: -1.2,
      max: 1.4,
      maxVelocity: 0.8,
      displayUnit: '°',
    })
    expect(definitions[1]).toMatchObject({
      id: 'lift_joint',
      displayName: 'Lift',
      kind: 'prismatic',
      min: 0.1,
      max: 0.6,
      home: 0.1,
      displayUnit: 'm',
    })
  })

  it('为 continuous 关节提供一圈控制范围并忽略 mimic 关节', () => {
    const definitions = createJointDefinitions({
      wheel_joint: joint('continuous', 0, 0),
      follower_joint: joint('revolute', -1, 1, 1, true),
    })

    expect(definitions).toHaveLength(1)
    expect(definitions[0]?.min).toBe(-Math.PI)
    expect(definitions[0]?.max).toBe(Math.PI)
  })
})
