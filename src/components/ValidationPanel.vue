<script setup lang="ts">
import { computed } from 'vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { faCheckCircle, faDownload, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons'
import { useRoute, useRouter } from 'vue-router'
import { simulationRecordToCsv } from '@/robot/simulation-validation'
import { useValidationStore } from '@/stores/validation'
import { downloadTextFile, sanitizeFileName } from '@/utils/download'

const route = useRoute()
const router = useRouter()
const validation = useValidationStore()
const record = computed(() => validation.selectedRecord)
const hasTcpTargets = computed(() => Boolean(record.value?.summary.tcpTargetCount))

const statusLabel = computed(() => {
  const labels = {
    idle: '未开始',
    running: '采样中',
    paused: '已暂停',
    completed: '已完成',
    stopped: '已停止',
    error: '异常',
  }
  return record.value ? labels[record.value.status] : '暂无记录'
})

function formatDate(timestamp: number | null) {
  return timestamp ? new Date(timestamp).toLocaleString('zh-CN', { hour12: false }) : '—'
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
            <h3>当前验证结果</h3>
            <span>{{ record.taskName }}</span>
          </div>
          <ElSelect
            v-if="validation.records.length > 1"
            :model-value="record.id"
            class="record-select"
            size="small"
            aria-label="选择验证记录"
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
              <dt>完成状态</dt>
              <dd :class="{ pass: record.summary.passed }">{{ statusLabel }}</dd>
            </div>
            <div>
              <dt>运行时长</dt>
              <dd>{{ formatDuration(record.durationMs) }}</dd>
            </div>
          </dl>
          <dl>
            <div>
              <dt>采样点数</dt>
              <dd>{{ record.summary.sampleCount }}</dd>
            </div>
            <div>
              <dt>TCP 路径距离</dt>
              <dd>{{ record.summary.tcpPathLength.toFixed(3) }} m</dd>
            </div>
          </dl>
          <dl>
            <template v-if="hasTcpTargets">
              <div>
                <dt>最大位置误差</dt>
                <dd>
                  {{
                    record.summary.maxTcpPositionError === null
                      ? '—'
                      : `${(record.summary.maxTcpPositionError * 1000).toFixed(3)} mm`
                  }}
                </dd>
              </div>
              <div>
                <dt>最大姿态误差</dt>
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
                <dt>开始时间</dt>
                <dd>{{ formatDate(record.startedAt) }}</dd>
              </div>
              <div>
                <dt>结束时间</dt>
                <dd>{{ formatDate(record.endedAt) }}</dd>
              </div>
            </template>
          </dl>
        </div>
      </section>

      <section class="check-list">
        <h3>验证指标</h3>
        <ElTable class="adaptive-table" :data="record.checks" border size="small" height="100%">
          <ElTableColumn prop="name" label="指标名称" min-width="125" />
          <ElTableColumn prop="description" label="说明" min-width="220" show-overflow-tooltip />
          <ElTableColumn prop="expected" label="期望" width="110" align="center" />
          <ElTableColumn prop="actual" label="实测" width="110" align="center" />
          <ElTableColumn label="结果" width="92" align="center">
            <template #default="{ row }">
              <span :class="row.passed ? 'pass' : 'fail'">
                <FontAwesomeIcon :icon="row.passed ? faCheckCircle : faTriangleExclamation" />
                {{ row.passed ? '通过' : '未通过' }}
              </span>
            </template>
          </ElTableColumn>
        </ElTable>
      </section>

      <section class="export-bar">
        <div>
          <strong>验证数据输出</strong>
          <span>JSON 含目标/实际 TCP 与验证结论；CSV 为逐时刻关节、TCP 和跟踪误差。</span>
        </div>
        <ElButton :disabled="validation.isRecording" @click="exportJson">
          <FontAwesomeIcon :icon="faDownload" />导出 JSON
        </ElButton>
        <ElButton type="primary" plain :disabled="validation.isRecording" @click="exportCsv">
          <FontAwesomeIcon :icon="faDownload" />导出 CSV
        </ElButton>
      </section>
    </template>

    <ElEmpty v-else description="尚无验证记录">
      <p>先在任务编排中播放一个任务，系统会自动采集关节与 TCP 数据。</p>
      <ElButton type="primary" plain @click="goToTasks">前往任务编排</ElButton>
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
