<script setup lang="ts">
import { ref, watch } from 'vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { faCube } from '@fortawesome/free-solid-svg-icons'
import type { TabPaneName } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import ConsolePanel from '@/components/ConsolePanel.vue'
import JointControlPanel from '@/components/JointControlPanel.vue'
import MotionControls from '@/components/MotionControls.vue'
import RobotViewport from '@/components/RobotViewport.vue'
import RobotTaskPanel from '@/components/RobotTaskPanel.vue'
import TcpStatusPanel from '@/components/TcpStatusPanel.vue'
import TopStatusBar from '@/components/TopStatusBar.vue'
import { useRobotWorkstation } from '@/composables/useRobotWorkstation'

type ControlPanel = 'joint' | 'tcp' | 'task'

const route = useRoute()
const router = useRouter()
const activePanel = ref<ControlPanel>(
  route.query.tab === 'tcp' || route.query.tab === 'task' ? route.query.tab : 'joint',
)
const { currentTime } = useRobotWorkstation()

watch(
  () => route.query.tab,
  (tab) => (activePanel.value = tab === 'tcp' || tab === 'task' ? (tab as ControlPanel) : 'joint'),
)

function selectPanel(panel: TabPaneName) {
  const nextPanel: ControlPanel = panel === 'tcp' || panel === 'task' ? panel : 'joint'
  activePanel.value = nextPanel
  void router.replace({
    query: { ...route.query, tab: nextPanel === 'joint' ? undefined : nextPanel },
  })
}
</script>

<template>
  <div class="workstation">
    <header class="titlebar">
      <div class="brand">
        <span class="brand-mark"><FontAwesomeIcon :icon="faCube" /></span
        ><strong>RoboStation</strong><span>机器人仿真控制台</span>
      </div>
    </header>
    <TopStatusBar :current-time="currentTime" />

    <main class="workspace">
      <RobotViewport />
      <section class="control panel" aria-label="机器人控制区">
        <ElTabs
          :model-value="activePanel"
          class="control-tabs"
          stretch
          aria-label="控制视图"
          @tab-change="selectPanel"
        >
          <ElTabPane label="关节控制" name="joint" />
          <ElTabPane label="TCP 状态" name="tcp" />
          <ElTabPane label="机器人任务" name="task" />
        </ElTabs>
        <div class="control-content">
          <JointControlPanel v-show="activePanel === 'joint'" />
          <TcpStatusPanel v-show="activePanel === 'tcp'" />
          <RobotTaskPanel v-show="activePanel === 'task'" />
        </div>
        <MotionControls :show-execute="false" />
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
  gap: 10px;
  padding-bottom: 10px;
  background: #eef2f6;
}
.titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px;
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
.workspace {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(520px, 1.04fr) minmax(660px, 0.96fr);
  gap: 10px;
  padding: 0 10px;
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
  gap: 0;
  padding-bottom: 0;
  overflow: hidden;
  background: #f8fafc;
}
.control-tabs {
  border-bottom: 1px solid var(--line-300);
  background: #f7f9fb;
}
.control-tabs :deep(.el-tabs__header) {
  height: 39px;
  margin: 0;
}
.control-tabs :deep(.el-tabs__nav-wrap),
.control-tabs :deep(.el-tabs__nav-scroll),
.control-tabs :deep(.el-tabs__nav) {
  height: 100%;
}
.control-tabs :deep(.el-tabs__nav-wrap::after) {
  display: none;
}
.control-tabs :deep(.el-tabs__item) {
  height: 39px;
  border-right: 1px solid var(--line-200);
  font-size: 14px;
}
.control-tabs :deep(.el-tabs__item:last-child) {
  border-right: 0;
}
.control-tabs :deep(.el-tabs__item.is-active) {
  color: var(--blue-700);
  background: #fff;
  font-weight: 650;
}
.control-tabs :deep(.el-tabs__active-bar) {
  height: 2px;
}
.control-tabs :deep(.el-tabs__content) {
  display: none;
}
.control-content {
  min-height: 0;
  overflow: hidden;
  background: #fff;
}
.control :deep(.motion-controls) {
  border-top: 1px solid var(--line-300);
}
.console {
  margin: 0 10px;
}
@media (max-height: 850px) {
  .workstation {
    grid-template-rows: 44px 44px minmax(390px, 1fr) minmax(190px, 25vh);
    gap: 8px;
  }
}
</style>
