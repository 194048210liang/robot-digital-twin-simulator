# RoboStation

基于 Vue 3、TypeScript、Three.js 与 URDF 的机器人仿真控制上位机。项目以 Fetch 移动操作机器人为当前模型，目标是展示前端工程、三维数字孪生、机器人状态管理与工业 HMI 设计能力。

> 当前版本是 V0.1 仿真原型：不连接真实硬件，不发送真实机器人控制指令。

## 当前能力

- 加载 Fetch URDF、DAE 与 STL 模型，并显示实时 TCP 位姿。
- 按躯干、机械臂、头部和夹爪分组控制 11 个关节。
- 关节限位校验、目标位置、速度倍率、运行、暂停、回零和仿真停止。
- `关节控制 / TCP 状态` 双工作视图。
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

- V0.2：关节趋势图、示教点、轨迹编辑与播放。
- V0.3：逆运动学与 TCP 目标控制。
- V0.4：WebSocket/串口网关与真实设备协议适配。
- V1.0：桌面封装、运行记录与可复现演示场景。

更完整的范围和边界见 [PROJECT_PLAN.md](./PROJECT_PLAN.md)。

## 模型与许可证

应用代码采用 MIT License。仓库中的机器人模型资源可能包含独立的第三方许可，公开发布前请先确认其来源与再分发条款，详见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。
