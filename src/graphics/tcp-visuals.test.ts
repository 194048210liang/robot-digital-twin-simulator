import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { TcpFrameHelper } from './tcp-frame-helper'
import { TrajectoryLine } from './trajectory-line'

describe('TCP visual helpers', () => {
  it('将 TCP 坐标系挂载到末端对象并支持显隐', () => {
    const tcpObject = new THREE.Object3D()
    const helper = new TcpFrameHelper()

    helper.attachTo(tcpObject)
    const axes = tcpObject.getObjectByName('tcp-coordinate-frame')
    expect(axes).toBeInstanceOf(THREE.AxesHelper)

    helper.setVisible(false)
    expect(axes?.visible).toBe(false)

    helper.dispose()
    expect(tcpObject.getObjectByName('tcp-coordinate-frame')).toBeUndefined()
  })

  it('更新并清除 TCP 轨迹线', () => {
    const robotRoot = new THREE.Object3D()
    const trajectory = new TrajectoryLine()

    trajectory.attachTo(robotRoot)
    trajectory.setPoints([
      { x: 0, y: 0, z: 0, timestamp: 0 },
      { x: 0.01, y: 0.02, z: 0.03, timestamp: 20 },
    ])

    const line = robotRoot.getObjectByName('tcp-trajectory') as THREE.Line | undefined
    expect(line).toBeInstanceOf(THREE.Line)
    expect(line?.geometry.drawRange.count).toBe(2)
    expect(line?.visible).toBe(true)

    trajectory.clear()
    expect(line?.geometry.drawRange.count).toBe(0)
    expect(line?.visible).toBe(false)

    trajectory.dispose()
    expect(robotRoot.getObjectByName('tcp-trajectory')).toBeUndefined()
  })
})
