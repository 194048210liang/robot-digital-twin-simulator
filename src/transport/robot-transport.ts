import type { RobotCommand, TransportAck } from '@/robot/types'

export interface RobotTransport {
  connect(): Promise<void>
  disconnect(): Promise<void>
  send(command: RobotCommand): Promise<TransportAck>
}
