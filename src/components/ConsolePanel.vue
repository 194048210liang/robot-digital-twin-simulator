<script setup lang="ts">
import { computed, ref } from 'vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { faDownload, faGear, faTrashCan } from '@fortawesome/free-solid-svg-icons'
import type { LogChannel, RobotLog } from '@/robot/types'
import { useRobotStore } from '@/stores/robot'

const store = useRobotStore()
const settingsOpen = ref(false)
const tabs: { id: LogChannel; label: string }[] = [
  { id: 'alarm', label: '报警' },
  { id: 'command', label: '命令' },
  { id: 'communication', label: '通信' },
]
const statusLabel = computed(() => `${store.logs.length} / 500`)

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
    <div class="console-tabs" role="tablist" aria-label="诊断类型">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        role="tab"
        :aria-selected="store.consoleTab === tab.id"
        :class="{ active: store.consoleTab === tab.id }"
        @click="store.consoleTab = tab.id"
      >
        {{ tab.label
        }}<em v-if="tab.id === 'alarm' && store.warningCount">{{ store.warningCount }}</em>
      </button>
    </div>
    <div class="log-table-wrap">
      <table v-if="store.filteredLogs.length">
        <thead>
          <tr>
            <th>时间</th>
            <th v-if="store.consoleTab !== 'communication'">级别</th>
            <th v-if="store.consoleTab === 'communication'">方向</th>
            <th>来源</th>
            <th>代码 / 类型</th>
            <th>命令 / 消息</th>
            <th>参数 / 数据</th>
            <th v-if="store.consoleTab === 'communication'">往返时间</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="log in store.filteredLogs" :key="log.id">
            <td>{{ log.time }}</td>
            <td v-if="store.consoleTab !== 'communication'" :class="log.level">
              {{ levelLabel(log) }}
            </td>
            <td
              v-if="store.consoleTab === 'communication'"
              :class="log.direction === 'RX' ? 'rx' : 'tx'"
            >
              ● {{ log.direction }}
            </td>
            <td>{{ log.source }}</td>
            <td>{{ log.code }}</td>
            <td class="message">{{ log.message }}</td>
            <td class="details">{{ log.details }}</td>
            <td v-if="store.consoleTab === 'communication'">
              {{ log.latency ? `${log.latency} ms` : '—' }}
            </td>
            <td :class="log.status === '成功' ? 'success' : log.level">{{ log.status }}</td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty">
        暂无{{ tabs.find((tab) => tab.id === store.consoleTab)?.label }}记录
      </div>
    </div>
    <footer class="console-footer">
      <div class="footer-status">
        <span>模型已加载：<strong>fetch_robot_v1.0</strong></span
        ><i /><span>采样状态：<b>● 正常</b></span
        ><i /><span>日志：{{ statusLabel }}</span>
      </div>
      <div class="footer-actions">
        <button @click="store.clearLogs()"><FontAwesomeIcon :icon="faTrashCan" />清除日志</button>
        <button @click="exportLogs"><FontAwesomeIcon :icon="faDownload" />导出日志</button>
        <button @click="settingsOpen = !settingsOpen">
          <FontAwesomeIcon :icon="faGear" />设置
        </button>
      </div>
      <div v-if="settingsOpen" class="settings-popover">
        <strong>诊断设置</strong><label><input type="checkbox" checked /> 自动滚动最新记录</label
        ><label><input type="checkbox" checked /> 保留通信 ACK</label>
      </div>
    </footer>
  </section>
</template>

<style scoped>
.console {
  position: relative;
  min-height: 0;
  display: grid;
  grid-template-rows: 36px minmax(0, 1fr) 54px;
  overflow: visible;
}
.console-tabs {
  display: flex;
  border-bottom: 1px solid var(--line-300);
  background: #fafbfd;
}
.console-tabs button {
  position: relative;
  min-width: 88px;
  border: 0;
  background: transparent;
  cursor: pointer;
}
.console-tabs button.active {
  color: var(--blue-700);
  font-weight: 650;
}
.console-tabs button.active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  background: var(--blue-600);
}
.console-tabs em {
  display: inline-flex;
  min-width: 18px;
  height: 18px;
  margin-left: 6px;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  color: #fff;
  background: var(--amber-600);
  font-size: 11px;
  font-style: normal;
}
.log-table-wrap {
  min-height: 0;
  overflow: auto;
  scrollbar-width: thin;
}
table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 12px;
}
th,
td {
  height: 27px;
  padding: 4px 10px;
  border-right: 1px solid var(--line-200);
  border-bottom: 1px solid var(--line-200);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}
th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #f3f6f8;
  font-weight: 600;
}
th:nth-child(1) {
  width: 130px;
}
th:nth-child(2) {
  width: 82px;
}
th:nth-child(3) {
  width: 88px;
}
th:nth-child(4) {
  width: 130px;
}
.message {
  width: 26%;
}
.details {
  width: 28%;
  color: var(--ink-700);
}
.empty {
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--ink-500);
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
  padding: 0 12px;
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
  height: 18px;
  background: var(--line-200);
}
.footer-status b {
  color: var(--green-600);
}
.footer-status strong {
  font-weight: 500;
}
.footer-actions button {
  min-width: 116px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid var(--line-300);
  border-radius: var(--radius-sm);
  background: #fff;
  cursor: pointer;
}
.footer-actions button:hover {
  color: var(--blue-700);
  border-color: var(--blue-600);
}
.settings-popover {
  position: absolute;
  right: 12px;
  bottom: 48px;
  z-index: 5;
  width: 230px;
  padding: 13px;
  border: 1px solid var(--line-300);
  border-radius: var(--radius-sm);
  background: #fff;
  box-shadow: 0 8px 28px rgb(23 33 45 / 16%);
}
.settings-popover strong {
  display: block;
  margin-bottom: 8px;
}
.settings-popover label {
  display: block;
  margin-top: 7px;
}
</style>
