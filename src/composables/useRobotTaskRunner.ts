import { computed, onScopeDispose, watch } from 'vue'
import {
  calculateSequenceProgress,
  calculateTaskProgress,
  type RobotTask,
  type RobotTaskStatus,
} from '@/robot/task'
import { isTargetWithinLimits } from '@/robot/robot-controller'
import { useRobotController } from '@/robot/controller-context'
import { useRobotStore } from '@/stores/robot'
import { useRobotTaskStore } from '@/stores/tasks'

const ACTIVE_STATUSES = new Set<RobotTaskStatus>(['running', 'paused'])

export function useRobotTaskRunner() {
  const robotStore = useRobotStore()
  const taskStore = useRobotTaskStore()
  const controller = useRobotController()
  let stepTransitionPending = false

  const canExecuteTask = computed(
    () =>
      robotStore.connectionState === 'connected' &&
      robotStore.modelLoaded &&
      robotStore.motionState !== 'running' &&
      robotStore.motionState !== 'paused',
  )

  function currentPositions() {
    return Object.fromEntries(robotStore.joints.map((joint) => [joint.id, joint.current]))
  }

  function elapsedTime() {
    return taskStore.runtime.startedAt === null ? 0 : Date.now() - taskStore.runtime.startedAt
  }

  function validateTask(task: RobotTask) {
    for (const step of task.steps) {
      for (const target of step.targets) {
        const joint = robotStore.findJoint(target.jointId)
        if (!joint || !isTargetWithinLimits(target.position, joint.min, joint.max)) {
          taskStore.failTask(task.id, `任务包含无效关节目标：${target.jointId}`)
          return false
        }
      }
    }
    return task.steps.length > 0
  }

  async function startStep(task: RobotTask, stepIndex: number) {
    const step = task.steps[stepIndex]
    if (!step) {
      taskStore.failTask(task.id, '任务步骤不存在')
      return false
    }

    taskStore.startStep(stepIndex, currentPositions())
    controller.setSpeedScale(step.speedScale)
    for (const target of step.targets) controller.setJointTarget(target.jointId, target.position)
    await controller.execute()
    synchronizeRuntime()
    return true
  }

  function moveToNextStep(task: RobotTask, stepIndex: number) {
    if (stepTransitionPending) return
    stepTransitionPending = true
    void startStep(task, stepIndex).finally(() => {
      stepTransitionPending = false
    })
  }

  function synchronizeRuntime() {
    const runtime = taskStore.runtime
    const task = taskStore.activeTask
    if (!task || !ACTIVE_STATUSES.has(runtime.status)) return

    const step = task.steps[runtime.currentStepIndex]
    if (!step) {
      taskStore.failTask(task.id, '当前任务步骤无效')
      return
    }

    const positions = currentPositions()
    const stepProgress = calculateTaskProgress(runtime.startPositions, step.targets, positions)
    const progress = calculateSequenceProgress(
      runtime.currentStepIndex,
      runtime.totalSteps,
      stepProgress,
    )
    const elapsedMs = elapsedTime()

    if (robotStore.motionState === 'paused') {
      taskStore.updateRuntime('paused', progress, elapsedMs)
    } else if (robotStore.motionState === 'stopped') {
      taskStore.updateRuntime('stopped', progress, elapsedMs)
    } else if (robotStore.motionState === 'error') {
      taskStore.updateRuntime('error', progress, elapsedMs, '机器人运动状态异常')
    } else if (robotStore.motionState === 'idle') {
      const nextStepIndex = runtime.currentStepIndex + 1
      if (nextStepIndex < task.steps.length) {
        taskStore.updateRuntime('running', progress, elapsedMs)
        moveToNextStep(task, nextStepIndex)
      } else {
        taskStore.updateRuntime('completed', 100, elapsedMs)
      }
    } else {
      taskStore.updateRuntime('running', progress, elapsedMs)
    }
  }

  async function executeTask(task: RobotTask) {
    if (!canExecuteTask.value || !validateTask(task)) return false

    const positions = currentPositions()
    taskStore.startTask(task.id, task.steps.length, positions)
    return startStep(task, 0)
  }

  const stopMotionWatch = watch(
    [() => robotStore.motionState, () => robotStore.joints.map((joint) => joint.current)],
    synchronizeRuntime,
  )
  const monitorTimer = window.setInterval(synchronizeRuntime, 250)

  synchronizeRuntime()
  onScopeDispose(() => {
    stopMotionWatch()
    window.clearInterval(monitorTimer)
  })

  return { canExecuteTask, executeTask }
}
