import * as THREE from 'three'

export class TcpFrameHelper {
  private readonly axes: THREE.AxesHelper

  constructor(size = 0.16) {
    this.axes = new THREE.AxesHelper(size)
    this.axes.name = 'tcp-coordinate-frame'
  }

  attachTo(tcpObject: THREE.Object3D) {
    tcpObject.add(this.axes)
  }

  setVisible(visible: boolean) {
    this.axes.visible = visible
  }

  dispose() {
    this.axes.removeFromParent()
    this.axes.geometry.dispose()
    const materials = Array.isArray(this.axes.material) ? this.axes.material : [this.axes.material]
    for (const material of materials) material.dispose()
  }
}
