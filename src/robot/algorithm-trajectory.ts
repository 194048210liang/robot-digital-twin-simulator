import {
  ROBOT_TASK_DESCRIPTION_MAX_LENGTH,
  ROBOT_TASK_MAX_STEPS,
  ROBOT_TASK_NAME_MAX_LENGTH,
  type CreateRobotTaskInput,
} from './task'
import { createJointSignature } from './task-file'
import type { JointState, TcpPose, TranslationDescriptor } from './types'

export const ALGORITHM_TRAJECTORY_FORMAT = 'robostation-algorithm-trajectory'
export const ALGORITHM_TRAJECTORY_VERSION = 1

export interface AlgorithmTrajectoryPoint {
  speedScale: number
  targetPose: TcpPose
  joints: Record<string, number>
}

export interface AlgorithmTrajectoryFile {
  format: typeof ALGORITHM_TRAJECTORY_FORMAT
  version: typeof ALGORITHM_TRAJECTORY_VERSION
  generatedAt: string
  name: string
  description: string
  units: {
    revolute: 'rad'
    prismatic: 'm'
    tcpPosition: 'm'
    tcpRotation: 'deg-xyz'
  }
  model: {
    name: string
    fileName: string
    tcpLinkName: string
    jointSignature: string
    jointIds: string[]
  }
  trajectory: AlgorithmTrajectoryPoint[]
}

interface CreateTemplateOptions {
  modelName: string
  modelFileName: string
  tcpLinkName: string
  joints: JointState[]
  tcpPose: TcpPose
  speedScale: number
  name?: string
  description?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isTcpPose(value: unknown): value is TcpPose {
  return (
    isRecord(value) &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.z) &&
    Number.isFinite(value.rx) &&
    Number.isFinite(value.ry) &&
    Number.isFinite(value.rz)
  )
}

function isTrajectoryPoint(value: unknown): value is AlgorithmTrajectoryPoint {
  return (
    isRecord(value) &&
    Number.isFinite(value.speedScale) &&
    Number(value.speedScale) >= 0.1 &&
    Number(value.speedScale) <= 1 &&
    isTcpPose(value.targetPose) &&
    isRecord(value.joints) &&
    Object.keys(value.joints).length > 0 &&
    Object.values(value.joints).every(Number.isFinite)
  )
}

export function createAlgorithmTrajectoryTemplate(
  options: CreateTemplateOptions,
): AlgorithmTrajectoryFile {
  return {
    format: ALGORITHM_TRAJECTORY_FORMAT,
    version: ALGORITHM_TRAJECTORY_VERSION,
    generatedAt: new Date().toISOString(),
    name: (options.name || `${options.modelName} Algorithm Trajectory`).slice(
      0,
      ROBOT_TASK_NAME_MAX_LENGTH,
    ),
    description:
      options.description ||
      'Import target TCP poses and joint solutions from an external algorithm for validation.',
    units: {
      revolute: 'rad',
      prismatic: 'm',
      tcpPosition: 'm',
      tcpRotation: 'deg-xyz',
    },
    model: {
      name: options.modelName,
      fileName: options.modelFileName,
      tcpLinkName: options.tcpLinkName,
      jointSignature: createJointSignature(options.joints),
      jointIds: options.joints.map((joint) => joint.id),
    },
    trajectory: [
      {
        speedScale: Math.min(1, Math.max(0.1, options.speedScale)),
        targetPose: { ...options.tcpPose },
        joints: Object.fromEntries(options.joints.map((joint) => [joint.id, joint.current])),
      },
    ],
  }
}

export function parseAlgorithmTrajectoryFile(value: unknown): AlgorithmTrajectoryFile | null {
  if (!isRecord(value) || !isRecord(value.units) || !isRecord(value.model)) return null
  if (
    value.format !== ALGORITHM_TRAJECTORY_FORMAT ||
    value.version !== ALGORITHM_TRAJECTORY_VERSION ||
    typeof value.generatedAt !== 'string' ||
    Number.isNaN(Date.parse(value.generatedAt)) ||
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    value.name.length > ROBOT_TASK_NAME_MAX_LENGTH ||
    typeof value.description !== 'string' ||
    value.description.length > ROBOT_TASK_DESCRIPTION_MAX_LENGTH ||
    value.units.revolute !== 'rad' ||
    value.units.prismatic !== 'm' ||
    value.units.tcpPosition !== 'm' ||
    value.units.tcpRotation !== 'deg-xyz' ||
    typeof value.model.name !== 'string' ||
    typeof value.model.fileName !== 'string' ||
    typeof value.model.tcpLinkName !== 'string' ||
    typeof value.model.jointSignature !== 'string' ||
    !Array.isArray(value.model.jointIds) ||
    value.model.jointIds.length === 0 ||
    !value.model.jointIds.every((jointId) => typeof jointId === 'string' && Boolean(jointId)) ||
    new Set(value.model.jointIds).size !== value.model.jointIds.length ||
    !Array.isArray(value.trajectory) ||
    value.trajectory.length === 0 ||
    value.trajectory.length > ROBOT_TASK_MAX_STEPS ||
    !value.trajectory.every(isTrajectoryPoint)
  ) {
    return null
  }
  return value as unknown as AlgorithmTrajectoryFile
}

export function getAlgorithmTrajectoryCompatibilityError(
  file: AlgorithmTrajectoryFile,
  joints: JointState[],
  tcpLinkName: string,
): TranslationDescriptor | null {
  if (file.model.tcpLinkName !== tcpLinkName) {
    return {
      key: 'task.fileErrors.trajectoryTcpMismatch',
      params: { file: file.model.tcpLinkName || '—', current: tcpLinkName || '—' },
    }
  }
  if (file.model.jointSignature !== createJointSignature(joints)) {
    return { key: 'task.fileErrors.trajectoryModelMismatch' }
  }

  const expectedIds = new Set(joints.map((joint) => joint.id))
  for (let pointIndex = 0; pointIndex < file.trajectory.length; pointIndex += 1) {
    const point = file.trajectory[pointIndex]!
    const actualIds = Object.keys(point.joints)
    const missingIds = joints
      .map((joint) => joint.id)
      .filter((jointId) => !Object.prototype.hasOwnProperty.call(point.joints, jointId))
    const unknownIds = actualIds.filter((jointId) => !expectedIds.has(jointId))
    if (missingIds.length) {
      return {
        key: 'task.fileErrors.missingSolutions',
        params: { point: pointIndex + 1, joints: missingIds.join(', ') },
      }
    }
    if (unknownIds.length) {
      return {
        key: 'task.fileErrors.unknownJoints',
        params: { point: pointIndex + 1, joints: unknownIds.join(', ') },
      }
    }
    for (const joint of joints) {
      const position = point.joints[joint.id]!
      if (position < joint.min - 0.000001 || position > joint.max + 0.000001) {
        return {
          key: 'task.fileErrors.outOfLimit',
          params: { point: pointIndex + 1, joint: joint.displayName },
        }
      }
    }
  }
  return null
}

export function algorithmTrajectoryToTaskInput(
  file: AlgorithmTrajectoryFile,
  joints: JointState[],
): CreateRobotTaskInput {
  return {
    name: file.name,
    description: file.description,
    steps: file.trajectory.map((point) => ({
      id: '',
      speedScale: point.speedScale,
      targetTcpPose: { ...point.targetPose },
      targets: joints.map((joint) => ({
        jointId: joint.id,
        position: point.joints[joint.id]!,
      })),
    })),
  }
}
