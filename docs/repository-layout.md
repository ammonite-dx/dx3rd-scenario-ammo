# リポジトリ構成方針

## 1. 位置付けと決定事項

本書は、[要件定義](requirements.md) に定めた単一リポジトリMVPの責務と配置を固定する設計文書である。対象は、Markdownと外部YAMLを正本として扱い、remark-parse/Unifiedと自前parserで検証・変換した意味的HTMLをVivliostyleで組版する実行環境である。VFMは依存に含めない。

専用ブロックの文法は [記法仕様](syntax.md)、意味的HTMLのタグ・属性・クラス契約は [HTML出力契約](html-contract.md)、敵データとコンボのYAML契約は [データ契約](data-contract.md) を正本とする。本書ではそれらを重複定義せず、ファイルの責務、生成物、判型との境界、実装と移行の順序を定める。

現時点での構成上の決定は次のとおりである。

- manuscripts/ のMarkdownと data/enemies/ のYAMLを、作者が編集・レビューするcanonical sourceとして扱う。どちらもGitで追跡する。
- 本文用の narrative block は dialogue、roleplay、choice、check、info、e-lois、battle の7種類に限定する。combo と enemy は本文ブロックではなく、敵YAMLと通常のMarkdownリンクで扱う。
- JSON、正規化AST、意味的HTML、PDFは生成物または交換形式であり、手書きの正本にしない。特にJSONを敵データのcanonical sourceにしない。
- 通常のbuild・previewは gift/ を読まない。gift/ は旧記法の参照元・移行元として残し、明示的なlegacy移行段階だけが読む。
- 変換・検証・意味的HTMLは判型非依存とし、MVPのA5組版はThemeに分離する。A4は同じMarkdown、YAML、意味的HTMLを使う後続拡張とする。
- dist/ はbuildの生成物、.vivliostyle/ はVivliostyleの作業領域であり、正本ではない。

## 2. 現在の実ファイル構成

現時点で存在する新構成の中心は、契約文書、4章の実用シナリオ、敵YAML、構文フィクスチャである。ルートの実行設定、src/、Theme、dist/ はまだ追加段階にあり、現状の gift/ 内設定を新MVPの設定として扱わない。

    .
    ├── docs/
    │   ├── requirements.md
    │   ├── syntax.md
    │   ├── html-contract.md
    │   ├── data-contract.md
    │   └── repository-layout.md
    ├── data/                                  # 現行のcanonical source（Git追跡）
    │   └── enemies/
    │       └── gray-experiment.yaml
    ├── manuscripts/                            # 現行のMarkdown正本（Git追跡）
    │   └── sample/
    │       ├── README.md
    │       ├── 01-opening.md
    │       ├── 02-traces.md
    │       ├── 03-resonance.md
    │       └── 04-climax.md
    ├── tests/
    │   └── fixtures/                           # 現行の契約入力（Git追跡）
    │       ├── README.md
    │       ├── data/enemies/sample-warden.yaml
    │       ├── valid/
    │       └── invalid/
    └── gift/                                   # 旧プロジェクト（移行完了まで保持）
        ├── package.json
        ├── vivliostyle.config.js
        ├── _postReplaceList.json
        ├── manuscripts/
        ├── themes/
        ├── .vivliostyle/
        ├── node_modules/
        └── gift.pdf

現行ファイルの役割は、[サンプルのREADME](../manuscripts/sample/README.md)、[fixtureのREADME](../tests/fixtures/README.md)、[実用シナリオの敵YAML](../data/enemies/gray-experiment.yaml)、[fixture用敵YAML](../tests/fixtures/data/enemies/sample-warden.yaml) で確認できる。サンプルの章は [01-opening.md](../manuscripts/sample/01-opening.md)、[02-traces.md](../manuscripts/sample/02-traces.md)、[03-resonance.md](../manuscripts/sample/03-resonance.md)、[04-climax.md](../manuscripts/sample/04-climax.md) の4つである。

gift/ の構成と旧成果物の確認根拠は、[gift/package.json](../gift/package.json)、[gift/vivliostyle.config.js](../gift/vivliostyle.config.js)、[_postReplaceList.json](../gift/_postReplaceList.json)、[旧Themeのmain.css](../gift/themes/vivliostyle-theme-dx3rd-ammonite/main.css) とする。gift/node_modules/ と gift/.vivliostyle/ は依存物・作業状態であり、新構成の入力や成果物置場ではない。

## 3. 正本、fixture、生成物の境界

### 3.1 正本

| パス | 位置付け | Git上の扱い | 判型依存 |
| --- | --- | --- | --- |
| manuscripts/**/*.md | シナリオ本文、frontmatter、通常Markdown、7種類の narrative block、YAMLへの通常リンク | 追跡する | A5/A4非依存 |
| data/enemies/*.yaml | 敵本体と敵内コンボのcanonical source | 追跡する | A5/A4非依存 |
| tests/fixtures/**/*.md | Markdown契約を検証する入力 | 追跡する | A5/A4非依存 |
| tests/fixtures/data/enemies/*.yaml | fixture専用の参照データ | 追跡する | A5/A4非依存 |

data/enemies/ はリポジトリ直下の正本入力である。tests/fixtures/data/enemies/ はテストを自己完結させるための別名前空間であり、実用シナリオのデータを代用しない。コンボは data/combos/ に分離せず、対象敵の enemy.combos[] として同じYAMLに置く。

### 3.2 生成物

JSONを出力する場合も、YAMLから機械的に生成する交換形式または中間表現に限定する。JSONを編集してYAMLへ戻す運用、JSONから敵IDやコンボIDを推測する運用は採用しない。意味的HTMLとPDFも同じく正本から再生成する。

| パス | 生成元 | Git上の扱い | 判型依存 |
| --- | --- | --- | --- |
| dist/html/ | Markdownと参照YAMLの解析・検証・AST変換 | 生成物。通常はignoreする | A5/A4非依存 |
| dist/pdf/ | dist/html/ と選択したTheme | 生成物。通常はignoreする | 選択した判型に依存 |
| .vivliostyle/ | Vivliostyleの workspaceDir | 作業状態。ignoreする | 実行設定に依存 |
| coverage/、test-results/、tmp/ | テスト・移行・開発の一時処理 | 生成物。ignoreする | A5/A4非依存。ただしvisual結果は後続段階 |

dist/ や .vivliostyle/ がまだ存在しない段階でも、正本入力をそこへ移動して空の置場を先に作ることはしない。buildを実装した段階で、必要なファイルを生成する。

## 4. 推奨ツリーと後続配置

次のツリーは、現行の入力を残したまま実行経路を追加する際の目標である。[現行] はすでに存在するもの、[後続] は実装時に最初の実ファイルと同時に追加するもの、[生成] はbuildやテストが作るものを示す。空のディレクトリだけを先に作ることはしない。

    .
    ├── package.json                         # [後続] ルートのscriptsと依存関係
    ├── package-lock.json                    # [後続] ルート依存のロック
    ├── vivliostyle.config.js               # [後続] MVPのA5設定
    ├── .gitignore                           # [後続] 生成物・依存物の規約
    ├── src/                                 # [後続] 実装とCLI
    │   ├── core/
    │   │   ├── parse/
    │   │   ├── validate/
    │   │   ├── transform/
    │   │   └── index.js
    │   ├── cli/
    │   │   ├── build.js
    │   │   └── preview.js
    │   └── migration/                       # [現行] 明示起動する一回限りのlegacy移行
    ├── manuscripts/                         # [現行]
    │   └── sample/                          # 4章の実用シナリオ
    ├── data/                                # [現行] canonical source、Git追跡
    │   └── enemies/
    ├── tests/                               # [現行]
    │   ├── fixtures/                        # 構文・参照契約の入力
    │   ├── unit/                            # [後続] AST・診断・変換のテスト
    │   ├── integration/                     # [後続] build/previewの結合テスト
    │   └── visual/                          # [後続] 画像・視覚回帰
    ├── themes/
    │   └── a5/                              # [後続] A5専用Theme
    ├── assets/                              # [後続] 実際に必要な共有資産
    │   ├── fonts/
    │   └── images/
    ├── dist/                                # [生成] HTML/PDF
    ├── .vivliostyle/                        # [生成] workspaceDir
    ├── coverage/                            # [生成]
    ├── test-results/                        # [生成]
    ├── docs/                                # [現行]
    └── gift/                                # [現行] legacy参照・移行元

manuscripts/sample/ と tests/fixtures/valid/11-kitchen-sink.md は役割が異なる。前者は4章を通して読める実用シナリオ例、後者は7種類の narrative block、標準Markdown、敵・コンボの通常リンクを一つの入力で確認する構文網羅・スモーク用fixtureである。実用シナリオをfixtureの代わりにしたり、fixtureを配布用サンプルとみなしたりしない。

## 5. ディレクトリごとの責務

### 5.1 Markdown正本

manuscripts/<scenario-id>/ は作者が編集・レビューする本文の置場である。シナリオに属する章Markdownと、本文から相対参照する資産を配置する。ただし現在の manuscripts/sample/ には画像資産がなく、4章のMarkdownとREADMEだけで成立している。画像を現行サンプルの成立条件にしない。

本文用の narrative block は次の7種類だけである。

| ブロック | 責務 |
| --- | --- |
| dialogue | 台詞・会話 |
| roleplay | 自由演技や進行指示 |
| choice | 選択、分岐、選択後の進行 |
| check | 技能、難易度、必須性、判定結果 |
| info | GM向け情報や情報収集項目 |
| e-lois | Eロイスに関する処理・説明 |
| battle | 戦闘の進行、配置、終了条件、参照先 |

敵の本質データとコンボの機械データは本文に埋め込まず、data/enemies/<enemy-id>.yaml の正本をMarkdownの通常リンクから参照する。combo と enemy を本文用ブロックとして追加しない。

現行サンプルは画像なしで成立する。画像fixtureと tests/visual/ の視覚テストは、画像資産の配置・ライセンス・レンダリング経路が決まった後の後続段階で追加し、現時点のサンプルやvalid fixtureに存在しない画像への参照を置かない。

### 5.2 構造化データ

data/enemies/ は実用シナリオが参照する敵データのcanonical sourceである。ファイル名のID、YAML内の enemy.id、Markdownリンクのパス、コンボfragmentを一致させ、[データ契約](data-contract.md) の型・ID・参照整合性に従う。

JSONはYAMLから生成する交換形式または中間表現に限る。dist/ に生成されたJSONが将来追加されても、data/enemies/ のYAMLを置き換えたり、手書きJSONをGit追跡の正本として追加したりしない。

### 5.3 テストとfixture

tests/fixtures/ は実装の都合で書き換えず、入力契約として追跡する。

- valid/ は正常な章文書と記法の入力を固定する。11-kitchen-sink.md は構文網羅・スモーク用であり、実用シナリオの章構成を表さない。
- invalid/ は未知ブロック、閉じ忘れ、frontmatter、H1、フィールド、属性リスト、入れ子、敵・コンボ本文ブロックなどの診断対象を固定する。
- tests/fixtures/data/enemies/ はfixtureだけが使う外部YAMLを置く。ルートの data/enemies/ とは正本の境界を分ける。
- `tests/fixtures/migration/` と `tests/fixtures/legacy-gift/` は、複合・曖昧・壊れたフェンスと敵YAML移行の最小入力を固定する。
- 画像fixtureとvisual testは後続段階で追加し、画像のない現行入力を無理に画像回帰へ変えない。

unit/ と integration/ も実装段階で追加する。buildとpreviewは同じAST解析・検証・意味変換を共有し、gift/ を入力探索先にしない。

### 5.4 実装、Theme、判型

src/core/ はMarkdownとYAMLを解析・検証し、判型に依存しない意味的HTMLを返す。src/cli/ はbuild・previewの入出力を担当し、通常経路からlegacy移行を呼び出さない。src/migration/ は明示的に起動した一回限りの移行だけを担当する。

themes/a5/ は意味的HTMLにA5のページ寸法、余白、書体、改ページ、装飾を適用する。変換ツールやYAML契約をA5固有にしない。A4を追加するときは、同じ正本と意味的HTMLを使い、A4側のTheme・設定・visual testで調整する。

dist/html/ は判型非依存の意味的HTML、dist/pdf/ は選択したThemeと判型に依存するPDFとする。HTMLへA5/A4の寸法やCSSを埋め込んで分岐させない。

## 6. gift/ のライフサイクル

gift/ は旧プロジェクトの参照・移行元として、legacy移行が完了するまで現状維持する。次の境界を守る。

- 通常のroot build・previewは gift/、その設定、旧HTML、旧PDF、旧作業領域を読まない。
- gift/ のMarkdownやHTMLを新しい manuscripts/ の正本へ手でコピー・上書きしない。
- 旧入力を移行するときは、対象を `tests/fixtures/legacy-gift/` に最小限固定し、期待するMarkdownと外部YAMLリンクを `tests/fixtures/migration/` でレビュー可能にする。
- 移行ツールは明示起動し、曖昧な旧入力を推測でbuildへ通さない。移行後のMarkdownは通常のroot buildで検証する。
- gift/ の縮小・移動・生成物整理は、legacy fixture、移行結果、視覚比較、ライセンスを確認した独立コミットで行う。

移行完了後も、比較資料として必要な旧設定・旧Theme・旧生成物と、回帰テストに必要な最小入力を同じ場所に混在させない。通常経路が gift/ を参照しないことを設定・依存・パス検索で確認する。

## 7. Git追跡と生成物

ルート実行経路を追加する段階で、.gitignore に依存物・Vivliostyle作業領域・dist/・テスト出力・一時領域を追加する。正本入力の manuscripts/、ルート data/、fixture、契約文書はignoreしない。

| 種別 | 例 | 扱い |
| --- | --- | --- |
| canonical source | manuscripts/**/*.md、data/enemies/**/*.yaml | Git追跡。手編集する入力 |
| fixture input | tests/fixtures/**/*.md、tests/fixtures/data/**/*.yaml | Git追跡。契約を固定する入力 |
| implementation | src/、themes/a5/、root設定 | Git追跡。後続実装で追加 |
| semantic output | dist/html/ | build生成物。手編集せず、通常はignore |
| shaped output | dist/pdf/ | 選択したA5/A4 Themeの生成物。手編集せず、通常はignore |
| work state | .vivliostyle/、coverage/、test-results/、tmp/ | 再生成可能な作業状態。ignore |
| legacy reference | gift/ | 移行完了まで既存状態を保持。通常buildの入力にはしない |

data/ を生成物置場へ移動しない。敵YAMLを別形式へ変換した結果を保存する場合は、生成物として dist/ などの明示した出力先に置き、入力のGit追跡を維持する。

## 8. パスとファイル名

- 文書と設定のパス区切りは / とし、Windowsの絶対パス、ユーザー名、環境変数を正本設定に書かない。
- Markdownのリンクは、そのMarkdownファイルを基準にしたリポジトリ内の相対パスを使う。敵・コンボリンクは [データ契約](data-contract.md) の形式に従う。
- 通常の新規ファイル名は小文字ASCII、数字、ハイフン、必要な拡張子で構成する。章の並びは 01-opening.md のように明示する。
- UTF-8を使用し、OS依存の改行や大文字小文字差に依存しない。YAMLのファイル名と enemy.id の大文字小文字を一致させる。
- 将来、画像やフォントを入力資産に含める場合は、追跡対象の資産、ライセンス、相対参照、オフライン解決を同じ変更で用意する。現行サンプルは画像なしで成立する。

## 9. 実装の順序とコミット計画

docs/、tests/、manuscripts/、ルート data/ はすでに作成済みの入力・契約として扱う。後続作業でこれらを空のscaffoldに戻したり、同名の仮ファイルを作り直したりしない。各ディレクトリは、最初に意味のあるファイルを追加できる段階で作成する。

| 段階 | 作成・変更するもの | 必須確認 | コミット単位 |
| --- | --- | --- | --- |
| 0. 現行入力の固定 | 既存のdocs、data/enemies/、4章のmanuscripts/sample/、tests/fixtures/をそのまま基準にする | 相対リンク、YAML正本、7語彙、fixtureの責務を確認 | 本書のような文書更新だけ |
| 1. root実行経路 | package.json、ロック、root config、.gitignore、実ファイルを伴うsrc/ | root buildがgift/を読まず、依存とパスが再現できる | root実行経路の追加だけ |
| 2. 解析・検証 | src/core/ と unit/、integration/を実装 | 既存valid/invalid fixture、frontmatter、H1、7語彙、YAMLリンクを検証 | 変換基盤と契約テスト |
| 3. 変換・生成 | src/cli/、意味的HTML、dist/html/の生成経路を接続 | buildとpreviewが同じHTMLを使い、JSONをYAML正本と誤認しない | build/previewの実装 |
| 4. A5組版 | themes/a5/、root configのA5設定、必要なフォント | Markdown・YAML・意味的HTMLを変更せずA5 PDFを生成 | A5 Themeと受入確認 |
| 5. 画像・visual | 実在する画像資産、tests/visual/、承認済みスナップショットを必要な範囲だけ追加 | ライセンス、オフライン解決、画像なし現行サンプルとの責務を分離 | 後続のvisual変更 |
| 6. legacy移行 | `tests/fixtures/legacy-gift/`、`tests/fixtures/migration/`、`src/migration/`、`migrate:gift` | gift由来の曖昧さを診断し、移行後のMarkdownを通常buildで再検証 | 移行fixtureと移行ツール |
| 7. gift整理 | 必要な回帰入力と比較資料を分離し、不要な旧作業状態・生成物を整理 | 通常のbuild、preview、test、visualがgift/を参照しない | legacy整理だけ |

段階1〜4では、既存の正本・fixtureを実装の受け入れ入力として利用する。段階5の画像fixture・visual testは現行サンプルを変更しない後続段階とする。段階6のlegacy移行は通常buildへ互換層を戻す作業ではない。

## 10. 関連文書

- 要件、MVPの範囲、正本・生成物、build/preview、移行段階: [docs/requirements.md](requirements.md)
- narrative blockの文法、frontmatter、本文の許可範囲: [docs/syntax.md](syntax.md)
- 意味的HTMLのタグ、属性、クラス、ARIA、章構造: [docs/html-contract.md](html-contract.md)
- 敵YAML、敵内コンボ、JSON交換形式、参照整合性: [docs/data-contract.md](data-contract.md)
- 実用サンプルの章構成と資産境界: [manuscripts/sample/README.md](../manuscripts/sample/README.md)
- 構文網羅・スモークfixtureの分類: [tests/fixtures/README.md](../tests/fixtures/README.md)

本書の配置決定は、MarkdownとYAMLのcanonical source、7種類の本文用 narrative block、AST変換、gift/を読まない通常build、A5 Themeと判型非依存の変換、生成物の分離、legacyの一回限り移行を前提とする。
