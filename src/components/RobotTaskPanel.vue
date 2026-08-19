<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { useRobotTaskRunner } from '@/composables/useRobotTaskRunner'
import { toDisplayValue } from '@/robot/config'
import { isSameJointPose, type RobotTask, type RobotTaskStatus } from '@/robot/task'
import { useRobotStore } from '@/stores/robot'
import { useRobotTaskStore } from '@/stores/tasks'

const route = useRoute()
const router = useRouter()
const robotStore = useRobotStore()
const taskStore = useRobotTaskStore()
const { canExecuteTask, executeTask: runTask } = useRobotTaskRunner()
const playingTaskId = ref('')

const statusLabels: Record<RobotTaskStatus, string> = {
  idle: '待播放',
  running: '播放中',
  paused: '已暂停',
  completed: '已完成',
  stopped: '已停止',
  error: '异常',
}

const activeStatusLabel = computed(() => statusLabels[taskStore.runtime.status])
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
    ElMessage.info('机器人已在该任务的目标姿态，播放会直接完成')
  }

  playingTaskId.value = task.id
  try {
    const accepted = await runTask(task)
    if (!accepted) ElMessage.warning(taskStore.runtime.error || '机器人当前无法播放任务')
  } finally {
    playingTaskId.value = ''
  }
}

function removeTask(task: RobotTask) {
  if (taskStore.removeTask(task.id)) ElMessage.success(`任务“${task.name}”已删除`)
  else ElMessage.warning(taskStore.persistenceError || '播放中的任务不能删除')
}

function goToJointControl() {
  const query = { ...route.query }
  delete query.tab
  void router.replace({ query })
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false })
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
</script>

<template>
  <div class="task-panel">
    <section class="task-guide">
      <div>
        <h3>机器人任务</h3>
        <p>在关节控制中调整模型、依次添加姿态并保存，然后回到这里播放。</p>
      </div>
      <ElButton plain @click="goToJointControl">前往关节控制</ElButton>
    </section>

    <section class="task-list">
      <div class="section-title">
        <h3>已保存任务</h3>
        <span>{{ taskStore.tasks.length }} 个</span>
      </div>
      <ElTable
        v-if="taskStore.tasks.length"
        :data="taskStore.tasks"
        height="100%"
        border
        size="small"
        row-key="id"
      >
        <ElTableColumn type="expand" width="38">
          <template #default="{ row }">
            <div class="step-list">
              <div v-for="(step, index) in row.steps" :key="step.id" class="step-item">
                <span class="step-index">{{ index + 1 }}</span>
                <div class="step-meta">
                  <strong>姿态 {{ index + 1 }}</strong>
                  <small>速度 {{ Math.round(step.speedScale * 100) }}%</small>
                </div>
                <div class="step-targets">
                  <span v-for="target in step.targets" :key="target.jointId">
                    {{ formatTarget(target.jointId, target.position) }}
                  </span>
                </div>
              </div>
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="name" label="任务名称" min-width="142" show-overflow-tooltip />
        <ElTableColumn label="姿态" width="62" align="center">
          <template #default="{ row }">{{ row.steps.length }}</template>
        </ElTableColumn>
        <ElTableColumn label="保存时间" min-width="148">
          <template #default="{ row }">{{ formatDate(row.updatedAt) }}</template>
        </ElTableColumn>
        <ElTableColumn label="状态" width="78" align="center">
          <template #default="{ row }">
            <ElTag
              v-if="taskStore.runtime.activeTaskId === row.id"
              :type="activeStatusType"
              effect="plain"
              size="small"
            >
              {{ activeStatusLabel }}
            </ElTag>
            <span v-else>待播放</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="142" align="center">
          <template #default="{ row }">
            <ElButton
              type="primary"
              link
              :loading="playingTaskId === row.id"
              :disabled="!canExecuteTask"
              :aria-label="`播放任务 ${row.name}`"
              @click="playTask(row)"
            >
              播放
            </ElButton>
            <ElPopconfirm title="确定删除这个任务？" @confirm="removeTask(row)">
              <template #reference>
                <ElButton
                  type="danger"
                  link
                  :disabled="
                    taskStore.runtime.activeTaskId === row.id &&
                    (taskStore.runtime.status === 'running' ||
                      taskStore.runtime.status === 'paused')
                  "
                  :aria-label="`删除任务 ${row.name}`"
                >
                  删除
                </ElButton>
              </template>
            </ElPopconfirm>
          </template>
        </ElTableColumn>
      </ElTable>
      <ElEmpty v-else description="暂无任务，请先到关节控制添加姿态并保存" :image-size="54">
        <ElButton type="primary" plain @click="goToJointControl">前往关节控制</ElButton>
      </ElEmpty>
    </section>

    <section class="task-monitor">
      <div class="monitor-head">
        <div>
          <span>播放监控</span>
          <strong>{{ taskStore.activeTask?.name ?? '尚未播放任务' }}</strong>
        </div>
        <ElTag :type="activeStatusType" effect="plain">{{ activeStatusLabel }}</ElTag>
      </div>
      <ElProgress
        :percentage="Math.round(taskStore.runtime.progress)"
        :stroke-width="8"
        :status="taskStore.runtime.status === 'completed' ? 'success' : undefined"
      />
      <dl>
        <div>
          <dt>总进度</dt>
          <dd>{{ taskStore.runtime.progress.toFixed(1) }}%</dd>
        </div>
        <div>
          <dt>当前姿态</dt>
          <dd v-if="taskStore.activeTask">
            {{ Math.min(taskStore.runtime.currentStepIndex + 1, taskStore.runtime.totalSteps) }} /
            {{ taskStore.runtime.totalSteps }}
          </dd>
          <dd v-else>—</dd>
        </div>
        <div>
          <dt>已用时</dt>
          <dd>{{ formatDuration(taskStore.runtime.elapsedMs) }}</dd>
        </div>
        <div>
          <dt>播放控制</dt>
          <dd>使用下方暂停 / 继续 / 停止</dd>
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
  grid-template-rows: 66px minmax(150px, 1fr) 118px;
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
.task-monitor {
  padding: 10px 12px;
}
.monitor-head {
  margin-bottom: 9px;
}
.monitor-head > div {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.monitor-head span {
  color: var(--ink-500);
  font-size: 11px;
}
.monitor-head strong {
  font-size: 13px;
}
.task-monitor :deep(.el-progress__text) {
  min-width: 38px;
  font-size: 11px !important;
}
.task-monitor dl {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  margin: 8px 0 0;
}
.task-monitor dl div {
  display: flex;
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
  font-variant-numeric: tabular-nums;
}
.task-error {
  margin-top: 6px;
  color: var(--red-600);
  font-size: 11px;
}
</style>
