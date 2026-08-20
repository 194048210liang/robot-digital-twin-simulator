<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { toDisplayValue, toInternalValue } from '@/robot/config'
import { useRobotController } from '@/robot/controller-context'
import type { JointState, TcpPose } from '@/robot/types'
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
const mode = ref<BatchInputMode>('joint')
const addToTask = ref(false)
const jointRows = ref<BatchJointRow[]>([])
const poseInput = ref<TcpPose>({ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 })

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
    ElMessage.warning('请等待模型就绪和当前运动结束后再批量设置')
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
    ElMessage.error(`${invalid.joint.displayName} 的目标值超出限位`)
    return
  }

  for (const { joint, position } of targets) {
    if (!controller.teachJointPosition(joint.id, position)) {
      ElMessage.error(`${joint.displayName} 批量设置失败，请检查机器人状态`)
      return
    }
  }

  if (addToTask.value) {
    const step = taskStore.addDraftStep(
      targets.map(({ joint, position }) => ({ jointId: joint.id, position })),
      robotStore.speedScale,
    )
    if (!step) {
      ElMessage.warning(`批量设置已应用；${taskStore.draftError || '任务姿态添加失败'}`)
      close()
      return
    }
    ElMessage.success(`批量设置已应用，并添加为姿态 ${taskStore.draftSteps.length}`)
  } else {
    ElMessage.success('关节目标已批量应用')
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
    title="批量设置"
    width="min(760px, calc(100vw - 32px))"
    append-to-body
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="batch-mode">
      <div>
        <strong>输入类型</strong>
        <span>选择关节空间目标或 TCP 笛卡尔目标</span>
      </div>
      <ElRadioGroup v-model="mode" aria-label="批量设置输入类型">
        <ElRadioButton value="joint">关节目标</ElRadioButton>
        <ElRadioButton value="tcp">TCP 目标位姿</ElRadioButton>
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
        <ElTableColumn label="关节" min-width="150">
          <template #default="{ row }">{{ row.joint.displayName }}</template>
        </ElTableColumn>
        <ElTableColumn label="当前值" width="105" align="center">
          <template #default="{ row }">
            {{ toDisplayValue(row.joint, row.joint.current).toFixed(row.joint.displayDecimals) }}
            {{ row.joint.displayUnit }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="目标值" width="170" align="center">
          <template #default="{ row }">
            <label class="batch-value-input">
              <ElInputNumber
                v-model="row.value"
                :min="toDisplayValue(row.joint, row.joint.min)"
                :max="toDisplayValue(row.joint, row.joint.max)"
                :step="row.joint.displayDecimals === 1 ? 0.1 : 0.01"
                :precision="row.joint.displayDecimals"
                :controls="false"
                :aria-label="`${row.joint.displayName} 批量目标值`"
              />
              <span>{{ row.joint.displayUnit }}</span>
            </label>
          </template>
        </ElTableColumn>
        <ElTableColumn label="限位" min-width="170" align="center">
          <template #default="{ row }">
            {{ toDisplayValue(row.joint, row.joint.min).toFixed(row.joint.displayDecimals) }} ～
            {{ toDisplayValue(row.joint, row.joint.max).toFixed(row.joint.displayDecimals) }}
            {{ row.joint.displayUnit }}
          </template>
        </ElTableColumn>
      </ElTable>

      <div class="task-option">
        <ElCheckbox v-model="addToTask">同时添加为任务姿态</ElCheckbox>
        <span>添加后可在关节示教底部继续补充姿态并保存任务。</span>
      </div>
    </template>

    <template v-else>
      <ElAlert
        title="当前未配置正式 IK Provider"
        description="可以填写 TCP 目标位姿，但在 IK 返回合法关节解之前，不能应用到模型，也不能添加为可执行任务。"
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
        <ElCheckbox :model-value="false" disabled>同时添加为任务姿态</ElCheckbox>
        <span>接入 IK 后，合法解会转换成现有的关节空间任务姿态。</span>
      </div>
    </template>

    <template #footer>
      <div class="dialog-footer">
        <ElButton type="primary" plain @click="goToTasks">前往任务编排</ElButton>
        <span class="footer-spacer" />
        <ElButton @click="close">取消</ElButton>
        <ElTooltip
          :disabled="mode === 'joint'"
          content="需要先接入正式 IK Provider"
          placement="top"
        >
          <span>
            <ElButton type="primary" :disabled="!canApply" @click="applyJointBatch">
              应用批量设置
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
