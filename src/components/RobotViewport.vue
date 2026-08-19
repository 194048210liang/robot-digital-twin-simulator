<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import {
  faCamera,
  faCompress,
  faCrosshairs,
  faEraser,
  faHouse,
  faRotate,
  faRoute,
  faTableCellsLarge,
} from '@fortawesome/free-solid-svg-icons'
import { RobotScene } from '@/graphics/robot-scene'
import { useRobotStore } from '@/stores/robot'
import { useTrajectoryStore } from '@/stores/trajectory'

const store = useRobotStore()
const trajectory = useTrajectoryStore()
const container = ref<HTMLElement>()
const scene = shallowRef<RobotScene>()
const autoRotating = ref(false)
const gridVisible = ref(true)

onMounted(async () => {
  if (!container.value) return
  scene.value = new RobotScene(container.value, {
    onFps: (fps) => (store.fps = fps),
    onTcpState: (state) => {
      store.setTcpState(state)
      trajectory.sample(state, store.motionState === 'running')
    },
    onModelLoaded: () => {
      store.modelLoaded = true
      store.modelError = ''
      store.addLog({
        level: 'info',
        channel: 'communication',
        direction: 'SYS',
        source: '模型',
        code: 'MOD-2001',
        message: 'URDF 加载成功：robot.urdf',
        details: 'Fetch mobile manipulator',
        status: '成功',
      })
    },
    onModelError: (message) => {
      store.modelError = message
      store.addLog({
        level: 'error',
        channel: 'alarm',
        direction: 'SYS',
        source: '模型',
        code: 'MOD-5001',
        message: 'URDF 模型加载失败',
        details: message,
        status: '错误',
      })
    },
  })
  try {
    await scene.value.loadRobot(`${import.meta.env.BASE_URL}robot.urdf`)
    scene.value.setJointValues(store.joints)
    scene.value.setTcpFrameVisible(trajectory.tcpFrameVisible)
    scene.value.setTrajectoryVisible(trajectory.trajectoryVisible)
    scene.value.setTrajectory(trajectory.points)
    scene.value.fitCamera()
  } catch {
    // 错误已通过场景回调写入状态与日志。
  }
})

watch(
  () => store.joints.map((joint) => joint.current),
  () => scene.value?.setJointValues(store.joints),
)

watch(
  () => trajectory.revision,
  () => scene.value?.setTrajectory(trajectory.points),
)

watch(
  () => trajectory.tcpFrameVisible,
  (visible) => scene.value?.setTcpFrameVisible(visible),
)

watch(
  () => trajectory.trajectoryVisible,
  (visible) => scene.value?.setTrajectoryVisible(visible),
)

onBeforeUnmount(() => scene.value?.dispose())

function toggleAutoRotate() {
  autoRotating.value = scene.value?.toggleAutoRotate() ?? false
}

function toggleGrid() {
  gridVisible.value = scene.value?.toggleGrid() ?? true
}

function clearTrajectory() {
  const pointCount = trajectory.pointCount
  if (pointCount === 0) return
  trajectory.clear()
  store.addLog({
    level: 'info',
    channel: 'command',
    direction: 'SYS',
    source: '轨迹',
    code: 'TRAJECTORY-CLEAR',
    message: '已清空 TCP 运动轨迹',
    details: `移除 ${pointCount} 个轨迹点`,
    status: '成功',
  })
}
</script>

<template>
  <section class="viewport panel" aria-labelledby="viewport-title">
    <header class="panel-title"><h2 id="viewport-title">3D 视图</h2></header>
    <div ref="container" class="scene-host">
      <div v-if="!store.modelLoaded && !store.modelError" class="scene-notice">
        <span class="spinner" />正在加载 Fetch URDF…
      </div>
      <div v-if="store.modelError" class="scene-notice error">
        模型加载失败：{{ store.modelError }}
      </div>
      <ElButtonGroup class="viewport-tools" role="toolbar" aria-label="三维视图工具">
        <ElTooltip content="适配模型" placement="bottom">
          <ElButton aria-label="适配模型" @click="scene?.fitCamera()">
            <FontAwesomeIcon :icon="faHouse" />
          </ElButton>
        </ElTooltip>
        <ElTooltip content="全屏" placement="bottom">
          <ElButton aria-label="全屏" @click="scene?.requestFullscreen()">
            <FontAwesomeIcon :icon="faCompress" />
          </ElButton>
        </ElTooltip>
        <ElTooltip content="自动旋转" placement="bottom">
          <ElButton
            :class="{ active: autoRotating }"
            aria-label="自动旋转"
            @click="toggleAutoRotate"
          >
            <FontAwesomeIcon :icon="faRotate" />
          </ElButton>
        </ElTooltip>
        <ElTooltip content="显示网格" placement="bottom">
          <ElButton :class="{ active: gridVisible }" aria-label="显示网格" @click="toggleGrid">
            <FontAwesomeIcon :icon="faTableCellsLarge" />
          </ElButton>
        </ElTooltip>
        <ElTooltip content="TCP 坐标系" placement="bottom">
          <ElButton
            :class="{ active: trajectory.tcpFrameVisible }"
            :aria-pressed="trajectory.tcpFrameVisible"
            aria-label="TCP 坐标系"
            @click="trajectory.toggleTcpFrame()"
          >
            <FontAwesomeIcon :icon="faCrosshairs" />
          </ElButton>
        </ElTooltip>
        <ElTooltip content="运动轨迹" placement="bottom">
          <ElButton
            :class="{ active: trajectory.trajectoryVisible }"
            :aria-pressed="trajectory.trajectoryVisible"
            aria-label="运动轨迹"
            @click="trajectory.toggleTrajectory()"
          >
            <FontAwesomeIcon :icon="faRoute" />
          </ElButton>
        </ElTooltip>
        <ElTooltip content="清空轨迹" placement="bottom">
          <ElButton
            aria-label="清空轨迹"
            :disabled="trajectory.pointCount === 0"
            @click="clearTrajectory"
          >
            <FontAwesomeIcon :icon="faEraser" />
          </ElButton>
        </ElTooltip>
        <ElTooltip content="保存截图" placement="bottom">
          <ElButton aria-label="保存截图" @click="scene?.downloadScreenshot()">
            <FontAwesomeIcon :icon="faCamera" />
          </ElButton>
        </ElTooltip>
      </ElButtonGroup>
      <div v-if="trajectory.pointCount > 0" class="trajectory-status" aria-live="polite">
        TCP 轨迹 {{ trajectory.pointCount }} 点
      </div>
      <div class="axis-legend" aria-hidden="true">
        <i class="z" /> <b>Z</b><i class="y" /> <b>Y</b><i class="x" /> <b>X</b>
      </div>
    </div>
  </section>
</template>

<style scoped>
.viewport {
  min-width: 0;
  overflow: hidden;
}
.panel-title {
  height: 38px;
  display: flex;
  align-items: center;
  padding: 0 14px;
  border-bottom: 1px solid var(--line-200);
  background: #fbfcfd;
}
.panel-title h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 650;
}
.scene-host {
  position: relative;
  height: calc(100% - 38px);
  min-height: 0;
  overflow: hidden;
  background: #e2e8ee;
}
.scene-host :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}
.viewport-tools {
  position: absolute;
  z-index: 2;
  top: 14px;
  right: 14px;
  box-shadow: 0 1px 4px rgb(25 42 60 / 8%);
}
.viewport-tools :deep(.el-button) {
  width: 38px;
  height: 36px;
  padding: 0;
  background: rgb(255 255 255 / 94%);
}
.viewport-tools :deep(.el-button:hover),
.viewport-tools :deep(.el-button.active) {
  border-color: var(--blue-600);
  color: var(--blue-700);
  background: var(--blue-100);
}
.scene-notice {
  position: absolute;
  z-index: 3;
  left: 50%;
  top: 50%;
  display: flex;
  align-items: center;
  gap: 10px;
  transform: translate(-50%, -50%);
  color: var(--ink-500);
}
.scene-notice.error {
  color: var(--red-600);
}
.trajectory-status {
  position: absolute;
  z-index: 2;
  right: 14px;
  bottom: 14px;
  padding: 5px 9px;
  border: 1px solid rgb(117 145 169 / 55%);
  border-radius: var(--radius-sm);
  color: var(--ink-700);
  background: rgb(255 255 255 / 88%);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid var(--line-300);
  border-top-color: var(--blue-600);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.axis-legend {
  position: absolute;
  left: 22px;
  bottom: 18px;
  display: none;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
