<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import {
  faCamera,
  faCompress,
  faCrosshairs,
  faEraser,
  faFolderOpen,
  faHouse,
  faRotate,
  faRoute,
  faTableCellsLarge,
} from '@fortawesome/free-solid-svg-icons'
import { RobotScene } from '@/graphics/robot-scene'
import { jointDefinitions } from '@/robot/config'
import { useRobotStore } from '@/stores/robot'
import { useRobotTaskStore } from '@/stores/tasks'
import { useTrajectoryStore } from '@/stores/trajectory'
import { useValidationStore } from '@/stores/validation'

const store = useRobotStore()
const taskStore = useRobotTaskStore()
const trajectory = useTrajectoryStore()
const validation = useValidationStore()
const container = ref<HTMLElement>()
const modelFilesInput = ref<HTMLInputElement>()
const modelFolderInput = ref<HTMLInputElement>()
const scene = shallowRef<RobotScene>()
const autoRotating = ref(false)
const gridVisible = ref(true)
const modelLoading = ref(false)

onMounted(async () => {
  if (!container.value) return
  scene.value = new RobotScene(container.value, {
    onFps: (fps) => (store.fps = fps),
    onTcpState: (state) => {
      store.setTcpState(state)
      trajectory.sample(state, store.motionState === 'running')
      validation.sample(store.joints, state.pose, Math.max(0, taskStore.runtime.currentStepIndex))
    },
    onModelLoaded: (profile) => {
      validation.finish('stopped', '模型已切换')
      store.setModelProfile(profile)
      taskStore.clearDraft()
      trajectory.clear()
      store.addLog({
        level: 'info',
        channel: 'communication',
        direction: 'SYS',
        source: '模型',
        code: 'MOD-2001',
        message: `URDF 加载成功：${profile.fileName}`,
        details: `${profile.name} · ${profile.joints.length} 个可控关节${profile.tcpLinkName ? ` · TCP ${profile.tcpLinkName}` : ''}`,
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
    await scene.value.loadRobot(`${import.meta.env.BASE_URL}robot.urdf`, {
      name: 'Fetch',
      fileName: 'robot.urdf',
      tcpLinkName: 'gripper_link',
      joints: jointDefinitions,
    })
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

function chooseImportSource(command: string) {
  if (command === 'folder') modelFolderInput.value?.click()
  else modelFilesInput.value?.click()
}

async function importLocalModel(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (!files.length || !scene.value) return

  const wasLoaded = store.modelLoaded
  modelLoading.value = true
  store.modelLoaded = false
  store.modelError = ''
  try {
    const profile = await scene.value.loadRobotFiles(files)
    scene.value.setJointValues(store.joints)
    scene.value.setTcpFrameVisible(trajectory.tcpFrameVisible)
    scene.value.setTrajectoryVisible(trajectory.trajectoryVisible)
    scene.value.setTrajectory(trajectory.points)
    ElMessage.success(`已加载 ${profile.name}，解析 ${profile.joints.length} 个可控关节`)
  } catch (error) {
    if (wasLoaded) {
      store.modelLoaded = true
      store.modelError = ''
    }
    ElMessage.error(error instanceof Error ? error.message : 'URDF 模型加载失败')
  } finally {
    modelLoading.value = false
  }
}
</script>

<template>
  <section class="viewport panel" aria-labelledby="viewport-title">
    <header class="panel-title">
      <h2 id="viewport-title">3D 视图</h2>
      <input
        ref="modelFilesInput"
        class="model-input"
        type="file"
        multiple
        accept=".urdf,.stl,.dae,.png,.jpg,.jpeg"
        @change="importLocalModel"
      />
      <input
        ref="modelFolderInput"
        class="model-input"
        type="file"
        multiple
        webkitdirectory
        @change="importLocalModel"
      />
      <ElDropdown trigger="click" @command="chooseImportSource">
        <ElButton
          size="small"
          :loading="modelLoading"
          :disabled="store.motionState === 'running' || store.motionState === 'paused'"
        >
          <FontAwesomeIcon :icon="faFolderOpen" />
          导入 URDF
        </ElButton>
        <template #dropdown>
          <ElDropdownMenu>
            <ElDropdownItem command="files">选择 URDF 及资源文件</ElDropdownItem>
            <ElDropdownItem command="folder">选择模型文件夹</ElDropdownItem>
          </ElDropdownMenu>
        </template>
      </ElDropdown>
    </header>
    <div ref="container" class="scene-host">
      <div v-if="!store.modelLoaded && !store.modelError" class="scene-notice">
        <span class="spinner" />{{ modelLoading ? '正在解析 URDF…' : '正在加载默认 URDF…' }}
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
  justify-content: space-between;
  padding: 0 14px;
  border-bottom: 1px solid var(--line-200);
  background: #fbfcfd;
}
.panel-title :deep(.el-button) {
  gap: 7px;
}
.model-input {
  display: none;
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
