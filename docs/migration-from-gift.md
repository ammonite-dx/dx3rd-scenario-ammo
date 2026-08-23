# gift旧原稿の一回限り移行

## 位置付け

`src/migration/gift.ts` は、旧 `gift/` を読むためだけの明示起動入口である。通常の
parser、renderer、buildはこのモジュールを参照せず、旧記法を受理する互換層も追加しない。
`gift/` は参照専用であり、変換先は新規の一時ディレクトリだけに公開する。

```text
npm run migrate:gift -- --source gift --output tmp/gift-migration
npm run migrate:gift -- --source gift --output tmp/gift-migration --dry-run
```

出力先は既定で `tmp/gift-migration` である。明示出力を指定しても、既存ディレクトリ、
`gift/`、`manuscripts/`、`data/`、絶対パス、リポジトリ外への traversal、source/output の
重なり、root外へ出る symlink を拒否する。新しいステージディレクトリへ全ファイルを
書き込んだ後、ディレクトリ単位で公開するため、既存出力を上書きしない。

出力構成は次のとおりである。

```text
tmp/gift-migration/
├── manuscripts/**/*.md       # 変換候補。元の相対位置を維持
├── data/enemies/*.yaml       # data-contractを通った敵だけ
├── manuscripts/img/...       # 変換後Markdownから参照された画像
├── migration-report.json     # 機械可読の全診断・検証結果
└── migration-report.md       # レビュー用の要約
```

`migration-report.json` のファイル状態は `success`、`partial`、`failed` の3種類である。
`partial` は出力候補がありparserは通っても未解決判断が残る状態、`failed` はparser、
参照、YAMLのいずれかが失敗した状態であり、成功件数に含めない。CLIも未解決または
失敗が残る場合は終了コード1を返す。

## 旧記法と現行構文の対応表

対応は `gift/_postReplaceList.json` と旧Markdownの実出現を照合して決めている。
HTML置換規則そのものを再実行するのではなく、行・フェンス・旧ブロックの境界を先に
走査する。

| 旧記法・実出現 | 意味 | 移行先 | 判定 |
| --- | --- | --- | --- |
| `:::section-title ...` と内部H1 | 章の装飾タイトルとkicker | 通常H1、kickerはfrontmatter | 安全変換。内部H1前の最初の文章をkickerへ移す |
| `:::serif 名前` | 台詞 | `:::dialogue 名前` | 安全変換 |
| `:::rp 名前` | 自由ロールプレイ | `:::roleplay 名前` | 安全変換 |
| `:::select 名前` | 選択・分岐 | `:::choice 名前` | 安全変換 |
| `:::check 名前` | 判定 | `:::check 名前` | 安全変換 |
| `:::info 名前` | 情報収集 | `:::info 名前` | 安全変換 |
| `:::e-lois 名前` | Eロイスの処理 | `:::e-lois 名前` | 安全変換 |
| `:::battle 名前` | 戦闘進行 | `:::battle 名前` | 安全変換 |
| `[難易度] 8 ★` | シナリオ進行上必須の判定 | `[難易度] 8` と `[必須]` | 根拠が明確な機械変換、診断を残す |
| 旧 `[ラベル] 値` の説明リスト | 旧Themeの説明リスト | `**ラベル**: 値` | 通常Markdown化 |
| 行頭の `~` | 旧Themeの no-indent 表示指定 | `~` を除去 | 内容を変えない表示指定の変換 |
| `:::trailer` | トレーラー用装飾コンテナ | 内部を通常Markdownへ展開 | 現行7ブロックに対応しないため警告 |
| `:::toc` | 目次用装飾コンテナ | 内部を通常Markdownへ展開 | 現行7ブロックに対応しないため警告 |
| `:::combo 名前`（敵ページ） | 敵固有コンボ | `data/enemies/<id>.yaml` の `enemy.combos[]` と通常リンク | YAMLが契約を満たす場合だけ変換 |
| `:::combo 名前`（所有者不明） | 構造化コンボ | 通常Markdownへ展開し、原文と診断を保持 | 未解決。YAMLを捏造しない |
| `:::enemy`、未知の旧ブロック、閉じ忘れ | 旧専用構文 | 原文候補を残し、parser失敗と診断 | 未解決・失敗 |
| `[エネミーデータ](shiro.html)` | 旧敵ページ参照 | `[敵データ：表示名](../data/enemies/shiro.yaml)` | YAML生成・所有者同定時だけ変換 |
| `[敵データ: 名前](shiro.html)` | 旧敵ページ参照 | 全角コロンの敵YAML通常リンク | 対応する敵ページを解決できる場合 |
| `foo.html` の章リンク | 旧HTMLページ参照 | 対応する `foo.md` への通常リンク | 対象がない場合は未解決診断 |
| `![](image.png){width=400}` | Markdown後の属性リスト | `![](image.png)` と画像コピー | 幅指定は現行契約外なので警告 |
| `{表示\|読み}` | 旧Theme/VFMのルビ表現 | 本文は原文保持、ブロックタイトルは `表示（読み）` | 現行契約外。未解決診断 |

敵YAMLは、4能力値、技能の能力値参照、エフェクト、D/Eロイス、コンボの必須値と
参照先を安全に抽出できる場合だけ生成する。IDは出力ファイル名と一致する小文字
ASCII IDを生成し、コンボIDも通常リンクのfragmentに使える形式にする。能力値、効果
名、判定式、攻撃力などを旧原稿から読み取れない場合は、`data/enemies/` に空欄や
推測値を作らず、旧Markdownと未解決診断を残す。

## 実giftの棚卸し

調査入力は `gift/manuscripts/**/*.md`、`gift/_postReplaceList.json`、旧
`gift/vivliostyle.config.js`、旧Themeのファイル一覧である。`node_modules/`、
`.vivliostyle/`、生成HTML/PDFは除外する。現在の実giftでは原稿24件を対象に、次の
旧ブロックが出現した。

| 旧名 | 件数 |
| --- | ---: |
| `section-title` | 24 |
| `serif` | 29 |
| `rp` | 7 |
| `select` | 3 |
| `check` | 2 |
| `info` | 6 |
| `e-lois` | 3 |
| `battle` | 2 |
| `combo` | 7 |
| `trailer` | 1 |
| `toc` | 1 |
| 開始・終了を含む `:::` | 170 |

置換表のうち、旧生成HTMLを対象とする `<p>...`、`<div>...`、`<hr>`、`<a>` の規則は
旧Markdownでは0件だった。旧Markdownに直接出現する規則は `serif` 29、`rp` 7、
`select` 3、`check` 2、`info` 6、`e-lois` 3、`battle` 2、`combo` 7、`trailer` 1、
`toc` 1、広域の `:::` 170件である。この突合結果は各実行のJSON/Markdownレポートにも
保存される。

## レビューと採用手順

1. 出力レポートで `failed`、`unresolved`、`MIGRATION_RUBY_PRESERVED`、リンク未解決、
   所有者不明のコンボを確認する。
2. `manuscripts/**/*.md` を通常 `parseScenarioMarkdown` に通し、`data/enemies/*.yaml`
   を `parseEnemyDataYaml` に通す。移行ツール自身もこの検証を実施する。
3. 外部YAMLリンクを `resolveEnemyDataReferences` で再確認し、通常buildの入力として
   採用するMarkdown・YAMLだけを人手レビュー後に新正本へ取り込む。
4. ルビ、旧HTMLリンクの対象不明、説明リストの意味、敵の省略データ、コンボの
   `item_ids` など、レポートに残ったユーザー判断を埋めてから採用する。
5. 採用前後に `gift/` のGit statusとhashが不変であることを確認する。移行出力は
   `tmp/` または `generated/` のignore対象であり、コミットしない。
