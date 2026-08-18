<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref } from 'vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { faCube, faMinus, faSquare, faXmark } from '@fortawesome/free-solid-svg-icons'
import ConsolePanel from '@/components/ConsolePanel.vue'
import JointControlPanel from '@/components/JointControlPanel.vue'
import MotionControls from '@/components/MotionControls.vue'
import RobotViewport from '@/components/RobotViewport.vue'
import TcpStatusPanel from '@/components/TcpStatusPanel.vue'
import TopStatusBar from '@/components/TopStatusBar.vue'
import { robotControllerKey } from '@/robot/controller-context'
import { RobotController } from '@/robot/robot-controller'
import { RobotSimulator } from '@/robot/robot-simulator'
import { useRobotStore } from '@/stores/robot'
import { MockTransport } from '@/transport/mock-transport'

const store = useRobotStore()
const simulator = new RobotSimulator(store)
const controller = new RobotController(store, new MockTransport(), simulator)
provide(robotControllerKey, controller)

const initialTab = new URLSearchParams(window.location.search).get('tab')
const activePanel = ref<'joint' | 'tcp'>(initialTab === 'tcp' ? 'tcp' : 'joint')
const now = ref(new Date())
let clockTimer = 0

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
    details: '11 个控制关节',
    latency: 20,
    status: '成功',
  })
  void controller.connect()
  clockTimer = window.setInterval(() => (now.value = new Date()), 1000)
})

onBeforeUnmount(() => {
  simulator.dispose()
  window.clearInterval(clockTimer)
})
</script>

<template>
  <div class="workstation">
    <header class="titlebar">
      <div class="brand">
        <span class="brand-mark"><FontAwesomeIcon :icon="faCube" /></span
        ><strong>RoboStation</strong><span>机器人仿真控制台</span>
      </div>
      <div class="window-controls" aria-hidden="true">
        <FontAwesomeIcon :icon="faMinus" /><FontAwesomeIcon :icon="faSquare" /><FontAwesomeIcon
          :icon="faXmark"
        />
      </div>
    </header>
    <TopStatusBar :current-time="currentTime" />

    <main class="workspace">
      <RobotViewport />
      <section class="control panel" aria-label="机器人控制区">
        <div class="control-tabs" role="tablist" aria-label="控制视图">
          <button
            role="tab"
            :aria-selected="activePanel === 'joint'"
            :class="{ active: activePanel === 'joint' }"
            @click="activePanel = 'joint'"
          >
            关节控制
          </button>
          <button
            role="tab"
            :aria-selected="activePanel === 'tcp'"
            :class="{ active: activePanel === 'tcp' }"
            @click="activePanel = 'tcp'"
          >
            TCP 状态
          </button>
        </div>
        <div class="control-content">
          <JointControlPanel v-if="activePanel === 'joint'" />
          <TcpStatusPanel v-else />
        </div>
        <MotionControls />
      </section>
    </main>
    <ConsolePanel />
  </div>
</template>

<style scoped>
.workstation {
  height: 100%;
  min-height: 760px;
  display: grid;
  grid-template-rows: 44px 50px minmax(410px, 1fr) minmax(232px, 29vh);
  gap: 8px;
  padding-bottom: 8px;
  background: #eef2f6;
}
.titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 17px;
  color: #f5f8fc;
  background: linear-gradient(100deg, #071321, #0d1d31 68%, #071321);
}
.brand {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 16px;
  letter-spacing: 0.1px;
}
.brand strong {
  font-size: 19px;
}
.brand-mark {
  width: 25px;
  height: 25px;
  display: grid;
  place-items: center;
  border: 2px solid #dfe9f6;
  transform: rotate(30deg);
}
.brand-mark svg {
  transform: rotate(-30deg);
  font-size: 13px;
}
.window-controls {
  display: flex;
  align-items: center;
  gap: 30px;
  font-size: 15px;
}
.workspace {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(520px, 1.04fr) minmax(660px, 0.96fr);
  gap: 8px;
  padding: 0 8px;
}
.panel {
  border: 1px solid var(--line-300);
  border-radius: var(--radius-md);
  background: #fff;
  box-shadow: 0 1px 2px rgb(25 42 60 / 4%);
}
.control {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: 40px minmax(0, 1fr) 50px;
  gap: 8px;
  padding-bottom: 0;
  overflow: hidden;
  background: #f8fafc;
}
.control-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border-bottom: 1px solid var(--line-300);
  background: #f7f9fb;
}
.control-tabs button {
  position: relative;
  border: 0;
  border-right: 1px solid var(--line-200);
  background: transparent;
  cursor: pointer;
  font-size: 15px;
}
.control-tabs button:last-child {
  border-right: 0;
}
.control-tabs button.active {
  color: var(--blue-700);
  font-weight: 650;
  background: #fff;
}
.control-tabs button.active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  background: var(--blue-600);
}
.control-content {
  min-height: 0;
  overflow: hidden;
  border-bottom: 1px solid var(--line-300);
  background: #fff;
}
.control :deep(.motion-controls) {
  margin: 0 0 0;
  padding: 0;
}
.console {
  margin: 0 8px;
}
@media (max-height: 850px) {
  .workstation {
    grid-template-rows: 44px 44px minmax(390px, 1fr) minmax(190px, 25vh);
    gap: 6px;
  }
}
</style>
