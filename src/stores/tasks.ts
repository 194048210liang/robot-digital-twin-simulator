import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  isRobotTask,
  isSameJointPose,
  migrateStoredTask,
  normalizeTaskText,
  ROBOT_TASK_DESCRIPTION_MAX_LENGTH,
  ROBOT_TASK_MAX_STEPS,
  ROBOT_TASK_NAME_MAX_LENGTH,
  type CreateRobotTaskInput,
  type RobotTask,
  type RobotTaskJointTarget,
  type RobotTaskRuntime,
  type RobotTaskStatus,
  type RobotTaskStep,
} from '@/robot/task'

const STORAGE_KEY = 'robostation.robot-tasks.v1'

function createId(prefix: string) {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function loadTasks() {
  if (typeof localStorage === 'undefined') return { tasks: [] as RobotTask[], error: '' }
  try {
    const serialized = localStorage.getItem(STORAGE_KEY)
    if (!serialized) return { tasks: [] as RobotTask[], error: '' }
    const parsed: unknown = JSON.parse(serialized)
    if (!Array.isArray(parsed)) throw new Error('任务数据格式无效')
    return {
      tasks: parsed.map(migrateStoredTask).filter((task): task is RobotTask => task !== null),
      error: '',
    }
  } catch (error) {
    return {
      tasks: [] as RobotTask[],
      error: error instanceof Error ? error.message : '任务数据读取失败',
    }
  }
}

function initialRuntime(): RobotTaskRuntime {
  return {
    activeTaskId: null,
    status: 'idle',
    progress: 0,
    startedAt: null,
    elapsedMs: 0,
    currentStepIndex: 0,
    totalSteps: 0,
    startPositions: {},
    error: '',
  }
}

export const useRobotTaskStore = defineStore('robot-tasks', () => {
  const loaded = loadTasks()
  const tasks = ref<RobotTask[]>(loaded.tasks)
  const draftSteps = ref<RobotTaskStep[]>([])
  const draftError = ref('')
  const persistenceError = ref(loaded.error)
  const runtime = ref<RobotTaskRuntime>(initialRuntime())
  const activeTask = computed(
    () => tasks.value.find((task) => task.id === runtime.value.activeTaskId) ?? null,
  )

  function persist(nextTasks: RobotTask[]) {
    if (typeof localStorage === 'undefined') return true
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextTasks))
      persistenceError.value = ''
      return true
    } catch (error) {
      persistenceError.value = error instanceof Error ? error.message : '任务保存失败'
      return false
    }
  }

  function addDraftStep(targets: RobotTaskJointTarget[], speedScale: number) {
    draftError.value = ''
    if (
      targets.length === 0 ||
      targets.some((target) => !target.jointId || !Number.isFinite(target.position))
    ) {
      draftError.value = '当前姿态数据无效'
      return null
    }
    if (draftSteps.value.length >= ROBOT_TASK_MAX_STEPS) {
      draftError.value = `每个任务最多 ${ROBOT_TASK_MAX_STEPS} 个姿态`
      return null
    }
    const lastStep = draftSteps.value.at(-1)
    if (lastStep && isSameJointPose(lastStep.targets, targets)) {
      draftError.value = '当前姿态与上一个姿态相同'
      return null
    }
    const step: RobotTaskStep = {
      id: createId('step'),
      targets: targets.map((target) => ({ ...target })),
      speedScale: Math.min(1, Math.max(0.1, speedScale)),
    }
    draftSteps.value.push(step)
    return step
  }

  function removeLastDraftStep() {
    draftError.value = ''
    return draftSteps.value.pop() ?? null
  }

  function clearDraft() {
    draftSteps.value = []
    draftError.value = ''
  }

  function createTask(input: CreateRobotTaskInput) {
    const name = normalizeTaskText(input.name, ROBOT_TASK_NAME_MAX_LENGTH)
    if (!name || input.steps.length === 0 || input.steps.length > ROBOT_TASK_MAX_STEPS) return null

    const timestamp = Date.now()
    const task: RobotTask = {
      id: createId('task'),
      name,
      description: normalizeTaskText(input.description ?? '', ROBOT_TASK_DESCRIPTION_MAX_LENGTH),
      steps: input.steps.map((step) => ({
        id: step.id || createId('step'),
        targets: step.targets.map((target) => ({ ...target })),
        speedScale: Math.min(1, Math.max(0.1, step.speedScale)),
      })),
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    if (!isRobotTask(task)) return null

    const nextTasks = [task, ...tasks.value]
    if (!persist(nextTasks)) return null
    tasks.value = nextTasks
    return task
  }

  function removeTask(taskId: string) {
    if (
      runtime.value.activeTaskId === taskId &&
      (runtime.value.status === 'running' || runtime.value.status === 'paused')
    ) {
      return false
    }
    const nextTasks = tasks.value.filter((task) => task.id !== taskId)
    if (nextTasks.length === tasks.value.length || !persist(nextTasks)) return false
    tasks.value = nextTasks
    if (runtime.value.activeTaskId === taskId) runtime.value = initialRuntime()
    return true
  }

  function startTask(taskId: string, totalSteps: number, startPositions: Record<string, number>) {
    runtime.value = {
      activeTaskId: taskId,
      status: 'running',
      progress: 0,
      startedAt: Date.now(),
      elapsedMs: 0,
      currentStepIndex: 0,
      totalSteps,
      startPositions: { ...startPositions },
      error: '',
    }
  }

  function startStep(stepIndex: number, startPositions: Record<string, number>) {
    runtime.value.currentStepIndex = stepIndex
    runtime.value.startPositions = { ...startPositions }
    runtime.value.status = 'running'
  }

  function updateRuntime(status: RobotTaskStatus, progress: number, elapsedMs: number, error = '') {
    runtime.value.status = status
    runtime.value.progress = Math.min(100, Math.max(0, progress))
    runtime.value.elapsedMs = Math.max(0, elapsedMs)
    runtime.value.error = error
  }

  function failTask(taskId: string, error: string) {
    runtime.value = {
      ...initialRuntime(),
      activeTaskId: taskId,
      status: 'error',
      error,
    }
  }

  return {
    tasks,
    draftSteps,
    draftError,
    runtime,
    activeTask,
    persistenceError,
    addDraftStep,
    removeLastDraftStep,
    clearDraft,
    createTask,
    removeTask,
    startTask,
    startStep,
    updateRuntime,
    failTask,
  }
})
