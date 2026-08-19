import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  MAX_TRAJECTORY_POINTS,
  shouldSampleTrajectory,
  type TrajectoryPoint,
} from '@/robot/trajectory'
import type { TcpState } from '@/robot/types'

export const useTrajectoryStore = defineStore('trajectory', () => {
  const points = ref<TrajectoryPoint[]>([])
  const tcpFrameVisible = ref(true)
  const trajectoryVisible = ref(true)
  const revision = ref(0)
  const pointCount = computed(() => points.value.length)

  function sample(state: TcpState, isMoving: boolean, timestamp = state.timestamp) {
    if (!isMoving) return false
    const previous = points.value.at(-1)
    if (!shouldSampleTrajectory(previous, state.pose, timestamp)) return false

    points.value.push({ x: state.pose.x, y: state.pose.y, z: state.pose.z, timestamp })
    if (points.value.length > MAX_TRAJECTORY_POINTS) {
      points.value.splice(0, points.value.length - MAX_TRAJECTORY_POINTS)
    }
    revision.value += 1
    return true
  }

  function clear() {
    if (points.value.length === 0) return
    points.value = []
    revision.value += 1
  }

  function toggleTcpFrame() {
    tcpFrameVisible.value = !tcpFrameVisible.value
  }

  function toggleTrajectory() {
    trajectoryVisible.value = !trajectoryVisible.value
  }

  return {
    points,
    pointCount,
    revision,
    tcpFrameVisible,
    trajectoryVisible,
    sample,
    clear,
    toggleTcpFrame,
    toggleTrajectory,
  }
})
