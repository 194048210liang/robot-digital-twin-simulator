import { describe, expect, it } from 'vitest'
import {
  buildSimulationValidation,
  calculateTcpPathLength,
  simulationRecordToCsv,
  type SimulationJointDefinition,
  type SimulationRecord,
  type SimulationSample,
} from './simulation-validation'

const definitions: SimulationJointDefinition[] = [
  {
    id: 'joint-a',
    name: 'Joint A',
    kind: 'revolute',
    unit: '°',
    min: -1,
    max: 1,
    maxVelocity: 2,
  },
]

function sample(timestamp: number, x: number, position = 0, velocity = 0): SimulationSample {
  return {
    timestamp,
    elapsedMs: timestamp - 1000,
    stepIndex: 0,
    tcp: { x, y: 0, z: 0, rx: 0, ry: 0, rz: 0 },
    joints: [{ id: 'joint-a', position, target: position, velocity }],
  }
}

describe('simulation validation', () => {
  it('根据采样计算 TCP 路径与通过状态', () => {
    const samples = [sample(1000, 0), sample(1100, 0.3), sample(1200, 0.7)]
    const validation = buildSimulationValidation('completed', definitions, samples)

    expect(calculateTcpPathLength(samples)).toBeCloseTo(0.7)
    expect(validation.summary.sampleCount).toBe(3)
    expect(validation.summary.maxSampleGapMs).toBe(100)
    expect(validation.summary.passed).toBe(true)
  })

  it('报告位置越限、速度超限和采样中断', () => {
    const validation = buildSimulationValidation('completed', definitions, [
      sample(1000, 0),
      sample(1400, 0.2, 1.2, 2.5),
    ])

    expect(validation.summary.positionViolationCount).toBe(1)
    expect(validation.summary.velocityViolationCount).toBe(1)
    expect(validation.summary.passed).toBe(false)
    expect(validation.checks.filter((check) => !check.passed)).toHaveLength(3)
  })

  it('导出逐样本 TCP 与关节数据 CSV', () => {
    const samples = [sample(1000, 0), sample(1100, 0.2, 0.5, 1)]
    const validation = buildSimulationValidation('completed', definitions, samples)
    const record: SimulationRecord = {
      format: 'robostation-simulation-record',
      version: 1,
      id: 'record-1',
      taskId: 'task-1',
      taskName: '测试任务',
      task: {
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
      },
      modelName: 'Test Robot',
      tcpLinkName: 'tool0',
      startedAt: 1000,
      endedAt: 1100,
      durationMs: 100,
      status: 'completed',
      error: '',
      jointDefinitions: definitions,
      samples,
      ...validation,
    }

    const csv = simulationRecordToCsv(record)
    expect(csv).toContain('tcp_x_m')
    expect(csv).toContain('joint-a_position,joint-a_target,joint-a_velocity')
    expect(csv.split('\r\n')).toHaveLength(3)
  })
})
