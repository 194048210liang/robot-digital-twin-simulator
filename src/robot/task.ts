export type RobotTaskStatus = 'idle' | 'running' | 'paused' | 'completed' | 'stopped' | 'error'

export interface RobotTaskJointTarget {
  jointId: string
  position: number
}

export interface RobotTaskStep {
  id: string
  targets: RobotTaskJointTarget[]
  speedScale: number
}

export interface RobotTask {
  id: string
  name: string
  description: string
  steps: RobotTaskStep[]
  createdAt: number
  updatedAt: number
}

export interface RobotTaskRuntime {
  activeTaskId: string | null
  status: RobotTaskStatus
  progress: number
  startedAt: number | null
  elapsedMs: number
  currentStepIndex: number
  totalSteps: number
  startPositions: Record<string, number>
  error: string
}

export interface CreateRobotTaskInput {
  name: string
  description?: string
  steps: RobotTaskStep[]
}

export const ROBOT_TASK_NAME_MAX_LENGTH = 40
export const ROBOT_TASK_DESCRIPTION_MAX_LENGTH = 120
export const ROBOT_TASK_MAX_STEPS = 50

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isRobotTaskTarget(value: unknown): value is RobotTaskJointTarget {
  return (
    isRecord(value) &&
    typeof value.jointId === 'string' &&
    Boolean(value.jointId) &&
    Number.isFinite(value.position)
  )
}

function isRobotTaskStep(value: unknown): value is RobotTaskStep {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    Boolean(value.id) &&
    Number.isFinite(value.speedScale) &&
    Number(value.speedScale) >= 0.1 &&
    Number(value.speedScale) <= 1 &&
    Array.isArray(value.targets) &&
    value.targets.length > 0 &&
    value.targets.every(isRobotTaskTarget)
  )
}

export function normalizeTaskText(value: string, maxLength: number) {
  return value.trim().slice(0, maxLength)
}

export function cloneRobotTask(task: RobotTask): RobotTask {
  return {
    ...task,
    steps: task.steps.map((step) => ({
      ...step,
      targets: step.targets.map((target) => ({ ...target })),
    })),
  }
}

export function isRobotTask(value: unknown): value is RobotTask {
  if (!isRecord(value)) return false
  if (typeof value.id !== 'string' || !value.id) return false
  if (
    typeof value.name !== 'string' ||
    !value.name ||
    value.name.length > ROBOT_TASK_NAME_MAX_LENGTH
  ) {
    return false
  }
  if (
    typeof value.description !== 'string' ||
    value.description.length > ROBOT_TASK_DESCRIPTION_MAX_LENGTH
  ) {
    return false
  }
  if (!Number.isFinite(value.createdAt) || !Number.isFinite(value.updatedAt)) return false
  if (
    !Array.isArray(value.steps) ||
    value.steps.length === 0 ||
    value.steps.length > ROBOT_TASK_MAX_STEPS
  ) {
    return false
  }
  return value.steps.every(isRobotTaskStep)
}

export function migrateStoredTask(value: unknown): RobotTask | null {
  if (isRobotTask(value)) return value
  if (
    !isRecord(value) ||
    !Array.isArray(value.targets) ||
    !value.targets.every(isRobotTaskTarget)
  ) {
    return null
  }
  if (
    typeof value.id !== 'string' ||
    !value.id ||
    typeof value.name !== 'string' ||
    !value.name ||
    value.name.length > ROBOT_TASK_NAME_MAX_LENGTH ||
    typeof value.description !== 'string' ||
    value.description.length > ROBOT_TASK_DESCRIPTION_MAX_LENGTH ||
    !Number.isFinite(value.speedScale) ||
    Number(value.speedScale) < 0.1 ||
    Number(value.speedScale) > 1 ||
    !Number.isFinite(value.createdAt) ||
    !Number.isFinite(value.updatedAt) ||
    value.targets.length === 0
  ) {
    return null
  }

  return {
    id: value.id,
    name: value.name,
    description: value.description,
    steps: [
      {
        id: `${value.id}-step-1`,
        targets: value.targets.map((target) => ({ ...target })),
        speedScale: Number(value.speedScale),
      },
    ],
    createdAt: Number(value.createdAt),
    updatedAt: Number(value.updatedAt),
  }
}

export function isSameJointPose(
  first: RobotTaskJointTarget[],
  second: RobotTaskJointTarget[],
  tolerance = 0.000001,
) {
  if (first.length !== second.length) return false
  const secondPositions = new Map(second.map((target) => [target.jointId, target.position]))
  return first.every((target) => {
    const position = secondPositions.get(target.jointId)
    return typeof position === 'number' && Math.abs(position - target.position) <= tolerance
  })
}

export function calculateTaskProgress(
  startPositions: Record<string, number>,
  targets: RobotTaskJointTarget[],
  currentPositions: Record<string, number>,
) {
  let progressSum = 0
  let movingJointCount = 0

  for (const target of targets) {
    const start = startPositions[target.jointId]
    const current = currentPositions[target.jointId]
    if (typeof start !== 'number' || !Number.isFinite(start)) continue
    if (typeof current !== 'number' || !Number.isFinite(current)) continue
    const distance = Math.abs(target.position - start)
    if (distance <= Number.EPSILON) continue
    const remaining = Math.abs(target.position - current)
    progressSum += Math.min(1, Math.max(0, (distance - remaining) / distance))
    movingJointCount += 1
  }

  if (movingJointCount === 0) return 100
  return (progressSum / movingJointCount) * 100
}

export function calculateSequenceProgress(
  currentStepIndex: number,
  totalSteps: number,
  currentStepProgress: number,
) {
  if (totalSteps <= 0) return 0
  const completedSteps = Math.min(totalSteps, Math.max(0, currentStepIndex))
  const boundedStepProgress = Math.min(100, Math.max(0, currentStepProgress)) / 100
  return Math.min(100, ((completedSteps + boundedStepProgress) / totalSteps) * 100)
}
