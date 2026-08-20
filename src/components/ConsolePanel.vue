<script setup lang="ts">
import { computed, ref } from 'vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { faDownload, faGear, faTrashCan } from '@fortawesome/free-solid-svg-icons'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
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
const { locale, t } = useI18n()
const activeTab = ref<BottomTab>('event')
const autoScroll = ref(true)
const keepAcks = ref(true)
const tabs = computed<{ id: BottomTab; label: string }[]>(() => [
  { id: 'event', label: t('console.event') },
  { id: 'validation', label: t('console.validation') },
  { id: 'communication', label: t('console.communication') },
])
const eventLogs = computed(() =>
  store.logs.filter(
    (log) =>
      log.channel !== 'communication' ||
      (log.direction === 'SYS' && log.source !== 'COMMUNICATION' && log.source !== 'MOCK'),
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
  return log?.level ? t(`console.levels.${log.level}`) : t('common.none')
}

function recordStatus(status: string) {
  return t(`validation.statuses.${status}`)
}

function sourceLabel(source: RobotLog['source']) {
  return t(`console.sources.${source.toLowerCase()}`)
}

function logMessage(log: RobotLog) {
  return t(log.messageKey, log.messageParams ?? {})
}

function logDetails(log: RobotLog) {
  if (log.detailsText) return log.detailsText
  if (log.detailsKey) return t(log.detailsKey, log.detailsParams ?? {})
  return t('common.none')
}

function logStatus(log: RobotLog) {
  return log?.status ? t(`status.${log.status}`) : t('common.none')
}

function formatDate(timestamp: number | null) {
  return timestamp
    ? new Date(timestamp).toLocaleString(locale.value, { hour12: false })
    : t('common.none')
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
  <section class="console panel" :aria-label="t('console.title')">
    <ElTabs v-model="activeTab" class="console-tabs" :aria-label="t('console.dataType')">
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
        :empty-text="
          activeTab === 'communication' ? t('console.noCommunication') : t('console.noEvents')
        "
        row-key="id"
        border
        size="small"
        height="100%"
      >
        <ElTableColumn prop="time" :label="t('common.time')" width="130" />
        <ElTableColumn v-if="activeTab === 'event'" :label="t('console.level')" width="82">
          <template #default="{ row }">
            <span :class="row.level">{{ levelLabel(row) }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn v-else :label="t('common.direction')" width="82">
          <template #default="{ row }">
            <span :class="row.direction === 'RX' ? 'rx' : 'tx'">● {{ row.direction }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn :label="t('common.source')" width="96">
          <template #default="{ row }">{{ sourceLabel(row.source) }}</template>
        </ElTableColumn>
        <ElTableColumn prop="code" :label="t('common.codeType')" width="140" />
        <ElTableColumn :label="t('common.eventMessage')" min-width="280" show-overflow-tooltip>
          <template #default="{ row }">{{ logMessage(row) }}</template>
        </ElTableColumn>
        <ElTableColumn :label="t('common.dataDetails')" min-width="280" show-overflow-tooltip>
          <template #default="{ row }">{{ logDetails(row) }}</template>
        </ElTableColumn>
        <ElTableColumn
          v-if="activeTab === 'communication'"
          :label="t('common.roundTripTime')"
          width="110"
        >
          <template #default="{ row }">
            {{ row.latency ? `${row.latency} ms` : t('common.none') }}
          </template>
        </ElTableColumn>
        <ElTableColumn :label="t('common.status')" width="90">
          <template #default="{ row }">
            <span :class="row.status === 'SUCCESS' ? 'success' : row.level">{{
              logStatus(row)
            }}</span>
          </template>
        </ElTableColumn>
      </ElTable>

      <ElTable
        v-else
        class="log-table validation-table adaptive-table"
        :data="validation.records"
        :empty-text="t('validation.recordsEmpty')"
        row-key="id"
        border
        size="small"
        height="100%"
        @row-dblclick="openValidationRow"
      >
        <ElTableColumn type="index" :label="t('common.index')" width="62" align="center" />
        <ElTableColumn :label="t('common.startTime')" width="180">
          <template #default="{ row }">{{ formatDate(row.startedAt) }}</template>
        </ElTableColumn>
        <ElTableColumn
          prop="taskName"
          :label="t('task.taskName')"
          min-width="210"
          show-overflow-tooltip
        />
        <ElTableColumn :label="t('validation.completionStatus')" width="100" align="center">
          <template #default="{ row }">
            <span
              :class="row.summary.passed ? 'success' : row.status === 'running' ? 'tx' : 'warning'"
            >
              {{ recordStatus(row.status) }}
            </span>
          </template>
        </ElTableColumn>
        <ElTableColumn :label="t('validation.duration')" width="110" align="center">
          <template #default="{ row }">{{ formatDuration(row.durationMs) }}</template>
        </ElTableColumn>
        <ElTableColumn :label="t('validation.samplePoints')" width="100" align="center">
          <template #default="{ row }">{{ row.summary.sampleCount }}</template>
        </ElTableColumn>
        <ElTableColumn :label="t('validation.tcpPath')" width="120" align="center">
          <template #default="{ row }">{{ row.summary.tcpPathLength.toFixed(3) }} m</template>
        </ElTableColumn>
        <ElTableColumn :label="t('validation.jointViolations')" width="100" align="center">
          <template #default="{ row }">{{ row.summary.positionViolationCount }}</template>
        </ElTableColumn>
        <ElTableColumn :label="t('common.operation')" width="90" align="center">
          <template #default="{ row }">
            <ElButton type="primary" link @click="showRecord(row.id)">
              {{ t('common.view') }}
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
    </div>

    <footer class="console-footer">
      <div class="footer-status">
        <span
          >{{ t('robot.loadedModel') }}<strong>{{ store.modelName }}</strong></span
        >
        <i />
        <span
          >{{ t('robot.recorder')
          }}<b>● {{ validation.isRecording ? t('status.RECORDING') : t('status.READY') }}</b></span
        >
        <i />
        <span>{{
          activeTab === 'validation'
            ? t('validation.recordsCount', { count: validation.records.length })
            : t('robot.logs', { value: statusLabel })
        }}</span>
      </div>
      <div class="footer-actions">
        <ElButton
          v-if="activeTab === 'validation'"
          :disabled="validation.isRecording"
          @click="validation.clear()"
        >
          <FontAwesomeIcon :icon="faTrashCan" />{{ t('console.clearRecords') }}
        </ElButton>
        <template v-else>
          <ElButton @click="store.clearLogs()">
            <FontAwesomeIcon :icon="faTrashCan" />{{ t('console.clearLogs') }}
          </ElButton>
          <ElButton @click="exportVisibleLogs">
            <FontAwesomeIcon :icon="faDownload" />{{ t('console.exportLogs') }}
          </ElButton>
        </template>
        <ElPopover placement="top-end" :width="230" trigger="click">
          <template #reference>
            <ElButton><FontAwesomeIcon :icon="faGear" />{{ t('common.settings') }}</ElButton>
          </template>
          <div class="settings-panel">
            <strong>{{ t('settings.dataConsole') }}</strong>
            <ElCheckbox v-model="autoScroll">{{ t('settings.autoScroll') }}</ElCheckbox>
            <ElCheckbox v-model="keepAcks">{{ t('settings.keepAcks') }}</ElCheckbox>
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
