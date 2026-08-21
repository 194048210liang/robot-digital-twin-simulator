<script setup lang="ts">
import { computed } from 'vue'
import type { TableColumnCtx } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { getSimulationVelocity, toDisplayValue, toInternalValue } from '@/robot/config'
import { useRobotController } from '@/robot/controller-context'
import type { JointGroup, JointState } from '@/robot/types'
import { useRobotStore } from '@/stores/robot'

interface JointTableRow {
  joint: JointState
  group: JointGroup
  showGroup: boolean
  span: number
}

interface SpanMethodProps {
  row: JointTableRow
  column: TableColumnCtx<JointTableRow>
  rowIndex: number
  columnIndex: number
}

const store = useRobotStore()
const controller = useRobotController()
const { t } = useI18n()
const groups: JointGroup[] = ['torso', 'arm', 'head', 'gripper']
const selected = computed(() => store.selectedJoint)

const rows = computed<JointTableRow[]>(() =>
  groups.flatMap((group) => {
    const joints = store.joints.filter((joint) => joint.group === group)
    return joints.map((joint, index) => ({
      joint,
      group,
      showGroup: index === 0,
      span: joints.length,
    }))
  }),
)

function display(joint: JointState, value: number) {
  return toDisplayValue(joint, value).toFixed(joint.displayDecimals)
}

function setFromDisplay(joint: JointState, value: number | undefined) {
  if (value === undefined) return
  controller.setJointTarget(joint.id, toInternalValue(joint, value))
}

function setJointTarget(joint: JointState, value: number | number[]) {
  if (typeof value === 'number') controller.setJointTarget(joint.id, value)
}

function setSpeedScale(value: number | number[]) {
  if (typeof value === 'number') controller.setSpeedScale(value)
}

function selectJoint(row: JointTableRow) {
  store.selectedJointId = row.joint.id
}

function rowKey(row: JointTableRow) {
  return row.joint.id
}

function spanMethod({ row, columnIndex }: SpanMethodProps) {
  if (columnIndex !== 0) return [1, 1]
  return row.showGroup ? [row.span, 1] : [0, 0]
}

function groupLabel(group?: JointGroup) {
  return group ? t(`joint.groups.${group}`) : t('common.none')
}
</script>

<template>
  <div class="tcp-panel">
    <section class="tcp-card">
      <h3>{{ t('tcp.position') }}</h3>
      <div class="pose-grid">
        <div v-for="axis in ['x', 'y', 'z', 'rx', 'ry', 'rz'] as const" :key="axis">
          <span>{{ axis.toUpperCase() }} {{ axis.length === 1 ? '(mm)' : '(°)' }}</span>
          <strong>{{
            axis.length === 1
              ? (store.tcpPose[axis] * 1000).toFixed(3)
              : store.tcpPose[axis].toFixed(3)
          }}</strong>
        </div>
      </div>
    </section>

    <section class="status-card">
      <h3>{{ t('joint.status') }}</h3>
      <div class="table-scroll">
        <ElTable
          class="joint-status-table adaptive-table"
          :data="rows"
          :row-key="rowKey"
          :current-row-key="store.selectedJointId"
          :span-method="spanMethod"
          border
          highlight-current-row
          size="small"
          height="100%"
          @row-click="selectJoint"
        >
          <ElTableColumn :label="t('joint.group')" width="70" align="center">
            <template #default="{ row }">
              <span class="group-cell">{{ groupLabel(row.group) }}</span>
            </template>
          </ElTableColumn>
          <ElTableColumn :label="t('joint.name')" min-width="128" align="center">
            <template #default="{ row }">{{ row.joint.displayName }}</template>
          </ElTableColumn>
          <ElTableColumn :label="t('common.currentValue')" min-width="104" align="center">
            <template #default="{ row }">
              {{ display(row.joint, row.joint.current) }} {{ row.joint.displayUnit }}
            </template>
          </ElTableColumn>
          <ElTableColumn :label="t('common.targetValue')" min-width="104" align="center">
            <template #default="{ row }">
              {{ display(row.joint, row.joint.target) }} {{ row.joint.displayUnit }}
            </template>
          </ElTableColumn>
          <ElTableColumn :label="t('joint.velocity')" width="72" align="center">
            <template #default="{ row }">
              {{ Math.abs(toDisplayValue(row.joint, row.joint.velocity)).toFixed(2) }}
            </template>
          </ElTableColumn>
          <ElTableColumn :label="t('joint.limitStatus')" width="82" align="center">
            <template #default>
              <span class="normal">{{ t('status.NORMAL') }}</span>
            </template>
          </ElTableColumn>
        </ElTable>
      </div>
    </section>

    <section v-if="selected" class="quick-control">
      <div class="quick-title">
        <strong>{{ selected.displayName }}</strong>
        <small>{{ t('joint.jointTarget') }}</small>
      </div>
      <div class="jog-control">
        <ElButton
          class="jog-button"
          :aria-label="t('joint.decreaseTarget')"
          @click="controller.jogJoint(selected.id, -1 / selected.displayScale)"
        >
          −
        </ElButton>
        <ElSlider
          size="small"
          :model-value="selected.target"
          :min="selected.min"
          :max="selected.max"
          :step="selected.kind === 'prismatic' || selected.kind === 'virtual' ? 0.001 : 0.01"
          :show-tooltip="false"
          :aria-label="t('joint.targetValueAria', { name: selected.displayName })"
          @input="setJointTarget(selected, $event)"
        />
        <ElButton
          class="jog-button"
          :aria-label="t('joint.increaseTarget')"
          @click="controller.jogJoint(selected.id, 1 / selected.displayScale)"
        >
          ＋
        </ElButton>
      </div>
      <label class="target-input">
        <span>{{ t('common.targetValue') }}</span>
        <ElInputNumber
          size="small"
          :model-value="Number(display(selected, selected.target))"
          :min="Number(display(selected, selected.min))"
          :max="Number(display(selected, selected.max))"
          :precision="selected.displayDecimals"
          :controls="false"
          :aria-label="t('joint.targetNumberAria', { name: selected.displayName })"
          @change="setFromDisplay(selected, $event)"
        />
      </label>
      <div class="speed-input">
        <div>
          <span>{{ t('joint.speed', { unit: selected.displayUnit }) }}</span>
          <strong>{{
            Math.abs(
              toDisplayValue(selected, getSimulationVelocity(selected) * store.speedScale),
            ).toFixed(1)
          }}</strong>
        </div>
        <ElSlider
          size="small"
          :model-value="store.speedScale"
          :min="0.1"
          :max="1"
          :step="0.05"
          :show-tooltip="false"
          :aria-label="t('joint.speedScale')"
          @input="setSpeedScale"
        />
      </div>
    </section>

    <section class="controller-card">
      <h3>{{ t('tcp.controllerStatus') }}</h3>
      <dl>
        <div>
          <dt>{{ t('tcp.connectionStatus') }}</dt>
          <dd class="normal">{{ t('tcp.mockConnected') }}</dd>
        </div>
        <div>
          <dt>{{ t('tcp.feedbackCycle') }}</dt>
          <dd>20 ms</dd>
        </div>
        <div>
          <dt>{{ t('tcp.communicationLatency') }}</dt>
          <dd>1.2 ms</dd>
        </div>
        <div>
          <dt>{{ t('tcp.packetLoss') }}</dt>
          <dd>0 %</dd>
        </div>
      </dl>
    </section>
  </div>
</template>

<style scoped>
.tcp-panel {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: 90px minmax(0, 1fr) 72px 66px;
  gap: 10px;
  padding: 10px;
  overflow: hidden;
  background: #f6f8fa;
}
section {
  min-height: 0;
  border: 1px solid var(--line-300);
  border-radius: var(--radius-sm);
  background: #fff;
  overflow: hidden;
}
h3 {
  height: 30px;
  display: flex;
  align-items: center;
  margin: 0;
  padding: 0 12px;
  border-bottom: 1px solid var(--line-200);
  font-size: 14px;
}
.pose-grid {
  height: calc(100% - 30px);
  display: grid;
  grid-template-columns: repeat(6, 1fr);
}
.pose-grid div {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 5px;
  border-right: 1px solid var(--line-200);
}
.pose-grid div:last-child {
  border: 0;
}
.pose-grid span {
  color: var(--ink-700);
  font-size: 12px;
}
.pose-grid strong {
  color: var(--blue-700);
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.table-scroll {
  height: calc(100% - 30px);
  overflow: hidden;
}
.joint-status-table {
  --el-table-row-hover-bg-color: #f4f8ff;
  --el-table-current-row-bg-color: #eaf2ff;
}
.joint-status-table :deep(.el-table__cell) {
  height: 18px;
  padding: 0 !important;
}
.joint-status-table :deep(.cell) {
  padding: 0 6px;
  overflow: hidden;
  line-height: 17px;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
}
.group-cell {
  color: var(--ink-700);
}
.normal {
  color: var(--green-600);
  font-weight: 600;
}
.quick-control {
  display: grid;
  grid-template-columns: minmax(88px, 0.7fr) minmax(220px, 2.5fr) 96px minmax(132px, 1fr);
  align-items: center;
  gap: 12px;
  padding: 9px 12px;
}
.quick-title {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.quick-title small,
.target-input span,
.speed-input span {
  color: var(--ink-500);
  font-size: 11px;
}
.jog-control {
  min-width: 0;
  display: grid;
  grid-template-columns: 32px minmax(100px, 1fr) 32px;
  align-items: center;
  gap: 10px;
}
.quick-control :deep(.jog-button) {
  width: 32px;
  height: 32px;
  padding: 0;
}
.quick-control :deep(.el-slider) {
  min-width: 0;
  width: 100%;
}
.quick-control :deep(.el-slider__runway) {
  width: 100%;
  margin-block: 8px;
}
.target-input {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.target-input :deep(.el-input-number) {
  width: 100%;
}
.speed-input {
  min-width: 0;
  display: grid;
  grid-template-rows: 18px 20px;
  gap: 3px;
}
.speed-input > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.speed-input strong {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.speed-input :deep(.el-slider) {
  height: 20px;
}
.controller-card dl {
  height: calc(100% - 30px);
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  margin: 0;
}
.controller-card dl div {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 10px;
  border-right: 1px solid var(--line-200);
}
.controller-card dl div:last-child {
  border: 0;
}
dt {
  color: var(--ink-500);
  white-space: nowrap;
}
dd {
  margin: 0;
  white-space: nowrap;
}
</style>
