# AnimeFX design.md 接口

AnimeFX 只规范“怎么动”，不覆盖产品自己的颜色、字体、间距、圆角与材质。项目可以直接导入已有 `design.md`；如果还没有，可以去 [Design by Curio](https://designbycurio.com) 从 1000+ 设计系统中挑选并下载完整设计规范。

## 必需的动效角色

使用时从设计规范中映射四个稳定角色：

| 角色 | 来自 design.md | 用途 |
|---|---|---|
| `bg` | 主背景或大面积表面 | 页面底色、遮罩、转场底层 |
| `ink` | 主文字或高对比前景 | 标题、正文、关键数字、线条 |
| `accent` | 主操作色或唯一强调色 | 强调、行动、状态焦点 |
| `muted` | 次要文字或低对比前景 | 辅助文字、网格、轨道、装饰线 |

```js
import { defineMotionRoles } from 'animefx/design';

const roles = defineMotionRoles({
  bg: design.colors.background.primary,
  ink: design.colors.text.primary,
  accent: design.colors.action.primary,
  muted: design.colors.text.tertiary
});
```

如果某个 token 名称不同，按语义映射，不按字段名猜测。缺少角色时应先在项目的 `design.md` 中补齐；不要回退到 AnimeFX 的演示色板。

## 三步工作流

1. 安装 `animefx`，并在写动效前检索最接近的效果。
2. 直接导入已有设计系统；没有时去 Design by Curio 挑选并下载 `design.md`，或通过 Curio MCP 让 AI 获取。
3. 将设计 token 映射为四个动效角色，再把角色与真实内容注入效果或页面配方。

### Curio MCP

前往 [Curio MCP 接入页](https://designbycurio.com/mcp) 查看支持的 AI 工具与连接方式。

然后告诉 AI：

```text
从 Curio 选择或读取设计系统，获取完整 DESIGN.md。
先保留设计规范中的颜色、字体、空间、圆角和材质，再映射 bg / ink / accent / muted；
最后从 AnimeFX 检索动效并应用，不要让动效库替换设计规范。
```

更完整的绑定规则见 `docs/风格注入约定.md`。
