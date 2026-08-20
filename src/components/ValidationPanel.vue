<script setup lang="ts">
import { computed } from 'vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { faCheckCircle, faDownload, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { simulationRecordToCsv } from '@/robot/simulation-validation'
import { useValidationStore } from '@/stores/validation'
import { downloadTextFile, sanitizeFileName } from '@/utils/download'
import type { TranslationDescriptor } from '@/robot/types'

const route = useRoute()
const router = useRouter()
const validation = useValidationStore()
const { locale, t } = useI18n()
const record = computed(() => validation.selectedRecord)
const hasTcpTargets = computed(() => Boolean(record.value?.summary.tcpTargetCount))

function validationText(value: TranslationDescriptor) {
  return t(value.key, value.params ?? {})
}

const statusLabel = computed(() =>
  record.value ? t(`validation.statuses.${record.value.status}`) : t('validation.statuses.none'),
)

function formatDate(timestamp: number | null) {
  return timestamp
    ? new Date(timestamp).toLocaleString(locale.value, { hour12: false })
    : t('common.none')
}

function formatDuration(milliseconds: number) {
  if (milliseconds < 60_000) return `${(milliseconds / 1000).toFixed(2)} s`
  const totalSeconds = Math.floor(milliseconds / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function fileBaseName() {
  const value = record.value
  return value
    ? `${sanitizeFileName(value.taskName) || 'simulation'}-${value.id.slice(0, 8)}`
    : 'simulation'
}

function exportJson() {
  if (!record.value) return
  downloadTextFile(
    `${fileBaseName()}.simulation.json`,
    JSON.stringify(record.value, null, 2),
    'application/json;charset=utf-8',
  )
}

function exportCsv() {
  if (!record.value) return
  downloadTextFile(
    `${fileBaseName()}.trajectory.csv`,
    `\uFEFF${simulationRecordToCsv(record.value)}`,
    'text/csv;charset=utf-8',
  )
}

function goToTasks() {
  void router.replace({ query: { ...route.query, tab: 'task' } })
}
</script>

<template>
  <div class="validation-panel">
    <template v-if="record">
      <section class="run-overview">
        <header>
          <div>
            <h3>{{ t('validation.currentResult') }}</h3>
            <span>{{ record.taskName }}</span>
          </div>
          <ElSelect
            v-if="validation.records.length > 1"
            :model-value="record.id"
            class="record-select"
            size="small"
            :aria-label="t('validation.chooseRecord')"
            @change="validation.select"
          >
            <ElOption
              v-for="item in validation.records"
              :key="item.id"
              :label="`${item.taskName} · ${formatDate(item.startedAt)}`"
              :value="item.id"
            />
          </ElSelect>
        </header>
        <div class="overview-grid">
          <dl>
            <div>
              <dt>{{ t('validation.completionStatus') }}</dt>
              <dd :class="{ pass: record.summary.passed }">{{ statusLabel }}</dd>
            </div>
            <div>
              <dt>{{ t('validation.duration') }}</dt>
              <dd>{{ formatDuration(record.durationMs) }}</dd>
            </div>
          </dl>
          <dl>
            <div>
              <dt>{{ t('validation.sampleCount') }}</dt>
              <dd>{{ record.summary.sampleCount }}</dd>
            </div>
            <div>
              <dt>{{ t('validation.tcpPathLength') }}</dt>
              <dd>{{ record.summary.tcpPathLength.toFixed(3) }} m</dd>
            </div>
          </dl>
          <dl>
            <template v-if="hasTcpTargets">
              <div>
                <dt>{{ t('validation.maxPositionError') }}</dt>
                <dd>
                  {{
                    record.summary.maxTcpPositionError === null
                      ? '—'
                      : `${(record.summary.maxTcpPositionError * 1000).toFixed(3)} mm`
                  }}
                </dd>
              </div>
              <div>
                <dt>{{ t('validation.maxOrientationError') }}</dt>
                <dd>
                  {{
                    record.summary.maxTcpOrientationError === null
                      ? '—'
                      : `${record.summary.maxTcpOrientationError.toFixed(3)}°`
                  }}
                </dd>
              </div>
            </template>
            <template v-else>
              <div>
                <dt>{{ t('common.startTime') }}</dt>
                <dd>{{ formatDate(record.startedAt) }}</dd>
              </div>
              <div>
                <dt>{{ t('common.endTime') }}</dt>
                <dd>{{ formatDate(record.endedAt) }}</dd>
              </div>
            </template>
          </dl>
        </div>
      </section>

      <section class="check-list">
        <h3>{{ t('validation.metrics') }}</h3>
        <ElTable class="adaptive-table" :data="record.checks" border size="small" height="100%">
          <ElTableColumn :label="t('validation.metricName')" min-width="125">
            <template #default="{ row }">{{ validationText(row.name) }}</template>
          </ElTableColumn>
          <ElTableColumn :label="t('common.description')" min-width="220" show-overflow-tooltip>
            <template #default="{ row }">{{ validationText(row.description) }}</template>
          </ElTableColumn>
          <ElTableColumn :label="t('common.expected')" width="110" align="center">
            <template #default="{ row }">{{ validationText(row.expected) }}</template>
          </ElTableColumn>
          <ElTableColumn :label="t('common.measured')" width="110" align="center">
            <template #default="{ row }">{{ validationText(row.actual) }}</template>
          </ElTableColumn>
          <ElTableColumn :label="t('common.result')" width="92" align="center">
            <template #default="{ row }">
              <span :class="row.passed ? 'pass' : 'fail'">
                <FontAwesomeIcon :icon="row.passed ? faCheckCircle : faTriangleExclamation" />
                {{ row.passed ? t('validation.pass') : t('validation.failed') }}
              </span>
            </template>
          </ElTableColumn>
        </ElTable>
      </section>

      <section class="export-bar">
        <div>
          <strong>{{ t('validation.output') }}</strong>
          <span>{{ t('validation.outputDescription') }}</span>
        </div>
        <ElButton :disabled="validation.isRecording" @click="exportJson">
          <FontAwesomeIcon :icon="faDownload" />{{ t('validation.exportJson') }}
        </ElButton>
        <ElButton type="primary" plain :disabled="validation.isRecording" @click="exportCsv">
          <FontAwesomeIcon :icon="faDownload" />{{ t('validation.exportCsv') }}
        </ElButton>
      </section>
    </template>

    <ElEmpty v-else :description="t('validation.noRecord')">
      <p>{{ t('validation.emptyHint') }}</p>
      <ElButton type="primary" plain @click="goToTasks">{{ t('task.goToTasks') }}</ElButton>
    </ElEmpty>
  </div>
</template>

<style scoped>
.validation-panel {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: 154px minmax(0, 1fr) 66px;
  gap: 10px;
  padding: 10px;
  overflow: hidden;
  background: #f6f8fa;
}
.validation-panel > section {
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--line-300);
  border-radius: var(--radius-sm);
  background: #fff;
}
h3,
p {
  margin: 0;
}
.run-overview header {
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 12px;
  border-bottom: 1px solid var(--line-200);
}
.run-overview header > div {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.run-overview h3,
.check-list h3 {
  font-size: 14px;
}
.run-overview header span {
  overflow: hidden;
  color: var(--ink-500);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.record-select {
  flex: 0 0 270px;
  width: 270px;
}
.overview-grid {
  height: calc(100% - 40px);
  display: grid;
  grid-template-columns: repeat(3, 1fr);
}
.overview-grid dl {
  display: grid;
  align-content: center;
  gap: 12px;
  margin: 0;
  padding: 0 18px;
  border-right: 1px solid var(--line-200);
}
.overview-grid dl:last-child {
  border: 0;
}
.overview-grid dl div {
  display: grid;
  grid-template-columns: 86px minmax(0, 1fr);
  gap: 8px;
}
dt {
  color: var(--ink-500);
}
dd {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.check-list {
  display: grid;
  grid-template-rows: 34px minmax(0, 1fr);
}
.check-list h3 {
  display: flex;
  align-items: center;
  padding: 0 12px;
  border-bottom: 1px solid var(--line-200);
}
.check-list :deep(.el-table__cell) {
  height: 34px;
  padding: 0;
}
.check-list :deep(.cell) {
  line-height: 33px;
  font-size: 12px;
}
.pass,
.fail {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-weight: 600;
}
.pass {
  color: var(--green-600);
}
.fail {
  color: var(--red-600);
}
.export-bar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
}
.export-bar > div {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.export-bar span {
  overflow: hidden;
  color: var(--ink-500);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.export-bar :deep(.el-button) {
  min-width: 112px;
  margin: 0;
  gap: 7px;
}
.validation-panel :deep(.el-empty) {
  grid-row: 1 / -1;
  align-self: center;
}
.validation-panel :deep(.el-empty p) {
  margin: -4px 0 14px;
  color: var(--ink-500);
}
@media (max-height: 850px) {
  .validation-panel {
    grid-template-rows: 126px minmax(0, 1fr) 58px;
    gap: 8px;
    padding: 8px;
  }
  .overview-grid dl {
    gap: 7px;
  }
}
</style>
