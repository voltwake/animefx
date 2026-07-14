<h1>AnimeFX</h1>

[English](README.md) | [简体中文](README.zh-CN.md) | 日本語

> [anime.js](https://animejs.com) をコアに WebGL シェーダーと three.js を統合した無料・オープンソースのウェブモーションライブラリ —— **検証済みの 88 エフェクト**と **8 つの実シナリオデモ**。ウェブ制作にも、プログラマティック動画（Hyperframe / Remotion）にも使えます。

[![npm version](https://img.shields.io/npm/v/animefx.svg)](https://www.npmjs.com/package/animefx)
[![License: MIT](https://img.shields.io/badge/License-MIT-informational.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22.12-brightgreen.svg)](https://nodejs.org)

AnimeFX は動画ジェネレーターではなく、「まず見て、それから使う」参照・再利用ライブラリです。実際の動きを確認し、パラメータ契約・ソースコード・プロジェクトの `design.md` を持ち込んでコードに組み込みます。プロジェクトを AnimeFX の composition に移行する必要はなく、いまのスタックのまま実装できます。

![AnimeFX](https://raw.githubusercontent.com/voltwake/animefx/master/assets/readme/hero-en.jpg)

## 特長

- **検証済みかつ決定論的。** 各エフェクトは seek 可能なタイムラインで、自動チェックスイートで検証されます。同じ入力フレームは常に同じ出力を再現するため、フレーム厳密な動画ホストにきれいに合成できます。
- **明文化されたパラメータ契約。** 各エフェクトは `manifest/effects.json` に権威ある契約（名前・型・デフォルト・範囲・ペア・制約）を備え、検索 CLI がそのまま返すため、ID やパラメータを捏造しません。
- **スタイルはプロジェクトのもの。** AnimeFX はパレットを持ちません。色は 4 つのセマンティックなモーションロール `bg / ink / accent / muted` を通じてプロジェクトの `design.md` から注入され、AnimeFX がデザイン仕様を上書きすることはありません。
- **AI フレンドリー。** そのまま使える [`AGENTS.md`](AGENTS.md)、決定論的な自然言語検索 CLI（`npx animefx --query`）、コンパクトな `manifest/ai-catalog.json` により、コーディングエージェントは最も近い実在エフェクトを見つけられます。
- **コードは商用無料。** 配布されるコードはすべて MIT ライセンスで、個人・商用プロジェクトともに無料で利用できます。

## インストール

```bash
npm install animefx
```

必要環境：Node.js ≥ 22.12。

## クイックスタート

**ESM / バンドラー / Node：**

```js
import AnimeFX, { defineMotionRoles } from 'animefx';

const roles = defineMotionRoles({
  bg: '#1B2127',
  ink: '#F0EBE0',
  accent: '#AFC6CF',
  muted: '#A89B82'
});

AnimeFX.init('hero', 7);                 // (compositionId, seed) —— エフェクトの前に一度だけ
document.querySelector('#title').style.color = roles.ink;
AnimeFX.text.charsReveal('#title', { at: 300 });
AnimeFX.finalize();                      // 登録済みインスタンスをフレーム 0 に固定
```

`defineMotionRoles` は `bg / ink / accent / muted` のいずれかが欠けると例外を投げるため、マッピングは常に明示的です。

**ブラウザ（素の `<script>`）：** 先に anime.js v4、続いてランタイムを読み込みます。

```html
<script src="node_modules/animefx/lib/anime.v4.umd.min.js"></script>
<script src="node_modules/animefx/lib/anime-fx.js"></script>
<script>
  AnimeFX.init('scene-id', 6);
  AnimeFX.text.charsReveal('#title', { at: 300 });
  AnimeFX.finalize();
</script>
```

シェーダーエフェクト（`shader.*`、WebGL）は `anime-fx.js` の前に 2 ファイルを追加で読み込みます：`lib/afx-shaders.umd.js` と `lib/shader-fx-config.js`。

何もインストールせずに検索だけ行うこともできます：

```bash
npx animefx --query "抑制の効いた上質な見出しの登場" --limit 3
```

## AI エージェント向け

コーディングエージェントを [`AGENTS.md`](AGENTS.md) に向けてください。「検索 → 使用 → スタイル注入 → ルール」の完全なループが記載されています。`npm install animefx` の後、次のプロンプトを渡します：

```text
このプロジェクトで animefx を使ってください（未インストールなら先に npm install animefx）：
node_modules/animefx/AGENTS.md を読み、その手順に従って要件に合った動効を検索して適用してください。
```

## スクリーンショット

| エフェクト一覧 | エフェクト詳細 | デモ再生 |
|---|---|---|
| ![エフェクト一覧](https://raw.githubusercontent.com/voltwake/animefx/master/assets/readme/effects-grid.jpg) | ![エフェクト詳細](https://raw.githubusercontent.com/voltwake/animefx/master/assets/readme/effect-detail.png) | ![デモモーダル](https://raw.githubusercontent.com/voltwake/animefx/master/assets/readme/demo-modal.png) |

88 エフェクトをカード内で再生し、詳細ページで全パラメータをライブ調整して呼び出しコードをコピー、8 つの実シナリオデモをその場で再生できます。

## design.md と Design by Curio

導入の順序は、ライブラリのインストール → プロジェクトの `design.md` の読み込み → `bg / ink / accent / muted` のマッピング → エフェクトの呼び出しです。既存のデザインシステムがあればそのまま取り込み、なければ [Design by Curio](https://designbycurio.com) の 1000+ デザインシステムから完全な `design.md` を選んでダウンロードするか、[Curio MCP エンドポイント](https://designbycurio.com/mcp) 経由で AI に取得させます。

ロール契約は [`design.md`](design.md)、機械的なマッピング規則は中国語ガイド [`docs/风格注入约定.md`](docs/风格注入约定.md) を参照してください。

## ウェブサイト

**[animefx.voltwake.com](https://animefx.voltwake.com)** で全エフェクトをライブプレビュー付きで閲覧できます（英語・日本語ポータルあり）。各エフェクトには自動生成コントロール付きの共有可能な詳細 URL があります。

## ライセンス

**コードは商用無料（MIT）。ブランドとサイト素材は著作権保留（All Rights Reserved）。**

- ランタイム、エフェクトデータ、AI スキル、ツール、デモコード —— npm パッケージ [`animefx`](https://www.npmjs.com/package/animefx) で配布されるすべては [MIT License](LICENSE) です。個人・商用プロジェクトで許可も支払いも不要で利用でき、配布時に著作権表示を保持するだけです（サードパーティ表示は [`licenses/`](licenses/)）。
- AnimeFX の名称とロゴ、animefx.voltwake.com のデザインと文言、プレビュー画像（`assets/`、`previews/`）は © Voltwake、All Rights Reserved です。

保留素材の商用利用、カスタムモーション制作、サポートについては、X の [@voltwake](https://x.com/voltwake) まで DM ください —— 詳細は [docs/商业使用说明.md](docs/商业使用说明.md)。
