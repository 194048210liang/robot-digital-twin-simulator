<script setup lang="ts">
import { computed, ref } from 'vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { faForward, faHouse, faPause, faPlay, faStop } from '@fortawesome/free-solid-svg-icons'
import { useRobotController } from '@/robot/controller-context'
import { useRobotStore } from '@/stores/robot'

withDefaults(defineProps<{ showExecute?: boolean }>(), { showExecute: true })

const controller = useRobotController()
const store = useRobotStore()
const executeLoading = ref(false)
const stopLoading = ref(false)
const pausePending = ref(false)
const canExecute = computed(
  () =>
    store.connectionState === 'connected' &&
    store.modelLoaded &&
    store.motionState !== 'running' &&
    store.motionState !== 'paused' &&
    !stopLoading.value,
)
const canPauseOrResume = computed(
  () =>
    (store.motionState === 'running' || store.motionState === 'paused') &&
    !executeLoading.value &&
    !stopLoading.value &&
    !pausePending.value,
)
const canHome = computed(
  () =>
    store.connectionState === 'connected' &&
    store.modelLoaded &&
    store.motionState !== 'running' &&
    store.motionState !== 'paused' &&
    !executeLoading.value &&
    !stopLoading.value,
)

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds))

async function execute() {
  if (executeLoading.value || stopLoading.value) return
  executeLoading.value = true
  try {
    await Promise.all([controller.execute(), wait(320)])
  } finally {
    executeLoading.value = false
  }
}

async function pauseOrResume() {
  if (!canPauseOrResume.value) return
  pausePending.value = true
  try {
    if (store.motionState === 'paused') await controller.resume()
    else await controller.pause()
  } finally {
    pausePending.value = false
  }
}

async function stop() {
  if (stopLoading.value) return
  stopLoading.value = true
  try {
    await Promise.all([controller.stop(), wait(320)])
  } finally {
    stopLoading.value = false
  }
}
</script>

<template>
  <div class="motion-controls">
    <ElButtonGroup class="motion-group" role="group" aria-label="运动控制">
      <ElButton
        v-if="showExecute"
        class="execute-button"
        type="primary"
        plain
        :loading="executeLoading"
        :disabled="!canExecute"
        @click="execute"
      >
        <FontAwesomeIcon v-if="!executeLoading" :icon="faPlay" />
        {{ executeLoading ? '执行中' : '执行' }}
      </ElButton>
      <ElButton :disabled="!canPauseOrResume" @click="pauseOrResume">
        <FontAwesomeIcon :icon="store.motionState === 'paused' ? faForward : faPause" />
        {{ store.motionState === 'paused' ? '继续' : '暂停' }}
      </ElButton>
      <ElButton :disabled="!canHome" @click="controller.home()">
        <FontAwesomeIcon :icon="faHouse" />回到零位
      </ElButton>
    </ElButtonGroup>
    <ElButton class="danger" type="danger" plain :loading="stopLoading" @click="stop">
      <FontAwesomeIcon v-if="!stopLoading" :icon="faStop" />
      {{ stopLoading ? '停止中' : '仿真停止' }}
    </ElButton>
  </div>
</template>

<style scoped>
.motion-controls {
  height: 50px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 7px 10px;
  background: #f5f7f9;
}
.motion-group {
  height: 34px;
}
.motion-group :deep(.el-button) {
  min-width: 108px;
  height: 34px;
  gap: 8px;
  padding: 0 18px;
  font-size: 13px;
  font-weight: 500;
}
.motion-group :deep(.el-button:last-child) {
  min-width: 124px;
}
.motion-group :deep(.execute-button) {
  min-width: 88px;
  color: var(--blue-700);
}
.motion-group :deep(.execute-button:hover:not(.is-disabled)),
.motion-group :deep(.execute-button:focus-visible) {
  border-color: var(--el-color-primary-light-5);
  color: var(--blue-700);
  background: #f8fbff;
}
.motion-controls :deep(.el-button.danger) {
  min-width: 112px;
  height: 34px;
  margin-left: auto;
  color: var(--red-700);
}
.motion-controls :deep(.el-button.danger:hover:not(.is-disabled)),
.motion-controls :deep(.el-button.danger:focus-visible) {
  border-color: #ee8b85;
  color: var(--red-700);
  background: #fffafa;
}
@media (max-width: 1320px) {
  .motion-controls {
    gap: 8px;
    padding-inline: 8px;
  }
  .motion-group :deep(.el-button) {
    min-width: 92px;
    padding: 0 12px;
  }
  .motion-group :deep(.el-button:last-child) {
    min-width: 108px;
  }
  .motion-controls :deep(.el-button.danger) {
    min-width: 108px;
  }
}
</style>
