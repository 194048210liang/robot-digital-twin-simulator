import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { jointDefinitions } from '@/robot/config'
import type {
  ConnectionState,
  JointState,
  LogChannel,
  RobotLog,
  SafetyState,
  TcpPose,
  MotionState,
} from '@/robot/types'

let logSequence = 0

function timestamp() {
  const now = new Date()
  const time = now.toLocaleTimeString('zh-CN', { hour12: false })
  return `${time}.${String(now.getMilliseconds()).padStart(3, '0')}`
}

export const useRobotStore = defineStore('robot', () => {
  const joints = ref<JointState[]>(
    jointDefinitions.map((definition) => ({
      ...definition,
      current: definition.home,
      target: definition.home,
      velocity: 0,
    })),
  )
  const selectedJointId = ref('elbow_flex_joint')
  const connectionState = ref<ConnectionState>('disconnected')
  const motionState = ref<MotionState>('idle')
  const safetyState = ref<SafetyState>('normal')
  const modelLoaded = ref(false)
  const modelError = ref('')
  const speedScale = ref(0.5)
  const fps = ref(0)
  const tcpPose = ref<TcpPose>({ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 })
  const consoleTab = ref<LogChannel>('communication')
  const logs = ref<RobotLog[]>([])

  const selectedJoint = computed(
    () => joints.value.find((joint) => joint.id === selectedJointId.value) ?? joints.value[0],
  )
  const filteredLogs = computed(() => logs.value.filter((log) => log.channel === consoleTab.value))
  const warningCount = computed(
    () => logs.value.filter((log) => log.level === 'warning' || log.level === 'error').length,
  )

  function findJoint(jointId: string) {
    return joints.value.find((joint) => joint.id === jointId)
  }

  function addLog(entry: Omit<RobotLog, 'id' | 'time'>) {
    logs.value.unshift({ id: ++logSequence, time: timestamp(), ...entry })
    if (logs.value.length > 500) logs.value.length = 500
  }

  function clearLogs() {
    logs.value = []
  }

  function setTcpPose(pose: TcpPose) {
    tcpPose.value = pose
  }

  return {
    joints,
    selectedJointId,
    selectedJoint,
    connectionState,
    motionState,
    safetyState,
    modelLoaded,
    modelError,
    speedScale,
    fps,
    tcpPose,
    consoleTab,
    logs,
    filteredLogs,
    warningCount,
    findJoint,
    addLog,
    clearLogs,
    setTcpPose,
  }
})
