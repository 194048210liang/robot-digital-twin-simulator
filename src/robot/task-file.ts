import { cloneRobotTask, isRobotTask, type RobotTask } from './task'
import type { JointState, TranslationDescriptor } from './types'

export const ROBOT_TASK_FILE_FORMAT = 'robostation-task'
export const ROBOT_TASK_FILE_VERSION = 1

export interface RobotTaskModelBinding {
  name: string
  fileName: string
  tcpLinkName: string
  jointSignature: string
  jointIds: string[]
}

export interface RobotTaskFile {
  format: typeof ROBOT_TASK_FILE_FORMAT
  version: typeof ROBOT_TASK_FILE_VERSION
  exportedAt: string
  model: RobotTaskModelBinding
  task: RobotTask
}

interface CreateTaskFileOptions {
  modelName: string
  modelFileName: string
  tcpLinkName: string
  joints: JointState[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function createJointSignature(joints: JointState[]) {
  return joints
    .map((joint) => [joint.id, joint.kind, joint.min, joint.max].join(':'))
    .sort()
    .join('|')
}

export function createRobotTaskFile(
  task: RobotTask,
  options: CreateTaskFileOptions,
): RobotTaskFile {
  return {
    format: ROBOT_TASK_FILE_FORMAT,
    version: ROBOT_TASK_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    model: {
      name: options.modelName,
      fileName: options.modelFileName,
      tcpLinkName: options.tcpLinkName,
      jointSignature: createJointSignature(options.joints),
      jointIds: options.joints.map((joint) => joint.id),
    },
    task: cloneRobotTask(task),
  }
}

export function parseRobotTaskFile(value: unknown): RobotTaskFile | null {
  if (!isRecord(value) || !isRecord(value.model)) return null
  if (value.format !== ROBOT_TASK_FILE_FORMAT || value.version !== ROBOT_TASK_FILE_VERSION)
    return null
  if (typeof value.exportedAt !== 'string' || Number.isNaN(Date.parse(value.exportedAt)))
    return null
  if (
    typeof value.model.name !== 'string' ||
    typeof value.model.fileName !== 'string' ||
    typeof value.model.tcpLinkName !== 'string' ||
    typeof value.model.jointSignature !== 'string' ||
    !Array.isArray(value.model.jointIds) ||
    !value.model.jointIds.every((jointId) => typeof jointId === 'string') ||
    !isRobotTask(value.task)
  ) {
    return null
  }
  return value as unknown as RobotTaskFile
}

export function getTaskCompatibilityError(
  file: RobotTaskFile,
  joints: JointState[],
  tcpLinkName?: string,
): TranslationDescriptor | null {
  const currentIds = new Set(joints.map((joint) => joint.id))
  const missingJoints = file.task.steps
    .flatMap((step) => step.targets)
    .map((target) => target.jointId)
    .filter((jointId, index, ids) => !currentIds.has(jointId) && ids.indexOf(jointId) === index)

  if (missingJoints.length) {
    return { key: 'task.fileErrors.missingJoints', params: { joints: missingJoints.join(', ') } }
  }
  if (
    tcpLinkName !== undefined &&
    file.task.steps.some((step) => step.targetTcpPose) &&
    file.model.tcpLinkName !== tcpLinkName
  ) {
    return {
      key: 'task.fileErrors.tcpMismatch',
      params: {
        file: file.model.tcpLinkName || '—',
        current: tcpLinkName || '—',
      },
    }
  }
  if (file.model.jointSignature !== createJointSignature(joints)) {
    return { key: 'task.fileErrors.modelMismatch' }
  }
  return null
}
