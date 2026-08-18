<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import {
  faCamera,
  faCompress,
  faHouse,
  faRotate,
  faTableCellsLarge,
} from '@fortawesome/free-solid-svg-icons'
import { RobotScene } from '@/graphics/robot-scene'
import { useRobotStore } from '@/stores/robot'

const store = useRobotStore()
const container = ref<HTMLElement>()
const scene = ref<RobotScene>()
const autoRotating = ref(false)
const gridVisible = ref(true)

onMounted(async () => {
  if (!container.value) return
  scene.value = new RobotScene(container.value, {
    onFps: (fps) => (store.fps = fps),
    onTcpPose: store.setTcpPose,
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
    scene.value.fitCamera()
  } catch {
    // 错误已通过场景回调写入状态与日志。
  }
})

watch(
  () => store.joints.map((joint) => joint.current),
  () => scene.value?.setJointValues(store.joints),
)

onBeforeUnmount(() => scene.value?.dispose())

function toggleAutoRotate() {
  autoRotating.value = scene.value?.toggleAutoRotate() ?? false
}

function toggleGrid() {
  gridVisible.value = scene.value?.toggleGrid() ?? true
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
      <div class="viewport-tools" role="toolbar" aria-label="三维视图工具">
        <button title="适配模型" aria-label="适配模型" @click="scene?.fitCamera()">
          <FontAwesomeIcon :icon="faHouse" />
        </button>
        <button title="全屏" aria-label="全屏" @click="scene?.requestFullscreen()">
          <FontAwesomeIcon :icon="faCompress" />
        </button>
        <button
          :class="{ active: autoRotating }"
          title="自动旋转"
          aria-label="自动旋转"
          @click="toggleAutoRotate"
        >
          <FontAwesomeIcon :icon="faRotate" />
        </button>
        <button :class="{ active: gridVisible }" title="网格" aria-label="网格" @click="toggleGrid">
          <FontAwesomeIcon :icon="faTableCellsLarge" />
        </button>
        <button title="保存截图" aria-label="保存截图" @click="scene?.downloadScreenshot()">
          <FontAwesomeIcon :icon="faCamera" />
        </button>
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
  padding: 0 12px;
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
  background: radial-gradient(circle at 48% 36%, #fff 0, #f8fafc 58%, #edf2f6 100%);
}
.scene-host :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}
.viewport-tools {
  position: absolute;
  z-index: 2;
  top: 12px;
  right: 12px;
  display: flex;
  border: 1px solid var(--line-300);
  border-radius: var(--radius-sm);
  overflow: hidden;
  box-shadow: 0 1px 4px rgb(25 42 60 / 8%);
}
.viewport-tools button {
  width: 38px;
  height: 36px;
  border: 0;
  border-right: 1px solid var(--line-200);
  background: rgb(255 255 255 / 94%);
  cursor: pointer;
}
.viewport-tools button:last-child {
  border-right: 0;
}
.viewport-tools button:hover,
.viewport-tools button.active {
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
