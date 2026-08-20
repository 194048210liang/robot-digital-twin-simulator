<script setup lang="ts">
import { computed, ref } from 'vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { faDownload, faGear, faTrashCan } from '@fortawesome/free-solid-svg-icons'
import { useRoute, useRouter } from 'vue-router'
import type { RobotLog } from '@/robot/types'
import type { SimulationRecord } from '@/robot/simulation-validation'
import { useRobotStore } from '@/stores/robot'
import { useValidationStore } from '@/stores/validation'
import { downloadTextFile } from '@/utils/download'

type BottomTab = 'event' | 'validation' | 'communication'

const route = useRoute()
const router = useRouter()
const store = useRobotStore()
const validation = useValidationStore()
const activeTab = ref<BottomTab>('event')
const autoScroll = ref(true)
const keepAcks = ref(true)
const tabs: { id: BottomTab; label: string }[] = [
  { id: 'event', label: '仿真事件' },
  { id: 'validation', label: '验证记录' },
  { id: 'communication', label: '通信诊断' },
]
const eventLogs = computed(() =>
  store.logs.filter(
    (log) =>
      log.channel !== 'communication' ||
      (log.direction === 'SYS' && log.source !== '通信' && log.source !== 'Mock'),
  ),
)
const communicationLogs = computed(() =>
  store.logs.filter(
    (log) => log.channel === 'communication' && (keepAcks.value || log.code !== 'ACK'),
  ),
)
const visibleLogs = computed(() =>
  activeTab.value === 'communication' ? communicationLogs.value : eventLogs.value,
)
const statusLabel = computed(() => `${store.logs.length} / 500`)

function exportVisibleLogs() {
  const name = activeTab.value === 'communication' ? 'communication' : 'simulation-events'
  downloadTextFile(
    `robostation-${name}-${Date.now()}.json`,
    JSON.stringify(visibleLogs.value, null, 2),
    'application/json;charset=utf-8',
  )
}

function levelLabel(log: RobotLog) {
  return { info: '信息', warning: '警告', error: '错误' }[log.level]
}

function recordStatus(status: string) {
  return {
    running: '采样中',
    paused: '已暂停',
    completed: '已完成',
    stopped: '已停止',
    error: '异常',
    idle: '未开始',
  }[status]
}

function formatDate(timestamp: number | null) {
  return timestamp ? new Date(timestamp).toLocaleString('zh-CN', { hour12: false }) : '—'
}

function formatDuration(milliseconds: number) {
  if (milliseconds < 60_000) return `${(milliseconds / 1000).toFixed(2)} s`
  const seconds = Math.floor(milliseconds / 1000)
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function showRecord(recordId: string) {
  validation.select(recordId)
  void router.replace({ query: { ...route.query, tab: 'validation' } })
}

function openValidationRow(row: SimulationRecord) {
  showRecord(row.id)
}
</script>

<template>
  <section class="console panel" aria-label="仿真数据台">
    <ElTabs v-model="activeTab" class="console-tabs" aria-label="仿真数据类型">
      <ElTabPane v-for="tab in tabs" :key="tab.id" :name="tab.id">
        <template #label>
          <ElBadge
            v-if="tab.id === 'event'"
            :value="store.warningCount"
            :hidden="store.warningCount === 0"
            class="alarm-badge"
          >
            <span>{{ tab.label }}</span>
          </ElBadge>
          <span v-else>{{ tab.label }}</span>
        </template>
      </ElTabPane>
    </ElTabs>

    <div class="log-table-wrap">
      <ElTable
        v-if="activeTab !== 'validation'"
        class="log-table adaptive-table"
        :data="visibleLogs"
        :empty-text="activeTab === 'communication' ? '暂无通信诊断记录' : '暂无仿真事件'"
        row-key="id"
        border
        size="small"
        height="100%"
      >
        <ElTableColumn prop="time" label="时间" width="130" />
        <ElTableColumn v-if="activeTab === 'event'" label="级别" width="82">
          <template #default="{ row }">
            <span :class="row.level">{{ levelLabel(row) }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn v-else label="方向" width="82">
          <template #default="{ row }">
            <span :class="row.direction === 'RX' ? 'rx' : 'tx'">● {{ row.direction }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="source" label="来源" width="96" />
        <ElTableColumn prop="code" label="代码 / 类型" width="140" />
        <ElTableColumn prop="message" label="事件 / 消息" min-width="280" show-overflow-tooltip />
        <ElTableColumn prop="details" label="数据 / 详情" min-width="280" show-overflow-tooltip />
        <ElTableColumn v-if="activeTab === 'communication'" label="往返时间" width="110">
          <template #default="{ row }">{{ row.latency ? `${row.latency} ms` : '—' }}</template>
        </ElTableColumn>
        <ElTableColumn label="状态" width="90">
          <template #default="{ row }">
            <span :class="row.status === '成功' ? 'success' : row.level">{{ row.status }}</span>
          </template>
        </ElTableColumn>
      </ElTable>

      <ElTable
        v-else
        class="log-table validation-table adaptive-table"
        :data="validation.records"
        empty-text="播放任务后将在此生成验证记录"
        row-key="id"
        border
        size="small"
        height="100%"
        @row-dblclick="openValidationRow"
      >
        <ElTableColumn type="index" label="序号" width="62" align="center" />
        <ElTableColumn label="开始时间" width="180">
          <template #default="{ row }">{{ formatDate(row.startedAt) }}</template>
        </ElTableColumn>
        <ElTableColumn prop="taskName" label="任务名称" min-width="210" show-overflow-tooltip />
        <ElTableColumn label="完成状态" width="100" align="center">
          <template #default="{ row }">
            <span
              :class="row.summary.passed ? 'success' : row.status === 'running' ? 'tx' : 'warning'"
            >
              {{ recordStatus(row.status) }}
            </span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="运行时长" width="110" align="center">
          <template #default="{ row }">{{ formatDuration(row.durationMs) }}</template>
        </ElTableColumn>
        <ElTableColumn label="采样点" width="100" align="center">
          <template #default="{ row }">{{ row.summary.sampleCount }}</template>
        </ElTableColumn>
        <ElTableColumn label="TCP 路径" width="120" align="center">
          <template #default="{ row }">{{ row.summary.tcpPathLength.toFixed(3) }} m</template>
        </ElTableColumn>
        <ElTableColumn label="关节越限" width="100" align="center">
          <template #default="{ row }">{{ row.summary.positionViolationCount }}</template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="90" align="center">
          <template #default="{ row }">
            <ElButton type="primary" link @click="showRecord(row.id)">查看</ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
    </div>

    <footer class="console-footer">
      <div class="footer-status">
        <span
          >模型已加载：<strong>{{ store.modelName }}</strong></span
        >
        <i />
        <span
          >记录器：<b>● {{ validation.isRecording ? '采样中' : '就绪' }}</b></span
        >
        <i />
        <span>{{
          activeTab === 'validation'
            ? `验证记录：${validation.records.length}`
            : `日志：${statusLabel}`
        }}</span>
      </div>
      <div class="footer-actions">
        <ElButton
          v-if="activeTab === 'validation'"
          :disabled="validation.isRecording"
          @click="validation.clear()"
        >
          <FontAwesomeIcon :icon="faTrashCan" />清除记录
        </ElButton>
        <template v-else>
          <ElButton @click="store.clearLogs()">
            <FontAwesomeIcon :icon="faTrashCan" />清除日志
          </ElButton>
          <ElButton @click="exportVisibleLogs">
            <FontAwesomeIcon :icon="faDownload" />导出日志
          </ElButton>
        </template>
        <ElPopover placement="top-end" :width="230" trigger="click">
          <template #reference>
            <ElButton><FontAwesomeIcon :icon="faGear" />设置</ElButton>
          </template>
          <div class="settings-panel">
            <strong>数据台设置</strong>
            <ElCheckbox v-model="autoScroll">自动滚动最新记录</ElCheckbox>
            <ElCheckbox v-model="keepAcks">保留通信 ACK</ElCheckbox>
          </div>
        </ElPopover>
      </div>
    </footer>
  </section>
</template>

<style scoped>
.console {
  position: relative;
  min-height: 0;
  display: grid;
  grid-template-rows: 36px minmax(0, 1fr) 44px;
  overflow: hidden;
}
.console-tabs {
  border-bottom: 1px solid var(--line-300);
  background: #fafbfd;
}
.console-tabs :deep(.el-tabs__header) {
  height: 35px;
  margin: 0;
}
.console-tabs :deep(.el-tabs__nav-wrap),
.console-tabs :deep(.el-tabs__nav-scroll),
.console-tabs :deep(.el-tabs__nav) {
  height: 100%;
}
.console-tabs :deep(.el-tabs__nav-wrap::after) {
  display: none;
}
.console-tabs :deep(.el-tabs__item) {
  min-width: 110px;
  height: 35px;
  padding: 0 22px;
  font-size: 13px;
}
.console-tabs :deep(.el-tabs__item.is-active) {
  color: var(--blue-700);
  font-weight: 650;
}
.console-tabs :deep(.el-tabs__active-bar) {
  height: 2px;
}
.console-tabs :deep(.el-tabs__content) {
  display: none;
}
.alarm-badge :deep(.el-badge__content) {
  top: 3px;
  right: -5px;
}
.log-table-wrap {
  min-height: 0;
  overflow: hidden;
}
.log-table {
  --el-table-row-hover-bg-color: #f4f8ff;
}
.log-table :deep(.el-table__cell) {
  height: 27px;
  padding: 0;
}
.log-table :deep(.cell) {
  padding: 0 10px;
  overflow: hidden;
  line-height: 26px;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}
.validation-table :deep(.el-table__row) {
  cursor: pointer;
}
.warning {
  color: var(--amber-600);
}
.error {
  color: var(--red-600);
}
.success,
.rx {
  color: var(--green-600);
}
.tx {
  color: var(--blue-600);
}
.console-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  border-top: 1px solid var(--line-200);
  background: #fbfcfd;
}
.footer-status,
.footer-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}
.footer-status i {
  width: 1px;
  height: 16px;
  background: var(--line-200);
}
.footer-status b {
  color: var(--green-600);
}
.footer-status strong {
  font-weight: 500;
}
.footer-actions {
  gap: 8px;
}
.footer-actions :deep(.el-button) {
  min-width: 116px;
  height: 30px;
  margin-left: 0;
  gap: 8px;
}
.settings-panel {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}
.settings-panel strong {
  margin-bottom: 2px;
}
.settings-panel :deep(.el-checkbox) {
  margin-right: 0;
}
</style>
