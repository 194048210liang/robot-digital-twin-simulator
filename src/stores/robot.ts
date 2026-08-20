import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { jointDefinitions } from '@/robot/config'
import type {
  ConnectionState,
  JointState,
  LogChannel,
  RobotLog,
  SafetyState,
  TcpState,
  MotionState,
  RobotModelProfile,
  TranslationDescriptor,
} from '@/robot/types'

let logSequence = 0

function timestamp() {
  const now = new Date()
  const time = now.toLocaleTimeString(undefined, { hour12: false })
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
  const modelError = ref<TranslationDescriptor | null>(null)
  const modelName = ref('Fetch')
  const modelFileName = ref('robot.urdf')
  const speedScale = ref(0.5)
  const fps = ref(0)
  const tcpState = ref<TcpState>({
    pose: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 },
    sourceLink: '',
    timestamp: 0,
  })
  const tcpPose = computed(() => tcpState.value.pose)
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

  function setTcpState(state: TcpState) {
    tcpState.value = state
  }

  function setModelProfile(profile: RobotModelProfile) {
    joints.value = profile.joints.map((definition) => ({
      ...definition,
      current: definition.home,
      target: definition.home,
      velocity: 0,
    }))
    selectedJointId.value = joints.value[0]?.id ?? ''
    modelName.value = profile.name
    modelFileName.value = profile.fileName
    modelLoaded.value = true
    modelError.value = null
    motionState.value = 'idle'
    tcpState.value = {
      pose: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 },
      sourceLink: profile.tcpLinkName,
      timestamp: 0,
    }
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
    modelName,
    modelFileName,
    speedScale,
    fps,
    tcpState,
    tcpPose,
    consoleTab,
    logs,
    filteredLogs,
    warningCount,
    findJoint,
    addLog,
    clearLogs,
    setTcpState,
    setModelProfile,
  }
})
