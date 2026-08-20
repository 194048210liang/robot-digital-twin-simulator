# IK 接口与接入方案

[简体中文](./IK_DESIGN.md) | [English](./IK_DESIGN.en.md)

## 当前边界

本阶段只定义 `InverseKinematicsSolver` 接口和数据契约，不提供任何本地假解算、随机关节值或硬编码映射。当前可执行的机器人任务只保存并执行关节空间目标。

TCP 目标只有在正式 IK Provider 返回合法解，并经过限位与安全校验后，才能转换为关节空间任务进入现有 `RobotController`。

## 数据单位

- 笛卡尔位置：米。
- 笛卡尔姿态：单位四元数，避免欧拉角奇异性和角度制歧义。
- 旋转误差：弧度。
- Revolute/continuous 关节：弧度。
- Prismatic 关节：米。
- 时间：毫秒。

界面层可以继续显示毫米和角度，但进入 IK 接口前必须转换为上述内部单位。

## 执行链路

```text
TCP 目标
   │
   ▼
校验 frame / link / 数值 / 四元数
   │
   ▼
InverseKinematicsSolver.solve(request, AbortSignal)
   │
   ├── failure ──► 显示明确原因，不执行机器人
   │
   ▼
候选关节解
   │
   ▼
关节限位 / 连续关节归一化 / 碰撞策略 / 解排序
   │
   ▼
选择合法解并生成关节空间 RobotTask
   │
   ▼
现有 RobotController → RobotSimulator / 真实 Transport
```

Three.js 只负责目标位姿交互与结果预览，不承担 IK 求解，也不能直接修改机器人实际关节状态。

## Provider 方案

接口允许后续接入三类正式实现：

1. Web Worker + WASM 运动学库：适合纯前端离线演示，求解不能阻塞 UI 线程。
2. ROS 2 / MoveIt 网关：由后端维护机器人模型、碰撞场景和求解插件，前端通过 WebSocket 或 HTTP 请求。
3. 真实机器人控制器：使用厂商控制器提供的 IK 服务，前端只发送目标和种子关节值。

具体 Provider 必须单独实现 `InverseKinematicsSolver`，应用层不得通过判断 Provider 类型写特殊分支。

## 必须执行的校验

- `baseLink` 和 `tcpLink` 必须存在于当前 URDF。
- 所有数值必须有限，四元数必须归一化。
- 请求必须包含当前关节值作为 seed。
- 返回解必须覆盖所有参与求解的关节。
- 返回解必须重新进行本地关节限位校验。
- 开启碰撞检查时，Provider 不得把未经碰撞验证的解标记为成功。
- 超时或取消后不得继续把迟到结果写入当前任务。
- IK 失败不能改变现有关节目标，也不能触发 `execute()`。

## 失败模型

接口使用显式失败原因：

- `solver-unavailable`
- `invalid-request`
- `unreachable`
- `joint-limit`
- `collision`
- `timeout`
- `cancelled`
- `solver-error`

UI 应显示失败原因和消息，同时保留原 TCP 目标供用户修改，不允许用最近关节值或随机关节值伪装成功。

## 后续实现顺序

1. 选择并验证真实 IK Provider。
2. 增加 Provider 生命周期、就绪状态和健康检查。
3. 增加 TCP 目标编辑器，但求解器未就绪时保持不可执行。
4. 调用 IK 并展示候选解预览。
5. 对选中解执行限位和安全校验。
6. 将合法解转换为现有的关节空间任务。
7. 增加超时、取消、并发请求去重和回归测试。

在完成以上步骤前，不实现 TCP Jog，不暴露可执行的 TCP 目标按钮。
