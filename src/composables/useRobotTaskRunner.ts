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
import { useTrajectoryStore } from '@/stores/trajectory'
import { useValidationStore } from '@/stores/validation'

const ACTIVE_STATUSES = new Set<RobotTaskStatus>(['running', 'paused'])

export function useRobotTaskRunner() {
  const robotStore = useRobotStore()
  const taskStore = useRobotTaskStore()
  const trajectoryStore = useTrajectoryStore()
  const validationStore = useValidationStore()
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

  function finishValidation(status: RobotTaskStatus, error = '') {
    const record = validationStore.finish(status, error, robotStore.joints, robotStore.tcpPose)
    if (!record) return
    const passed = record.summary.passed
    robotStore.addLog({
      level: passed ? 'info' : 'warning',
      channel: passed ? 'command' : 'alarm',
      direction: 'SYS',
      source: '验证',
      code: passed ? 'VALIDATION-PASS' : 'VALIDATION-INCOMPLETE',
      message: passed
        ? `任务“${record.taskName}”仿真验证通过`
        : `任务“${record.taskName}”验证未通过`,
      details: `${record.summary.sampleCount} 个样本 · TCP ${record.summary.tcpPathLength.toFixed(3)} m`,
      status: passed ? '成功' : '警告',
    })
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
      validationStore.setStatus('paused')
    } else if (robotStore.motionState === 'stopped') {
      taskStore.updateRuntime('stopped', progress, elapsedMs)
      finishValidation('stopped')
    } else if (robotStore.motionState === 'error') {
      taskStore.updateRuntime('error', progress, elapsedMs, '机器人运动状态异常')
      finishValidation('error', '机器人运动状态异常')
    } else if (robotStore.motionState === 'idle') {
      const nextStepIndex = runtime.currentStepIndex + 1
      if (nextStepIndex < task.steps.length) {
        taskStore.updateRuntime('running', progress, elapsedMs)
        moveToNextStep(task, nextStepIndex)
      } else {
        taskStore.updateRuntime('completed', 100, elapsedMs)
        finishValidation('completed')
      }
    } else {
      taskStore.updateRuntime('running', progress, elapsedMs)
      validationStore.setStatus('running')
    }
  }

  async function executeTask(task: RobotTask) {
    if (!canExecuteTask.value || !validateTask(task)) return false

    const positions = currentPositions()
    trajectoryStore.clear()
    validationStore.begin(
      task,
      robotStore.modelName,
      robotStore.tcpState.sourceLink,
      robotStore.joints,
      robotStore.tcpPose,
    )
    robotStore.addLog({
      level: 'info',
      channel: 'command',
      direction: 'SYS',
      source: '验证',
      code: 'VALIDATION-START',
      message: `开始记录任务“${task.name}”的仿真数据`,
      details: `${task.steps.length} 个姿态 · ${robotStore.joints.length} 个关节`,
      status: '成功',
    })
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
