import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'workstation',
      component: () => import('@/views/WorkstationView.vue'),
    },
  ],
})

export default router
