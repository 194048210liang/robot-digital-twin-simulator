import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  calculateSequenceProgress,
  calculateTaskProgress,
  isRobotTask,
  isSameJointPose,
} from './task'
import { useRobotTaskStore } from '@/stores/tasks'

function installStorage() {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  })
  return values
}

function taskStep(id = 'step-1', position = 0.5) {
  return {
    id,
    targets: [{ jointId: 'joint-a', position }],
    speedScale: 0.6,
  }
}

const modelBinding = {
  name: 'Test Robot',
  fileName: 'test.urdf',
  tcpLinkName: 'tool0',
  jointSignature: 'joint-a:revolute:-1:1',
  jointIds: ['joint-a'],
}

describe('robot task', () => {
  beforeEach(() => {
    installStorage()
    setActivePinia(createPinia())
  })

  afterEach(() => vi.unstubAllGlobals())

  it('按运动关节的完成比例计算单个姿态进度', () => {
    const targets = [
      { jointId: 'joint-a', position: 1 },
      { jointId: 'joint-b', position: -1 },
    ]

    expect(
      calculateTaskProgress({ 'joint-a': 0, 'joint-b': 0 }, targets, {
        'joint-a': 0.5,
        'joint-b': -0.5,
      }),
    ).toBe(50)
    expect(calculateSequenceProgress(1, 4, 50)).toBe(37.5)
  })

  it('识别相同姿态，避免连续添加重复步骤', () => {
    const first = [
      { jointId: 'joint-a', position: 0.5 },
      { jointId: 'joint-b', position: -0.2 },
    ]
    const reordered = [
      { jointId: 'joint-b', position: -0.2 },
      { jointId: 'joint-a', position: 0.5 },
    ]

    expect(isSameJointPose(first, reordered)).toBe(true)
    expect(isSameJointPose(first, [{ jointId: 'joint-a', position: 0.6 }])).toBe(false)
  })

  it('添加多个姿态并保存为可持久化任务', () => {
    const store = useRobotTaskStore()
    expect(store.addDraftStep(taskStep().targets, 0.6)).not.toBeNull()
    expect(store.addDraftStep(taskStep('ignored', 0.8).targets, 0.4)).not.toBeNull()

    const task = store.createTask({
      name: ' 抓取任务 ',
      description: '测试任务',
      steps: store.draftSteps,
    })

    expect(task?.name).toBe('抓取任务')
    expect(task?.steps).toHaveLength(2)
    expect(localStorage.getItem('robostation.robot-tasks.v1')).toContain('joint-a')
    expect(isRobotTask(task)).toBe(true)
  })

  it('保存并导入算法任务时保留 TCP 目标', () => {
    const store = useRobotTaskStore()
    const targetTcpPose = { x: 0.4, y: 0, z: 0.3, rx: 0, ry: 45, rz: 0 }
    const task = store.createTask({
      name: '算法任务',
      steps: [{ ...taskStep(), targetTcpPose }],
      model: modelBinding,
    })

    expect(task?.steps[0]?.targetTcpPose).toEqual(targetTcpPose)
    expect(task?.model).toEqual(modelBinding)
    if (!task) return
    const imported = store.importTask(task)
    expect(imported?.steps[0]?.targetTcpPose).toEqual(targetTcpPose)
    expect(imported?.model).toEqual(modelBinding)
  })

  it('拒绝连续添加完全相同的姿态', () => {
    const store = useRobotTaskStore()
    const targets = taskStep().targets
    expect(store.addDraftStep(targets, 0.5)).not.toBeNull()
    expect(store.addDraftStep(targets, 0.8)).toBeNull()
    expect(store.draftError).toEqual({ key: 'task.storeErrors.duplicatePose' })
  })

  it('运行或暂停中的任务不能删除', () => {
    const store = useRobotTaskStore()
    const task = store.createTask({ name: '运行任务', steps: [taskStep()] })
    expect(task).not.toBeNull()
    if (!task) return

    store.startTask(task.id, task.steps.length, { 'joint-a': 0 })
    expect(store.removeTask(task.id)).toBe(false)

    store.updateRuntime('completed', 100, 1200)
    expect(store.removeTask(task.id)).toBe(true)
  })

  it('批量删除多个非运行任务并一次更新任务列表', () => {
    const store = useRobotTaskStore()
    const first = store.createTask({ name: '任务一', steps: [taskStep()] })
    const second = store.createTask({ name: '任务二', steps: [taskStep()] })
    const third = store.createTask({ name: '任务三', steps: [taskStep()] })
    expect(first && second && third).toBeTruthy()
    if (!first || !second || !third) return

    expect(store.removeTasks([first.id, third.id])).toBe(2)
    expect(store.tasks.map((task) => task.id)).toEqual([second.id])
    expect(localStorage.getItem('robostation.robot-tasks.v1')).toContain(second.id)
    expect(localStorage.getItem('robostation.robot-tasks.v1')).not.toContain(first.id)
  })

  it('批量删除包含运行任务时不删除任何任务', () => {
    const store = useRobotTaskStore()
    const active = store.createTask({ name: '运行任务', steps: [taskStep()] })
    const idle = store.createTask({ name: '待机任务', steps: [taskStep()] })
    expect(active && idle).toBeTruthy()
    if (!active || !idle) return

    store.startTask(active.id, 1, { 'joint-a': 0 })
    expect(store.removeTasks([active.id, idle.id])).toBe(0)
    expect(store.tasks).toHaveLength(2)
  })

  it('将旧版单姿态任务迁移为一个步骤', () => {
    localStorage.setItem(
      'robostation.robot-tasks.v1',
      JSON.stringify([
        {
          id: 'legacy-task',
          name: '旧任务',
          description: '',
          targets: [{ jointId: 'joint-a', position: 0.5 }],
          speedScale: 0.5,
          createdAt: 1,
          updatedAt: 1,
        },
      ]),
    )
    setActivePinia(createPinia())

    const [task] = useRobotTaskStore().tasks
    expect(task).toBeDefined()
    if (!task) return
    expect(task.steps).toHaveLength(1)
    expect(task.model).toBeUndefined()
    const [step] = task.steps
    expect(step).toBeDefined()
    expect(step?.targets[0]?.jointId).toBe('joint-a')
  })

  it('丢弃本地存储中的无效任务数据', () => {
    localStorage.setItem(
      'robostation.robot-tasks.v1',
      JSON.stringify([{ id: 'bad-task', name: '', targets: [] }]),
    )
    setActivePinia(createPinia())

    expect(useRobotTaskStore().tasks).toHaveLength(0)
  })
})
