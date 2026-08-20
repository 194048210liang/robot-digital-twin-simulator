<script setup lang="ts">
import { computed, ref } from 'vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { faFileImport } from '@fortawesome/free-solid-svg-icons'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useRobotTaskRunner } from '@/composables/useRobotTaskRunner'
import {
  algorithmTrajectoryToTaskInput,
  createAlgorithmTrajectoryTemplate,
  getAlgorithmTrajectoryCompatibilityError,
  parseAlgorithmTrajectoryFile,
} from '@/robot/algorithm-trajectory'
import { toDisplayValue } from '@/robot/config'
import { isSameJointPose, type RobotTask } from '@/robot/task'
import {
  createRobotTaskFile,
  getTaskCompatibilityError,
  parseRobotTaskFile,
} from '@/robot/task-file'
import { useRobotStore } from '@/stores/robot'
import { useRobotTaskStore } from '@/stores/tasks'
import type { TcpPose, TranslationDescriptor } from '@/robot/types'
import { downloadTextFile, sanitizeFileName } from '@/utils/download'

const route = useRoute()
const router = useRouter()
const robotStore = useRobotStore()
const taskStore = useRobotTaskStore()
const { locale, t } = useI18n()
const { canExecuteTask, executeTask: runTask } = useRobotTaskRunner()
const playingTaskId = ref('')
const taskFileInput = ref<HTMLInputElement>()
const algorithmFileInput = ref<HTMLInputElement>()

function issueText(issue: TranslationDescriptor | null, fallbackKey: string) {
  return issue ? t(issue.key, issue.params ?? {}) : t(fallbackKey)
}

const activeStatusLabel = computed(() => t(`task.statuses.${taskStore.runtime.status}`))
const activeStatusType = computed(() => {
  const types = {
    idle: 'info',
    running: 'primary',
    paused: 'warning',
    completed: 'success',
    stopped: 'info',
    error: 'danger',
  } as const
  return types[taskStore.runtime.status]
})

async function playTask(task: RobotTask) {
  const currentPose = robotStore.joints.map((joint) => ({
    jointId: joint.id,
    position: joint.current,
  }))
  const onlyStep = task.steps.length === 1 ? task.steps[0] : undefined
  if (onlyStep && isSameJointPose(onlyStep.targets, currentPose)) {
    ElMessage.info(t('task.messages.alreadyAtTarget'))
  }

  playingTaskId.value = task.id
  try {
    const accepted = await runTask(task)
    if (!accepted) ElMessage.warning(taskStore.runtime.error || t('task.messages.cannotPlay'))
  } finally {
    playingTaskId.value = ''
  }
}

function removeTask(task: RobotTask) {
  if (taskStore.removeTask(task.id))
    ElMessage.success(t('task.messages.removed', { name: task.name }))
  else ElMessage.warning(issueText(taskStore.persistenceError, 'task.messages.cannotRemovePlaying'))
}

function taskFile(task: RobotTask) {
  return createRobotTaskFile(task, {
    modelName: robotStore.modelName,
    modelFileName: robotStore.modelFileName,
    tcpLinkName: robotStore.tcpState.sourceLink,
    joints: robotStore.joints,
  })
}

function exportTask(task: RobotTask) {
  downloadTextFile(
    `${sanitizeFileName(task.name) || 'robot-task'}.robot-task.json`,
    JSON.stringify(taskFile(task), null, 2),
    'application/json;charset=utf-8',
  )
  ElMessage.success(t('task.messages.exported', { name: task.name }))
}

async function importTask(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  try {
    const parsed: unknown = JSON.parse(await file.text())
    const taskDocument = parseRobotTaskFile(parsed)
    if (!taskDocument) throw new Error(t('task.messages.invalidTaskFile'))
    const compatibilityError = getTaskCompatibilityError(
      taskDocument,
      robotStore.joints,
      robotStore.tcpState.sourceLink,
    )
    if (compatibilityError)
      throw new Error(issueText(compatibilityError, 'task.messages.importFailed'))
    const task = taskStore.importTask(taskDocument.task)
    if (!task) throw new Error(issueText(taskStore.persistenceError, 'task.messages.importFailed'))
    ElMessage.success(t('task.messages.imported', { name: task.name }))
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : t('task.messages.readFailed'))
  }
}

function downloadAlgorithmTemplate() {
  const template = createAlgorithmTrajectoryTemplate({
    modelName: robotStore.modelName,
    modelFileName: robotStore.modelFileName,
    tcpLinkName: robotStore.tcpState.sourceLink,
    joints: robotStore.joints,
    tcpPose: robotStore.tcpPose,
    speedScale: robotStore.speedScale,
    name: t('task.template.name', { model: robotStore.modelName }),
    description: t('task.template.description'),
  })
  downloadTextFile(
    `${sanitizeFileName(robotStore.modelName) || 'robot'}.algorithm-trajectory.json`,
    JSON.stringify(template, null, 2),
    'application/json;charset=utf-8',
  )
  ElMessage.success(t('task.messages.templateDownloaded'))
}

async function importAlgorithmTrajectory(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  try {
    const parsed: unknown = JSON.parse(await file.text())
    const document = parseAlgorithmTrajectoryFile(parsed)
    if (!document) throw new Error(t('task.messages.invalidAlgorithmFile'))
    const compatibilityError = getAlgorithmTrajectoryCompatibilityError(
      document,
      robotStore.joints,
      robotStore.tcpState.sourceLink,
    )
    if (compatibilityError)
      throw new Error(issueText(compatibilityError, 'task.messages.convertFailed'))
    const task = taskStore.createTask(algorithmTrajectoryToTaskInput(document, robotStore.joints))
    if (!task) throw new Error(issueText(taskStore.persistenceError, 'task.messages.convertFailed'))
    ElMessage.success(t('task.messages.converted', { name: task.name }))
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : t('task.messages.algorithmReadFailed'))
  }
}

function goToJointControl() {
  const query = { ...route.query }
  delete query.tab
  void router.replace({ query })
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString(locale.value, { hour12: false })
}

function formatDuration(milliseconds: number) {
  const totalSeconds = Math.floor(milliseconds / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function formatTarget(jointId: string, position: number) {
  const joint = robotStore.findJoint(jointId)
  if (!joint) return `${jointId} ${position.toFixed(3)}`
  return `${joint.displayName} ${toDisplayValue(joint, position).toFixed(joint.displayDecimals)} ${joint.displayUnit}`
}

function formatTcpTarget(pose: TcpPose) {
  return `TCP ${pose.x.toFixed(3)}, ${pose.y.toFixed(3)}, ${pose.z.toFixed(3)} m · ${pose.rx.toFixed(2)}°, ${pose.ry.toFixed(2)}°, ${pose.rz.toFixed(2)}°`
}
</script>

<template>
  <div class="task-panel">
    <section class="task-guide">
      <input
        ref="taskFileInput"
        class="task-file-input"
        type="file"
        accept=".json,.robot-task.json,application/json"
        @change="importTask"
      />
      <input
        ref="algorithmFileInput"
        class="task-file-input"
        type="file"
        accept=".json,.algorithm-trajectory.json,application/json"
        @change="importAlgorithmTrajectory"
      />
      <div>
        <h3>{{ t('task.title') }}</h3>
        <p>{{ t('task.guide') }}</p>
      </div>
      <div class="guide-actions">
        <ElButton @click="taskFileInput?.click()">
          <FontAwesomeIcon :icon="faFileImport" />{{ t('task.importTask') }}
        </ElButton>
        <ElDropdown
          split-button
          type="primary"
          plain
          :disabled="!robotStore.modelLoaded"
          @click="algorithmFileInput?.click()"
          @command="downloadAlgorithmTemplate"
        >
          {{ t('task.importTrajectory') }}
          <template #dropdown>
            <ElDropdownMenu>
              <ElDropdownItem command="template">{{ t('task.downloadTemplate') }}</ElDropdownItem>
            </ElDropdownMenu>
          </template>
        </ElDropdown>
        <ElButton plain @click="goToJointControl">{{ t('task.goToTeaching') }}</ElButton>
      </div>
    </section>

    <section class="task-list">
      <div class="section-title">
        <h3>{{ t('task.savedTasks') }}</h3>
        <span>{{ t('task.taskCount', { count: taskStore.tasks.length }) }}</span>
      </div>
      <ElTable
        v-if="taskStore.tasks.length"
        class="adaptive-table"
        :data="taskStore.tasks"
        border
        size="small"
        row-key="id"
        height="100%"
      >
        <ElTableColumn type="expand" width="38">
          <template #default="{ row }">
            <div class="step-list">
              <div v-for="(step, index) in row.steps" :key="step.id" class="step-item">
                <span class="step-index">{{ index + 1 }}</span>
                <div class="step-meta">
                  <strong>{{ t('task.poseIndex', { index: index + 1 }) }}</strong>
                  <small>{{ t('task.speed', { value: Math.round(step.speedScale * 100) }) }}</small>
                </div>
                <div class="step-targets">
                  <strong v-if="step.targetTcpPose" class="step-tcp">
                    {{ formatTcpTarget(step.targetTcpPose) }}
                  </strong>
                  <span v-for="target in step.targets" :key="target.jointId">
                    {{ formatTarget(target.jointId, target.position) }}
                  </span>
                </div>
              </div>
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn
          prop="name"
          :label="t('task.taskName')"
          min-width="142"
          show-overflow-tooltip
        />
        <ElTableColumn :label="t('task.pose')" width="62" align="center">
          <template #default="{ row }">{{ row.steps.length }}</template>
        </ElTableColumn>
        <ElTableColumn :label="t('task.savedAt')" min-width="148">
          <template #default="{ row }">{{ formatDate(row.updatedAt) }}</template>
        </ElTableColumn>
        <ElTableColumn :label="t('common.status')" width="78" align="center">
          <template #default="{ row }">
            <ElTag
              v-if="taskStore.runtime.activeTaskId === row.id"
              :type="activeStatusType"
              effect="plain"
              size="small"
            >
              {{ activeStatusLabel }}
            </ElTag>
            <span v-else>{{ t('task.statuses.idle') }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn :label="t('common.operation')" width="202" align="center">
          <template #default="{ row }">
            <ElButton
              type="primary"
              link
              :loading="playingTaskId === row.id"
              :disabled="!canExecuteTask"
              :aria-label="t('task.playTaskAria', { name: row.name })"
              @click="playTask(row)"
            >
              {{ t('task.play') }}
            </ElButton>
            <ElButton
              type="primary"
              link
              :aria-label="t('task.exportTaskAria', { name: row.name })"
              @click="exportTask(row)"
            >
              {{ t('task.export') }}
            </ElButton>
            <ElPopconfirm :title="t('task.deleteConfirm')" @confirm="removeTask(row)">
              <template #reference>
                <ElButton
                  type="danger"
                  link
                  :disabled="
                    taskStore.runtime.activeTaskId === row.id &&
                    (taskStore.runtime.status === 'running' ||
                      taskStore.runtime.status === 'paused')
                  "
                  :aria-label="t('task.deleteTaskAria', { name: row.name })"
                >
                  {{ t('task.delete') }}
                </ElButton>
              </template>
            </ElPopconfirm>
          </template>
        </ElTableColumn>
      </ElTable>
      <ElEmpty v-else :description="t('task.empty')" :image-size="54">
        <ElButton type="primary" plain @click="goToJointControl">
          {{ t('task.goToTeaching') }}
        </ElButton>
      </ElEmpty>
    </section>

    <section class="task-monitor">
      <div class="monitor-head">
        <div>
          <span>{{ t('task.monitor') }}</span>
          <strong>{{ taskStore.activeTask?.name ?? t('task.notPlayed') }}</strong>
        </div>
        <ElTag :type="activeStatusType" effect="plain">{{ activeStatusLabel }}</ElTag>
      </div>
      <div class="monitor-progress">
        <span>{{ t('task.totalProgress') }}</span>
        <ElProgress
          :percentage="Math.round(taskStore.runtime.progress)"
          :stroke-width="6"
          :status="taskStore.runtime.status === 'completed' ? 'success' : undefined"
        />
      </div>
      <dl>
        <div>
          <dt>{{ t('task.currentPose') }}</dt>
          <dd v-if="taskStore.activeTask">
            {{ Math.min(taskStore.runtime.currentStepIndex + 1, taskStore.runtime.totalSteps) }} /
            {{ taskStore.runtime.totalSteps }}
          </dd>
          <dd v-else>—</dd>
        </div>
        <div>
          <dt>{{ t('task.elapsed') }}</dt>
          <dd>{{ formatDuration(taskStore.runtime.elapsedMs) }}</dd>
        </div>
        <div>
          <dt>{{ t('task.control') }}</dt>
          <dd>{{ t('task.controlHint') }}</dd>
        </div>
      </dl>
      <p v-if="taskStore.runtime.error" class="task-error">{{ taskStore.runtime.error }}</p>
    </section>
  </div>
</template>

<style scoped>
.task-panel {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: 66px minmax(150px, 1fr) 96px;
  gap: 8px;
  padding: 8px;
  overflow: hidden;
  background: #f6f8fa;
}
.task-panel section {
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--line-300);
  border-radius: var(--radius-sm);
  background: #fff;
}
.task-guide {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
}
.task-guide > div {
  min-width: 0;
}
.task-file-input {
  display: none;
}
.guide-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
}
.guide-actions :deep(.el-button),
.guide-actions :deep(.el-dropdown) {
  margin: 0;
  gap: 7px;
}
h3,
p {
  margin: 0;
}
h3 {
  font-size: 14px;
}
.task-guide p {
  margin-top: 4px;
  overflow: hidden;
  color: var(--ink-500);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.task-list {
  display: grid;
  grid-template-rows: 32px minmax(0, 1fr);
}
.section-title,
.monitor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.section-title {
  padding: 0 10px;
  border-bottom: 1px solid var(--line-200);
}
.section-title span {
  color: var(--ink-500);
  font-size: 11px;
}
.task-list :deep(.el-table__cell) {
  padding: 4px 0;
}
.task-list :deep(.cell) {
  font-size: 11.5px;
}
.task-list :deep(.el-table__expanded-cell) {
  padding: 8px 12px;
  background: #f8fafc;
}
.task-list :deep(.el-empty) {
  padding: 8px 0;
}
.step-list {
  display: grid;
  gap: 5px;
}
.step-item {
  display: grid;
  grid-template-columns: 24px 96px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid var(--line-200);
  border-radius: 3px;
  background: #fff;
}
.step-index {
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: var(--blue-700);
  background: #eaf2ff;
  font-weight: 650;
}
.step-meta {
  display: flex;
  flex-direction: column;
}
.step-meta small {
  color: var(--ink-500);
}
.step-targets {
  display: flex;
  flex-wrap: wrap;
  gap: 3px 10px;
  color: var(--ink-700);
  font-size: 10.5px;
}
.step-tcp {
  flex: 0 0 100%;
  color: var(--blue-700);
  font-weight: 600;
}
.task-monitor {
  position: relative;
  display: grid;
  grid-template-rows: 22px 20px 24px;
  gap: 4px;
  padding: 8px 12px;
}
.monitor-head {
  min-width: 0;
}
.monitor-head > div {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}
.monitor-head span {
  color: var(--ink-500);
  font-size: 11px;
}
.monitor-head strong {
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.monitor-head :deep(.el-tag) {
  height: 22px;
}
.monitor-progress {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}
.monitor-progress > span {
  color: var(--ink-500);
  font-size: 11px;
}
.monitor-progress :deep(.el-progress) {
  min-width: 0;
}
.task-monitor :deep(.el-progress__text) {
  min-width: 38px;
  font-size: 11px !important;
}
.task-monitor dl {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  align-items: center;
  margin: 0;
}
.task-monitor dl div {
  display: flex;
  align-items: center;
  gap: 7px;
  padding-right: 10px;
  border-right: 1px solid var(--line-200);
}
.task-monitor dl div:last-child {
  border: 0;
}
.task-monitor dt {
  color: var(--ink-500);
}
.task-monitor dd {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.task-error {
  position: absolute;
  right: 12px;
  bottom: 6px;
  margin: 0;
  color: var(--red-600);
  font-size: 11px;
}
@media (max-height: 850px) {
  .task-list :deep(.el-empty) {
    padding: 4px 0;
  }
  .task-list :deep(.el-empty__image) {
    display: none;
  }
  .task-list :deep(.el-empty__description) {
    margin-top: 0;
  }
}
</style>
