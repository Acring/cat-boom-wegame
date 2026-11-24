# AGENTS.md

本文件面向在 `cat-boom-wegame` 仓库工作的 AI Agent 与开发者，说明架构边界、规则文档、验证命令与工程约束。

## 1. 项目概览

**Cat Boom** 是一款基于 7×7 平顶六边形共用棋盘的**猫梗 Boss 肉鸽消除小游戏**（同时保留本地双人 PvP 模式），纯 TypeScript + Canvas 2D 实现，零运行时外部依赖，支持**微信小游戏**与**浏览器**双端运行。

- 构建工具：`esbuild`（`package.json`）+ `tsc --noEmit`（strict 模式，ES2018）
- 双入口产物：
  - `game.js`：微信小游戏主入口（同时被 `index.html` 引用）
  - `lab.js`：独立网页合成与特效实验室入口（被 `lab.html` 引用）

## 2. 目录结构与模块边界

```text
src/
  rules.ts        # 纯确定性棋盘规则引擎（规则 v3、护盾/真伤、RuleModifiers）
  rng.ts          # 可复现种子伪随机数生成器
  roguelike.ts    # 纯肉鸽逻辑（3 位猫梗 Boss、意图、技能、9 大机制祝福、分层提示）
  fixtures.ts     # 17 个确定性预设测试局面与分组（单测与实验室共享）
  platform.ts     # 微信小游戏(wx) 与浏览器双端 Canvas/输入/安全区/震动适配
  assets.ts       # 双端图片与精灵图集加载器（加载期优雅降级）
  catRender.ts    # 猫咪 10 帧精灵图集切片渲染与 3 级炫彩猫动态特效
  gameApp.ts      # 主游戏循环、720x1220 手绘贴纸风 UI、拎起挣扎交互与肉鸽闯关
  main.ts         # 主游戏启动入口 -> 打包为 game.js
  labApp.ts       # 独立网页实验室（慢放、子阶段单步、自由摆棋、动作预览）-> lab.js
tests/
  rules.test.ts     # 棋盘规则与 17 个预设局面的回归测试
  roguelike.test.ts # Boss 习性/技能、9 大祝福、护盾真伤与 3 关模拟测试
tools/
  gen_roguelike_assets.py # 生成 Boss 头像(160x160)与流派徽章(96x96)透明贴纸 PNG
  gen_cat_animations.py   # 生成 4色x2级 10帧猫咪精灵图集(1920x192)
docs/
  rules.md          # 当前已实现棋盘核心规则（单一事实源）
  roguelike-mvp.md  # 猫梗 Boss 与三大流派构筑设计（单一事实源）
  ideas.md          # 后续玩法演进与进度清单
```

### 硬性模块边界
1. **纯逻辑与渲染严格解耦**：`src/rules.ts`、`src/rng.ts`、`src/roguelike.ts`、`src/fixtures.ts` **严禁依赖** DOM、Canvas、`window` 或 `wx`，确保可在 Node 环境直接运行确定性测试。
2. **实验室与主包隔离**：`src/main.ts` 和 `src/gameApp.ts` **严禁导入** `src/labApp.ts`，避免把网页实验台代码打进微信小游戏主包 `game.js`。
3. **规则 RNG 与视觉特效分离**：所有影响盘面、补猫、Boss 技能和抽卡的随机行为必须使用 `SeededRng`；粒子/表现层允许使用 `Math.random()`，绝不污染规则确定性。

## 3. 常用命令与必过门禁

任何修改 `src/`、`tests/` 或规则数值的变更，提交前必须依次通过：

```sh
npm run typecheck   # TypeScript 严格类型检查（必须 0 错误）
npm test            # 运行全部规则测试 + 肉鸽测试（必须全部通过）
npm run build       # 重新构建 game.js 与 lab.js（修改 src/ 后务必同步更新产物）
```

本地浏览器试玩与特效调试（因加载 `assets/` 图片，请通过 HTTP 服务打开）：

```sh
python3 -m http.server 8080
# 主游戏：http://localhost:8080/index.html
# 实验室：http://localhost:8080/lab.html
```

## 4. 开发与美术约束

- **简洁至上（KISS）**：保持实现直接清晰，避免过度抽象和冗余防御代码。
- **规则改动同步文档与测试**：
  - 改动合成/爆发/收缩/伤害规则时，必须同步更新 `docs/rules.md` 与 `tests/rules.test.ts`。
  - 改动 Boss 习性、意图或祝福效果时，必须同步更新 `docs/roguelike-mvp.md` 与 `tests/roguelike.test.ts`。
- **微信小游戏兼容性**：
  - 所有 Canvas 2D 渲染需兼容微信小游戏基础库，避免依赖兼容性差的新浏览器 API（如 `createConicGradient`）。
  - 新增图片资源必须在 `src/assets.ts` 中通过双端加载器注册，并在未加载完成时提供无报错兜底。
- **美术与动画帧规范**：
  - 统一暖系日系手绘贴纸风：深可可棕圆润粗描边 `#4e342e`、柔和马卡龙平涂、8 位 RGBA 透明底。
  - 猫咪精灵图集固定为 `1920×192`（10 帧 × `192×192`）：帧 `0~3` 待机、帧 `4~6` 挥爪提示、帧 `7~9` 拎起挣扎；修改脚本重新生成后须校验无越界串帧且四角透明。
- **提交规范**：严禁提交 `node_modules/`、`.DS_Store` 或临时测试产物 `.tmp-*.cjs`；修改 `src/` 后应连同最新构建的 `game.js` / `lab.js` 一并提交，便于微信开发者工具直接预览。
