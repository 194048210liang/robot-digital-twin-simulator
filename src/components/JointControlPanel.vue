<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { toDisplayValue, toInternalValue } from '@/robot/config'
import { useRobotController } from '@/robot/controller-context'
import { createRobotTaskModelBinding } from '@/robot/task-file'
import type { JointGroup, JointState, TranslationDescriptor } from '@/robot/types'
import { useRobotStore } from '@/stores/robot'
import { useRobotTaskStore } from '@/stores/tasks'

const store = useRobotStore()
const taskStore = useRobotTaskStore()
const controller = useRobotController()
const { t } = useI18n()
const groups: JointGroup[] = ['torso', 'arm', 'head', 'gripper']
const saveDialogVisible = ref(false)
const draftName = ref('')
const draftDescription = ref('')
const pendingJointPositions = new Map<string, number>()
let teachingFrame = 0

function issueText(issue: TranslationDescriptor | null, fallbackKey: string) {
  return issue ? t(issue.key, issue.params ?? {}) : t(fallbackKey)
}
const grouped = computed(() =>
  groups
    .map((group) => ({ group, joints: store.joints.filter((joint) => joint.group === group) }))
    .filter((section) => section.joints.length > 0),
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
    ElMessage.warning(t('joint.messages.waitBeforeAddPose'))
    return
  }
  const step = taskStore.addDraftStep(
    store.joints.map((joint) => ({ jointId: joint.id, position: joint.current })),
    store.speedScale,
  )
  if (!step) {
    ElMessage.warning(issueText(taskStore.draftError, 'task.messages.poseCannotAdd'))
    return
  }
  ElMessage.success(t('joint.messages.poseAdded', { count: taskStore.draftSteps.length }))
}

function openSaveDialog() {
  if (!taskStore.draftSteps.length) return
  draftName.value = t('task.defaultName', { number: taskStore.tasks.length + 1 })
  draftDescription.value = ''
  saveDialogVisible.value = true
}

function saveTask() {
  const task = taskStore.createTask({
    name: draftName.value,
    description: draftDescription.value,
    steps: taskStore.draftSteps,
    model: createRobotTaskModelBinding({
      modelName: store.modelName,
      modelFileName: store.modelFileName,
      tcpLinkName: store.tcpState.sourceLink,
      joints: store.joints,
    }),
  })
  if (!task) {
    ElMessage.error(issueText(taskStore.persistenceError, 'task.messages.invalidName'))
    return
  }
  saveDialogVisible.value = false
  taskStore.clearDraft()
  ElMessage.success(t('task.messages.saved', { name: task.name }))
}

onBeforeUnmount(() => {
  if (teachingFrame) window.cancelAnimationFrame(teachingFrame)
})
</script>

<template>
  <div class="joint-panel">
    <div class="joint-head">
      <span>{{ t('joint.title') }}</span
      ><span>{{ t('common.currentValue') }}</span
      ><span>{{ t('joint.teachingValue') }}</span
      ><span>{{ t('common.minimum') }}</span
      ><span>{{ t('common.maximum') }}</span>
    </div>
    <div class="joint-scroll">
      <template v-for="section in grouped" :key="section.group">
        <div class="group-row">{{ t(`joint.groups.${section.group}`) }}</div>
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
              :aria-label="t('joint.teachingValueAria', { name: joint.displayName })"
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
                :aria-label="t('joint.teachingNumberAria', { name: joint.displayName })"
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
    <footer class="panel-summary">
      <div class="task-draft">
        <div class="draft-title">
          <strong>{{ t('task.taskPose') }}</strong>
          <span>{{ t('task.addedCount', { count: taskStore.draftSteps.length }) }}</span>
        </div>
        <p>{{ t('task.playInOrder') }}</p>
        <div class="draft-actions">
          <ElButton type="primary" :disabled="!canTeach" @click="addCurrentPose">
            {{ t('task.addCurrentPose') }}
          </ElButton>
          <ElButton
            type="primary"
            plain
            :disabled="!taskStore.draftSteps.length"
            @click="openSaveDialog"
          >
            {{ t('task.saveTask') }}
          </ElButton>
        </div>
        <div v-if="taskStore.draftSteps.length" class="draft-tools">
          <ElButton link @click="taskStore.removeLastDraftStep()">
            {{ t('task.undoLast') }}
          </ElButton>
          <ElPopconfirm :title="t('task.clearPosesConfirm')" @confirm="taskStore.clearDraft()">
            <template #reference>
              <ElButton type="danger" link>{{ t('task.clearPoses') }}</ElButton>
            </template>
          </ElPopconfirm>
        </div>
      </div>
      <div class="tcp-mini">
        <strong>{{ t('tcp.positionBaseFrame') }}</strong>
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
      <div class="speed-control">
        <strong>{{ t('joint.speedScale') }}</strong>
        <ElSlider
          size="small"
          :model-value="store.speedScale"
          :min="0.1"
          :max="1"
          :step="0.05"
          :show-tooltip="false"
          :disabled="!canTeach"
          :aria-label="t('joint.speedScale')"
          @input="setSpeedScale"
        />
        <span>{{ Math.round(store.speedScale * 100) }}%</span>
      </div>
    </footer>

    <ElDialog
      v-model="saveDialogVisible"
      :title="t('task.saveDialogTitle')"
      width="430px"
      append-to-body
      destroy-on-close
    >
      <ElForm label-position="top">
        <ElFormItem :label="t('task.taskName')" required>
          <ElInput
            v-model="draftName"
            maxlength="40"
            show-word-limit
            :placeholder="t('task.namePlaceholder')"
            @keyup.enter="saveTask"
          />
        </ElFormItem>
        <ElFormItem :label="t('task.taskDescription')">
          <ElInput
            v-model="draftDescription"
            type="textarea"
            :rows="2"
            maxlength="120"
            show-word-limit
            :placeholder="t('common.optional')"
          />
        </ElFormItem>
      </ElForm>
      <ElAlert
        :title="t('task.savePoseSummary', { count: taskStore.draftSteps.length })"
        type="info"
        :closable="false"
        show-icon
      />
      <template #footer>
        <ElButton @click="saveDialogVisible = false">{{ t('common.cancel') }}</ElButton>
        <ElButton type="primary" :disabled="!draftName.trim()" @click="saveTask">
          {{ t('task.saveTask') }}
        </ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.joint-panel {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: 40px minmax(0, 1fr) 104px;
}
.joint-head,
.joint-row {
  display: grid;
  grid-template-columns: minmax(110px, 1fr) 68px minmax(210px, 1.85fr) 62px 62px;
  align-items: center;
  column-gap: 12px;
}
.joint-head {
  padding: 0 14px;
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
  height: 26px;
  display: flex;
  align-items: center;
  padding: 0 14px;
  border-bottom: 1px solid var(--line-200);
  background: #f2f5f8;
  font-size: 12px;
  font-weight: 650;
}
.joint-row {
  width: 100%;
  min-height: 40px;
  padding: 0 14px;
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
  grid-template-columns: minmax(100px, 1fr) 92px;
  align-items: center;
  gap: 14px;
}
.number-wrap {
  position: relative;
  width: 92px;
}
.number-wrap :deep(.el-input-number) {
  width: 100%;
}
.number-wrap :deep(.el-input__wrapper) {
  min-height: 28px;
  padding: 0 22px 0 7px;
}
.number-wrap :deep(.el-input__inner) {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.number-wrap small {
  position: absolute;
  right: 5px;
  top: 7px;
  color: var(--ink-500);
}
.panel-summary {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1.65fr) minmax(0, 0.85fr);
  overflow: hidden;
  border-top: 1px solid var(--line-300);
  background: #fbfcfd;
}
.speed-control {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-rows: 18px minmax(24px, 1fr);
  column-gap: 12px;
  row-gap: 6px;
  align-items: center;
  padding: 12px;
}
.speed-control strong {
  grid-column: 1;
}
.speed-control > span {
  grid-column: 2;
  grid-row: 1;
  color: var(--ink-700);
  font-variant-numeric: tabular-nums;
}
.speed-control :deep(.el-slider) {
  grid-column: 1 / -1;
  grid-row: 2;
  min-width: 0;
  width: 100%;
  height: 22px;
}
.speed-control :deep(.el-slider__runway) {
  margin: 9px 0;
}
.target-control :deep(.el-slider) {
  min-width: 0;
  width: 100%;
  height: 28px;
}
.target-control :deep(.el-slider__runway) {
  margin: 11px 0;
}
.tcp-mini {
  padding: 10px 12px;
  border-right: 1px solid var(--line-200);
}
.tcp-mini strong {
  display: block;
  margin-bottom: 6px;
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
  padding: 8px 10px;
  border-right: 1px solid var(--line-200);
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
  margin: 3px 0 6px;
  line-height: 14px;
}
.draft-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.draft-actions :deep(.el-button) {
  min-width: 0;
  height: 32px;
  margin: 0;
  padding-inline: 6px;
  font-size: 12px;
  font-weight: 600;
}
.draft-tools {
  display: flex;
  justify-content: flex-end;
  height: 16px;
}
.draft-tools :deep(.el-button) {
  min-height: 16px;
  padding: 0 5px;
  font-size: 11px;
}
</style>
