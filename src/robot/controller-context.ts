import { inject, type InjectionKey } from 'vue'
import type { RobotController } from './robot-controller'

export const robotControllerKey: InjectionKey<RobotController> = Symbol('robot-controller')

export function useRobotController() {
  const controller = inject(robotControllerKey)
  if (!controller) throw new Error('RobotController 未初始化')
  return controller
}
