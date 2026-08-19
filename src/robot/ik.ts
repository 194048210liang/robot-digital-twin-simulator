export type IkSolverState = 'unavailable' | 'initializing' | 'ready' | 'error'
export type IkFailureReason =
  | 'solver-unavailable'
  | 'invalid-request'
  | 'unreachable'
  | 'joint-limit'
  | 'collision'
  | 'timeout'
  | 'cancelled'
  | 'solver-error'

export interface CartesianPosition {
  x: number
  y: number
  z: number
}

export interface UnitQuaternion {
  x: number
  y: number
  z: number
  w: number
}

export interface IkJointLimit {
  min: number
  max: number
}

export interface IkTarget {
  baseLink: string
  tcpLink: string
  positionMeters: CartesianPosition
  orientation: UnitQuaternion
}

export interface IkRequest {
  requestId: string
  target: IkTarget
  seedJointPositions: Record<string, number>
  jointLimits: Record<string, IkJointLimit>
  options: {
    timeoutMs: number
    maxSolutions: number
    positionToleranceMeters: number
    orientationToleranceRadians: number
    collisionCheck: boolean
  }
}

export interface IkSolution {
  jointPositions: Record<string, number>
  positionErrorMeters: number
  orientationErrorRadians: number
  cost: number
}

export type IkResult =
  | {
      ok: true
      requestId: string
      solutions: IkSolution[]
      solveTimeMs: number
    }
  | {
      ok: false
      requestId: string
      reason: IkFailureReason
      message: string
      solveTimeMs: number
    }

export interface InverseKinematicsSolver {
  readonly id: string
  readonly state: IkSolverState
  solve(request: IkRequest, signal?: AbortSignal): Promise<IkResult>
}
