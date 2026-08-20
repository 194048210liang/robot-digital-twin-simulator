import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { cloneRobotTask, type RobotTask, type RobotTaskStatus } from '@/robot/task'
import {
  buildSimulationValidation,
  createSimulationSample,
  SIMULATION_RECORD_FORMAT,
  SIMULATION_RECORD_VERSION,
  type SimulationRecord,
} from '@/robot/simulation-validation'
import type { JointState, TcpPose } from '@/robot/types'

const SAMPLE_INTERVAL_MS = 50
const MAX_SAMPLES_PER_RECORD = 10000
const MAX_RECORDS = 20

function createId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  return `record-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function jointDefinitions(joints: JointState[]) {
  return joints.map((joint) => ({
    id: joint.id,
    name: joint.displayName,
    kind: joint.kind,
    unit: joint.displayUnit,
    min: joint.min,
    max: joint.max,
    maxVelocity: joint.maxVelocity,
  }))
}

export const useValidationStore = defineStore('simulation-validation', () => {
  const records = ref<SimulationRecord[]>([])
  const activeRecordId = ref<string | null>(null)
  const selectedRecordId = ref<string | null>(null)
  const activeRecord = computed(
    () => records.value.find((record) => record.id === activeRecordId.value) ?? null,
  )
  const selectedRecord = computed(
    () =>
      records.value.find((record) => record.id === selectedRecordId.value) ??
      activeRecord.value ??
      records.value[0] ??
      null,
  )
  const isRecording = computed(
    () => activeRecord.value?.status === 'running' || activeRecord.value?.status === 'paused',
  )

  function begin(
    task: RobotTask,
    modelName: string,
    tcpLinkName: string,
    joints: JointState[],
    tcp: TcpPose,
  ) {
    if (activeRecord.value) finish('stopped', '新的仿真任务已开始')
    const startedAt = Date.now()
    const sample = createSimulationSample(joints, tcp, 0, startedAt, startedAt)
    const validation = buildSimulationValidation(
      'running',
      jointDefinitions(joints),
      [sample],
      task,
    )
    const record: SimulationRecord = {
      format: SIMULATION_RECORD_FORMAT,
      version: SIMULATION_RECORD_VERSION,
      id: createId(),
      taskId: task.id,
      taskName: task.name,
      task: cloneRobotTask(task),
      modelName,
      tcpLinkName,
      startedAt,
      endedAt: null,
      durationMs: 0,
      status: 'running',
      error: '',
      jointDefinitions: jointDefinitions(joints),
      samples: [sample],
      ...validation,
    }
    records.value.unshift(record)
    if (records.value.length > MAX_RECORDS) records.value.length = MAX_RECORDS
    activeRecordId.value = record.id
    selectedRecordId.value = record.id
    return record
  }

  function sample(
    joints: JointState[],
    tcp: TcpPose,
    stepIndex: number,
    force = false,
    waypointReached = false,
  ) {
    const record = activeRecord.value
    if (!record || (record.status !== 'running' && !force)) return false
    if (
      waypointReached &&
      record.samples.some((item) => item.stepIndex === stepIndex && item.waypointReached)
    ) {
      return false
    }
    const timestamp = Date.now()
    const previous = record.samples.at(-1)
    if (!force && previous && timestamp - previous.timestamp < SAMPLE_INTERVAL_MS) return false
    if (record.samples.length >= MAX_SAMPLES_PER_RECORD) return false
    record.samples.push(
      createSimulationSample(joints, tcp, stepIndex, record.startedAt, timestamp, waypointReached),
    )
    record.durationMs = timestamp - record.startedAt
    return true
  }

  function captureWaypoint(joints: JointState[], tcp: TcpPose, stepIndex: number) {
    return sample(joints, tcp, stepIndex, true, true)
  }

  function setStatus(status: Extract<RobotTaskStatus, 'running' | 'paused'>) {
    if (activeRecord.value) activeRecord.value.status = status
  }

  function finish(status: RobotTaskStatus, error = '', joints?: JointState[], tcp?: TcpPose) {
    const record = activeRecord.value
    if (!record) return null
    if (joints && tcp) sample(joints, tcp, record.samples.at(-1)?.stepIndex ?? 0, true)
    const endedAt = Date.now()
    record.endedAt = endedAt
    record.durationMs = endedAt - record.startedAt
    record.status = status
    record.error = error
    const validation = buildSimulationValidation(
      status,
      record.jointDefinitions,
      record.samples,
      record.task,
    )
    record.summary = validation.summary
    record.checks = validation.checks
    record.tcpWaypointErrors = validation.tcpWaypointErrors
    activeRecordId.value = null
    return record
  }

  function select(recordId: string) {
    if (records.value.some((record) => record.id === recordId)) selectedRecordId.value = recordId
  }

  function remove(recordId: string) {
    if (recordId === activeRecordId.value) return false
    records.value = records.value.filter((record) => record.id !== recordId)
    if (selectedRecordId.value === recordId) selectedRecordId.value = records.value[0]?.id ?? null
    return true
  }

  function clear() {
    records.value = activeRecord.value ? [activeRecord.value] : []
    selectedRecordId.value = activeRecord.value?.id ?? null
  }

  return {
    records,
    activeRecordId,
    selectedRecordId,
    activeRecord,
    selectedRecord,
    isRecording,
    begin,
    sample,
    captureWaypoint,
    setStatus,
    finish,
    select,
    remove,
    clear,
  }
})
