import type { URDFJoint, URDFRobot } from 'urdf-loader'
import type { Object3D } from 'three'
import type { JointDefinition, RobotModelProfile } from './types'

const REVOLUTE_DEFAULT_LIMIT = Math.PI
const PRISMATIC_DEFAULT_LIMIT = 0.5
const REVOLUTE_DEFAULT_VELOCITY = 1
const PRISMATIC_DEFAULT_VELOCITY = 0.1
const REVOLUTE_MAX_SIMULATION_VELOCITY = Math.PI
const PRISMATIC_MAX_SIMULATION_VELOCITY = 0.5

export function resolveJointVelocity(value: number | undefined, prismatic: boolean) {
  const fallback = prismatic ? PRISMATIC_DEFAULT_VELOCITY : REVOLUTE_DEFAULT_VELOCITY
  const declaredVelocity = Number.isFinite(value) && Number(value) > 0 ? Number(value) : fallback
  const simulationLimit = prismatic
    ? PRISMATIC_MAX_SIMULATION_VELOCITY
    : REVOLUTE_MAX_SIMULATION_VELOCITY
  return {
    maxVelocity: declaredVelocity,
    simulationVelocity: Math.min(declaredVelocity, simulationLimit),
  }
}

function hasUsableLimits(joint: URDFJoint) {
  return (
    Number.isFinite(joint.limit.lower) &&
    Number.isFinite(joint.limit.upper) &&
    joint.limit.upper > joint.limit.lower
  )
}

function isMimicJoint(joint: URDFJoint) {
  return Boolean(joint.mimicJoint || joint.urdfNode?.querySelector('mimic'))
}

function humanizeJointName(name: string) {
  const words = name
    .replace(/_joint$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim()
  if (!words) return name
  return words.replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
}

export function createJointDefinitions(joints: Record<string, URDFJoint>): JointDefinition[] {
  return Object.entries(joints).flatMap(([name, joint]) => {
    if (
      joint.jointType === 'fixed' ||
      joint.jointType === 'floating' ||
      joint.jointType === 'planar' ||
      isMimicJoint(joint)
    ) {
      return []
    }

    const prismatic = joint.jointType === 'prismatic'
    const continuous = joint.jointType === 'continuous'
    const fallbackLimit = prismatic ? PRISMATIC_DEFAULT_LIMIT : REVOLUTE_DEFAULT_LIMIT
    const min = continuous
      ? -REVOLUTE_DEFAULT_LIMIT
      : hasUsableLimits(joint)
        ? joint.limit.lower
        : -fallbackLimit
    const max = continuous
      ? REVOLUTE_DEFAULT_LIMIT
      : hasUsableLimits(joint)
        ? joint.limit.upper
        : fallbackLimit
    const home = Math.min(max, Math.max(min, 0))
    const velocity = resolveJointVelocity(joint.limit.velocity, prismatic)

    return [
      {
        id: name,
        urdfNames: [name],
        displayName: humanizeJointName(name),
        group: 'arm',
        kind: prismatic ? 'prismatic' : 'revolute',
        min,
        max,
        home,
        maxVelocity: velocity.maxVelocity,
        simulationVelocity: velocity.simulationVelocity,
        displayScale: prismatic ? 1 : 180 / Math.PI,
        displayUnit: prismatic ? 'm' : '°',
        displayDecimals: prismatic ? 3 : 2,
      } satisfies JointDefinition,
    ]
  })
}

function objectDepth(object: Object3D) {
  let depth = 0
  let current = object.parent
  while (current) {
    depth += 1
    current = current.parent
  }
  return depth
}

export function findTcpLinkName(robot: URDFRobot) {
  const entries = Object.entries(robot.links)
  const preferredNames = ['tool0', 'tcp_link', 'ee_link', 'end_effector', 'gripper_link', 'flange']

  for (const preferredName of preferredNames) {
    if (robot.links[preferredName]) return preferredName
  }

  const semanticMatch = entries.find(([name]) =>
    /(tool|tcp|end[_-]?effector|gripper|wrist[_-]?3)/i.test(name),
  )
  if (semanticMatch) return semanticMatch[0]

  return entries.sort((left, right) => objectDepth(right[1]) - objectDepth(left[1]))[0]?.[0] ?? ''
}

export function createRobotModelProfile(
  robot: URDFRobot,
  fileName: string,
  preferredJoints?: JointDefinition[],
  preferredName?: string,
  preferredTcpLinkName?: string,
): RobotModelProfile {
  return {
    name: preferredName || robot.robotName || fileName.replace(/\.urdf$/i, '') || 'robot',
    fileName,
    tcpLinkName: preferredTcpLinkName || findTcpLinkName(robot),
    joints: preferredJoints ?? createJointDefinitions(robot.joints),
  }
}
