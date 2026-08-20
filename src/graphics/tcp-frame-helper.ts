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

  detach() {
    this.axes.removeFromParent()
  }

  setVisible(visible: boolean) {
    this.axes.visible = visible
  }

  dispose() {
    this.detach()
    this.axes.geometry.dispose()
    const materials = Array.isArray(this.axes.material) ? this.axes.material : [this.axes.material]
    for (const material of materials) material.dispose()
  }
}
