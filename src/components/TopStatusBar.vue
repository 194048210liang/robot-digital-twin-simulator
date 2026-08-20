<script setup lang="ts">
import { computed } from 'vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import {
  faCircleCheck,
  faCrosshairs,
  faRobot,
  faSliders,
  faWaveSquare,
} from '@fortawesome/free-solid-svg-icons'
import { useRobotStore } from '@/stores/robot'
import { useValidationStore } from '@/stores/validation'

defineProps<{ currentTime: string }>()
const store = useRobotStore()
const validation = useValidationStore()

const motionLabel = computed(() => {
  const labels = {
    idle: '待机',
    running: '运行中',
    paused: '已暂停',
    stopped: '已停止',
    error: '异常',
  }
  return labels[store.motionState]
})
</script>

<template>
  <div class="status-strip" aria-label="系统状态">
    <div class="status-cell mode">
      <FontAwesomeIcon class="ok" :icon="faCircleCheck" />仿真{{
        store.modelLoaded ? '就绪' : '加载中'
      }}
    </div>
    <div class="status-cell model">
      <span class="label">模型：</span><FontAwesomeIcon :icon="faRobot" />
      <span class="model-name" :title="store.modelName">{{ store.modelName }}</span>
    </div>
    <div class="status-cell">
      <FontAwesomeIcon :icon="faSliders" /><span class="label">可控关节：</span
      >{{ store.joints.length }}
    </div>
    <div class="status-cell tcp-source">
      <FontAwesomeIcon :icon="faCrosshairs" /><span class="label">TCP：</span>
      <span :title="store.tcpState.sourceLink">{{ store.tcpState.sourceLink || '未识别' }}</span>
    </div>
    <div class="status-cell">
      <FontAwesomeIcon :class="{ ok: validation.isRecording }" :icon="faWaveSquare" />
      <span class="label">采样：</span>{{ validation.isRecording ? '记录中' : '就绪' }}
    </div>
    <div class="status-cell"><span class="label">FPS：</span>{{ store.fps || '—' }}</div>
    <div class="status-cell motion"><span class="label">运动状态：</span>{{ motionLabel }}</div>
    <time class="clock">{{ currentTime }}</time>
  </div>
</template>

<style scoped>
.status-strip {
  height: 50px;
  display: grid;
  grid-template-columns: 142px minmax(170px, 1fr) 148px minmax(150px, 1fr) 142px 104px 156px auto;
  align-items: center;
  border-bottom: 1px solid var(--line-300);
  background: linear-gradient(#fff, #f6f8fa);
  box-shadow: 0 1px 2px rgb(24 39 55 / 6%);
}
.status-cell {
  height: 28px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 18px;
  border-right: 1px solid var(--line-200);
  white-space: nowrap;
}
.status-cell.mode {
  color: var(--blue-700);
  font-weight: 650;
}
.status-cell svg {
  color: var(--blue-600);
}
.status-cell svg.ok {
  color: var(--green-600);
}
.label {
  color: var(--ink-700);
}
.model-name {
  overflow: hidden;
  text-overflow: ellipsis;
}
.tcp-source > span:last-child {
  overflow: hidden;
  text-overflow: ellipsis;
}
.motion {
  min-width: 150px;
}
.clock {
  padding: 0 20px;
  color: var(--ink-700);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
@media (max-width: 1280px) {
  .status-strip {
    grid-template-columns: auto minmax(140px, 1fr) auto minmax(120px, 1fr) auto auto auto auto;
  }
  .status-cell {
    padding: 0 13px;
  }
}
</style>
