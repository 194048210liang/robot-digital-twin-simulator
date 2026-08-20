# IK Interface and Integration Design

[简体中文](./IK_DESIGN.md) | [English](./IK_DESIGN.en.md)

## Current Boundary

This stage defines only the `InverseKinematicsSolver` interface and its data contract. It does not provide fabricated local solutions, random joint values, or hard-coded mappings. Executable robot tasks currently store and execute joint-space targets only.

A TCP target may be converted into a joint-space task and passed to the existing `RobotController` only after a real IK provider returns a valid solution and the solution passes joint-limit and safety checks.

## Data Units

- Cartesian position: metres.
- Cartesian orientation: unit quaternion, avoiding Euler-angle singularities and angle-unit ambiguity.
- Rotation error: radians.
- Revolute and continuous joints: radians.
- Prismatic joints: metres.
- Time: milliseconds.

The interface may continue to display millimetres and degrees, but values must be converted to the internal units above before entering the IK interface.

## Execution Pipeline

```text
TCP Target
   │
   ▼
Validate frame / link / values / quaternion
   │
   ▼
InverseKinematicsSolver.solve(request, AbortSignal)
   │
   ├── failure ──► Show an explicit reason; do not move the robot
   │
   ▼
Candidate Joint Solutions
   │
   ▼
Joint Limits / Continuous-Joint Normalization / Collision Policy / Ranking
   │
   ▼
Select a valid solution and create a joint-space RobotTask
   │
   ▼
Existing RobotController → RobotSimulator / Real Transport
```

Three.js is responsible only for target-pose interaction and solution previews. It does not solve IK and must not directly modify the robot's actual joint state.

## Provider Options

The interface supports three types of real implementation in the future:

1. Web Worker plus a WASM kinematics library: suitable for a fully frontend, offline demonstration; solving must not block the UI thread.
2. ROS 2 / MoveIt gateway: a backend owns the robot model, collision scene, and solver plugins, while the frontend sends requests over WebSocket or HTTP.
3. Physical robot controller: use the IK service provided by the vendor controller; the frontend sends only the target and seed joint values.

Each provider must implement `InverseKinematicsSolver` independently. The application layer must not add provider-specific branches by testing the provider type.

## Required Validation

- `baseLink` and `tcpLink` must exist in the current URDF.
- All values must be finite, and the quaternion must be normalized.
- The request must include the current joint values as its seed.
- A returned solution must cover every joint involved in solving.
- Returned solutions must pass local joint-limit validation again.
- When collision checking is enabled, a provider must not mark an unchecked solution as successful.
- After timeout or cancellation, a late result must not be written into the current task.
- IK failure must not change the current joint targets or trigger `execute()`.

## Failure Model

The interface uses explicit failure reasons:

- `solver-unavailable`
- `invalid-request`
- `unreachable`
- `joint-limit`
- `collision`
- `timeout`
- `cancelled`
- `solver-error`

The UI should show the failure reason and message while preserving the original TCP target for editing. It must never disguise failure by reusing the nearest joint values or random joint values.

## Implementation Sequence

1. Select and validate a real IK provider.
2. Add provider lifecycle management, readiness state, and health checks.
3. Add a TCP target editor that remains non-executable while the solver is unavailable.
4. Call IK and display candidate-solution previews.
5. Apply joint-limit and safety validation to the selected solution.
6. Convert a valid solution into the existing joint-space task.
7. Add timeout, cancellation, concurrent-request deduplication, and regression tests.

Until these steps are complete, do not implement TCP Jog or expose an executable TCP target button.
