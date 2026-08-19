# RoboStation

基于 Vue 3、TypeScript、Three.js 与 URDF 的机器人仿真控制上位机。项目以 Fetch 移动操作机器人为当前模型，目标是展示前端工程、三维数字孪生、机器人状态管理与工业 HMI 设计能力。

> 当前处于 V0.2 功能开发阶段：不连接真实硬件，不发送真实机器人控制指令。

## 当前能力

- 加载 Fetch URDF、DAE 与 STL 模型，并显示实时 TCP 位姿。
- 按躯干、机械臂、头部和夹爪分组控制 11 个关节。
- 仿真示教时拖动关节即可实时更新模型，支持限位校验、速度倍率和回零。
- `关节控制 / TCP 状态 / 机器人任务` 三工作视图。
- TCP 末端坐标系、实际运动轨迹、轨迹显隐与清除。
- 多姿态机器人任务的编排、浏览器本地保存、顺序播放、监控、暂停与恢复。
- Mock 控制器、通信 ACK、报警/命令/通信日志以及 JSON 日志导出。
- Three.js 相机适配、轨道控制、自动旋转、网格开关、全屏与截图。
- 控制器与仿真算法的基础单元测试。

## 技术栈

- Vue 3 + Vite + TypeScript
- Three.js + urdf-loader
- Pinia
- Vitest + ESLint + Prettier

## 本地运行

```bash
npm install
npm run dev
```

默认开发地址为 `http://localhost:5173`。

## 任务使用方法

1. 在“关节控制”中拖动滑块，确认模型到达需要的姿态。
2. 点击“添加当前姿态”，继续调整并添加后续姿态。
3. 点击“保存任务”，填写名称后保存。
4. 打开“机器人任务”，展开可查看姿态顺序，点击“播放”开始运行。
5. 播放过程中使用底部的“暂停 / 继续 / 仿真停止”控制任务。

任务默认从机器人当前姿态开始，不会自动回零；如需从零位开始，请先手动点击“回到零位”。

## 质量检查

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## 架构

```text
Vue HMI
   │
   ▼
RobotController ──► MockTransport
   │
   ▼
RobotSimulator ──► Pinia RobotState ──► Three.js / URDF
```

Pinia 只保存可序列化的机器人与界面状态；Three.js 对象由场景层独立管理。`RobotTransport` 接口隔离了通信实现，后续可以在不改动主要界面的前提下增加 WebSocket、串口网关或真实控制器适配器。

## 目录

```text
src/
├─ components/   # 工业 HMI 组件
├─ graphics/     # Three.js 与 URDF 场景
├─ robot/        # 关节配置、控制器、仿真器与测试
├─ stores/       # Pinia 状态
└─ transport/    # 通信抽象与 Mock 实现
```

## 路线图

- V0.2：TCP 坐标系与轨迹、关节空间任务工作流；下一步开发示教点。
- V0.3：接入正式逆运动学 Provider 后开发 TCP 目标控制，不使用假 IK。
- V0.4：WebSocket/串口网关与真实设备协议适配。
- V1.0：桌面封装、运行记录与可复现演示场景。

更完整的范围和边界见 [PROJECT_PLAN.md](./PROJECT_PLAN.md)。
IK 接口、单位约定与接入边界见 [docs/IK_DESIGN.md](./docs/IK_DESIGN.md)。

## 模型与许可证

应用代码采用 MIT License。仓库中的机器人模型资源可能包含独立的第三方许可，公开发布前请先确认其来源与再分发条款，详见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。
