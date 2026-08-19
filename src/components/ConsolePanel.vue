<script setup lang="ts">
import { computed, ref } from 'vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { faDownload, faGear, faTrashCan } from '@fortawesome/free-solid-svg-icons'
import type { LogChannel, RobotLog } from '@/robot/types'
import { useRobotStore } from '@/stores/robot'

const store = useRobotStore()
const autoScroll = ref(true)
const keepAcks = ref(true)
const tabs: { id: LogChannel; label: string }[] = [
  { id: 'alarm', label: '报警' },
  { id: 'command', label: '命令' },
  { id: 'communication', label: '通信' },
]
const statusLabel = computed(() => `${store.logs.length} / 500`)
const emptyText = computed(
  () => `暂无${tabs.find((tab) => tab.id === store.consoleTab)?.label ?? ''}记录`,
)

function exportLogs() {
  const blob = new Blob([JSON.stringify(store.logs, null, 2)], { type: 'application/json' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `robostation-logs-${Date.now()}.json`
  link.click()
  URL.revokeObjectURL(link.href)
}

function levelLabel(log: RobotLog) {
  return { info: '信息', warning: '警告', error: '错误' }[log.level]
}
</script>

<template>
  <section class="console panel" aria-label="诊断控制台">
    <ElTabs v-model="store.consoleTab" class="console-tabs" aria-label="诊断类型">
      <ElTabPane v-for="tab in tabs" :key="tab.id" :name="tab.id">
        <template #label>
          <ElBadge
            v-if="tab.id === 'alarm'"
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
        class="log-table adaptive-table"
        :data="store.filteredLogs"
        :empty-text="emptyText"
        row-key="id"
        border
        size="small"
        height="100%"
      >
        <ElTableColumn prop="time" label="时间" width="130" />
        <ElTableColumn v-if="store.consoleTab !== 'communication'" label="级别" width="82">
          <template #default="{ row }">
            <span :class="row.level">{{ levelLabel(row) }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn v-else label="方向" width="82">
          <template #default="{ row }">
            <span :class="row.direction === 'RX' ? 'rx' : 'tx'">● {{ row.direction }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="source" label="来源" width="88" />
        <ElTableColumn prop="code" label="代码 / 类型" width="130" />
        <ElTableColumn prop="message" label="命令 / 消息" min-width="260" show-overflow-tooltip />
        <ElTableColumn prop="details" label="参数 / 数据" min-width="260" show-overflow-tooltip />
        <ElTableColumn v-if="store.consoleTab === 'communication'" label="往返时间" width="110">
          <template #default="{ row }">{{ row.latency ? `${row.latency} ms` : '—' }}</template>
        </ElTableColumn>
        <ElTableColumn label="状态" width="90">
          <template #default="{ row }">
            <span :class="row.status === '成功' ? 'success' : row.level">{{ row.status }}</span>
          </template>
        </ElTableColumn>
      </ElTable>
    </div>

    <footer class="console-footer">
      <div class="footer-status">
        <span>模型已加载：<strong>fetch_robot_v1.0</strong></span>
        <i />
        <span>采样状态：<b>● 正常</b></span>
        <i />
        <span>日志：{{ statusLabel }}</span>
      </div>
      <div class="footer-actions">
        <ElButton @click="store.clearLogs()">
          <FontAwesomeIcon :icon="faTrashCan" />清除日志
        </ElButton>
        <ElButton @click="exportLogs"> <FontAwesomeIcon :icon="faDownload" />导出日志 </ElButton>
        <ElPopover placement="top-end" :width="230" trigger="click">
          <template #reference>
            <ElButton><FontAwesomeIcon :icon="faGear" />设置</ElButton>
          </template>
          <div class="settings-panel">
            <strong>诊断设置</strong>
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
  overflow: visible;
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
  min-width: 88px;
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
