<script setup lang="ts">
import { computed } from 'vue'
import { jointGroupLabels, toDisplayValue, toInternalValue } from '@/robot/config'
import { useRobotController } from '@/robot/controller-context'
import type { JointGroup, JointState } from '@/robot/types'
import { useRobotStore } from '@/stores/robot'

const store = useRobotStore()
const controller = useRobotController()
const groups: JointGroup[] = ['torso', 'arm', 'head', 'gripper']
const grouped = computed(() =>
  groups.map((group) => ({ group, joints: store.joints.filter((joint) => joint.group === group) })),
)

function display(joint: JointState, value: number) {
  return toDisplayValue(joint, value).toFixed(joint.displayDecimals)
}

function setFromDisplay(joint: JointState, event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  controller.setJointTarget(joint.id, toInternalValue(joint, value))
}
</script>

<template>
  <div class="joint-panel">
    <div class="joint-head">
      <span>关节</span><span>当前值</span><span>目标值</span><span>最小</span><span>最大</span>
    </div>
    <div class="joint-scroll">
      <template v-for="section in grouped" :key="section.group">
        <div class="group-row">{{ jointGroupLabels[section.group] }}</div>
        <button
          v-for="joint in section.joints"
          :key="joint.id"
          class="joint-row"
          :class="{ selected: store.selectedJointId === joint.id }"
          @click="store.selectedJointId = joint.id"
        >
          <span class="name">{{ joint.displayName }}</span>
          <span class="current">{{ display(joint, joint.current) }}</span>
          <span class="target-control">
            <input
              class="range"
              type="range"
              :min="joint.min"
              :max="joint.max"
              :step="joint.kind === 'prismatic' || joint.kind === 'virtual' ? 0.001 : 0.01"
              :value="joint.target"
              :aria-label="`${joint.displayName} 目标值`"
              @input="
                controller.setJointTarget(
                  joint.id,
                  Number(($event.target as HTMLInputElement).value),
                )
              "
              @click.stop
            />
            <label class="number-wrap" @click.stop>
              <input
                type="number"
                :min="display(joint, joint.min)"
                :max="display(joint, joint.max)"
                :step="joint.displayDecimals === 1 ? 0.1 : 0.01"
                :value="display(joint, joint.target)"
                @change="setFromDisplay(joint, $event)"
              />
              <small>{{ joint.displayUnit }}</small>
            </label>
          </span>
          <span class="limit">{{ display(joint, joint.min) }}</span>
          <span class="limit">{{ display(joint, joint.max) }}</span>
        </button>
      </template>
    </div>
    <div class="panel-summary">
      <div class="speed-control">
        <strong>速度倍率</strong>
        <input
          type="range"
          min="0.1"
          max="1"
          step="0.05"
          :value="store.speedScale"
          aria-label="速度倍率"
          @input="controller.setSpeedScale(Number(($event.target as HTMLInputElement).value))"
        />
        <span>{{ Math.round(store.speedScale * 100) }}%</span>
      </div>
      <div class="tcp-mini">
        <strong>TCP 位置（基坐标系）</strong>
        <dl>
          <div>
            <dt>X (m)</dt>
            <dd>{{ store.tcpPose.x.toFixed(3) }}</dd>
          </div>
          <div>
            <dt>Y (m)</dt>
            <dd>{{ store.tcpPose.y.toFixed(3) }}</dd>
          </div>
          <div>
            <dt>Z (m)</dt>
            <dd>{{ store.tcpPose.z.toFixed(3) }}</dd>
          </div>
          <div>
            <dt>Rx (°)</dt>
            <dd>{{ store.tcpPose.rx.toFixed(2) }}</dd>
          </div>
          <div>
            <dt>Ry (°)</dt>
            <dd>{{ store.tcpPose.ry.toFixed(2) }}</dd>
          </div>
          <div>
            <dt>Rz (°)</dt>
            <dd>{{ store.tcpPose.rz.toFixed(2) }}</dd>
          </div>
        </dl>
      </div>
    </div>
  </div>
</template>

<style scoped>
.joint-panel {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: 38px minmax(0, 1fr) 86px;
}
.joint-head,
.joint-row {
  display: grid;
  grid-template-columns: minmax(130px, 1.15fr) 70px minmax(230px, 1.55fr) 68px 68px;
  align-items: center;
}
.joint-head {
  padding: 0 10px;
  border-bottom: 1px solid var(--line-300);
  color: var(--ink-700);
  font-weight: 600;
  text-align: center;
}
.joint-head span:first-child {
  text-align: left;
}
.joint-scroll {
  min-height: 0;
  overflow: auto;
  scrollbar-width: thin;
}
.group-row {
  height: 22px;
  display: flex;
  align-items: center;
  padding: 0 10px;
  border-bottom: 1px solid var(--line-200);
  background: #f2f5f8;
  font-size: 12px;
  font-weight: 650;
}
.joint-row {
  width: 100%;
  min-height: 28px;
  padding: 0 10px;
  border: 0;
  border-bottom: 1px solid #e4e9ef;
  background: #fff;
  text-align: left;
  cursor: pointer;
}
.joint-row:hover,
.joint-row.selected {
  background: #f4f8ff;
}
.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.current,
.limit {
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.range {
  min-width: 0;
  width: 100%;
  margin: 0;
  accent-color: var(--blue-600);
  vertical-align: middle;
}
.target-control {
  display: grid;
  grid-template-columns: minmax(80px, 1fr) 82px;
  align-items: center;
  gap: 12px;
}
.number-wrap {
  position: relative;
  width: 82px;
}
.number-wrap input {
  width: 100%;
  height: 24px;
  padding: 0 23px 0 7px;
  border: 1px solid var(--line-300);
  border-radius: 3px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.number-wrap small {
  position: absolute;
  right: 5px;
  top: 5px;
  color: var(--ink-500);
}
.panel-summary {
  display: grid;
  grid-template-columns: 38% 62%;
  border-top: 1px solid var(--line-300);
  background: #fbfcfd;
}
.speed-control {
  display: grid;
  grid-template-columns: auto 1fr 44px;
  gap: 12px;
  align-items: center;
  padding: 12px;
  border-right: 1px solid var(--line-200);
}
.speed-control strong {
  grid-column: 1 / -1;
}
.speed-control input {
  accent-color: var(--blue-600);
}
.tcp-mini {
  padding: 8px 14px;
}
.tcp-mini strong {
  display: block;
  margin-bottom: 8px;
}
.tcp-mini dl {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  margin: 0;
}
.tcp-mini dl div {
  text-align: center;
  border-right: 1px solid var(--line-200);
}
.tcp-mini dl div:last-child {
  border: 0;
}
dt {
  color: var(--ink-700);
  font-size: 12px;
}
dd {
  margin: 2px 0 0;
  font-variant-numeric: tabular-nums;
}
</style>
