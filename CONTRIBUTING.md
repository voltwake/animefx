# Contributing to AnimeFX

感谢你帮助完善动效库。请先搜索已有 Issue，再提交问题或 Pull Request。

## 本地验证

```bash
npm install
npm run check:manifest
npm run check:gallery
npm run check:detail
npm run check:reference
```

新效果必须同时提供：可运行实现、参数合同、确定性预览、适用/不适用场景和回归验证。不要直接修改生成的 `manifest/ai-catalog.json` 或 `manifest/gallery-data.json`。

项目接受修复、文档、新效果与现有效果改进。较大的 API 变更请先开 Issue 对齐合同和兼容性。
