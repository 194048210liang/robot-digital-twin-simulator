<script setup lang="ts">
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { faHouse, faPause, faPlay, faStop } from '@fortawesome/free-solid-svg-icons'
import { useRobotController } from '@/robot/controller-context'
import { useRobotStore } from '@/stores/robot'

const controller = useRobotController()
const store = useRobotStore()
</script>

<template>
  <div class="motion-controls">
    <button class="primary" :disabled="store.motionState === 'running'" @click="controller.run()">
      <FontAwesomeIcon :icon="faPlay" />运行
    </button>
    <button @click="controller.pause()"><FontAwesomeIcon :icon="faPause" />暂停</button>
    <button @click="controller.home()"><FontAwesomeIcon :icon="faHouse" />回到零位</button>
    <button class="danger" @click="controller.stop()">
      <FontAwesomeIcon :icon="faStop" />仿真停止
    </button>
  </div>
</template>

<style scoped>
.motion-controls {
  height: 50px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}
button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: 1px solid var(--line-300);
  border-radius: var(--radius-sm);
  background: linear-gradient(#fff, #f5f7f9);
  font-weight: 600;
  cursor: pointer;
}
button:hover:not(:disabled) {
  border-color: var(--blue-600);
  color: var(--blue-700);
}
button.primary {
  border-color: var(--blue-700);
  color: #fff;
  background: linear-gradient(#1475e8, #075bc7);
}
button.danger {
  border-color: var(--red-700);
  color: #fff;
  background: linear-gradient(#ef3026, #d91f17);
}
button:disabled {
  opacity: 0.55;
  cursor: default;
}
</style>
