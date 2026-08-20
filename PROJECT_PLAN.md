# RoboStation V0.1 实施计划

[简体中文](./PROJECT_PLAN.md) | [English](./PROJECT_PLAN.en.md)

## 产品目标

构建一个基于 Vue 3、TypeScript 和 Three.js 的机器人仿真工作站，重点展示由状态驱动的工业 HMI，而不是静态模型查看器。

## 已选界面方案

- 主工作区：以确认过的第一版设计作为主体布局。
- 左侧：大型 Fetch 机器人三维视口。
- 右侧：关节控制和 TCP 状态标签页。
- 底部：采用第二版设计中的诊断控制台、通信表格、状态栏和工具区。

## 架构

```text
Vue UI -> RobotController -> MockTransport -> RobotSimulator
   ^                                              |
   |                                              v
Three.js <- RobotState <- Pinia state feedback ---+
```

Three.js 对象保留在 Pinia 之外；Pinia 只保存可序列化的机器人状态和应用状态。

## V0.1 范围

- 加载 Fetch URDF，并支持 DAE/STL Mesh。
- 在 DAE 引用的纹理图片缺失时提供材质回退。
- 为躯干、机械臂、头部和夹爪建立命名关节组。
- 支持当前位置、目标位置、速度、限位、Jog、运行、暂停、回零和停止仿真。
- 提供只读 TCP 位姿。
- 提供 Mock 控制器状态及有界的报警、命令和通信日志。
- 支持相机适配/重置、全屏、网格显隐和截图操作。
- 为限位和插值逻辑添加单元测试。

## 明确延后

- IK 和 TCP 运动指令。
- 示教点和轨迹播放。
- ROS、SLAM、导航、真实设备控制、串口/TCP/CAN、数据库、登录和权限。

## 已知模型风险

- DAE 文件引用了当前缺失的 PNG 纹理；V0.1 使用 URDF 材质颜色作为替代。
- 仓库内置模型看起来源自 Fetch description 资源；公开发布前必须核实来源和第三方许可证。
