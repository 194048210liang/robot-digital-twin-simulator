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
import type { TranslationDescriptor } from '@/robot/types'

const STORAGE_KEY = 'robostation.robot-tasks.v1'

function createId(prefix: string) {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function loadTasks(): { tasks: RobotTask[]; error: TranslationDescriptor | null } {
  if (typeof localStorage === 'undefined') return { tasks: [], error: null }
  try {
    const serialized = localStorage.getItem(STORAGE_KEY)
    if (!serialized) return { tasks: [], error: null }
    const parsed: unknown = JSON.parse(serialized)
    if (!Array.isArray(parsed)) {
      return { tasks: [], error: { key: 'task.storeErrors.invalidData' } }
    }
    return {
      tasks: parsed.map(migrateStoredTask).filter((task): task is RobotTask => task !== null),
      error: null,
    }
  } catch {
    return {
      tasks: [] as RobotTask[],
      error: { key: 'task.storeErrors.readFailed' },
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
  const draftError = ref<TranslationDescriptor | null>(null)
  const persistenceError = ref(loaded.error)
  const runtime = ref<RobotTaskRuntime>(initialRuntime())
  const activeTask = computed(
    () => tasks.value.find((task) => task.id === runtime.value.activeTaskId) ?? null,
  )

  function persist(nextTasks: RobotTask[]) {
    if (typeof localStorage === 'undefined') return true
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextTasks))
      persistenceError.value = null
      return true
    } catch {
      persistenceError.value = { key: 'task.storeErrors.saveFailed' }
      return false
    }
  }

  function addDraftStep(targets: RobotTaskJointTarget[], speedScale: number) {
    draftError.value = null
    if (
      targets.length === 0 ||
      targets.some((target) => !target.jointId || !Number.isFinite(target.position))
    ) {
      draftError.value = { key: 'task.storeErrors.invalidPose' }
      return null
    }
    if (draftSteps.value.length >= ROBOT_TASK_MAX_STEPS) {
      draftError.value = {
        key: 'task.storeErrors.maxPoses',
        params: { count: ROBOT_TASK_MAX_STEPS },
      }
      return null
    }
    const lastStep = draftSteps.value.at(-1)
    if (lastStep && isSameJointPose(lastStep.targets, targets)) {
      draftError.value = { key: 'task.storeErrors.duplicatePose' }
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
    draftError.value = null
    return draftSteps.value.pop() ?? null
  }

  function clearDraft() {
    draftSteps.value = []
    draftError.value = null
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
        targetTcpPose: step.targetTcpPose ? { ...step.targetTcpPose } : undefined,
      })),
      model: input.model ? { ...input.model, jointIds: [...input.model.jointIds] } : undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    if (!isRobotTask(task)) return null

    const nextTasks = [task, ...tasks.value]
    if (!persist(nextTasks)) return null
    tasks.value = nextTasks
    return task
  }

  function importTask(task: RobotTask, model = task.model) {
    return createTask({
      name: task.name,
      description: task.description,
      steps: task.steps.map((step) => ({
        id: '',
        speedScale: step.speedScale,
        targets: step.targets.map((target) => ({ ...target })),
        targetTcpPose: step.targetTcpPose ? { ...step.targetTcpPose } : undefined,
      })),
      model,
    })
  }

  function removeTasks(taskIds: string[]) {
    const selectedIds = new Set(taskIds)
    if (!selectedIds.size) return 0
    if (
      runtime.value.activeTaskId &&
      selectedIds.has(runtime.value.activeTaskId) &&
      (runtime.value.status === 'running' || runtime.value.status === 'paused')
    ) {
      return 0
    }
    const nextTasks = tasks.value.filter((task) => !selectedIds.has(task.id))
    const removedCount = tasks.value.length - nextTasks.length
    if (removedCount === 0 || !persist(nextTasks)) return 0
    tasks.value = nextTasks
    if (runtime.value.activeTaskId && selectedIds.has(runtime.value.activeTaskId)) {
      runtime.value = initialRuntime()
    }
    return removedCount
  }

  function removeTask(taskId: string) {
    return removeTasks([taskId]) === 1
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
    importTask,
    removeTasks,
    removeTask,
    startTask,
    startStep,
    updateRuntime,
    failTask,
  }
})
