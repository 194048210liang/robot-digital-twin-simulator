# RoboStation

**基于 Vue 3、TypeScript、Three.js 与 URDF 的浏览器端机器人离线仿真与验证工作站。**

[简体中文](./README.md) | [English](./README.en.md) · [在线演示](https://robot-digital-twin-simulator.l194048210.workers.dev/)

> 当前版本：V0.2。项目以离线仿真验证为核心，不连接真实硬件，也不会把仿真任务直接下发到机器人。

## 项目简介

RoboStation 不只是一个 URDF 模型查看器。它围绕机器人开发中常见的“模型、姿态、任务、执行、采样、验证、导出”流程，提供一套完全运行在浏览器中的闭环工作站：

```text
URDF / Mesh
     ↓
关节示教或外部算法结果
     ↓
机器人任务编排
     ↓
仿真执行与 TCP 轨迹采样
     ↓
限位、连续性与 TCP 误差验证
     ↓
JSON / CSV 数据导出
```

项目内置 Fetch 移动操作机器人作为示例，同时支持导入本地 URDF 及其 Mesh、纹理资源，并根据模型自动生成可控关节、限位和显示单位。

## 核心价值

- **通用模型输入**：加载本地 URDF 资源包，解析可控关节、关节类型、限位、速度和末端 Link。
- **可视化关节示教**：拖动关节时模型实时响应，可组合多个姿态并保存为可重复播放的任务。
- **外部算法验证**：导入自有 IK 或轨迹算法生成的“目标 TCP + 完整关节解”，在不执行外部代码的前提下验证算法结果。
- **可追溯的仿真输出**：记录逐时刻关节位置、目标、速度和 TCP 位姿，输出结构化 JSON 与 CSV。
- **清晰的工程边界**：Three.js、机器人控制、Mock 通信、任务状态和验证规则相互解耦，为后续替换求解器或 Transport 保留接口。

## 当前能力

### 模型与三维场景

- 默认加载 Fetch 示例模型。
- 从本地选择 URDF 和 STL、DAE、纹理等配套资源。
- 自动解析 Revolute、continuous 和 Prismatic 等可控关节。
- 根据模型尺寸自动适配相机，支持轨道控制、网格、全屏和截图。
- 显示实时 TCP 坐标系和实际运动轨迹。

### 示教与任务

- 关节滑块实时驱动三维模型。
- 关节限位、速度倍率和回零控制。
- 单关节控制与批量关节目标设置。
- 多姿态任务编排、本地保存、顺序播放、暂停、恢复和停止。
- 带模型关节签名的 `.robot-task.json` 导入与导出。

### 外部算法结果（Level 2）

- 根据当前 URDF 下载模型专属算法结果模板。
- 导入外部 IK / 轨迹算法输出的目标 TCP 和完整关节解。
- 校验 TCP Link、关节全集、关节类型、URDF 限位和数值合法性。
- 将合法结果转换为现有 `RobotTask`，继续使用原控制和仿真链路播放。
- 比较每个目标 TCP 与实际到达 TCP，计算目标覆盖率、最大位置误差和最大姿态误差。
- 浏览器只读取数值结果，不执行上传的脚本、动态库或算法代码。

### 仿真验证与数据输出

- 自动采集任务执行过程中的关节与 TCP 状态。
- 验证任务完成状态、关节位置限位、关节速度限位和采样连续性。
- 外部算法任务额外验证 TCP 目标覆盖、位置误差和姿态误差。
- 验证记录保留模型、任务、逐样本数据、汇总指标和最终结论。

## 输入与输出

| 类型         | 格式                         | 用途                                  |
| ------------ | ---------------------------- | ------------------------------------- |
| 机器人模型   | `.urdf` + Mesh / 纹理        | 构建机器人关节树和三维场景            |
| 机器人任务   | `.robot-task.json`           | 保存或迁移关节姿态序列                |
| 外部算法结果 | `.algorithm-trajectory.json` | 导入目标 TCP、完整关节解和速度倍率    |
| 仿真记录     | `.simulation.json`           | 保存模型、任务、采样、误差与验证结论  |
| 轨迹数据     | `.trajectory.csv`            | 提供逐时刻关节、TCP、目标值和跟踪误差 |

外部算法结果的协议、单位和校验规则见[外部算法轨迹格式](./docs/ALGORITHM_TRAJECTORY.md)。

## 界面结构

RoboStation 使用面向桌面工作站的工业 HMI 布局，而不是传统后台管理页面：

- 左侧：Three.js / URDF 三维场景。
- 右侧：关节示教、TCP 状态、任务编排和验证结果。
- 底部：仿真事件、验证记录、通信诊断和数据导出。
- 顶部：模型、关节数量、TCP、采样、FPS 和运动状态。

## 技术栈

- Vue 3 + Vite + TypeScript
- Three.js + urdf-loader
- Pinia + Vue Router
- Element Plus
- Vitest + ESLint + Prettier

## 架构

```text
Vue HMI
   │
   ▼
RobotController ──► MockTransport（可替换）
   │
   ▼
RobotSimulator ──► Pinia RobotState ──► Three.js / URDF
   │
   ├─────────────► RobotTask
   │
   └─────────────► SimulationValidation ──► JSON / CSV
```

Pinia 只保存可序列化的机器人、任务、采样和界面状态；Three.js 对象由场景层独立管理。`RobotTransport` 继续隔离通信实现，因此当前产品可以专注离线验证，同时保留以后接入 WebSocket 网关或真实控制器适配器的可能性。

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

## 当前边界

当前验证基于 URDF 运动学和浏览器端仿真数据，暂不包含：

- 浏览器内置通用 IK 求解器或假的逆运动学结果。
- 碰撞检测、动力学、力矩和加速度分析。
- 奇异点、可达域和真实控制器跟随误差验证。
- 精确时间参数化和实时控制周期保证。
- 未经适配即可下发真机的控制协议。

导出的任务和轨迹只能作为仿真与算法验证数据，不能绕过机器人控制器、安全系统和现场校验直接用于真实设备。

## 路线图

- **V0.2**：通用 URDF 导入、关节空间任务、外部算法结果导入、仿真采样与 JSON / CSV 验证闭环。
- **V0.3**：接入正式 IK Provider，开发 TCP 目标求解与候选解预览，不使用假 IK。
- **V0.4**：碰撞检测、轨迹图表、验证规则扩展与可复现演示场景。
- **V1.0**：稳定的模型、任务和验证报告工作流；真实设备协议适配保持为可选扩展。

## 相关文档

- [外部算法轨迹格式](./docs/ALGORITHM_TRAJECTORY.md)
- [IK 接口与接入方案](./docs/IK_DESIGN.md)
- [项目规划与范围](./PROJECT_PLAN.md)
- [第三方资源说明](./THIRD_PARTY_NOTICES.md)

完整操作手册将在工作流稳定后单独整理，不在当前 README 中展开。

## 许可证

应用代码采用 [MIT License](./LICENSE)。仓库中的机器人模型资源可能包含独立的第三方许可，公开发布和再分发前请查看 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。
