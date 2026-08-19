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

  it('拒绝连续添加完全相同的姿态', () => {
    const store = useRobotTaskStore()
    const targets = taskStep().targets
    expect(store.addDraftStep(targets, 0.5)).not.toBeNull()
    expect(store.addDraftStep(targets, 0.8)).toBeNull()
    expect(store.draftError).toBe('当前姿态与上一个姿态相同')
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
