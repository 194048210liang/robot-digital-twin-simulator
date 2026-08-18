/// <reference types="vite/client" />

declare module 'urdf-loader' {
  import type { LoadingManager, Material, Object3D } from 'three'

  export interface URDFJoint extends Object3D {
    jointType: string
    limit: { lower: number; upper: number }
    setJointValue(...values: number[]): boolean
  }

  export interface URDFRobot extends Object3D {
    joints: Record<string, URDFJoint>
    links: Record<string, Object3D>
    setJointValue(name: string, ...values: number[]): boolean
  }

  export type MeshLoadCallback = (
    path: string,
    manager: LoadingManager,
    material: Material | null,
    done: (object: Object3D | null, error?: unknown) => void,
  ) => void

  export default class URDFLoader {
    constructor(manager?: LoadingManager)
    parseCollision: boolean
    loadMeshCb: MeshLoadCallback
    load(
      url: string,
      onLoad: (robot: URDFRobot) => void,
      onProgress?: ((event: ProgressEvent) => void) | undefined,
      onError?: ((error: unknown) => void) | undefined,
    ): void
  }
}
