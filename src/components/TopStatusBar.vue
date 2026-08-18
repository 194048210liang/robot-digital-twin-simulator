<script setup lang="ts">
import { computed } from 'vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import {
  faBox,
  faCircleCheck,
  faLink,
  faRobot,
  faShieldHalved,
} from '@fortawesome/free-solid-svg-icons'
import { useRobotStore } from '@/stores/robot'

defineProps<{ currentTime: string }>()
const store = useRobotStore()

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
    <div class="status-cell mode"><FontAwesomeIcon :icon="faBox" />仿真模式</div>
    <div class="status-cell"><FontAwesomeIcon class="ok" :icon="faCircleCheck" />系统就绪</div>
    <div class="status-cell"><FontAwesomeIcon class="ok" :icon="faShieldHalved" />安全正常</div>
    <div class="status-cell">
      <span class="label">模型：</span><FontAwesomeIcon :icon="faRobot" /> Fetch
    </div>
    <div class="status-cell"><FontAwesomeIcon class="connected" :icon="faLink" />Mock 已连接</div>
    <div class="status-cell"><span class="label">FPS：</span>{{ store.fps || '—' }}</div>
    <div class="status-cell motion"><span class="label">运动状态：</span>{{ motionLabel }}</div>
    <time class="clock">{{ currentTime }}</time>
  </div>
</template>

<style scoped>
.status-strip {
  height: 50px;
  display: grid;
  grid-template-columns: 136px 154px 156px 148px 164px 126px 1fr auto;
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
  padding: 0 20px;
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
.status-cell svg.ok,
.status-cell svg.connected {
  color: var(--green-600);
}
.label {
  color: var(--ink-700);
}
.motion {
  min-width: 150px;
}
.clock {
  padding: 0 23px;
  color: var(--ink-700);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
@media (max-width: 1280px) {
  .status-strip {
    grid-template-columns: repeat(6, auto) 1fr auto;
  }
  .status-cell {
    padding: 0 13px;
  }
}
</style>
