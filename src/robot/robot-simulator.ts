import type { useRobotStore } from '@/stores/robot'
import { getSimulationVelocity } from './config'

const MAX_FRAME_DELTA_SECONDS = 0.1

export function advancePosition(current: number, target: number, maxDelta: number) {
  const delta = target - current
  if (Math.abs(delta) <= maxDelta) return target
  return current + Math.sign(delta) * maxDelta
}

export class RobotSimulator {
  private frameId = 0
  private lastTime = 0
  private motionActive = false

  constructor(private readonly store: ReturnType<typeof useRobotStore>) {}

  start() {
    if (this.frameId) return
    this.lastTime = performance.now()
    this.frameId = requestAnimationFrame(this.tick)
  }

  dispose() {
    cancelAnimationFrame(this.frameId)
    this.frameId = 0
  }

  markMotionStarted() {
    this.motionActive = true
  }

  setJointPosition(jointId: string, position: number) {
    const joint = this.store.findJoint(jointId)
    if (!joint) return false
    joint.current = position
    joint.target = position
    joint.velocity = 0
    this.motionActive = false
    this.store.motionState = 'idle'
    return true
  }

  stopMotion() {
    this.motionActive = false
    for (const joint of this.store.joints) {
      joint.target = joint.current
      joint.velocity = 0
    }
  }

  private readonly tick = (now: number) => {
    const deltaSeconds = Math.min((now - this.lastTime) / 1000, MAX_FRAME_DELTA_SECONDS)
    this.lastTime = now

    if (this.store.motionState === 'running') {
      let allArrived = true
      for (const joint of this.store.joints) {
        const previous = joint.current
        const maxDelta = getSimulationVelocity(joint) * this.store.speedScale * deltaSeconds
        joint.current = advancePosition(joint.current, joint.target, maxDelta)
        joint.velocity = deltaSeconds > 0 ? (joint.current - previous) / deltaSeconds : 0
        if (Math.abs(joint.target - joint.current) > 0.00001) allArrived = false
      }

      if (allArrived && this.motionActive) {
        this.motionActive = false
        this.store.motionState = 'idle'
        for (const joint of this.store.joints) joint.velocity = 0
        this.store.addLog({
          level: 'info',
          channel: 'command',
          direction: 'RX',
          source: 'SIMULATOR',
          code: 'MOTION-COMPLETE',
          messageKey: 'robot.messages.targetReached',
          detailsKey: 'robot.messages.allJointsReached',
          status: 'SUCCESS',
        })
      }
    } else {
      for (const joint of this.store.joints) joint.velocity = 0
    }

    this.frameId = requestAnimationFrame(this.tick)
  }
}
