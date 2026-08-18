import type { RobotCommand, TransportAck } from '@/robot/types'
import type { RobotTransport } from './robot-transport'

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds))

export class MockTransport implements RobotTransport {
  private connected = false

  async connect() {
    await wait(220)
    this.connected = true
  }

  async disconnect() {
    this.connected = false
  }

  async send(command: RobotCommand): Promise<TransportAck> {
    if (!this.connected) throw new Error('Mock transport is not connected')
    const latency = 14 + Math.round(Math.random() * 10)
    await wait(latency)
    return {
      accepted: true,
      latency,
      message: `${command.type} accepted`,
    }
  }
}
