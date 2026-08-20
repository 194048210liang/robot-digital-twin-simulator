export type JointGroup = 'torso' | 'arm' | 'head' | 'gripper'
export type JointKind = 'revolute' | 'prismatic' | 'virtual'
export type MotionState = 'idle' | 'running' | 'paused' | 'stopped' | 'error'
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'
export type SafetyState = 'normal' | 'warning' | 'error'
export type LogLevel = 'info' | 'warning' | 'error'
export type LogChannel = 'alarm' | 'command' | 'communication'
export type TransportDirection = 'TX' | 'RX' | 'SYS'
export type RobotLogSource =
  | 'COMMUNICATION'
  | 'MOCK'
  | 'MODEL'
  | 'TRAJECTORY'
  | 'SIMULATION'
  | 'STATE'
  | 'CONTROL'
  | 'SIMULATOR'
  | 'VALIDATION'
export type RobotLogStatus = 'SUCCESS' | 'SENT' | 'WARNING' | 'ERROR' | 'NONE'
export type TranslationParams = Record<string, string | number>
export interface TranslationDescriptor {
  key: string
  params?: TranslationParams
}

export interface JointDefinition {
  id: string
  urdfNames: string[]
  displayName: string
  group: JointGroup
  kind: JointKind
  min: number
  max: number
  home: number
  maxVelocity: number
  displayScale: number
  displayUnit: '°' | 'm' | 'mm'
  displayDecimals: number
}

export interface JointState extends JointDefinition {
  current: number
  target: number
  velocity: number
}

export interface RobotModelProfile {
  name: string
  fileName: string
  tcpLinkName: string
  joints: JointDefinition[]
}

export interface TcpPose {
  x: number
  y: number
  z: number
  rx: number
  ry: number
  rz: number
}

export interface TcpState {
  pose: TcpPose
  sourceLink: string
  timestamp: number
}

export interface RobotLog {
  id: number
  time: string
  level: LogLevel
  channel: LogChannel
  direction: TransportDirection
  source: RobotLogSource
  code: string
  messageKey: string
  messageParams?: TranslationParams
  detailsKey?: string
  detailsParams?: TranslationParams
  detailsText?: string
  latency?: number
  status: RobotLogStatus
}

export type RobotCommand =
  | { type: 'SET_JOINT_TARGET'; jointId: string; target: number }
  | { type: 'RUN' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'STOP' }
  | { type: 'HOME' }
  | { type: 'SET_SPEED_SCALE'; scale: number }

export interface TransportAck {
  accepted: boolean
  latency: number
  message: string
}
