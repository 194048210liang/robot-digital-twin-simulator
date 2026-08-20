# RoboStation

基于 Vue 3、TypeScript、Three.js 与 URDF 的机器人离线仿真与验证工作站。项目围绕“导入模型、关节示教、编排任务、执行仿真、验证结果、导出数据”形成浏览器端闭环，并以 Fetch 移动操作机器人作为默认示例模型。

> 当前处于 V0.2 功能开发阶段：不连接真实硬件，不发送真实机器人控制指令。导出的任务与轨迹是仿真参考数据，不能未经控制器适配与安全校验直接下发到真机。

## 当前能力

- 加载默认 Fetch 模型，也可从本地选择 URDF 与 STL、DAE、纹理等配套资源并自动解析可控关节。
- 根据模型关节类型、限位和速度生成控制项，并显示由末端 Link 计算的实时 TCP 位姿。
- 仿真示教时拖动关节即可实时更新模型，支持限位校验、速度倍率和回零。
- `关节示教 / TCP 状态 / 任务编排 / 验证结果` 四工作视图。
- TCP 末端坐标系、实际运动轨迹、轨迹显隐与清除。
- 多姿态机器人任务的编排、本地保存、顺序播放、暂停与恢复，并支持带模型关节签名的任务 JSON 导入与导出。
- 播放任务时自动记录关节位置、目标、速度和 TCP 位姿，验证任务完成、位置限位、速度限位与采样连续性。
- 验证结果可导出完整 `.simulation.json`，逐样本轨迹可导出 `.trajectory.csv`。
- 保留 Mock 控制器、通信 ACK 与延迟诊断，但通信能力作为可选基础设施，不占用主要工作流。
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

## 仿真验证使用方法

1. 使用默认 Fetch 模型，或在 3D 视图中点击“导入 URDF”加载本地模型与资源。
2. 在“关节示教”中拖动滑块，确认模型到达需要的姿态。
3. 点击“添加当前姿态”，继续调整并添加后续姿态。
4. 点击“保存任务”，填写名称后保存；也可以导入兼容当前模型的任务文件。
5. 打开“任务编排”，点击“播放”运行任务，过程中可暂停、继续或停止。
6. 任务结束后打开“验证结果”，检查采样、路径与限位结论，并导出 JSON 或 CSV。

任务默认从机器人当前姿态开始，不会自动回零；如需从零位开始，请先手动点击“回到零位”。任务文件会记录模型的关节 ID、类型和限位签名，不兼容的模型不会被静默导入。

## 输入与输出

- 输入：URDF 与 Mesh 资源、关节示教姿态、姿态顺序和速度倍率。
- 任务输出：`.robot-task.json`，用于保存或迁移关键姿态序列。
- 验证输出：`.simulation.json`，包含模型信息、任务、采样数据、汇总和验证结论。
- 轨迹输出：`.trajectory.csv`，每行包含时间、任务步骤、TCP 六维位姿以及各关节位置、目标和速度。

验证记录当前保留在本次页面会话中，需要长期保存时请在刷新页面前导出。当前验证范围来自现有运动学仿真数据，不包含碰撞、动力学、力矩、加速度、奇异点或真实控制器跟随误差。

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
RobotController ──► MockTransport（可替换）
   │
   ▼
RobotSimulator ──► Pinia RobotState ──► Three.js / URDF
   │
   └─────────────► SimulationValidation ──► JSON / CSV
```

Pinia 只保存可序列化的机器人、任务、采样与界面状态；Three.js 对象由场景层独立管理。`RobotTransport` 接口继续隔离通信实现，所以当前产品以离线仿真为核心，同时不阻止使用者以后增加 WebSocket、串口网关或真实控制器适配器。

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

- V0.2：通用 URDF 导入、关节空间任务、仿真采样、验证结果与 JSON / CSV 数据闭环。
- V0.3：接入正式逆运动学 Provider 后开发 TCP 目标控制，不使用假 IK。
- V0.4：碰撞检测、轨迹图表、验证规则扩展与可复现演示场景。
- V1.0：稳定的模型、任务、验证报告工作流；真实设备协议适配保持为可选扩展。

更完整的范围和边界见 [PROJECT_PLAN.md](./PROJECT_PLAN.md)。
IK 接口、单位约定与接入边界见 [docs/IK_DESIGN.md](./docs/IK_DESIGN.md)。

## 模型与许可证

应用代码采用 MIT License。仓库中的机器人模型资源可能包含独立的第三方许可，公开发布前请先确认其来源与再分发条款，详见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。
