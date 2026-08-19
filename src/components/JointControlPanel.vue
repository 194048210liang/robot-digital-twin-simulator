<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { jointGroupLabels, toDisplayValue, toInternalValue } from '@/robot/config'
import { useRobotController } from '@/robot/controller-context'
import type { JointGroup, JointState } from '@/robot/types'
import { useRobotStore } from '@/stores/robot'
import { useRobotTaskStore } from '@/stores/tasks'

const store = useRobotStore()
const taskStore = useRobotTaskStore()
const controller = useRobotController()
const groups: JointGroup[] = ['torso', 'arm', 'head', 'gripper']
const saveDialogVisible = ref(false)
const draftName = ref('')
const draftDescription = ref('')
const pendingJointPositions = new Map<string, number>()
let teachingFrame = 0
const grouped = computed(() =>
  groups.map((group) => ({ group, joints: store.joints.filter((joint) => joint.group === group) })),
)
const canTeach = computed(
  () =>
    store.connectionState === 'connected' &&
    store.modelLoaded &&
    store.motionState !== 'running' &&
    store.motionState !== 'paused',
)

function display(joint: JointState, value: number) {
  return toDisplayValue(joint, value).toFixed(joint.displayDecimals)
}

function setFromDisplay(joint: JointState, value: number | undefined) {
  if (value === undefined) return
  controller.teachJointPosition(joint.id, toInternalValue(joint, value))
}

function setJointPosition(joint: JointState, value: number | number[]) {
  if (typeof value !== 'number') return
  pendingJointPositions.set(joint.id, value)
  if (!teachingFrame) teachingFrame = window.requestAnimationFrame(flushJointPositions)
}

function flushJointPositions() {
  if (teachingFrame) window.cancelAnimationFrame(teachingFrame)
  teachingFrame = 0
  for (const [jointId, position] of pendingJointPositions) {
    controller.teachJointPosition(jointId, position)
  }
  pendingJointPositions.clear()
}

function setSpeedScale(value: number | number[]) {
  if (typeof value === 'number') controller.setSpeedScale(value)
}

function addCurrentPose() {
  flushJointPositions()
  if (!canTeach.value) {
    ElMessage.warning('请等待当前运动结束后再添加姿态')
    return
  }
  const step = taskStore.addDraftStep(
    store.joints.map((joint) => ({ jointId: joint.id, position: joint.current })),
    store.speedScale,
  )
  if (!step) {
    ElMessage.warning(taskStore.draftError || '当前姿态无法添加')
    return
  }
  ElMessage.success(`已添加姿态 ${taskStore.draftSteps.length}`)
}

function openSaveDialog() {
  if (!taskStore.draftSteps.length) return
  draftName.value = `机器人任务 ${taskStore.tasks.length + 1}`
  draftDescription.value = ''
  saveDialogVisible.value = true
}

function saveTask() {
  const task = taskStore.createTask({
    name: draftName.value,
    description: draftDescription.value,
    steps: taskStore.draftSteps,
  })
  if (!task) {
    ElMessage.error(taskStore.persistenceError || '请输入有效的任务名称')
    return
  }
  saveDialogVisible.value = false
  taskStore.clearDraft()
  ElMessage.success(`任务“${task.name}”已保存，可在机器人任务中播放`)
}

onBeforeUnmount(() => {
  if (teachingFrame) window.cancelAnimationFrame(teachingFrame)
})
</script>

<template>
  <div class="joint-panel">
    <div class="joint-head">
      <span>关节</span><span>当前值</span><span>示教值</span><span>最小</span><span>最大</span>
    </div>
    <div class="joint-scroll">
      <template v-for="section in grouped" :key="section.group">
        <div class="group-row">{{ jointGroupLabels[section.group] }}</div>
        <div
          v-for="joint in section.joints"
          :key="joint.id"
          class="joint-row"
          :class="{ selected: store.selectedJointId === joint.id }"
          role="button"
          tabindex="0"
          @click="store.selectedJointId = joint.id"
          @keydown.enter="store.selectedJointId = joint.id"
        >
          <span class="name">{{ joint.displayName }}</span>
          <span class="current">{{ display(joint, joint.current) }}</span>
          <span class="target-control">
            <ElSlider
              class="range"
              size="small"
              :model-value="joint.current"
              :min="joint.min"
              :max="joint.max"
              :step="joint.kind === 'prismatic' || joint.kind === 'virtual' ? 0.001 : 0.01"
              :show-tooltip="false"
              :disabled="!canTeach"
              :aria-label="`${joint.displayName} 示教值`"
              @update:model-value="setJointPosition(joint, $event)"
              @click.stop
            />
            <label class="number-wrap" @click.stop>
              <ElInputNumber
                size="small"
                :model-value="Number(display(joint, joint.current))"
                :min="Number(display(joint, joint.min))"
                :max="Number(display(joint, joint.max))"
                :step="joint.displayDecimals === 1 ? 0.1 : 0.01"
                :precision="joint.displayDecimals"
                :controls="false"
                :disabled="!canTeach"
                :aria-label="`${joint.displayName} 示教数值`"
                @change="setFromDisplay(joint, $event)"
              />
              <small>{{ joint.displayUnit }}</small>
            </label>
          </span>
          <span class="limit">{{ display(joint, joint.min) }}</span>
          <span class="limit">{{ display(joint, joint.max) }}</span>
        </div>
      </template>
    </div>
    <div class="panel-summary">
      <div class="speed-control">
        <strong>速度倍率</strong>
        <ElSlider
          size="small"
          :model-value="store.speedScale"
          :min="0.1"
          :max="1"
          :step="0.05"
          :show-tooltip="false"
          :disabled="!canTeach"
          aria-label="速度倍率"
          @input="setSpeedScale"
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
      <div class="task-draft">
        <div class="draft-title">
          <strong>任务姿态</strong>
          <span>已添加 {{ taskStore.draftSteps.length }} 个</span>
        </div>
        <p>按添加顺序播放</p>
        <div class="draft-actions">
          <ElButton :disabled="!canTeach" @click="addCurrentPose">添加当前姿态</ElButton>
          <ElButton
            type="primary"
            plain
            :disabled="!taskStore.draftSteps.length"
            @click="openSaveDialog"
          >
            保存任务
          </ElButton>
        </div>
        <div v-if="taskStore.draftSteps.length" class="draft-tools">
          <ElButton link @click="taskStore.removeLastDraftStep()">撤销上一步</ElButton>
          <ElPopconfirm title="确定清空已添加的所有姿态？" @confirm="taskStore.clearDraft()">
            <template #reference><ElButton type="danger" link>清空</ElButton></template>
          </ElPopconfirm>
        </div>
      </div>
    </div>

    <ElDialog
      v-model="saveDialogVisible"
      title="保存机器人任务"
      width="430px"
      append-to-body
      destroy-on-close
    >
      <ElForm label-position="top">
        <ElFormItem label="任务名称" required>
          <ElInput
            v-model="draftName"
            maxlength="40"
            show-word-limit
            placeholder="例如：抓取测试"
            @keyup.enter="saveTask"
          />
        </ElFormItem>
        <ElFormItem label="任务说明">
          <ElInput
            v-model="draftDescription"
            type="textarea"
            :rows="2"
            maxlength="120"
            show-word-limit
            placeholder="选填"
          />
        </ElFormItem>
      </ElForm>
      <ElAlert
        :title="`将保存 ${taskStore.draftSteps.length} 个姿态，并按添加顺序播放`"
        type="info"
        :closable="false"
        show-icon
      />
      <template #footer>
        <ElButton @click="saveDialogVisible = false">取消</ElButton>
        <ElButton type="primary" :disabled="!draftName.trim()" @click="saveTask">保存任务</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.joint-panel {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: 38px minmax(0, 1fr) 104px;
}
.joint-head,
.joint-row {
  display: grid;
  grid-template-columns: minmax(130px, 1.15fr) 70px minmax(230px, 1.55fr) 68px 68px;
  align-items: center;
}
.joint-head {
  padding: 0 12px;
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
  padding: 0 12px;
  border-bottom: 1px solid var(--line-200);
  background: #f2f5f8;
  font-size: 12px;
  font-weight: 650;
}
.joint-row {
  width: 100%;
  min-height: 28px;
  padding: 0 12px;
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
.number-wrap :deep(.el-input-number) {
  width: 100%;
}
.number-wrap :deep(.el-input__wrapper) {
  min-height: 24px;
  padding: 0 22px 0 7px;
}
.number-wrap :deep(.el-input__inner) {
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
  grid-template-columns: 25% 45% 30%;
  border-top: 1px solid var(--line-300);
  background: #fbfcfd;
}
.speed-control {
  display: grid;
  grid-template-columns: minmax(120px, 1fr) 44px;
  gap: 12px;
  align-items: center;
  padding: 12px 14px;
  border-right: 1px solid var(--line-200);
}
.speed-control strong {
  grid-column: 1 / -1;
}
.target-control :deep(.el-slider),
.speed-control :deep(.el-slider) {
  min-width: 0;
  width: 100%;
  height: 22px;
}
.target-control :deep(.el-slider__runway),
.speed-control :deep(.el-slider__runway) {
  margin: 9px 0;
}
.tcp-mini {
  padding: 8px 16px;
  border-right: 1px solid var(--line-200);
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
.task-draft {
  min-width: 0;
  padding: 8px 10px 6px;
}
.draft-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.draft-title span,
.task-draft p {
  color: var(--ink-500);
  font-size: 11px;
}
.task-draft p {
  margin: 3px 0 7px;
}
.draft-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.draft-actions :deep(.el-button) {
  min-width: 0;
  margin: 0;
  padding-inline: 8px;
}
.draft-tools {
  display: flex;
  justify-content: flex-end;
  height: 20px;
}
.draft-tools :deep(.el-button) {
  min-height: 20px;
  padding: 0 5px;
  font-size: 11px;
}
</style>
