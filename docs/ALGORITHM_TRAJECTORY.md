# 外部算法轨迹格式（等级 2）

等级 2 用于验证使用者已经在外部实现的 IK 或轨迹算法。RoboStation 不运行算法代码，只导入算法输出的数值结果，转换成现有 `RobotTask` 播放，并比较目标 TCP 与实际到达 TCP。

## 推荐流程

1. 在 RoboStation 加载算法对应的 URDF。
2. 在“任务编排”下载当前模型模板。
3. 使用 Python、C++、MATLAB、ROS 或其他工具计算目标 TCP 对应的关节解。
4. 保留模板中的 `model` 和 `units`，按顺序填写 `trajectory`。
5. 回到“任务编排”导入文件并播放。
6. 在“验证结果”查看误差并导出 `.simulation.json` 或 `.trajectory.csv`。

## 文件示例

```json
{
  "format": "robostation-algorithm-trajectory",
  "version": 1,
  "generatedAt": "2026-08-20T06:00:00.000Z",
  "name": "抓取轨迹验证",
  "description": "由外部 IK 求解器生成",
  "units": {
    "revolute": "rad",
    "prismatic": "m",
    "tcpPosition": "m",
    "tcpRotation": "deg-xyz"
  },
  "model": {
    "name": "Fetch",
    "fileName": "robot.urdf",
    "tcpLinkName": "gripper_link",
    "jointSignature": "请保留下载模板中的原值",
    "jointIds": ["torso_lift_joint", "shoulder_pan_joint"]
  },
  "trajectory": [
    {
      "speedScale": 0.5,
      "targetPose": {
        "x": 0.65,
        "y": 0,
        "z": 0.258,
        "rx": 0,
        "ry": 57.296,
        "rz": 0
      },
      "joints": {
        "torso_lift_joint": 0.12,
        "shoulder_pan_joint": 0.35
      }
    }
  ]
}
```

示例中的关节列表被缩短，仅用于说明结构。实际文件的每个轨迹点必须包含模板列出的全部可控关节。

## 单位与坐标约定

- Revolute / continuous 关节：弧度。
- Prismatic 关节：米。
- TCP 的 `x / y / z`：米，位于当前 URDF 根对象坐标系。
- TCP 的 `rx / ry / rz`：度，采用 XYZ 欧拉角，与界面 TCP 状态显示一致。
- `speedScale`：`0.1` 到 `1`，控制现有仿真器的速度倍率；它不是精确的时间参数。

未来实时 IK Provider 仍按 `IK_DESIGN.md` 使用四元数接口。等级 2 文件使用 XYZ 欧拉角，是为了让导入目标与当前工作站显示、CSV 输出保持一致；接入方应在生成文件时完成四元数到 XYZ 欧拉角的转换。

## 导入校验

导入前会检查：

- 文件格式和版本。
- 当前 TCP Link 与模板是否一致。
- 关节 ID、类型和 URDF 限位签名是否一致。
- 每个轨迹点是否包含全部关节且没有未知关节。
- 所有关节解是否为有限数值并位于 URDF 限位内。
- TCP 位姿是否为有限数值。
- 轨迹点数量是否在 1 到 50 之间。

任何一项不通过都会拒绝导入，不会补零、截断关节值或生成假的 IK 解。

## 验证输出

任务到达每个轨迹点时，系统会额外保存一条到达样本，并计算：

- 目标覆盖率：每个目标是否都有实际到达样本。
- TCP 位置误差：目标与实际位置的三维直线距离，默认阈值为 2 mm。
- TCP 姿态误差：目标与实际姿态四元数之间的旋转夹角，默认阈值为 1°。

JSON 会保留每个轨迹点的目标、实际值和误差。CSV 会在逐时刻采样中增加目标 TCP、位置误差、姿态误差以及 `waypoint_reached` 标记。
