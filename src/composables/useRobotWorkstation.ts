import { computed, onBeforeUnmount, onMounted, provide, ref } from 'vue'
import { robotControllerKey } from '@/robot/controller-context'
import { RobotController } from '@/robot/robot-controller'
import { RobotSimulator } from '@/robot/robot-simulator'
import { useRobotStore } from '@/stores/robot'
import { MockTransport } from '@/transport/mock-transport'

export function useRobotWorkstation() {
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
    return `${ymd} ${date.toLocaleTimeString('zh-CN', { hour12: false })}`
  })

  onMounted(() => {
    simulator.start()
    store.addLog({
      level: 'info',
      channel: 'communication',
      direction: 'SYS',
      source: '仿真',
      code: 'SIM-4001',
      message: '仿真环境初始化完成',
      details: '控制周期 20 ms',
      status: '成功',
    })
    store.addLog({
      level: 'info',
      channel: 'communication',
      direction: 'RX',
      source: '状态',
      code: 'JOINT-STATE',
      message: '全量关节状态同步完成',
      details: `${store.joints.length} 个控制关节`,
      latency: 20,
      status: '成功',
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
