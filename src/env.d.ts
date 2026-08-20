/// <reference types="vite/client" />

declare module 'urdf-loader' {
  import type { LoadingManager, Material, Object3D } from 'three'

  export interface URDFJoint extends Object3D {
    jointType: 'fixed' | 'continuous' | 'revolute' | 'planar' | 'prismatic' | 'floating'
    limit: { lower: number; upper: number; effort: number; velocity: number }
    urdfNode: Element | null
    mimicJoint?: string
    setJointValue(...values: number[]): boolean
  }

  export interface URDFRobot extends Object3D {
    robotName: string
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
    workingPath: string
    packages: string | Record<string, string> | ((targetPackage: string) => string)
    loadMeshCb: MeshLoadCallback
    parse(content: string | Element | Document, workingPath?: string): URDFRobot
    load(
      url: string,
      onLoad: (robot: URDFRobot) => void,
      onProgress?: ((event: ProgressEvent) => void) | undefined,
      onError?: ((error: unknown) => void) | undefined,
    ): void
  }
}
