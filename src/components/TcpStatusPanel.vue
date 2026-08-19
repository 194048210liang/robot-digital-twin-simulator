<script setup lang="ts">
import { computed } from 'vue'
import type { TableColumnCtx } from 'element-plus'
import { jointGroupLabels, toDisplayValue, toInternalValue } from '@/robot/config'
import { useRobotController } from '@/robot/controller-context'
import type { JointGroup, JointState } from '@/robot/types'
import { useRobotStore } from '@/stores/robot'

interface JointTableRow {
  joint: JointState
  group: JointGroup
  groupLabel: string
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
const groups: JointGroup[] = ['torso', 'arm', 'head', 'gripper']
const selected = computed(() => store.selectedJoint)

const rows = computed<JointTableRow[]>(() =>
  groups.flatMap((group) => {
    const joints = store.joints.filter((joint) => joint.group === group)
    return joints.map((joint, index) => ({
      joint,
      group,
      groupLabel: jointGroupLabels[group],
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
</script>

<template>
  <div class="tcp-panel">
    <section class="tcp-card">
      <h3>TCP 位置</h3>
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
      <h3>关节状态</h3>
      <div class="table-scroll">
        <ElTable
          class="joint-status-table"
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
          <ElTableColumn label="分组" width="70" align="center">
            <template #default="{ row }">
              <span class="group-cell">{{ row.groupLabel }}</span>
            </template>
          </ElTableColumn>
          <ElTableColumn label="关节名称" min-width="128" align="center">
            <template #default="{ row }">{{ row.joint.displayName }}</template>
          </ElTableColumn>
          <ElTableColumn label="当前值" min-width="104" align="center">
            <template #default="{ row }">
              {{ display(row.joint, row.joint.current) }} {{ row.joint.displayUnit }}
            </template>
          </ElTableColumn>
          <ElTableColumn label="目标值" min-width="104" align="center">
            <template #default="{ row }">
              {{ display(row.joint, row.joint.target) }} {{ row.joint.displayUnit }}
            </template>
          </ElTableColumn>
          <ElTableColumn label="速度" width="72" align="center">
            <template #default="{ row }">
              {{ Math.abs(toDisplayValue(row.joint, row.joint.velocity)).toFixed(2) }}
            </template>
          </ElTableColumn>
          <ElTableColumn label="限位状态" width="82" align="center">
            <template #default><span class="normal">正常</span></template>
          </ElTableColumn>
        </ElTable>
      </div>
    </section>

    <section v-if="selected" class="quick-control">
      <div>
        <strong>{{ selected.displayName }}</strong>
        <small>目标值</small>
      </div>
      <ElButton
        class="jog-button"
        aria-label="减小目标值"
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
        :aria-label="`${selected.displayName} 目标值`"
        @input="setJointTarget(selected, $event)"
      />
      <ElButton
        class="jog-button"
        aria-label="增大目标值"
        @click="controller.jogJoint(selected.id, 1 / selected.displayScale)"
      >
        ＋
      </ElButton>
      <label>
        <span>目标</span>
        <ElInputNumber
          size="small"
          :model-value="Number(display(selected, selected.target))"
          :min="Number(display(selected, selected.min))"
          :max="Number(display(selected, selected.max))"
          :precision="selected.displayDecimals"
          :controls="false"
          :aria-label="`${selected.displayName} 目标数值`"
          @change="setFromDisplay(selected, $event)"
        />
      </label>
      <label class="speed-input">
        <span>速度 ({{ selected.displayUnit }}/s)</span>
        <strong>{{
          Math.abs(toDisplayValue(selected, selected.maxVelocity * store.speedScale)).toFixed(1)
        }}</strong>
        <ElSlider
          size="small"
          :model-value="store.speedScale"
          :min="0.1"
          :max="1"
          :step="0.05"
          :show-tooltip="false"
          aria-label="速度倍率"
          @input="setSpeedScale"
        />
      </label>
    </section>

    <section class="controller-card">
      <h3>仿真控制器状态</h3>
      <dl>
        <div>
          <dt>连接状态</dt>
          <dd class="normal">● Mock 已连接</dd>
        </div>
        <div>
          <dt>反馈周期</dt>
          <dd>20 ms</dd>
        </div>
        <div>
          <dt>通信延迟</dt>
          <dd>1.2 ms</dd>
        </div>
        <div>
          <dt>丢包率</dt>
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
  grid-template-rows: 90px minmax(0, 1fr) 70px 66px;
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
  grid-template-columns: 105px 34px minmax(110px, 1fr) 34px 96px 130px;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
}
.quick-control > div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.quick-control small,
.quick-control label span {
  color: var(--ink-500);
  font-size: 11px;
}
.quick-control :deep(.jog-button) {
  width: 34px;
  height: 34px;
  padding: 0;
}
.quick-control :deep(.el-slider) {
  min-width: 0;
  width: 100%;
}
.quick-control > :deep(.el-slider) {
  align-self: center;
}
.quick-control :deep(.el-slider__runway) {
  width: 100%;
}
.quick-control label {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.quick-control label :deep(.el-input-number) {
  width: 100%;
}
.quick-control .speed-input {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 8px;
}
.quick-control .speed-input span {
  grid-column: 1 / -1;
}
.quick-control .speed-input strong {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.quick-control .speed-input :deep(.el-slider) {
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
