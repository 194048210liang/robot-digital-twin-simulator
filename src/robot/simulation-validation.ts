import type { RobotTask, RobotTaskStatus } from './task'
import type { JointState, TcpPose } from './types'

export const SIMULATION_RECORD_FORMAT = 'robostation-simulation-record'
export const SIMULATION_RECORD_VERSION = 1

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
  tcp: TcpPose
  joints: SimulationJointSample[]
}

export interface SimulationValidationCheck {
  id: 'task-completion' | 'position-limit' | 'velocity-limit' | 'sample-continuity'
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
  passed: boolean
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
  summary: SimulationValidationSummary
  checks: SimulationValidationCheck[]
}

export function createSimulationSample(
  joints: JointState[],
  tcp: TcpPose,
  stepIndex: number,
  startedAt: number,
  timestamp = Date.now(),
): SimulationSample {
  return {
    timestamp,
    elapsedMs: Math.max(0, timestamp - startedAt),
    stepIndex,
    tcp: { ...tcp },
    joints: joints.map((joint) => ({
      id: joint.id,
      position: joint.current,
      target: joint.target,
      velocity: joint.velocity,
    })),
  }
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
  const summary: SimulationValidationSummary = {
    sampleCount: samples.length,
    tcpPathLength: calculateTcpPathLength(samples),
    maxSampleGapMs,
    positionViolationCount,
    velocityViolationCount,
    passed: checks.every((check) => check.passed),
  }
  return { summary, checks }
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
  ]
  for (const jointId of jointIds) {
    headers.push(`${jointId}_position`, `${jointId}_target`, `${jointId}_velocity`)
  }
  const rows: Array<Array<string | number>> = record.samples.map((sample) => {
    const joints = new Map(sample.joints.map((joint) => [joint.id, joint]))
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
    ]
    for (const jointId of jointIds) {
      const joint = joints.get(jointId)
      row.push(...(joint ? [joint.position, joint.target, joint.velocity] : ['', '', '']))
    }
    return row
  })
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
}
