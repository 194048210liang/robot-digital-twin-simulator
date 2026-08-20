import { toDisplayValue } from './config'
import type { RobotCommand, TranslationParams } from './types'
import type { RobotSimulator } from './robot-simulator'
import type { useRobotStore } from '@/stores/robot'
import type { RobotTransport } from '@/transport/robot-transport'

export function isTargetWithinLimits(value: number, min: number, max: number) {
  return Number.isFinite(value) && value >= min && value <= max
}

export class RobotController {
  constructor(
    private readonly store: ReturnType<typeof useRobotStore>,
    private readonly transport: RobotTransport,
    private readonly simulator: RobotSimulator,
  ) {}

  async connect() {
    if (this.store.connectionState === 'connected') return
    this.store.connectionState = 'connecting'
    try {
      await this.transport.connect()
      this.store.connectionState = 'connected'
      this.store.addLog({
        level: 'info',
        channel: 'communication',
        direction: 'SYS',
        source: 'COMMUNICATION',
        code: 'CON-100',
        messageKey: 'robot.messages.controllerConnected',
        detailsKey: 'tcp.feedbackCycle',
        detailsText: '20 ms',
        status: 'SUCCESS',
      })
    } catch (error) {
      this.store.connectionState = 'error'
      this.store.safetyState = 'error'
      this.store.addLog({
        level: 'error',
        channel: 'alarm',
        direction: 'SYS',
        source: 'COMMUNICATION',
        code: 'CON-500',
        messageKey: 'robot.messages.controllerConnectFailed',
        detailsText: error instanceof Error ? error.message : undefined,
        detailsKey: error instanceof Error ? undefined : 'common.unknownError',
        status: 'ERROR',
      })
    }
  }

  setJointTarget(jointId: string, target: number) {
    const joint = this.store.findJoint(jointId)
    if (!joint) return false
    if (!isTargetWithinLimits(target, joint.min, joint.max)) {
      this.store.safetyState = 'warning'
      this.store.addLog({
        level: 'warning',
        channel: 'alarm',
        direction: 'SYS',
        source: 'CONTROL',
        code: 'JOINT-LIMIT',
        messageKey: 'joint.messages.positionOutOfLimit',
        messageParams: { name: joint.displayName },
        detailsText: `${toDisplayValue(joint, target).toFixed(joint.displayDecimals)} ${joint.displayUnit}`,
        status: 'WARNING',
      })
      return false
    }

    joint.target = target
    this.store.selectedJointId = jointId
    this.store.safetyState = 'normal'
    void this.send(
      { type: 'SET_JOINT_TARGET', jointId, target },
      'robot.messages.jointTargetUpdated',
      {
        name: joint.displayName,
        value: toDisplayValue(joint, target).toFixed(joint.displayDecimals),
        unit: joint.displayUnit,
      },
    )
    return true
  }

  teachJointPosition(jointId: string, position: number) {
    const joint = this.store.findJoint(jointId)
    if (
      !joint ||
      !this.store.modelLoaded ||
      this.store.motionState === 'running' ||
      this.store.motionState === 'paused'
    ) {
      return false
    }
    if (!isTargetWithinLimits(position, joint.min, joint.max)) return false

    this.store.selectedJointId = jointId
    this.store.safetyState = 'normal'
    return this.simulator.setJointPosition(jointId, position)
  }

  jogJoint(jointId: string, internalDelta: number) {
    const joint = this.store.findJoint(jointId)
    if (!joint) return
    this.setJointTarget(
      jointId,
      Math.min(joint.max, Math.max(joint.min, joint.target + internalDelta)),
    )
  }

  setSpeedScale(scale: number) {
    this.store.speedScale = Math.min(1, Math.max(0.1, scale))
    void this.send(
      { type: 'SET_SPEED_SCALE', scale: this.store.speedScale },
      'robot.messages.speedScaleUpdated',
    )
  }

  async execute() {
    if (!this.ensureReady()) return
    if (this.store.motionState === 'running' || this.store.motionState === 'paused') return
    this.store.motionState = 'running'
    this.simulator.markMotionStarted()
    await this.send({ type: 'RUN' }, 'robot.messages.executeJointTargets')
  }

  async pause() {
    if (this.store.motionState !== 'running') return
    this.store.motionState = 'paused'
    await this.send({ type: 'PAUSE' }, 'robot.messages.motionPaused')
  }

  async resume() {
    if (this.store.motionState !== 'paused') return
    this.store.motionState = 'running'
    await this.send({ type: 'RESUME' }, 'robot.messages.motionResumed')
  }

  async stop() {
    this.simulator.stopMotion()
    this.store.motionState = 'stopped'
    await this.send({ type: 'STOP' }, 'robot.messages.motionStopped')
  }

  home() {
    if (!this.ensureReady()) return
    for (const joint of this.store.joints) joint.target = joint.home
    this.store.motionState = 'running'
    this.simulator.markMotionStarted()
    void this.send({ type: 'HOME' }, 'robot.messages.returnedHome')
  }

  private ensureReady() {
    if (this.store.connectionState === 'connected' && this.store.modelLoaded) return true
    this.store.addLog({
      level: 'warning',
      channel: 'alarm',
      direction: 'SYS',
      source: 'CONTROL',
      code: 'NOT-READY',
      messageKey: 'robot.messages.robotNotReady',
      detailsKey: 'robot.messages.checkModelAndController',
      status: 'WARNING',
    })
    return false
  }

  private async send(command: RobotCommand, messageKey: string, messageParams?: TranslationParams) {
    if (this.store.connectionState !== 'connected') return
    this.store.addLog({
      level: 'info',
      channel: 'communication',
      direction: 'TX',
      source: 'CONTROL',
      code: command.type,
      messageKey,
      messageParams,
      detailsText: JSON.stringify(command),
      status: 'SENT',
    })
    this.store.addLog({
      level: 'info',
      channel: 'command',
      direction: 'TX',
      source: 'CONTROL',
      code: command.type,
      messageKey,
      messageParams,
      detailsKey: 'robot.messages.commandSubmitted',
      status: 'SENT',
    })

    try {
      const ack = await this.transport.send(command)
      this.store.addLog({
        level: 'info',
        channel: 'communication',
        direction: 'RX',
        source: 'MOCK',
        code: 'ACK',
        messageKey: 'robot.messages.commandAccepted',
        messageParams: { command: command.type },
        detailsKey: 'robot.messages.roundTripTime',
        detailsParams: { value: ack.latency },
        latency: ack.latency,
        status: 'SUCCESS',
      })
    } catch (error) {
      this.store.connectionState = 'error'
      this.store.addLog({
        level: 'error',
        channel: 'alarm',
        direction: 'SYS',
        source: 'COMMUNICATION',
        code: 'SEND-ERROR',
        messageKey: 'robot.messages.commandFailed',
        detailsText: error instanceof Error ? error.message : undefined,
        detailsKey: error instanceof Error ? undefined : 'common.unknownError',
        status: 'ERROR',
      })
    }
  }
}
