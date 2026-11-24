# Cat Boom

Godot 4.6 Standard / GDScript / Compatibility。共用六边形棋盘的本地双人猫猫对战原型。

## 运行

用 **Godot 4.6-stable Standard** 导入 `project.godot`，按 F6/F5 运行主场景。默认 720×960，可缩放。不要使用缺少 .NET 运行环境的 Mono 编辑器。

```sh
/path/to/Godot --path .
/path/to/Godot --headless --path . --script tests/test_rules.gd
/path/to/Godot --path . -- --ui-smoke
```

未签名 macOS 本地测试包位于 `builds/`（生成后）。正式发行签名、公证不属于本原型。

## 操作

- 点击选择猫，悬停相邻猫查看第一轮确定结果，再点击交换。无效交换不扣回合。
- 金色圈及数字 **2** 表示大猫；四种花纹辅助辨色。
- 补猫允许相邻同色，但只选择不会直接形成三连及以上的颜色；收缩连锁照常结算。
- 绿色圈：合成中心；粉色箭头：爆发；青色箭头：收缩。
- 上方玩家二、下方玩家一；当前行动方造成的所有连锁伤害打向对方。
- 新棋盘 / 同局重开 / 1×、2× / 震屏开关位于底部。
- 调试：输入种子、选择七种测试局面、恢复上回合开始、开启逐轮播放。逐轮模式在提交交换时锁定，随后通过“下一轮”继续。
- 测试局面的箭头指向推荐交换。相同局面可重复尝试不同选择。

## 工程结构

- `scripts/rules.gd`：不依赖场景、帧率和动画的规则引擎。
- `scripts/main.gd`：对局控制、事件播放、交互、日志。
- `scripts/cat.gd`：程序化猫猫美术。
- `scripts/fixtures.gd`：确定性测试局面。
- `tests/`：规则测试与回归。
- `docs/rules.md`：冻结规则与交叉结算细节。
- `docs/playtest.md`：人类试玩记录模板和已知限制。
- `docs/ideas.md`：后续灵感，当前未实现。

每次交换的开始/结束状态、直接与总伤害、收缩匹配、补猫新增匹配、对手最大即时伤害记录在 `user://matches/`，macOS 默认对应 `~/Library/Application Support/Godot/app_userdata/Cat Boom/matches/`。记录中包含 RNG state；精确状态恢复使用内存深拷贝，JSON 日志用于诊断，不承诺跨引擎版本回放。

随机序列、猫 ID、扫描及收缩顺序固定。视觉特效使用另一份 RNG。换引擎版本后不保证相同种子的结果相同。

## 本机快捷命令

```sh
tools/check.sh          # 规则回归 + 真实窗口动画/输入冒烟测试
tools/export-macos.sh   # 导出 Universal macOS 应用与 ZIP
```

脚本先找 `godot`，找不到时使用本次准备的 `~/Library/Application Support/CatBoom/tools/4.6-stable/Godot.app`。也可通过 `GODOT_BIN` 指定引擎路径。工具脚本校验版本，不会覆盖系统原有的 Godot Mono。
