<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { toDisplayValue, toInternalValue } from '@/robot/config'
import { useRobotController } from '@/robot/controller-context'
import type { JointState, TcpPose, TranslationDescriptor } from '@/robot/types'
import { useRobotStore } from '@/stores/robot'
import { useRobotTaskStore } from '@/stores/tasks'

type BatchInputMode = 'joint' | 'tcp'

interface BatchJointRow {
  joint: JointState
  value: number
}

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const route = useRoute()
const router = useRouter()
const robotStore = useRobotStore()
const taskStore = useRobotTaskStore()
const controller = useRobotController()
const { t } = useI18n()
const mode = ref<BatchInputMode>('joint')
const addToTask = ref(false)
const jointRows = ref<BatchJointRow[]>([])
const poseInput = ref<TcpPose>({ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 })

function issueText(issue: TranslationDescriptor | null, fallbackKey: string) {
  return issue ? t(issue.key, issue.params ?? {}) : t(fallbackKey)
}

const canTeach = computed(
  () =>
    robotStore.connectionState === 'connected' &&
    robotStore.modelLoaded &&
    robotStore.motionState !== 'running' &&
    robotStore.motionState !== 'paused',
)
const canApply = computed(
  () => mode.value === 'joint' && canTeach.value && jointRows.value.length > 0,
)

function resetInputs() {
  jointRows.value = robotStore.joints.map((joint) => ({
    joint,
    value: Number(toDisplayValue(joint, joint.current).toFixed(joint.displayDecimals)),
  }))
  poseInput.value = { ...robotStore.tcpPose }
  addToTask.value = false
}

function close() {
  emit('update:modelValue', false)
}

function applyJointBatch() {
  if (!canApply.value) {
    ElMessage.warning(t('joint.messages.waitBeforeBatch'))
    return
  }

  const targets = jointRows.value.map(({ joint, value }) => ({
    joint,
    value,
    position: toInternalValue(joint, value),
  }))
  const invalid = targets.find(
    ({ joint, value, position }) =>
      !Number.isFinite(value) || position < joint.min || position > joint.max,
  )
  if (invalid) {
    ElMessage.error(t('joint.messages.targetOutOfLimit', { name: invalid.joint.displayName }))
    return
  }

  for (const { joint, position } of targets) {
    if (!controller.teachJointPosition(joint.id, position)) {
      ElMessage.error(t('joint.messages.batchFailed', { name: joint.displayName }))
      return
    }
  }

  if (addToTask.value) {
    const step = taskStore.addDraftStep(
      targets.map(({ joint, position }) => ({ jointId: joint.id, position })),
      robotStore.speedScale,
    )
    if (!step) {
      ElMessage.warning(
        t('joint.messages.batchAppliedWithWarning', {
          reason: issueText(taskStore.draftError, 'task.messages.poseAddFailed'),
        }),
      )
      close()
      return
    }
    ElMessage.success(
      t('joint.messages.batchAppliedAndAdded', { count: taskStore.draftSteps.length }),
    )
  } else {
    ElMessage.success(t('joint.messages.batchApplied'))
  }
  close()
}

function goToTasks() {
  close()
  void router.replace({ query: { ...route.query, tab: 'task' } })
}

watch(
  () => props.modelValue,
  (visible) => {
    if (visible) resetInputs()
  },
)

watch(mode, (value) => {
  if (value === 'tcp') addToTask.value = false
})
</script>

<template>
  <ElDialog
    :model-value="modelValue"
    class="batch-set-dialog"
    :title="t('joint.batchSet')"
    width="min(760px, calc(100vw - 32px))"
    append-to-body
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="batch-mode">
      <div>
        <strong>{{ t('common.inputType') }}</strong>
        <span>{{ t('joint.chooseInputType') }}</span>
      </div>
      <ElRadioGroup v-model="mode" :aria-label="t('joint.batchInputAria')">
        <ElRadioButton value="joint">{{ t('joint.jointTarget') }}</ElRadioButton>
        <ElRadioButton value="tcp">{{ t('tcp.targetPose') }}</ElRadioButton>
      </ElRadioGroup>
    </div>

    <template v-if="mode === 'joint'">
      <ElTable
        class="batch-joint-table"
        :data="jointRows"
        row-key="joint.id"
        border
        size="small"
        height="360"
      >
        <ElTableColumn :label="t('joint.title')" min-width="150">
          <template #default="{ row }">{{ row.joint.displayName }}</template>
        </ElTableColumn>
        <ElTableColumn :label="t('common.currentValue')" width="105" align="center">
          <template #default="{ row }">
            {{ toDisplayValue(row.joint, row.joint.current).toFixed(row.joint.displayDecimals) }}
            {{ row.joint.displayUnit }}
          </template>
        </ElTableColumn>
        <ElTableColumn :label="t('common.targetValue')" width="170" align="center">
          <template #default="{ row }">
            <label class="batch-value-input">
              <ElInputNumber
                v-model="row.value"
                :min="toDisplayValue(row.joint, row.joint.min)"
                :max="toDisplayValue(row.joint, row.joint.max)"
                :step="row.joint.displayDecimals === 1 ? 0.1 : 0.01"
                :precision="row.joint.displayDecimals"
                :controls="false"
                :aria-label="t('joint.batchTargetAria', { name: row.joint.displayName })"
              />
              <span>{{ row.joint.displayUnit }}</span>
            </label>
          </template>
        </ElTableColumn>
        <ElTableColumn :label="t('joint.limit')" min-width="170" align="center">
          <template #default="{ row }">
            {{ toDisplayValue(row.joint, row.joint.min).toFixed(row.joint.displayDecimals) }} ～
            {{ toDisplayValue(row.joint, row.joint.max).toFixed(row.joint.displayDecimals) }}
            {{ row.joint.displayUnit }}
          </template>
        </ElTableColumn>
      </ElTable>

      <div class="task-option">
        <ElCheckbox v-model="addToTask">{{ t('joint.addToTask') }}</ElCheckbox>
        <span>{{ t('joint.addToTaskHint') }}</span>
      </div>
    </template>

    <template v-else>
      <ElAlert
        :title="t('tcp.ikUnavailableTitle')"
        :description="t('tcp.ikUnavailableDescription')"
        type="warning"
        :closable="false"
        show-icon
      />
      <ElForm class="pose-form" label-position="top">
        <ElFormItem label="X (m)">
          <ElInputNumber v-model="poseInput.x" :step="0.01" :precision="3" :controls="false" />
        </ElFormItem>
        <ElFormItem label="Y (m)">
          <ElInputNumber v-model="poseInput.y" :step="0.01" :precision="3" :controls="false" />
        </ElFormItem>
        <ElFormItem label="Z (m)">
          <ElInputNumber v-model="poseInput.z" :step="0.01" :precision="3" :controls="false" />
        </ElFormItem>
        <ElFormItem label="Rx (°)">
          <ElInputNumber
            v-model="poseInput.rx"
            :min="-180"
            :max="180"
            :step="1"
            :precision="2"
            :controls="false"
          />
        </ElFormItem>
        <ElFormItem label="Ry (°)">
          <ElInputNumber
            v-model="poseInput.ry"
            :min="-180"
            :max="180"
            :step="1"
            :precision="2"
            :controls="false"
          />
        </ElFormItem>
        <ElFormItem label="Rz (°)">
          <ElInputNumber
            v-model="poseInput.rz"
            :min="-180"
            :max="180"
            :step="1"
            :precision="2"
            :controls="false"
          />
        </ElFormItem>
      </ElForm>
      <div class="task-option disabled">
        <ElCheckbox :model-value="false" disabled>{{ t('joint.addToTask') }}</ElCheckbox>
        <span>{{ t('joint.addToTaskAfterIk') }}</span>
      </div>
    </template>

    <template #footer>
      <div class="dialog-footer">
        <ElButton type="primary" plain @click="goToTasks">{{ t('task.goToTasks') }}</ElButton>
        <span class="footer-spacer" />
        <ElButton @click="close">{{ t('common.cancel') }}</ElButton>
        <ElTooltip :disabled="mode === 'joint'" :content="t('tcp.ikRequired')" placement="top">
          <span>
            <ElButton type="primary" :disabled="!canApply" @click="applyJointBatch">
              {{ t('joint.applyBatch') }}
            </ElButton>
          </span>
        </ElTooltip>
      </div>
    </template>
  </ElDialog>
</template>

<style scoped>
.batch-mode {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 14px;
}
.batch-mode > div:first-child {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.batch-mode span,
.task-option span {
  color: var(--ink-500);
  font-size: 12px;
}
.batch-joint-table :deep(.el-table__cell) {
  padding: 5px 0;
}
.batch-value-input {
  position: relative;
  display: inline-block;
  width: 132px;
}
.batch-value-input :deep(.el-input-number) {
  width: 100%;
}
.batch-value-input :deep(.el-input__wrapper) {
  padding-right: 26px;
}
.batch-value-input > span {
  position: absolute;
  right: 8px;
  top: 8px;
  color: var(--ink-500);
  font-size: 12px;
  pointer-events: none;
}
.task-option {
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  padding: 0 12px;
  border: 1px solid var(--line-200);
  border-radius: var(--radius-sm);
  background: #f8fafc;
}
.task-option.disabled {
  margin-top: 14px;
}
.pose-form {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 2px 16px;
  margin-top: 16px;
}
.pose-form :deep(.el-form-item) {
  margin-bottom: 12px;
}
.pose-form :deep(.el-input-number) {
  width: 100%;
}
.dialog-footer {
  display: flex;
  align-items: center;
  width: 100%;
}
.dialog-footer :deep(.el-button) {
  margin: 0 0 0 8px;
}
.dialog-footer > :deep(.el-button:first-child) {
  margin-left: 0;
}
.footer-spacer {
  flex: 1;
}
@media (max-width: 700px) {
  .batch-mode {
    align-items: stretch;
    flex-direction: column;
    gap: 10px;
  }
  .pose-form {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
