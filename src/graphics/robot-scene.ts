import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import URDFLoader, { type URDFRobot } from 'urdf-loader'
import { TcpFrameHelper } from '@/graphics/tcp-frame-helper'
import { TrajectoryLine } from '@/graphics/trajectory-line'
import { createRobotModelProfile } from '@/robot/urdf-model'
import type { TrajectoryPoint } from '@/robot/trajectory'
import type {
  JointDefinition,
  JointState,
  RobotModelProfile,
  TcpState,
  TranslationDescriptor,
} from '@/robot/types'

interface RobotSceneCallbacks {
  onFps: (fps: number) => void
  onTcpState: (state: TcpState) => void
  onModelLoaded: (profile: RobotModelProfile) => void
  onModelError: (error: TranslationDescriptor) => void
  translate: (text: TranslationDescriptor) => string
}

interface RobotLoadOptions {
  name?: string
  fileName: string
  tcpLinkName?: string
  joints?: JointDefinition[]
}

const transparentPixel =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLqWQAAAABJRU5ErkJggg=='

class RobotSceneError extends Error {
  constructor(readonly translation: TranslationDescriptor) {
    super(translation.key)
  }
}

function sceneError(error: unknown, fallbackKey: string): TranslationDescriptor {
  return error instanceof RobotSceneError ? error.translation : { key: fallbackKey }
}

function normalizeAssetPath(path: string) {
  const withoutQuery = path.split(/[?#]/, 1)[0] ?? path
  let decoded = withoutQuery
  try {
    decoded = decodeURIComponent(withoutQuery)
  } catch {
    // Preserve the raw path so asset matching can still fall back to the file name.
  }
  const normalized = decoded
    .replace(/^package:\/\//i, '')
    .replace(/^[a-z]+:\/\/[^/]+\//i, '')
    .replace(/\\/g, '/')
  const segments: string[] = []
  for (const segment of normalized.split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') segments.pop()
    else segments.push(segment)
  }
  return segments.join('/').toLowerCase()
}

function directoryOf(path: string) {
  const separator = path.lastIndexOf('/')
  return separator < 0 ? '' : path.slice(0, separator + 1)
}

export class RobotScene {
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100)
  private readonly renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  })
  private readonly controls: OrbitControls
  private readonly grid = new THREE.GridHelper(8, 48, 0x879caf, 0xbac7d2)
  private readonly axes = new THREE.AxesHelper(0.28)
  private readonly tcpFrame = new TcpFrameHelper()
  private readonly trajectoryLine = new TrajectoryLine()
  private readonly resizeObserver: ResizeObserver
  private robot: URDFRobot | null = null
  private tcpLink: THREE.Object3D | null = null
  private localObjectUrls: string[] = []
  private animationFrame = 0
  private frames = 0
  private fpsStartedAt = performance.now()
  private lastTcpUpdate = 0
  private pendingJoints: JointState[] | null = null
  private readonly lastJointValues = new Map<string, number>()
  private needsRender = true
  private readonly tcpWorldPosition = new THREE.Vector3()
  private readonly tcpLocalPosition = new THREE.Vector3()
  private readonly rootQuaternion = new THREE.Quaternion()
  private readonly linkQuaternion = new THREE.Quaternion()
  private readonly relativeQuaternion = new THREE.Quaternion()
  private readonly tcpRotation = new THREE.Euler()

  constructor(
    private readonly container: HTMLElement,
    private readonly callbacks: RobotSceneCallbacks,
  ) {
    this.scene.background = new THREE.Color(0xe2e8ee)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.updateAccessibilityLabel()
    this.container.appendChild(this.renderer.domElement)

    this.camera.position.set(2.7, 1.9, 3.1)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.07
    this.controls.target.set(0, 0.85, 0)
    this.controls.minDistance = 0.5
    this.controls.maxDistance = 12

    const hemisphere = new THREE.HemisphereLight(0xffffff, 0x8c9aa8, 2.3)
    hemisphere.position.set(0, 5, 0)
    this.scene.add(hemisphere)

    const keyLight = new THREE.DirectionalLight(0xffffff, 3.4)
    keyLight.position.set(3.5, 6, 4)
    this.scene.add(keyLight)

    const fillLight = new THREE.DirectionalLight(0xbfdcff, 1.2)
    fillLight.position.set(-4, 2, -3)
    this.scene.add(fillLight)

    this.grid.material.transparent = true
    this.grid.material.opacity = 0.68
    this.grid.position.y = 0
    this.scene.add(this.grid)

    this.axes.position.set(-0.68, 0.015, 0.72)
    this.scene.add(this.axes)

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(0.48, 48),
      new THREE.MeshBasicMaterial({
        color: 0x617080,
        transparent: true,
        opacity: 0.09,
        depthWrite: false,
      }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.006
    ground.receiveShadow = true
    this.scene.add(ground)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(this.container)
    this.resize()
    this.animationFrame = requestAnimationFrame(this.render)
  }

  async loadRobot(url: string, options: RobotLoadOptions) {
    const manager = new THREE.LoadingManager()
    manager.setURLModifier((assetUrl) =>
      /\.png(?:$|\?)/i.test(assetUrl) ? transparentPixel : assetUrl,
    )
    const loader = this.createLoader(manager)

    await new Promise<RobotModelProfile>((resolve, reject) => {
      loader.load(
        url,
        (robot) => {
          const profile = createRobotModelProfile(
            robot,
            options.fileName,
            options.joints,
            options.name,
            options.tcpLinkName,
          )
          this.releaseLocalObjectUrls()
          this.mountRobot(robot, profile)
          resolve(profile)
        },
        undefined,
        (error) => {
          const translation = sceneError(error, 'robot.modelLoadFailed')
          this.callbacks.onModelError(translation)
          reject(error instanceof Error ? error : new RobotSceneError(translation))
        },
      )
    })
  }

  async loadRobotFiles(files: File[]) {
    const urdfFiles = files.filter((file) => /\.urdf$/i.test(file.name))
    if (urdfFiles.length !== 1) {
      const translation = {
        key: urdfFiles.length === 0 ? 'robot.errors.chooseUrdf' : 'robot.errors.oneUrdfOnly',
      }
      this.callbacks.onModelError(translation)
      throw new RobotSceneError(translation)
    }

    const urdfFile = urdfFiles[0]
    if (!urdfFile) throw new RobotSceneError({ key: 'robot.errors.urdfMissing' })
    const urdfPath = normalizeAssetPath(urdfFile.webkitRelativePath || urdfFile.name)
    const resourceFiles = files.filter((file) => file !== urdfFile)
    const exactUrls = new Map<string, string>()
    const fileNameUrls = new Map<string, string | null>()
    const objectUrls: string[] = []

    for (const file of resourceFiles) {
      const objectUrl = URL.createObjectURL(file)
      objectUrls.push(objectUrl)
      const relativePath = normalizeAssetPath(file.webkitRelativePath || file.name)
      exactUrls.set(relativePath, objectUrl)
      const fileName = normalizeAssetPath(file.name)
      const previous = fileNameUrls.get(fileName)
      fileNameUrls.set(fileName, previous === undefined ? objectUrl : null)
    }

    const manager = new THREE.LoadingManager()
    manager.setURLModifier((assetUrl) => {
      const normalized = normalizeAssetPath(assetUrl)
      const fileName = normalized.split('/').at(-1) ?? normalized
      const localUrl = exactUrls.get(normalized) ?? fileNameUrls.get(fileName)
      if (localUrl) return localUrl
      return /\.(?:png|jpe?g)(?:$|\?)/i.test(assetUrl) ? transparentPixel : assetUrl
    })
    const loader = this.createLoader(manager)
    const content = await urdfFile.text()
    const parsed = new window.DOMParser().parseFromString(content, 'application/xml')
    if (parsed.querySelector('parsererror') || parsed.documentElement.tagName !== 'robot') {
      for (const objectUrl of objectUrls) URL.revokeObjectURL(objectUrl)
      const translation = { key: 'robot.errors.invalidUrdfXml' }
      this.callbacks.onModelError(translation)
      throw new RobotSceneError(translation)
    }

    try {
      const robot = loader.parse(parsed, directoryOf(urdfPath))
      const profile = createRobotModelProfile(robot, urdfFile.name)
      this.releaseLocalObjectUrls()
      this.localObjectUrls = objectUrls
      this.mountRobot(robot, profile)
      manager.onLoad = () => {
        if (this.robot !== robot) return
        robot.updateMatrixWorld(true)
        this.fitCamera()
      }
      return profile
    } catch (error) {
      for (const objectUrl of objectUrls) URL.revokeObjectURL(objectUrl)
      this.callbacks.onModelError(sceneError(error, 'robot.errors.parseFailed'))
      throw error
    }
  }

  setJointValues(joints: JointState[]) {
    if (!this.robot) return
    this.pendingJoints = joints
    this.needsRender = true
    if (this.lastJointValues.size === 0) this.flushJointValues()
  }

  fitCamera() {
    if (!this.robot) return
    const bounds = new THREE.Box3().setFromObject(this.robot)
    const center = bounds.getCenter(new THREE.Vector3())
    const size = bounds.getSize(new THREE.Vector3())
    const maxDimension = Math.max(size.x, size.y, size.z, 0.8)
    const distance =
      (maxDimension / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)))) * 1.18
    const direction = new THREE.Vector3(0.88, 0.48, 1).normalize()
    this.camera.position.copy(center).add(direction.multiplyScalar(distance))
    this.camera.near = Math.max(distance / 100, 0.01)
    this.camera.far = distance * 20
    this.camera.updateProjectionMatrix()
    this.controls.target.copy(center)
    this.controls.update()
    this.needsRender = true
  }

  resetCamera() {
    this.fitCamera()
  }

  toggleAutoRotate() {
    this.controls.autoRotate = !this.controls.autoRotate
    this.controls.autoRotateSpeed = 1
    this.needsRender = true
    return this.controls.autoRotate
  }

  toggleGrid() {
    this.grid.visible = !this.grid.visible
    this.axes.visible = this.grid.visible
    this.needsRender = true
    return this.grid.visible
  }

  setTcpFrameVisible(visible: boolean) {
    this.tcpFrame.setVisible(visible)
    this.needsRender = true
  }

  setTrajectoryVisible(visible: boolean) {
    this.trajectoryLine.setVisible(visible)
    this.needsRender = true
  }

  setTrajectory(points: TrajectoryPoint[]) {
    this.trajectoryLine.setPoints(points)
    this.needsRender = true
  }

  updateAccessibilityLabel() {
    const translation = this.robot
      ? { key: 'robot.namedViewportAria', params: { name: this.robot.name || 'Robot' } }
      : { key: 'robot.viewportAria' }
    this.renderer.domElement.setAttribute('aria-label', this.callbacks.translate(translation))
  }

  async requestFullscreen() {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await this.container.requestFullscreen()
  }

  downloadScreenshot() {
    this.flushJointValues()
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
    const link = document.createElement('a')
    link.download = `robostation-${Date.now()}.png`
    link.href = this.renderer.domElement.toDataURL('image/png')
    link.click()
  }

  dispose() {
    cancelAnimationFrame(this.animationFrame)
    this.resizeObserver.disconnect()
    this.controls.dispose()
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      object.geometry.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) {
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) value.dispose()
        }
        material.dispose()
      }
    })
    this.tcpFrame.dispose()
    this.trajectoryLine.dispose()
    this.releaseLocalObjectUrls()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  private readonly loadMesh = (
    path: string,
    manager: THREE.LoadingManager,
    material: THREE.Material | null,
    done: (object: THREE.Object3D | null, error?: unknown) => void,
  ) => {
    const fallbackMaterial = material ?? new THREE.MeshPhongMaterial({ color: 0x7d8994 })
    if (/\.stl$/i.test(path)) {
      new STLLoader(manager).load(
        path,
        (geometry) => done(new THREE.Mesh(geometry, fallbackMaterial.clone())),
        undefined,
        (error) => done(null, error),
      )
      return
    }

    if (/\.dae$/i.test(path)) {
      new ColladaLoader(manager).load(
        path,
        (result) => {
          if (!result) {
            done(
              null,
              new RobotSceneError({ key: 'robot.errors.modelReadFailed', params: { path } }),
            )
            return
          }
          result.scene.traverse((object) => {
            if (object instanceof THREE.Mesh) object.material = fallbackMaterial.clone()
          })
          done(result.scene)
        },
        undefined,
        (error) => done(null, error),
      )
      return
    }

    done(null, new RobotSceneError({ key: 'robot.errors.unsupportedModel', params: { path } }))
  }

  private createLoader(manager: THREE.LoadingManager) {
    const loader = new URDFLoader(manager)
    loader.parseCollision = false
    loader.loadMeshCb = this.loadMesh
    return loader
  }

  private mountRobot(robot: URDFRobot, profile: RobotModelProfile) {
    this.removeCurrentRobot()
    this.robot = robot
    robot.rotation.x = -Math.PI / 2
    robot.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      object.castShadow = false
      object.receiveShadow = false
    })
    this.scene.add(robot)
    this.tcpLink = profile.tcpLinkName
      ? (robot.links[profile.tcpLinkName] ?? robot.getObjectByName(profile.tcpLinkName) ?? null)
      : null
    if (this.tcpLink) this.tcpFrame.attachTo(this.tcpLink)
    this.trajectoryLine.attachTo(robot)
    this.lastJointValues.clear()
    this.pendingJoints = null
    robot.updateMatrixWorld(true)
    this.renderer.domElement.setAttribute(
      'aria-label',
      this.callbacks.translate({ key: 'robot.namedViewportAria', params: { name: profile.name } }),
    )
    this.needsRender = true
    this.fitCamera()
    window.setTimeout(() => {
      if (this.robot !== robot) return
      robot.updateMatrixWorld(true)
      this.fitCamera()
    }, 350)
    this.callbacks.onModelLoaded(profile)
  }

  private removeCurrentRobot() {
    if (!this.robot) return
    this.tcpFrame.detach()
    this.trajectoryLine.detach()
    this.robot.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      object.geometry.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) {
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) value.dispose()
        }
        material.dispose()
      }
    })
    this.robot.removeFromParent()
    this.robot = null
    this.tcpLink = null
  }

  private releaseLocalObjectUrls() {
    for (const objectUrl of this.localObjectUrls) URL.revokeObjectURL(objectUrl)
    this.localObjectUrls = []
  }

  private resize() {
    const width = Math.max(this.container.clientWidth, 1)
    const height = Math.max(this.container.clientHeight, 1)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
    this.needsRender = true
  }

  private readonly render = (now: number) => {
    this.frames += 1
    if (now - this.fpsStartedAt >= 1000) {
      this.callbacks.onFps(Math.round((this.frames * 1000) / (now - this.fpsStartedAt)))
      this.frames = 0
      this.fpsStartedAt = now
    }

    this.flushJointValues(now)
    const controlsChanged = this.controls.update()
    if (this.needsRender || controlsChanged) {
      this.renderer.render(this.scene, this.camera)
      this.needsRender = false
    }
    this.animationFrame = requestAnimationFrame(this.render)
  }

  private updateTcpState() {
    if (!this.robot || !this.tcpLink) return
    this.tcpLink.getWorldPosition(this.tcpWorldPosition)
    this.robot.getWorldQuaternion(this.rootQuaternion).invert()
    this.tcpLink.getWorldQuaternion(this.linkQuaternion)
    this.relativeQuaternion.multiplyQuaternions(this.rootQuaternion, this.linkQuaternion)
    this.tcpLocalPosition.copy(this.tcpWorldPosition)
    this.robot.worldToLocal(this.tcpLocalPosition)
    this.tcpRotation.setFromQuaternion(this.relativeQuaternion, 'XYZ')
    this.callbacks.onTcpState({
      pose: {
        x: this.tcpLocalPosition.x,
        y: this.tcpLocalPosition.y,
        z: this.tcpLocalPosition.z,
        rx: THREE.MathUtils.radToDeg(this.tcpRotation.x),
        ry: THREE.MathUtils.radToDeg(this.tcpRotation.y),
        rz: THREE.MathUtils.radToDeg(this.tcpRotation.z),
      },
      sourceLink: this.tcpLink.name,
      timestamp: performance.now(),
    })
  }

  private flushJointValues(now = performance.now()) {
    if (!this.robot || !this.pendingJoints) return
    const joints = this.pendingJoints
    this.pendingJoints = null
    let changed = false

    for (const joint of joints) {
      if (this.lastJointValues.get(joint.id) === joint.current) continue
      this.lastJointValues.set(joint.id, joint.current)
      for (const urdfName of joint.urdfNames) {
        this.robot.setJointValue(urdfName, joint.current)
      }
      changed = true
    }

    if (!changed) return
    this.robot.updateMatrixWorld(true)
    this.needsRender = true
    if (now - this.lastTcpUpdate >= 50) {
      this.updateTcpState()
      this.lastTcpUpdate = now
    }
  }
}
