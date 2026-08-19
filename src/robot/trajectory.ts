import type { TcpPose } from './types'

export interface TrajectoryPoint {
  x: number
  y: number
  z: number
  timestamp: number
}

export const MAX_TRAJECTORY_POINTS = 2000
export const MIN_TRAJECTORY_DISTANCE_METERS = 0.003
export const MAX_TRAJECTORY_SAMPLE_INTERVAL_MS = 80
const MIN_MOVEMENT_METERS = 0.0001

export function trajectoryDistance(a: TrajectoryPoint, b: Pick<TcpPose, 'x' | 'y' | 'z'>) {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
}

export function shouldSampleTrajectory(
  previous: TrajectoryPoint | undefined,
  pose: TcpPose,
  timestamp: number,
) {
  if (!previous) return true
  const distance = trajectoryDistance(previous, pose)
  if (distance < MIN_MOVEMENT_METERS) return false
  return (
    distance >= MIN_TRAJECTORY_DISTANCE_METERS ||
    timestamp - previous.timestamp >= MAX_TRAJECTORY_SAMPLE_INTERVAL_MS
  )
}
