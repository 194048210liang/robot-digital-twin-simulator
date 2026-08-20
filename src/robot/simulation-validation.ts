import { Euler, MathUtils, Quaternion } from 'three'
import type { RobotTask, RobotTaskStatus } from './task'
import type { JointState, TcpPose, TranslationDescriptor } from './types'

export const SIMULATION_RECORD_FORMAT = 'robostation-simulation-record'
export const SIMULATION_RECORD_VERSION = 1
export const TCP_POSITION_TOLERANCE_M = 0.002
export const TCP_ORIENTATION_TOLERANCE_DEG = 1

export interface SimulationJointDefinition {
  id: string
  name: string
  kind: JointState['kind']
  unit: JointState['displayUnit']
  min: number
  max: number
  maxVelocity: number
}

export interface SimulationJointSample {
  id: string
  position: number
  target: number
  velocity: number
}

export interface SimulationSample {
  timestamp: number
  elapsedMs: number
  stepIndex: number
  waypointReached?: boolean
  tcp: TcpPose
  joints: SimulationJointSample[]
}

export interface SimulationValidationCheck {
  id:
    | 'task-completion'
    | 'position-limit'
    | 'velocity-limit'
    | 'sample-continuity'
    | 'tcp-waypoint-coverage'
    | 'tcp-position-error'
    | 'tcp-orientation-error'
  name: TranslationDescriptor
  description: TranslationDescriptor
  expected: TranslationDescriptor
  actual: TranslationDescriptor
  passed: boolean
}

export interface SimulationValidationSummary {
  sampleCount: number
  tcpPathLength: number
  maxSampleGapMs: number
  positionViolationCount: number
  velocityViolationCount: number
  tcpTargetCount: number
  tcpReachedCount: number
  maxTcpPositionError: number | null
  maxTcpOrientationError: number | null
  passed: boolean
}

export interface SimulationTcpWaypointError {
  stepIndex: number
  timestamp: number
  target: TcpPose
  actual: TcpPose
  positionError: number
  orientationError: number
}

export interface SimulationRecord {
  format: typeof SIMULATION_RECORD_FORMAT
  version: typeof SIMULATION_RECORD_VERSION
  id: string
  taskId: string
  taskName: string
  task: RobotTask
  modelName: string
  tcpLinkName: string
  startedAt: number
  endedAt: number | null
  durationMs: number
  status: RobotTaskStatus
  error: string
  jointDefinitions: SimulationJointDefinition[]
  samples: SimulationSample[]
  tcpWaypointErrors: SimulationTcpWaypointError[]
  summary: SimulationValidationSummary
  checks: SimulationValidationCheck[]
}

export function createSimulationSample(
  joints: JointState[],
  tcp: TcpPose,
  stepIndex: number,
  startedAt: number,
  timestamp = Date.now(),
  waypointReached = false,
): SimulationSample {
  return {
    timestamp,
    elapsedMs: Math.max(0, timestamp - startedAt),
    stepIndex,
    waypointReached,
    tcp: { ...tcp },
    joints: joints.map((joint) => ({
      id: joint.id,
      position: joint.current,
      target: joint.target,
      velocity: joint.velocity,
    })),
  }
}

export function calculateTcpPoseError(target: TcpPose, actual: TcpPose) {
  const targetRotation = new Quaternion().setFromEuler(
    new Euler(
      MathUtils.degToRad(target.rx),
      MathUtils.degToRad(target.ry),
      MathUtils.degToRad(target.rz),
      'XYZ',
    ),
  )
  const actualRotation = new Quaternion().setFromEuler(
    new Euler(
      MathUtils.degToRad(actual.rx),
      MathUtils.degToRad(actual.ry),
      MathUtils.degToRad(actual.rz),
      'XYZ',
    ),
  )
  const quaternionDot = Math.min(1, Math.abs(targetRotation.dot(actualRotation)))
  return {
    positionError: Math.hypot(actual.x - target.x, actual.y - target.y, actual.z - target.z),
    orientationError: MathUtils.radToDeg(2 * Math.acos(quaternionDot)),
  }
}

export function calculateTcpWaypointErrors(
  task: RobotTask | undefined,
  samples: SimulationSample[],
) {
  if (!task) return []
  const reachedSamples = new Map<number, SimulationSample>()
  for (const sample of samples) {
    if (sample.waypointReached) reachedSamples.set(sample.stepIndex, sample)
  }
  return task.steps.flatMap((step, stepIndex): SimulationTcpWaypointError[] => {
    const sample = reachedSamples.get(stepIndex)
    if (!step.targetTcpPose || !sample) return []
    const error = calculateTcpPoseError(step.targetTcpPose, sample.tcp)
    return [
      {
        stepIndex,
        timestamp: sample.timestamp,
        target: { ...step.targetTcpPose },
        actual: { ...sample.tcp },
        ...error,
      },
    ]
  })
}

export function calculateTcpPathLength(samples: SimulationSample[]) {
  let distance = 0
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]!.tcp
    const current = samples[index]!.tcp
    distance += Math.hypot(current.x - previous.x, current.y - previous.y, current.z - previous.z)
  }
  return distance
}

export function buildSimulationValidation(
  status: RobotTaskStatus,
  definitions: SimulationJointDefinition[],
  samples: SimulationSample[],
  task?: RobotTask,
) {
  const limits = new Map(definitions.map((joint) => [joint.id, joint]))
  let positionViolationCount = 0
  let velocityViolationCount = 0
  let maxSampleGapMs = 0

  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex += 1) {
    const sample = samples[sampleIndex]!
    if (sampleIndex > 0) {
      maxSampleGapMs = Math.max(
        maxSampleGapMs,
        sample.timestamp - samples[sampleIndex - 1]!.timestamp,
      )
    }
    for (const joint of sample.joints) {
      const definition = limits.get(joint.id)
      if (!definition) continue
      if (
        joint.position < definition.min - 0.000001 ||
        joint.position > definition.max + 0.000001
      ) {
        positionViolationCount += 1
      }
      if (Math.abs(joint.velocity) > definition.maxVelocity + 0.000001) {
        velocityViolationCount += 1
      }
    }
  }

  const completed = status === 'completed'
  const continuous = samples.length > 1 && maxSampleGapMs <= 250
  const tcpTargetCount = task?.steps.filter((step) => step.targetTcpPose).length ?? 0
  const tcpWaypointErrors = calculateTcpWaypointErrors(task, samples)
  const maxTcpPositionError = tcpWaypointErrors.length
    ? Math.max(...tcpWaypointErrors.map((item) => item.positionError))
    : null
  const maxTcpOrientationError = tcpWaypointErrors.length
    ? Math.max(...tcpWaypointErrors.map((item) => item.orientationError))
    : null
  const checks: SimulationValidationCheck[] = [
    {
      id: 'task-completion',
      name: { key: 'validation.checks.taskCompletion.name' },
      description: { key: 'validation.checks.taskCompletion.description' },
      expected: { key: 'validation.checks.taskCompletion.expected' },
      actual: {
        key: completed
          ? 'validation.checks.taskCompletion.actualCompleted'
          : status === 'error'
            ? 'validation.checks.taskCompletion.actualError'
            : 'validation.checks.taskCompletion.actualIncomplete',
      },
      passed: completed,
    },
    {
      id: 'position-limit',
      name: { key: 'validation.checks.positionLimit.name' },
      description: { key: 'validation.checks.positionLimit.description' },
      expected: { key: 'validation.checks.positionLimit.expected' },
      actual: {
        key: 'validation.checks.positionLimit.actual',
        params: { count: positionViolationCount },
      },
      passed: positionViolationCount === 0,
    },
    {
      id: 'velocity-limit',
      name: { key: 'validation.checks.velocityLimit.name' },
      description: { key: 'validation.checks.velocityLimit.description' },
      expected: { key: 'validation.checks.velocityLimit.expected' },
      actual: {
        key: 'validation.checks.velocityLimit.actual',
        params: { count: velocityViolationCount },
      },
      passed: velocityViolationCount === 0,
    },
    {
      id: 'sample-continuity',
      name: { key: 'validation.checks.sampleContinuity.name' },
      description: { key: 'validation.checks.sampleContinuity.description' },
      expected: { key: 'validation.checks.sampleContinuity.expected' },
      actual:
        samples.length > 1
          ? {
              key: 'validation.checks.sampleContinuity.actual',
              params: { value: Math.round(maxSampleGapMs) },
            }
          : { key: 'validation.checks.sampleContinuity.insufficient' },
      passed: continuous,
    },
  ]
  if (tcpTargetCount > 0) {
    checks.push(
      {
        id: 'tcp-waypoint-coverage',
        name: { key: 'validation.checks.tcpCoverage.name' },
        description: { key: 'validation.checks.tcpCoverage.description' },
        expected: {
          key: 'validation.checks.tcpCoverage.value',
          params: { actual: tcpTargetCount, expected: tcpTargetCount },
        },
        actual: {
          key: 'validation.checks.tcpCoverage.value',
          params: { actual: tcpWaypointErrors.length, expected: tcpTargetCount },
        },
        passed: tcpWaypointErrors.length === tcpTargetCount,
      },
      {
        id: 'tcp-position-error',
        name: { key: 'validation.checks.tcpPositionError.name' },
        description: { key: 'validation.checks.tcpPositionError.description' },
        expected: {
          key: 'validation.checks.tcpPositionError.expected',
          params: { value: TCP_POSITION_TOLERANCE_M * 1000 },
        },
        actual:
          maxTcpPositionError === null
            ? { key: 'validation.checks.noArrivalSample' }
            : {
                key: 'validation.checks.tcpPositionError.actual',
                params: { value: (maxTcpPositionError * 1000).toFixed(3) },
              },
        passed: maxTcpPositionError !== null && maxTcpPositionError <= TCP_POSITION_TOLERANCE_M,
      },
      {
        id: 'tcp-orientation-error',
        name: { key: 'validation.checks.tcpOrientationError.name' },
        description: { key: 'validation.checks.tcpOrientationError.description' },
        expected: {
          key: 'validation.checks.tcpOrientationError.expected',
          params: { value: TCP_ORIENTATION_TOLERANCE_DEG },
        },
        actual:
          maxTcpOrientationError === null
            ? { key: 'validation.checks.noArrivalSample' }
            : {
                key: 'validation.checks.tcpOrientationError.actual',
                params: { value: maxTcpOrientationError.toFixed(3) },
              },
        passed:
          maxTcpOrientationError !== null &&
          maxTcpOrientationError <= TCP_ORIENTATION_TOLERANCE_DEG,
      },
    )
  }
  const summary: SimulationValidationSummary = {
    sampleCount: samples.length,
    tcpPathLength: calculateTcpPathLength(samples),
    maxSampleGapMs,
    positionViolationCount,
    velocityViolationCount,
    tcpTargetCount,
    tcpReachedCount: tcpWaypointErrors.length,
    maxTcpPositionError,
    maxTcpOrientationError,
    passed: checks.every((check) => check.passed),
  }
  return { summary, checks, tcpWaypointErrors }
}

function csvCell(value: string | number) {
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function simulationRecordToCsv(record: SimulationRecord) {
  const jointIds = record.jointDefinitions.map((joint) => joint.id)
  const headers: string[] = [
    'timestamp',
    'elapsed_ms',
    'step',
    'tcp_x_m',
    'tcp_y_m',
    'tcp_z_m',
    'tcp_rx_deg',
    'tcp_ry_deg',
    'tcp_rz_deg',
    'waypoint_reached',
    'target_tcp_x_m',
    'target_tcp_y_m',
    'target_tcp_z_m',
    'target_tcp_rx_deg',
    'target_tcp_ry_deg',
    'target_tcp_rz_deg',
    'tcp_position_error_m',
    'tcp_orientation_error_deg',
  ]
  for (const jointId of jointIds) {
    headers.push(`${jointId}_position`, `${jointId}_target`, `${jointId}_velocity`)
  }
  const rows: Array<Array<string | number>> = record.samples.map((sample) => {
    const joints = new Map(sample.joints.map((joint) => [joint.id, joint]))
    const targetPose = record.task.steps[sample.stepIndex]?.targetTcpPose
    const tcpError = targetPose ? calculateTcpPoseError(targetPose, sample.tcp) : null
    const row: Array<string | number> = [
      new Date(sample.timestamp).toISOString(),
      sample.elapsedMs,
      sample.stepIndex + 1,
      sample.tcp.x,
      sample.tcp.y,
      sample.tcp.z,
      sample.tcp.rx,
      sample.tcp.ry,
      sample.tcp.rz,
      sample.waypointReached ? 'true' : 'false',
      ...(targetPose
        ? [
            targetPose.x,
            targetPose.y,
            targetPose.z,
            targetPose.rx,
            targetPose.ry,
            targetPose.rz,
            tcpError!.positionError,
            tcpError!.orientationError,
          ]
        : ['', '', '', '', '', '', '', '']),
    ]
    for (const jointId of jointIds) {
      const joint = joints.get(jointId)
      row.push(...(joint ? [joint.position, joint.target, joint.velocity] : ['', '', '']))
    }
    return row
  })
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
}
