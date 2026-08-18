# RoboStation V0.1 Implementation Plan

## Product goal

Build a Vue 3 + TypeScript + Three.js robot simulation workstation that demonstrates a state-driven industrial HMI rather than a static model viewer.

## Selected interface

- Main workspace: use the first approved design as the primary layout.
- Left: large Fetch robot 3D viewport.
- Right: `关节控制` and `TCP 状态` tabs.
- Bottom: use the second approved design's diagnostic console, communication table, status bar, and tools.

## Architecture

```text
Vue UI -> RobotController -> MockTransport -> RobotSimulator
   ^                                              |
   |                                              v
Three.js <- RobotState <- Pinia state feedback ---+
```

Three.js objects stay outside Pinia. Pinia stores serializable robot and application state only.

## V0.1 scope

- Fetch URDF load with DAE/STL mesh support.
- Material fallback for the currently missing DAE texture images.
- Named joint groups for torso, arm, head, and gripper.
- Current/target position, velocity, limits, jog, run, pause, home, and simulation stop.
- Read-only TCP pose.
- Mock controller state and bounded alarm/command/communication logs.
- Camera fit/reset, fullscreen, grid visibility, and screenshot actions.
- Unit tests for limits and interpolation.

## Explicitly deferred

- IK and TCP motion commands.
- Teach points and trajectory playback.
- ROS, SLAM, navigation, real device control, serial/TCP/CAN, database, login, and permissions.

## Known model risks

- DAE files reference PNG textures that are not present. V0.1 uses URDF material colors instead.
- The bundled model appears derived from Fetch description assets. Provenance and third-party licensing must be verified before a public release.
