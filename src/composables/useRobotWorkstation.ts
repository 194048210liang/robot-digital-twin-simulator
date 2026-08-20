import { computed, onBeforeUnmount, onMounted, provide, ref } from 'vue'
import { robotControllerKey } from '@/robot/controller-context'
import { RobotController } from '@/robot/robot-controller'
import { RobotSimulator } from '@/robot/robot-simulator'
import { useRobotStore } from '@/stores/robot'
import { MockTransport } from '@/transport/mock-transport'
import { useI18n } from 'vue-i18n'

export function useRobotWorkstation() {
  const { locale } = useI18n()
  const store = useRobotStore()
  const simulator = new RobotSimulator(store)
  const controller = new RobotController(store, new MockTransport(), simulator)
  const now = ref(new Date())
  let clockTimer: number | undefined

  provide(robotControllerKey, controller)

  const currentTime = computed(() => {
    const date = now.value
    const ymd = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-')
    return `${ymd} ${date.toLocaleTimeString(locale.value, { hour12: false })}`
  })

  onMounted(() => {
    simulator.start()
    store.addLog({
      level: 'info',
      channel: 'communication',
      direction: 'SYS',
      source: 'SIMULATION',
      code: 'SIM-4001',
      messageKey: 'robot.messages.environmentReady',
      detailsKey: 'robot.messages.controlCycle',
      detailsParams: { value: 20 },
      status: 'SUCCESS',
    })
    store.addLog({
      level: 'info',
      channel: 'communication',
      direction: 'RX',
      source: 'STATE',
      code: 'JOINT-STATE',
      messageKey: 'robot.messages.jointStateSynced',
      detailsKey: 'robot.messages.controlledJointCount',
      detailsParams: { count: store.joints.length },
      latency: 20,
      status: 'SUCCESS',
    })
    void controller.connect()
    clockTimer = window.setInterval(() => (now.value = new Date()), 1000)
  })

  onBeforeUnmount(() => {
    simulator.dispose()
    if (clockTimer !== undefined) window.clearInterval(clockTimer)
  })

  return { currentTime }
}
