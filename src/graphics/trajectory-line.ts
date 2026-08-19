import * as THREE from 'three'
import { MAX_TRAJECTORY_POINTS, type TrajectoryPoint } from '@/robot/trajectory'

export class TrajectoryLine {
  private readonly positions = new Float32Array(MAX_TRAJECTORY_POINTS * 3)
  private readonly geometry = new THREE.BufferGeometry()
  private readonly material = new THREE.LineBasicMaterial({
    color: 0x0a69dc,
    transparent: true,
    opacity: 0.92,
  })
  private readonly line = new THREE.Line(this.geometry, this.material)
  private visible = true
  private count = 0

  constructor() {
    const positionAttribute = new THREE.BufferAttribute(this.positions, 3)
    positionAttribute.setUsage(THREE.DynamicDrawUsage)
    this.geometry.setAttribute('position', positionAttribute)
    this.geometry.setDrawRange(0, 0)
    this.line.name = 'tcp-trajectory'
    this.line.frustumCulled = false
    this.line.visible = false
  }

  attachTo(parent: THREE.Object3D) {
    parent.add(this.line)
  }

  setVisible(visible: boolean) {
    this.visible = visible
    this.line.visible = visible && this.count > 1
  }

  setPoints(points: TrajectoryPoint[]) {
    const pointCount = Math.min(points.length, MAX_TRAJECTORY_POINTS)
    const startIndex = points.length - pointCount
    for (let index = 0; index < pointCount; index += 1) {
      const point = points[startIndex + index]
      if (!point) continue
      const offset = index * 3
      this.positions[offset] = point.x
      this.positions[offset + 1] = point.y
      this.positions[offset + 2] = point.z
    }

    const positionAttribute = this.geometry.getAttribute('position')
    positionAttribute.needsUpdate = true
    this.geometry.setDrawRange(0, pointCount)
    if (pointCount > 1) this.geometry.computeBoundingSphere()
    else this.geometry.boundingSphere = null
    this.count = pointCount
    this.line.visible = this.visible && pointCount > 1
  }

  clear() {
    this.setPoints([])
  }

  dispose() {
    this.line.removeFromParent()
    this.geometry.dispose()
    this.material.dispose()
  }
}
