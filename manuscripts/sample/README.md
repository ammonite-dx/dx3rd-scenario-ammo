# 実用シナリオサンプル

`manuscripts/sample/` は、短いDX3rd風シナリオを執筆するときの構成例です。本文は既存の `gift` 本文を複製せず、雨音をめぐる架空の事件として書いています。

## 読む順序

1. [01-opening.md](01-opening.md) — プリプレイと導入。依頼を受け、事件の入口へ向かう。
2. [02-traces.md](02-traces.md) — ミドルフェイズ。封鎖された駅で手掛かりを集める。
3. [03-resonance.md](03-resonance.md) — ミドルフェイズ。装置の前で相手と対話し、方針を選ぶ。
4. [04-climax.md](04-climax.md) — クライマックス戦闘と結末。選択の結果を踏まえて事件を終える。

各章はfrontmatter、章固有タイトルを正本とするプレーンなH1、日時・場所・シーンプレイヤー・解説・描写・結末という順で読める、独立したMarkdown文書です。章間の移動には同じディレクトリ内の相対リンクを使います。

## ビルドの正本

ビルドが読む正本は、このディレクトリの4つのMarkdownと、戦闘から参照する [gray-experiment.yaml](../../data/enemies/gray-experiment.yaml) です。Markdownには会話、描写、ロールプレイ、情報開示、分岐、戦闘の配置・終了条件・裁定を置き、生成HTMLやPDFは編集しません。

## YAMLとの境界

敵のID、能力値、技能、エフェクト、アイテム、ロイス、Eロイス、コンボは `data/enemies/` のYAMLを正本にします。本文からは、敵全体をfragmentなし、コンボを `#afterglow-chain` 付きの通常相対リンクで参照します。コンボの機械データや敵の戦闘プランを本文へ複製しないことが境界です。

## 生成物の配置

中間HTMLは `dist/html/`、PDFは `dist/pdf/` に出力します。Vivliostyleの作業領域やキャッシュは `.vivliostyle/` に集約し、いずれもMarkdownやYAMLの代わりに手編集するものではありません。

画像はまだ収録していません。今後のfixture対象として追加できるよう記録だけを残し、現在の原稿から存在しない画像は参照しません。

記法と配置の根拠は、[要件定義](../../docs/requirements.md)、[記法仕様](../../docs/syntax.md)、[HTML出力契約](../../docs/html-contract.md)、[データ契約](../../docs/data-contract.md)を参照してください。
