<script setup lang="ts">
import { computed } from 'vue'
import { jointGroupLabels, toDisplayValue, toInternalValue } from '@/robot/config'
import { useRobotController } from '@/robot/controller-context'
import type { JointGroup, JointState } from '@/robot/types'
import { useRobotStore } from '@/stores/robot'

const store = useRobotStore()
const controller = useRobotController()
const groups: JointGroup[] = ['torso', 'arm', 'head', 'gripper']
const selected = computed(() => store.selectedJoint)

const rows = computed(() =>
  groups.flatMap((group) =>
    store.joints
      .filter((joint) => joint.group === group)
      .map((joint, index) => ({
        joint,
        group,
        showGroup: index === 0,
        span: store.joints.filter((item) => item.group === group).length,
      })),
  ),
)

function display(joint: JointState, value: number) {
  return toDisplayValue(joint, value).toFixed(joint.displayDecimals)
}

function setFromDisplay(joint: JointState, value: number) {
  controller.setJointTarget(joint.id, toInternalValue(joint, value))
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
        <table>
          <thead>
            <tr>
              <th>分组</th>
              <th>关节名称</th>
              <th>当前值</th>
              <th>目标值</th>
              <th>速度</th>
              <th>限位状态</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in rows"
              :key="row.joint.id"
              :class="{ selected: store.selectedJointId === row.joint.id }"
              @click="store.selectedJointId = row.joint.id"
            >
              <td v-if="row.showGroup" :rowspan="row.span" class="group-cell">
                {{ jointGroupLabels[row.group] }}
              </td>
              <td>{{ row.joint.displayName }}</td>
              <td>{{ display(row.joint, row.joint.current) }} {{ row.joint.displayUnit }}</td>
              <td>{{ display(row.joint, row.joint.target) }} {{ row.joint.displayUnit }}</td>
              <td>{{ Math.abs(toDisplayValue(row.joint, row.joint.velocity)).toFixed(2) }}</td>
              <td class="normal">正常</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-if="selected" class="quick-control">
      <div>
        <strong>{{ selected.displayName }}</strong
        ><small>目标值</small>
      </div>
      <button
        aria-label="减小目标值"
        @click="controller.jogJoint(selected.id, -1 / selected.displayScale)"
      >
        −
      </button>
      <input
        type="range"
        :min="selected.min"
        :max="selected.max"
        :step="selected.kind === 'prismatic' || selected.kind === 'virtual' ? 0.001 : 0.01"
        :value="selected.target"
        @input="
          controller.setJointTarget(selected.id, Number(($event.target as HTMLInputElement).value))
        "
      />
      <button
        aria-label="增大目标值"
        @click="controller.jogJoint(selected.id, 1 / selected.displayScale)"
      >
        ＋
      </button>
      <label
        ><span>目标</span
        ><input
          type="number"
          :value="display(selected, selected.target)"
          @change="setFromDisplay(selected, Number(($event.target as HTMLInputElement).value))"
      /></label>
      <label class="speed-input">
        <span>速度 ({{ selected.displayUnit }}/s)</span>
        <strong>{{
          Math.abs(toDisplayValue(selected, selected.maxVelocity * store.speedScale)).toFixed(1)
        }}</strong>
        <input
          type="range"
          min="0.1"
          max="1"
          step="0.05"
          :value="store.speedScale"
          aria-label="速度倍率"
          @input="controller.setSpeedScale(Number(($event.target as HTMLInputElement).value))"
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
  gap: 8px;
  padding: 8px;
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
  padding: 0 10px;
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
  overflow: auto;
  scrollbar-width: thin;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
th,
td {
  height: 18px;
  padding: 1px 7px;
  border-right: 1px solid var(--line-200);
  border-bottom: 1px solid var(--line-200);
  text-align: center;
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
}
th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #f4f6f8;
  font-weight: 600;
}
tbody tr {
  cursor: pointer;
}
tbody tr:hover,
tbody tr.selected {
  color: var(--blue-700);
  background: #eaf2ff;
}
.group-cell {
  color: var(--ink-700);
  background: #fafbfd;
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
.quick-control div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.quick-control small,
.quick-control label span {
  color: var(--ink-500);
  font-size: 11px;
}
.quick-control button {
  height: 34px;
  border: 1px solid var(--line-300);
  border-radius: 3px;
  background: #fff;
  cursor: pointer;
}
.quick-control input[type='range'] {
  width: 100%;
  accent-color: var(--blue-600);
}
.quick-control label {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.quick-control label input {
  width: 100%;
  height: 28px;
  border: 1px solid var(--line-300);
  border-radius: 3px;
  padding: 0 8px;
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
.quick-control .speed-input input {
  height: auto;
  padding: 0;
  border: 0;
  accent-color: var(--blue-600);
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
