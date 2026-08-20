<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
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
import type { TranslationDescriptor } from '@/robot/types'

const store = useRobotStore()
const taskStore = useRobotTaskStore()
const trajectory = useTrajectoryStore()
const validation = useValidationStore()
const { locale, t } = useI18n()
const container = ref<HTMLElement>()
const modelFilesInput = ref<HTMLInputElement>()
const modelFolderInput = ref<HTMLInputElement>()
const scene = shallowRef<RobotScene>()
const autoRotating = ref(false)
const gridVisible = ref(true)
const modelLoading = ref(false)

function translatedText(value: TranslationDescriptor) {
  return t(value.key, value.params ?? {})
}

onMounted(async () => {
  if (!container.value) return
  scene.value = new RobotScene(container.value, {
    onFps: (fps) => (store.fps = fps),
    translate: translatedText,
    onTcpState: (state) => {
      store.setTcpState(state)
      trajectory.sample(state, store.motionState === 'running')
      validation.sample(store.joints, state.pose, Math.max(0, taskStore.runtime.currentStepIndex))
    },
    onModelLoaded: (profile) => {
      validation.finish('stopped', t('robot.messages.modelChanged'))
      store.setModelProfile(profile)
      taskStore.clearDraft()
      trajectory.clear()
      store.addLog({
        level: 'info',
        channel: 'communication',
        direction: 'SYS',
        source: 'MODEL',
        code: 'MOD-2001',
        messageKey: 'robot.messages.modelLoadedLog',
        messageParams: { fileName: profile.fileName },
        detailsKey: 'robot.messages.modelLoadedDetails',
        detailsParams: {
          name: profile.name,
          count: profile.joints.length,
          tcp: profile.tcpLinkName ? ` · TCP ${profile.tcpLinkName}` : '',
        },
        status: 'SUCCESS',
      })
    },
    onModelError: (error) => {
      store.modelError = error
      store.addLog({
        level: 'error',
        channel: 'alarm',
        direction: 'SYS',
        source: 'MODEL',
        code: 'MOD-5001',
        messageKey: 'robot.messages.modelLoadError',
        detailsKey: error.key,
        detailsParams: error.params,
        status: 'ERROR',
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
    // The scene callback has already reported the error to application state and logs.
  }
})

watch(
  () => store.joints.map((joint) => joint.current),
  () => scene.value?.setJointValues(store.joints),
)

watch(locale, () => scene.value?.updateAccessibilityLabel())

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
    source: 'TRAJECTORY',
    code: 'TRAJECTORY-CLEAR',
    messageKey: 'robot.messages.trajectoryCleared',
    detailsKey: 'robot.messages.trajectoryClearedDetails',
    detailsParams: { count: pointCount },
    status: 'SUCCESS',
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
  store.modelError = null
  try {
    const profile = await scene.value.loadRobotFiles(files)
    scene.value.setJointValues(store.joints)
    scene.value.setTcpFrameVisible(trajectory.tcpFrameVisible)
    scene.value.setTrajectoryVisible(trajectory.trajectoryVisible)
    scene.value.setTrajectory(trajectory.points)
    ElMessage.success(
      t('robot.messages.modelLoaded', { name: profile.name, count: profile.joints.length }),
    )
  } catch {
    const message = store.modelError ? translatedText(store.modelError) : t('robot.modelLoadFailed')
    if (wasLoaded) {
      store.modelLoaded = true
      store.modelError = null
    }
    ElMessage.error(message)
  } finally {
    modelLoading.value = false
  }
}
</script>

<template>
  <section class="viewport panel" aria-labelledby="viewport-title">
    <header class="panel-title">
      <h2 id="viewport-title">{{ t('robot.viewport') }}</h2>
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
          {{ t('robot.importUrdf') }}
        </ElButton>
        <template #dropdown>
          <ElDropdownMenu>
            <ElDropdownItem command="files">{{ t('robot.chooseUrdfFiles') }}</ElDropdownItem>
            <ElDropdownItem command="folder">{{ t('robot.chooseModelFolder') }}</ElDropdownItem>
          </ElDropdownMenu>
        </template>
      </ElDropdown>
    </header>
    <div ref="container" class="scene-host">
      <div v-if="!store.modelLoaded && !store.modelError" class="scene-notice">
        <span class="spinner" />{{
          modelLoading ? t('robot.parsingUrdf') : t('robot.loadingDefaultUrdf')
        }}
      </div>
      <div v-if="store.modelError" class="scene-notice error">
        {{
          t('robot.modelLoadFailedWithReason', {
            reason: translatedText(store.modelError),
          })
        }}
      </div>
      <ElButtonGroup class="viewport-tools" role="toolbar" :aria-label="t('robot.viewportAria')">
        <ElTooltip :content="t('robot.fitModel')" placement="bottom">
          <ElButton :aria-label="t('robot.fitModel')" @click="scene?.fitCamera()">
            <FontAwesomeIcon :icon="faHouse" />
          </ElButton>
        </ElTooltip>
        <ElTooltip :content="t('robot.fullscreen')" placement="bottom">
          <ElButton :aria-label="t('robot.fullscreen')" @click="scene?.requestFullscreen()">
            <FontAwesomeIcon :icon="faCompress" />
          </ElButton>
        </ElTooltip>
        <ElTooltip :content="t('robot.autoRotate')" placement="bottom">
          <ElButton
            :class="{ active: autoRotating }"
            :aria-label="t('robot.autoRotate')"
            @click="toggleAutoRotate"
          >
            <FontAwesomeIcon :icon="faRotate" />
          </ElButton>
        </ElTooltip>
        <ElTooltip :content="t('robot.showGrid')" placement="bottom">
          <ElButton
            :class="{ active: gridVisible }"
            :aria-label="t('robot.showGrid')"
            @click="toggleGrid"
          >
            <FontAwesomeIcon :icon="faTableCellsLarge" />
          </ElButton>
        </ElTooltip>
        <ElTooltip :content="t('robot.tcpFrame')" placement="bottom">
          <ElButton
            :class="{ active: trajectory.tcpFrameVisible }"
            :aria-pressed="trajectory.tcpFrameVisible"
            :aria-label="t('robot.tcpFrame')"
            @click="trajectory.toggleTcpFrame()"
          >
            <FontAwesomeIcon :icon="faCrosshairs" />
          </ElButton>
        </ElTooltip>
        <ElTooltip :content="t('robot.motionTrajectory')" placement="bottom">
          <ElButton
            :class="{ active: trajectory.trajectoryVisible }"
            :aria-pressed="trajectory.trajectoryVisible"
            :aria-label="t('robot.motionTrajectory')"
            @click="trajectory.toggleTrajectory()"
          >
            <FontAwesomeIcon :icon="faRoute" />
          </ElButton>
        </ElTooltip>
        <ElTooltip :content="t('robot.clearTrajectory')" placement="bottom">
          <ElButton
            :aria-label="t('robot.clearTrajectory')"
            :disabled="trajectory.pointCount === 0"
            @click="clearTrajectory"
          >
            <FontAwesomeIcon :icon="faEraser" />
          </ElButton>
        </ElTooltip>
        <ElTooltip :content="t('robot.saveScreenshot')" placement="bottom">
          <ElButton :aria-label="t('robot.saveScreenshot')" @click="scene?.downloadScreenshot()">
            <FontAwesomeIcon :icon="faCamera" />
          </ElButton>
        </ElTooltip>
      </ElButtonGroup>
      <div v-if="trajectory.pointCount > 0" class="trajectory-status" aria-live="polite">
        {{ t('robot.trajectoryPoints', { count: trajectory.pointCount }) }}
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
