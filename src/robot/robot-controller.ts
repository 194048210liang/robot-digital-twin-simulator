import { toDisplayValue } from './config'
import type { RobotCommand } from './types'
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
        source: '通信',
        code: 'CON-100',
        message: '已连接到 Mock 控制器',
        details: '反馈周期 20 ms',
        status: '成功',
      })
    } catch (error) {
      this.store.connectionState = 'error'
      this.store.safetyState = 'error'
      this.store.addLog({
        level: 'error',
        channel: 'alarm',
        direction: 'SYS',
        source: '通信',
        code: 'CON-500',
        message: 'Mock 控制器连接失败',
        details: error instanceof Error ? error.message : '未知错误',
        status: '错误',
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
        source: '控制',
        code: 'JOINT-LIMIT',
        message: `${joint.displayName} 目标超出限位`,
        details: `${toDisplayValue(joint, target).toFixed(joint.displayDecimals)} ${joint.displayUnit}`,
        status: '警告',
      })
      return false
    }

    joint.target = target
    this.store.selectedJointId = jointId
    this.store.safetyState = 'normal'
    void this.send(
      { type: 'SET_JOINT_TARGET', jointId, target },
      `${joint.displayName} → ${toDisplayValue(joint, target).toFixed(joint.displayDecimals)} ${joint.displayUnit}`,
    )
    return true
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
    void this.send({ type: 'SET_SPEED_SCALE', scale: this.store.speedScale }, '速度倍率已更新')
  }

  async execute() {
    if (!this.ensureReady()) return
    if (this.store.motionState === 'running' || this.store.motionState === 'paused') return
    this.store.motionState = 'running'
    this.simulator.markMotionStarted()
    await this.send({ type: 'RUN' }, '开始执行关节目标')
  }

  async pause() {
    if (this.store.motionState !== 'running') return
    this.store.motionState = 'paused'
    await this.send({ type: 'PAUSE' }, '仿真运动已暂停')
  }

  async resume() {
    if (this.store.motionState !== 'paused') return
    this.store.motionState = 'running'
    await this.send({ type: 'RESUME' }, '继续执行未完成目标')
  }

  async stop() {
    this.simulator.stopMotion()
    this.store.motionState = 'stopped'
    await this.send({ type: 'STOP' }, '仿真运动已停止')
  }

  home() {
    if (!this.ensureReady()) return
    for (const joint of this.store.joints) joint.target = joint.home
    this.store.motionState = 'running'
    this.simulator.markMotionStarted()
    void this.send({ type: 'HOME' }, '机器人返回零位')
  }

  private ensureReady() {
    if (this.store.connectionState === 'connected' && this.store.modelLoaded) return true
    this.store.addLog({
      level: 'warning',
      channel: 'alarm',
      direction: 'SYS',
      source: '控制',
      code: 'NOT-READY',
      message: '机器人尚未就绪',
      details: '请确认模型与 Mock 控制器状态',
      status: '警告',
    })
    return false
  }

  private async send(command: RobotCommand, message: string) {
    if (this.store.connectionState !== 'connected') return
    this.store.addLog({
      level: 'info',
      channel: 'communication',
      direction: 'TX',
      source: '控制',
      code: command.type,
      message,
      details: JSON.stringify(command),
      status: '已发送',
    })
    this.store.addLog({
      level: 'info',
      channel: 'command',
      direction: 'TX',
      source: '控制',
      code: command.type,
      message,
      details: '命令已提交',
      status: '已发送',
    })

    try {
      const ack = await this.transport.send(command)
      this.store.addLog({
        level: 'info',
        channel: 'communication',
        direction: 'RX',
        source: 'Mock',
        code: 'ACK',
        message: ack.message,
        details: `往返时间 ${ack.latency} ms`,
        latency: ack.latency,
        status: '成功',
      })
    } catch (error) {
      this.store.connectionState = 'error'
      this.store.addLog({
        level: 'error',
        channel: 'alarm',
        direction: 'SYS',
        source: '通信',
        code: 'SEND-ERROR',
        message: '命令发送失败',
        details: error instanceof Error ? error.message : '未知错误',
        status: '错误',
      })
    }
  }
}
