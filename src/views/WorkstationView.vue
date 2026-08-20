<script setup lang="ts">
import { ref, watch } from 'vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { faCube, faGlobe } from '@fortawesome/free-solid-svg-icons'
import type { TabPaneName } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import BatchSetDialog from '@/components/BatchSetDialog.vue'
import ConsolePanel from '@/components/ConsolePanel.vue'
import JointControlPanel from '@/components/JointControlPanel.vue'
import MotionControls from '@/components/MotionControls.vue'
import RobotViewport from '@/components/RobotViewport.vue'
import RobotTaskPanel from '@/components/RobotTaskPanel.vue'
import TcpStatusPanel from '@/components/TcpStatusPanel.vue'
import TopStatusBar from '@/components/TopStatusBar.vue'
import ValidationPanel from '@/components/ValidationPanel.vue'
import { useRobotWorkstation } from '@/composables/useRobotWorkstation'
import { isAppLocale, persistLocale, type AppLocale } from '@/i18n'

type ControlPanel = 'joint' | 'tcp' | 'task' | 'validation'

const route = useRoute()
const router = useRouter()
const { locale, t } = useI18n()
const batchDialogVisible = ref(false)
const activePanel = ref<ControlPanel>(
  route.query.tab === 'tcp' || route.query.tab === 'task' || route.query.tab === 'validation'
    ? route.query.tab
    : 'joint',
)
const { currentTime } = useRobotWorkstation()

watch(
  () => route.query.tab,
  (tab) =>
    (activePanel.value =
      tab === 'tcp' || tab === 'task' || tab === 'validation' ? (tab as ControlPanel) : 'joint'),
)

function selectPanel(panel: TabPaneName) {
  const nextPanel: ControlPanel =
    panel === 'tcp' || panel === 'task' || panel === 'validation' ? panel : 'joint'
  activePanel.value = nextPanel
  void router.replace({
    query: { ...route.query, tab: nextPanel === 'joint' ? undefined : nextPanel },
  })
}

function openBatchSet() {
  batchDialogVisible.value = true
}

function changeLanguage(command: AppLocale) {
  if (!isAppLocale(command)) return
  locale.value = command
  persistLocale(command)
}
</script>

<template>
  <div class="workstation">
    <header class="titlebar">
      <div class="brand">
        <span class="brand-mark"><FontAwesomeIcon :icon="faCube" /></span
        ><strong>{{ t('common.appName') }}</strong
        ><span class="brand-divider" /><span>{{ t('common.appSubtitle') }}</span>
      </div>
      <ElDropdown trigger="click" @command="changeLanguage">
        <ElButton class="title-language" text :aria-label="t('common.language')">
          <FontAwesomeIcon :icon="faGlobe" />
          {{ locale === 'en-US' ? t('common.english') : t('common.chinese') }}
        </ElButton>
        <template #dropdown>
          <ElDropdownMenu>
            <ElDropdownItem command="zh-CN" :disabled="locale === 'zh-CN'">
              {{ t('common.chinese') }}
            </ElDropdownItem>
            <ElDropdownItem command="en-US" :disabled="locale === 'en-US'">
              {{ t('common.english') }}
            </ElDropdownItem>
          </ElDropdownMenu>
        </template>
      </ElDropdown>
    </header>
    <TopStatusBar :current-time="currentTime" />

    <main class="workspace">
      <RobotViewport />
      <section class="control panel" :aria-label="t('robot.controlArea')">
        <ElTabs
          :model-value="activePanel"
          class="control-tabs"
          stretch
          :aria-label="t('robot.controlView')"
          @tab-change="selectPanel"
        >
          <ElTabPane :label="t('joint.teaching')" name="joint" />
          <ElTabPane :label="t('tcp.title')" name="tcp" />
          <ElTabPane :label="t('task.title')" name="task" />
          <ElTabPane :label="t('validation.title')" name="validation" />
        </ElTabs>
        <div class="control-content">
          <JointControlPanel v-show="activePanel === 'joint'" />
          <TcpStatusPanel v-show="activePanel === 'tcp'" />
          <RobotTaskPanel v-show="activePanel === 'task'" />
          <ValidationPanel v-show="activePanel === 'validation'" />
        </div>
        <MotionControls
          :show-execute="false"
          :show-batch-set="activePanel === 'joint'"
          @batch-set="openBatchSet"
        />
      </section>
    </main>
    <ConsolePanel />
    <BatchSetDialog v-model="batchDialogVisible" />
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
.brand-divider {
  width: 1px;
  height: 22px;
  margin: 0 3px;
  background: rgb(223 233 246 / 40%);
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
.title-language {
  min-width: 104px;
  gap: 8px;
  color: #e7eef7;
  font-size: 13px;
}
.title-language:hover,
.title-language:focus-visible {
  color: #fff;
  background: rgb(255 255 255 / 9%);
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
