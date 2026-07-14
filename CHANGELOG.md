# Changelog

本项目采用语义化版本记录。2.0 之前的里程碑根据仓库历史补记。

## 4.0.2 — npm 包名定为 @voltwake/animefx

- npm 拒绝注册 `animefx`（与 `animejs` 相似度保护），按官方建议改为作用域包 **`@voltwake/animefx`**；bin 名保留 `animefx`（安装后 `npx animefx --query` 不变）。
- 全量替换安装/导入/npx/node_modules 路径与 npm 链接（README×3、AGENTS、llms.txt、三语门户与词典、docs、校验脚本）。品牌名、网站域名不变。

## 4.0.1 — 文案口径修正

- README×3 / AGENTS.md / package.json 描述统一为「以 anime.js 为核心、集成 WebGL 着色器与 three.js」，对齐站点 metadata；npm 首发实际以此版本发出。

## 4.0.0 — Demo 案例全面场景化

> ⚠️ **Breaking**：`manifest/recipes.json`（npm `exports["./recipes"]`）的 16 条幻灯片式 recipe 全部移除，替换为 8 条真实场景 recipe；旧 recipe id 与旧 demo URL 不再保留（尚无外部使用者，不做兼容层）。CLI `--type recipe` 的类型词表随之更新。

### 8 个真实场景 Demo（替代原 16 个中性幻灯片 Demo）

- 新场景：`saas.launchHero`（SaaS 首屏）、`dashboard.opsConsole`（运维仪表盘）、`mobile.appPromo`（App 宣传页）、`commerce.productDrop`（电商详情）、`portfolio.photoStory`（摄影作品集）、`event.keynote`（大会落地页）、`ai.chatProduct`（AI 助手页）、`fintech.marketPulse`（行情数据页）。文案全英文；门户卡片新增 Web / Video 用途标签。
- **展示夹具层** `demos/fixtures/`：每个 demo 一份独立夹具（配色 + 字体 + 内容），语义为"模拟一位使用方的 design.md 注入"，不进 npm 包、不参与 suite 白名单与 AI 检索加分；recipe 的 `exampleTheme` 统一为 `neutral`，保持编排合同风格无关。
- **模板注册表** `tools/templates/`：场景模板（HTML/CSS/机器合同）从 `compile-composition.mjs` 外移；模板 CSS 按需注入，`requiredTargets`/DOM 断言纳入验证。
- **新验证入口** `npm run validate:recipes`：全量 recipe 编译 → 静态规则 → 浏览器挂载规则 → 模板 DOM 合同 → 效果空返回与 console error 计为失败。
- 配图素材（AI 生成）：`assets/demos/product-chair.jpg`、`assets/demos/portfolio-arctic.jpg`（站点资产，不进 npm）。
- 联动更新：门户三语文案与 sitemap、README×3、AGENTS.md、llms.txt、检索 CLI 场景词表、`check:contracts`/`check:reference`/`check:3-runtime` 断言。

## 3.1.0 — 网站打磨与 Demo 横屏化

> ⚠️ **Breaking**：shader 资产文件名与全局变量更名，旧路径/旧全局不再保留兼容别名（npm 尚未发布首个版本，无既有安装用户；GitHub 直连用户需按新文件名更新 script 引用）。

### Demo 案例 16:9 横屏化与门户弹窗

- 编排画布由 1080×1440 竖版改为 **1920×1080 横版**，`compile-composition.mjs` 的 12 个 template 布局全部按横版重排（安全边距 120/96，无出框，三时刻截图回归）。
- 总览门户 Demo 案例区改为**弹窗内播放**：点击 16:9 缩略图打开 `<dialog>` 内嵌 iframe 等比缩放，Esc/背板/按钮三路关闭并释放 WebGL；不再跳新页。
- 新增 `tools/shoot-recipe-previews.mjs`（`npm run shoot:recipe-previews`），16 张 960×540 配方缩略图纳入门户数据。
- 效果卡去掉「播放」角标、Demo 卡去掉「播放 Demo」按钮条，改为整卡/缩略图直接点击（保留键盘与读屏可达性）。

### 门户视觉外壳

- 新增 `shader.godRays` 全页背景（0.28 透明度，`prefers-reduced-motion` 不挂载、页面隐藏自动释放）。
- 顶部导航与页脚改为**居中浮动毛玻璃卡片**，分类标签条吸附于导航下方、药丸自带毛玻璃。
- Hero 展柜去卡片化：Logo 直接浮于光束背景，铭文居中于 Logo 下方。
- 「甜白」链接改为转化文案（界面来自一份 design.md·去 Curio 拿同款复刻）；三步接入补充落地方式与「一句话交给 AI」提示词块。
- 全站静态资源版本戳升至 3.1.0（预览图缓存随发版失效）。

### Shader 资产更名（去品牌化，保留 Apache-2.0 合规）

- `lib/paper-shaders.umd.js` → `lib/afx-shaders.umd.js`；UMD 全局名 `PaperShaders` → `AFXShaders`。
- `lib/paper-fx-config.js` → `lib/shader-fx-config.js`；全局变量 `PAPER_FX_CONFIG` → `AFX_SHADER_CONFIG`。
- 构建脚本 `tools/build-paper-shaders.mjs` → `tools/build-shaders.mjs`（`npm run build:shaders` 已指向新路径）。
- 同步更新 `lib/anime-fx.js`、`预览器.html`、`案例/15`、README、参考文档与全部生成物；`shader.*` 效果 ID 不变（对外 API 不破坏）。
- `package.json` 的 `files` 追加 `licenses/`，随分发携带 `licenses/paper-shaders/{LICENSE,NOTICE}`（Apache-2.0 NOTICE 要求）。文档正文中的品牌性表述改为“内置 WebGL shader 引擎”等中性说法，许可证声明原样保留。

### 预览体系配色

- `预览器.html` 主题由亮灰“中性主题”改为与站点一致的“景德甜白”暗色瓷器主题（bg #1B2127 / ink #F0EBE0 / 青瓷蓝 #AFC6CF / 暖调 #A89B82），嵌入门户暗色卡片不再刺眼。
- 文字类预览标题字号收敛（`.title` clamp 20–56px、max-width 82% + stage 安全内边距），修复 960×600 与卡片小尺寸下中文标题出框。
- 20 个 `shader.*` 效果的默认配色由构建脚本统一映射到瓷器色板衍生色（去除艳紫/橙红/糖果粉等演示色），速度参数上限收敛为 0.5 求“静雅”。
- `tools/shoot-previews.mjs` 增加按效果 ID 的取帧比例覆盖表，避免部分效果拍在死帧上；全量重拍预览图。

修复 3.0 验收暴露的合同缺陷与效果质量问题（仅动效实现层，未改任何参数合同/默认值，effects.json 与 catalog 不变）。

### 合同欺骗级（实现未遵守已登记参数）

- `camera.zoomPan`：改为按 keyframes 的 `at`(0-1) 定位区段并在段内线性插值（此前按均分段插值，忽略 `at`）；`at` 缺省时回退均分。
- `text.typeCursor`：实现 `deleteTo` 完整时间轴——打字 → hold → 回删到 `deleteTo` 个字符（删除速度约为打字的 0.6 倍/字）；`deleteTo=0`/未传时保持只打字不删。
- `chart.lineDraw`：实现 `area:true`——在折线下方生成闭合填充区（沿折线→右下→左下闭合到 viewBox 底边），内联样式填充 `color` 低透明度并随描画进度同步淡入（避开预览器 `path{fill:none}` 覆盖）。

### 效果质量级

- `text.numberOdometer`：从 `countUp` 换皮重写为逐位机械滚轮——每位是纵向 0-9 滚动列（overflow 裁剪），高位先停低位后停，小数点/负号静态；DOM 实现、确定性。
- `text.annotate`：SVG 增加 `preserveAspectRatio="none"` + `vector-effect:non-scaling-stroke`，四种圈注样式在宽中文标题下可整段包住（此前固定 viewBox 只箍住中间几字）。
- `chart.rankRace`：相邻 frame 之间条形宽度做 inOutQuad 连续过渡（此前帧间硬切），排位在段边界换位、数值文本按段中点切换。

### 可读性回归

- 将 3.0 新增的 33 个效果（image/transition/text/sticker/ui/chart/camera 段）从压缩单行体展开为与旧代码一致的可读多行风格，仅重排不改逻辑（上述 1-6 除外）。

### 评审回归修复（Codex review 发现）

- `text.numberOdometer`：滚轮列数改为按 from/to 两端的最大整数位数建列（此前只看 `to`，`{from:1280,to:0}` 只建 1 列）；任一端为负时预留负号槽，混号场景负号随当前值显隐（两端同负则静态），初始渲染正确显示 from。
- `chart.lineDraw`：面积基线不再写死 y=100，改为从目标 SVG 的 viewBox 解析底边（y + height），无 viewBox 时回退 100。
- `chart.rankRace`：排位（order）改为按当前段起点帧排序、在段边界换位（此前恒按下一帧，t=0 排位错误）；frames 只有一帧时直接静态渲染（此前 `frames[-1]` 首帧渲染即抛异常）。

## 3.0.0 — 2026-07-10

- 下线旧 `效果总览.html`，以 `总览门户.html` 作为唯一人类入口，并为九个基础效果建立独立源码锚点。
- 新增单效果中性预览器；门户卡片按需挂载效果本体，锚点页只承担“读代码”职责。
- 三个具体套件降级为 demo/测试渲染夹具；门户改为四角色风格注入说明，不再展示具体套件色板与字体。
- 11 个历史配方改为页型语义 ID，新增 roles/contentSlots 合同；另新增 5 个 3.0 编排配方，共 16 个中性主题 demo。
- 按任务书逐项清单新增 33 个效果：image ×6、transition ×6、text ×5、sticker ×5、ui ×5、chart ×4、camera ×2；效果总数从 65 增至 98。
- 数量勘误：任务书标题及完成定义写“新增 36 / 总数 101”，但逐项清单与三波数量实际为 12+14+7=33；backlog 的 3 个 code.* 明确标注不计入。因此 3.0 按完整清单交付 33 个，总数为 98。
- 新增 33 条自然语言检索回归、全预览器回归和 α/β/γ 串联 demo 的逐帧确定性检查。

### 配方 ID 改名

| 2.0 ID | 3.0 页型 ID |
|---|---|
| `techNoir.cover` | `cover.particleScramble` |
| `techNoir.coverHero` | `coverHero.gridAssemble` |
| `techNoir.data` | `data.ringFocus` |
| `techNoir.list` | `list.cascadeFlow` |
| `techNoir.end` | `end.tunnelCta` |
| `inkPaper.cover` | `cover.inkCalm` |
| `inkPaper.data` | `data.waveRing` |
| `inkPaper.list` | `list.inkCascade` |
| `appleGlass.cover` | `cover.glassLens` |
| `appleGlass.data` | `data.radialRing` |
| `appleGlass.copy` | `copy.glassCard` |

## 2.0.0 — 2026-07-10

- 清理套件盲测页、OPUS5 验收页、历史视频与截图等工作流副产物。
- 将 11 个生成配方从手写案例区迁移到 `demos/recipes/`，保留 composition 编译与验证能力。
- 新增 manifest 驱动的完整总览门户，覆盖 65 个效果、3 个套件与 11 个配方。
- 新增门户一致性、源码定位、锚点和预览完整性检查。
- 检索器新增 `--type recipe` 页面级配方检索。
- 补充项目接入说明、套件扩展指南与双插件版本同步检查。

## 1.2.0 — 插件化

- 将库定位为 `anime-fx-reference` AI 动效参考插件。
- 建立 Codex / Claude Code 双插件 manifest、共享 Skill、AI catalog 与确定性检索回归。

## 1.1.0 — 标准化

- 建立套件、配方、composition、静态/挂载规则与确定性渲染验证管线。
- 固化 `techNoir`、`inkPaper`、`appleGlass` 三套视觉语境和 11 个配方。

## 1.0.0 — 效果库

- 建立 AnimeFX 基础运行时、锚点案例和效果预览。
- 扩展至 36 个基础效果与 29 个 Shader，共 65 个可检索效果。
