import { Euler, MathUtils, Quaternion } from 'three'
import type { RobotTask, RobotTaskStatus } from './task'
import type { JointState, TcpPose } from './types'

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
  name: string
  description: string
  expected: string
  actual: string
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
      name: '任务执行完成',
      description: '任务序列是否完整播放至最后一个姿态',
      expected: '已完成',
      actual: completed ? '已完成' : status === 'error' ? '异常' : '未完成',
      passed: completed,
    },
    {
      id: 'position-limit',
      name: '关节位置限位',
      description: '采样位置是否位于 URDF 关节限位范围内',
      expected: '0 次越限',
      actual: `${positionViolationCount} 次越限`,
      passed: positionViolationCount === 0,
    },
    {
      id: 'velocity-limit',
      name: '关节速度限位',
      description: '采样速度是否低于模型关节最大速度',
      expected: '0 次超速',
      actual: `${velocityViolationCount} 次超速`,
      passed: velocityViolationCount === 0,
    },
    {
      id: 'sample-continuity',
      name: '采样连续性',
      description: '相邻样本间隔是否不超过 250 ms',
      expected: '≤ 250 ms',
      actual: samples.length > 1 ? `${Math.round(maxSampleGapMs)} ms` : '样本不足',
      passed: continuous,
    },
  ]
  if (tcpTargetCount > 0) {
    checks.push(
      {
        id: 'tcp-waypoint-coverage',
        name: 'TCP 目标覆盖',
        description: '每个外部算法目标是否都记录到任务到达时的实际 TCP',
        expected: `${tcpTargetCount} / ${tcpTargetCount}`,
        actual: `${tcpWaypointErrors.length} / ${tcpTargetCount}`,
        passed: tcpWaypointErrors.length === tcpTargetCount,
      },
      {
        id: 'tcp-position-error',
        name: 'TCP 位置误差',
        description: '目标 TCP 与任务到达时实际 TCP 的最大直线距离',
        expected: `≤ ${TCP_POSITION_TOLERANCE_M * 1000} mm`,
        actual:
          maxTcpPositionError === null
            ? '无到达样本'
            : `${(maxTcpPositionError * 1000).toFixed(3)} mm`,
        passed: maxTcpPositionError !== null && maxTcpPositionError <= TCP_POSITION_TOLERANCE_M,
      },
      {
        id: 'tcp-orientation-error',
        name: 'TCP 姿态误差',
        description: '目标姿态与任务到达时实际姿态的最大旋转夹角',
        expected: `≤ ${TCP_ORIENTATION_TOLERANCE_DEG}°`,
        actual:
          maxTcpOrientationError === null ? '无到达样本' : `${maxTcpOrientationError.toFixed(3)}°`,
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
