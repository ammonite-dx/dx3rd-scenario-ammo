# リポジトリ構成方針

## 1. 位置付けと決定事項

本書は、[`docs/requirements.md`](requirements.md) に定めた単一リポジトリMVPの責務と配置を固定する設計文書である。対象は、Markdown正本をVFM/UnifiedのASTで検証・変換し、意味的HTMLをVivliostyleでA5 PDFへ組版する実行環境である。

この文書ではディレクトリ、ファイルの責務、生成物の扱い、移行の順序だけを定める。専用ブロックの文法・属性スキーマは [`docs/syntax.md`](syntax.md)、意味的HTMLのタグ・属性・クラス契約は [`docs/html-contract.md`](html-contract.md) を正本とし、本書で重複定義しない。両文書は同時作成中であり、現時点では参照先として扱う。

MVPでは次を決定する。

- リポジトリ直下を唯一のnpmプロジェクトとし、`package.json`、`package-lock.json`、`vivliostyle.config.js`を直下に置く。workspace/monorepoにはしない。
- `manuscripts/` のMarkdownだけを編集対象の正本とする。生成HTML、PDF、旧記法のHTMLは正本にしない。
- ASTの解析・検証・意味変換、CLI、移行を `src/` の責務別ディレクトリに分ける。通常のbuild・previewは移行コードを呼び出さない。
- Themeは意味的HTMLだけを受け取り、MVPは `themes/a5/` のA5組版に限定する。変換ツールは判型を知らない。
- `tests/fixtures/` は記法・変換・移行の入力を固定し、`tests/visual/` はA5の目視品質を固定する。
- Vivliostyleの作業領域はリポジトリ直下の `.vivliostyle/`、中間HTMLとPDFは `dist/` に集約する。いずれも再生成物であり、通常は追跡しない。
- `gift/` は旧記法の参照元・移行元として、移行フィクスチャの成立までは現状維持する。この文書作成では実ファイルを移動しない。

## 2. 現在の構成と扱い

現時点のリポジトリは、`docs/requirements.md`、`gift/`、空の作業用 `tmp/` を中心とする。`gift/` には次の構成がある。

```text
gift/
├── package.json                  # 旧プロジェクトのbuild/previewとCLI依存
├── package-lock.json
├── vivliostyle.config.js         # 旧A5設定、manuscriptsをentryContextにする
├── _postReplaceList.json         # 旧正規表現後処理の置換定義
├── manuscripts/
│   ├── *.md                      # 旧原稿入力
│   ├── *.html                    # 旧生成HTML
│   ├── img/                      # 旧原稿画像
│   └── themes/                   # CLIが保持する旧作業用Theme関連
├── themes/vivliostyle-theme-dx3rd-ammonite/
│   ├── main.css                  # 旧A5 Theme
│   └── img/                      # Theme画像
├── .vivliostyle/                 # 旧CLI作業領域
└── gift.pdf                      # 旧生成PDF
```

このほか、作業ツリーには `gift/node_modules/` が存在する。これは依存インストール結果であり、ソースではない。現行Git履歴には旧 `.vivliostyle/`、旧生成HTML、`gift/gift.pdf` も含まれているため、移行完了前に一括削除や再生成はしない。旧構成の確認根拠は、[`gift/package.json`](../gift/package.json)、[`gift/vivliostyle.config.js`](../gift/vivliostyle.config.js)、[`gift/_postReplaceList.json`](../gift/_postReplaceList.json)、旧Themeの [`main.css`](../gift/themes/vivliostyle-theme-dx3rd-ammonite/main.css) とする。

`gift/` の内容は、新しいbuildの入力・依存・Themeとして直接参照しない。`gift` の `serif`、`rp`、`select` などの旧名、`section-title` などの旧タイトル表現、旧HTMLのクラスは、移行規則と比較資料のためにだけ保持する。

## 3. MVPの推奨ツリー

実装開始後の単一リポジトリは次の形を基準にする。`[生成]` はbuildやテストで作られる領域、`[予定]` はMVP開始時に作成する配置、`[将来]` はMVP後に追加する候補を表す。

```text
.
├── package.json                 # [予定] ルートのscriptsと依存関係
├── package-lock.json            # [予定] ルート依存の再現用ロック
├── vivliostyle.config.js        # [予定] MVP A5の組版設定
├── .gitignore                   # [予定] ルートの生成物・依存物規約
├── src/
│   ├── core/
│   │   ├── parse/               # VFM/UnifiedからASTを構築
│   │   ├── validate/            # frontmatter、専用ブロック、位置付き診断
│   │   ├── transform/           # ASTから意味的HTMLへ変換
│   │   └── index.js             # build/previewが共有する変換API
│   ├── migration/
│   │   └── gift/                # 旧記法からMarkdown正本への一回限りの移行
│   └── cli/
│       ├── build.js             # 共有変換APIからHTML/PDFを生成
│       ├── preview.js           # buildと同じ変換結果をpreviewへ渡す
│       └── migrate-gift.js      # 明示的に起動したときだけ移行を実行
├── manuscripts/
│   └── sample/
│       ├── 00-overview.md       # [予定] 代表原稿のMarkdown正本
│       └── assets/
│           └── images/          # [予定] 代表原稿に固有の画像
├── assets/
│   ├── fonts/                   # [予定] オフライン組版用の固定フォント
│   │   └── licenses/            # フォントごとのライセンス記録
│   └── images/                  # [予定] 複数原稿で共有する非Theme画像だけ
├── themes/
│   └── a5/
│       ├── main.css             # [予定] A5のページ・書体・装飾・改ページ
│       └── assets/              # [予定] Theme専用の画像・アイコン
├── tests/
│   ├── unit/                    # AST、検証、意味変換の小さなテスト
│   ├── integration/             # build/preview、HTML、PDF経路の結合テスト
│   ├── fixtures/
│   │   ├── valid/               # 正常な正本Markdown入力
│   │   ├── invalid/             # unknown、閉じ忘れ、属性不足、入れ子等
│   │   ├── migration/           # 旧入力から期待する新Markdownへの対応表
│   │   └── legacy/              # gift由来の自動移行テスト入力
│   └── visual/
│       ├── cases/               # A5で組版する代表ケースの定義
│       └── snapshots/a5/         # 承認済みの視覚ベースライン
├── dist/                        # [生成] 手編集しないbuild成果物
│   ├── html/                    # [生成] 意味的HTML
│   └── pdf/                     # [生成] A5 PDF
├── .vivliostyle/                # [生成] Vivliostyle workspaceDir
├── coverage/                    # [生成] テストカバレッジ
├── test-results/                # [生成] visual testの一時出力
├── tmp/                         # [生成] 開発者の一時作業領域
├── docs/
│   ├── requirements.md
│   ├── syntax.md
│   ├── html-contract.md
│   └── repository-layout.md
├── gift/                        # 移行完了まで現状維持
├── reference/                   # [将来] 残すべき旧資料の読み取り専用置場
│   └── gift/
└── [将来] themes/a4/            # A4用Theme。MVPでは作成しない
```

`reference/gift/` と `tests/fixtures/legacy/` は同じものではない。前者は旧設定・旧HTML・旧PDF・旧Themeなどの文脈や視覚比較を残すための非実行資料、後者は移行ツールが自動テストで読む最小限の旧Markdown・画像・メタデータである。両方を残す場合でも、通常のbuildがどちらかを暗黙に読む構成にはしない。

## 4. ディレクトリごとの責務

### 4.1 ルート設定と実行経路

| パス | 責務 | 置かないもの |
| --- | --- | --- |
| `package.json` | scripts、実行依存、テスト依存、Nodeの実行条件を定義する。`build` と `preview` は同じ変換パイプラインを呼ぶ。 | 原稿、Themeの細かなCSS、旧移行専用の恒久互換設定 |
| `package-lock.json` | 実際にbuild・preview・PDFを検証した依存バージョンを固定する。 | `latest` のみを前提にした依存解決 |
| `vivliostyle.config.js` | ルートを基準に、`dist/html/` のエントリ、`themes/a5/`、`size: 'A5'`、Themeのentry設定を指定する。 | Markdownの記法解釈、旧記法の置換、AST検証 |
| `src/cli/` | コマンドの引数処理と入出力を担当する。`build` と `preview` は `src/core/index.js` の同じ変換結果を使う。 | buildだけの寛容なフォールバック、previewだけの旧記法互換 |
| `src/core/` | VFM/UnifiedのAST、検証、意味的HTMLの安定した変換APIを提供する。 | A5/A4の余白・書体・改ページ、PDF固有の装飾 |
| `src/migration/` | giftの旧記法を新しいfrontmatter・通常のH1・専用ブロックを持つMarkdownへ変換する。 | 通常のbuildからの自動呼び出し、HTMLを正本にする処理 |

変換失敗時は `src/core/validate/` が入力ファイル、行・列、専用ブロック名、原因、修正方向を含む診断を返す。移行失敗時は、これに変換元位置、変換先候補、推測を避けた失敗理由を加える。HTML断片を正規表現で後処理する層は作らない。

### 4.2 Markdown正本と原稿サンプル

`manuscripts/<scenario-id>/` は作者が編集・レビューする正本である。1つのシナリオに属する章Markdownと、そこから相対参照する原稿固有画像を同じシナリオディレクトリに置く。新規正本にはMarkdown以外の対応HTMLやPDFを置かない。

`manuscripts/sample/` は、MVPの受け入れに使う代表原稿を置く場所である。frontmatter、通常のH1、通常Markdown、8種類の専用ブロック、画像、リンク、改ページに相当する入力を、記法仕様書とHTML出力契約に従って含める。構文の定義自体は本書に複製しない。

画像の責務は次のように分ける。

- `manuscripts/<scenario-id>/assets/images/`: そのシナリオだけが参照する入力画像。Markdownからは同じディレクトリを起点に相対参照する。
- `assets/images/`: 複数シナリオで共有する入力画像。共有理由とライセンスを近接したREADMEまたは文書で記録する。共有できない画像をここへ集約しない。
- `themes/a5/assets/`: Themeの装飾やアイコンなど、文書内容ではなく組版に属する画像。Markdownから直接参照しない。

### 4.3 フォント

`assets/fonts/` はPDF生成に必要な固定フォントの入力資産である。フォント本体、ライセンス記録、採用バージョン、CSS上のfamily名とフォールバック順をここで追跡する。外部Google Fonts URLを実行時の必須条件にしない。

Themeは `assets/fonts/` のフォントをCSSから相対参照する。フォントを `dist/`、`.vivliostyle/`、`gift/`、あるいはユーザーのOS固有のフォントディレクトリに依存させない。ライセンス上同梱できないフォントは、取得手順と固定ハッシュを記録し、ネットワークなしで検証済み資産を指定できる形にする。

### 4.4 テストとフィクスチャ

`tests/fixtures/` は実装の都合で書き換えず、入力と期待結果の契約として扱う。

- `valid/` は8種類の専用ブロック、章構造、通常Markdown、画像・リンクを最小例に分ける。
- `invalid/` は未知名、終端不整合、必須属性不足・形式不正、禁止された専用ブロックの入れ子、frontmatter不正、H1欠落を分ける。各ケースは位置付きエラーを検証できるようにする。
- `migration/` は旧入力ファイルと、レビュー可能な新Markdownの期待結果を対応付ける。期待結果はHTMLではなくMarkdown正本とする。
- `legacy/` は自動移行テストが読む旧Markdownと、変換に必要な最小画像・メタデータを置く。旧ファイル名を保持する必要がある場合は、このディレクトリだけ例外として許容する。

`tests/unit/` はASTノード、検証、診断、HTML構造を、文字列全体の偶然の一致に依存せず検証する。`tests/integration/` は同一入力をbuildとpreviewへ通し、意味的HTMLの一致、A5 PDF生成、エラー時に新しい成果物を公開しないことを検証する。

`tests/visual/` は `manuscripts/sample/` と `themes/a5/` を使う。実行時に生成するスクリーンショットやPDFレンダリング中間物は `test-results/` に置いて無視し、承認したA5ベースラインだけを `tests/visual/snapshots/a5/` に置く。視覚差分の更新は、意図した変更のレビューと同じコミットに限定する。

### 4.5 Themeと判型

MVPの `themes/a5/` は、意味的HTMLに対するページ寸法、余白、書体、見出し、専用ブロックの視覚表現、改ページ、ページ番号を担当する。専用ブロックの解析、属性補完、旧記法の変換、意味の判断は担当しない。

変換ツールは判型非依存とし、A5の寸法やCSSクラスをASTや意味的HTMLへ埋め込まない。A4はMVP後に、同じMarkdownと同じ意味的HTMLを `themes/a4/` とルート設定のA4プロファイルで組版する。A4用の文字サイズ、余白、改ページ、専用ブロックの収まりはA4側のTheme・設定・視覚テストで調整し、正本と変換APIを分岐させない。

MVPで作成するVivliostyle設定はルートの `vivliostyle.config.js` だけで、A5を既定とする。A4を実装するときも設定ファイルはルートに置く。別設定が必要になった場合は `vivliostyle.config.a4.js` のようなルート直下の明示的プロファイルとし、Themeディレクトリに設定やnpmプロジェクトを埋め込まない。

## 5. `gift/` のライフサイクル

### 5.1 現状維持の範囲

新しい正本・変換ツール・Theme・root npm設定が動き始めても、移行フィクスチャが整うまでは `gift/` を参照・移行元として残す。現段階で行わないことは次のとおりである。

- `gift` のMarkdownやHTMLを新しい `manuscripts/` に手で編集・上書きしない。
- `gift/package.json` や `gift/vivliostyle.config.js` を新MVPの実行設定として再利用しない。新MVPはルート設定から実行する。
- `gift/.vivliostyle/`、`gift/node_modules/`、`gift/gift.pdf` を新しい生成物置場へコピーしない。
- 旧生成HTMLを新しい意味的HTMLの期待結果にしない。旧HTMLは移行結果の視覚比較・調査資料に限る。

### 5.2 移動判定

`gift/` を縮小・移動してよいのは、次のゲートをすべて満たした後である。

1. 移行対象と対象外の旧記法を一覧化し、`_postReplaceList.json`、旧原稿、旧Theme、画像、設定、生成物の役割を説明できる。
2. 対象となる旧Markdownと必要な画像・メタデータが `tests/fixtures/legacy/` に再現可能な形で揃い、`tests/fixtures/migration/` に新Markdownの期待結果がある。
3. 対象ファイルを移行ツールで一括処理でき、曖昧な入力を推測で通さず、入力位置と理由をエラーにできる。
4. 移行後のMarkdownを `manuscripts/<scenario-id>/` の正本としてレビューでき、通常のroot buildで意味的HTMLとA5 PDFを再生成できる。
5. 旧PDF・旧HTMLとの差分を、意図した変更と欠落に分けて目視確認し、画像・フォント・ライセンスの移行漏れがない。
6. 移動後に通常のbuild・preview・テストが `gift/` を参照しないことを、設定・依存・パス検索で確認できる。

### 5.3 移動先

ゲート後は、用途に応じて次のように分ける。

- 移行ツールの回帰入力として必要な旧Markdown・画像・メタデータは `tests/fixtures/legacy/gift/` に置く。
- 旧設定、旧Theme、旧生成HTML、旧PDFなど、文脈や視覚比較のためだけに残す資料は `reference/gift/` に置く。ここは読み取り専用の資料置場で、buildのentryやnpm依存にしない。
- 移行後に作者が編集する新Markdownは `manuscripts/<scenario-id>/` に置く。旧ファイルを正本として参照し続けない。
- `node_modules/` と `.vivliostyle/` は移動せず破棄・再生成する対象、旧PDFと旧HTMLは残す必要があるものだけを `reference/gift/` に選別する。

すべての旧資料を残す必要がない場合でも、移行テストの再現に必要な最小フィクスチャは削除しない。`gift/` の削除または縮小は、上記の移動・検証を一つの独立した変更として扱う。

## 6. 生成物とignore方針

ルートに追加する `.gitignore` は、少なくとも次を無視する。ここでは規約だけを定め、`.gitignore` 自体は本書と同時には作成しない。

```gitignore
node_modules/
**/node_modules/
.vivliostyle/
**/.vivliostyle/
dist/
coverage/
test-results/
tmp/
*.log
*.tgz
```

生成物の扱いは次のとおりである。

| パス・種別 | 生成元 | Git上の扱い |
| --- | --- | --- |
| `dist/html/` | Markdown → AST検証 → 意味的HTML | buildの再生成物。手編集せず、通常はignoreする。MVP成果物としてbuild後に取得できるようにする。 |
| `dist/pdf/` | `dist/html/` → Vivliostyle CLI + A5 Theme | buildの再生成物。通常はignoreする。配布・受け入れ確認ではCI artifactやリリース添付として取り出す。 |
| `.vivliostyle/` | Vivliostyle `workspaceDir` | キャッシュ・一時状態。常にignoreし、正本・成果物として扱わない。 |
| `coverage/` | テストランナー | テスト実行の一時結果。ignoreする。数値を文書化する場合は結果だけをレビュー資料に転記する。 |
| `test-results/` | visual testのスクリーンショット・PDFレンダリング | ignoreする。承認済みベースラインだけを `tests/visual/snapshots/` に明示的に昇格する。 |
| `tmp/` | 移行のdry-runや開発者の一時作業 | ignoreする。正本やフィクスチャの代用にしない。 |
| `assets/`、`manuscripts/`、`tests/fixtures/` | 人がレビューする入力・契約 | 追跡する。ライセンスと出所を記録する。 |
| `package-lock.json` | npm依存解決 | 追跡する。未検証の更新を混ぜない。 |

現在追跡されている `gift/.vivliostyle/`、`gift/gift.pdf`、旧 `gift/manuscripts/*.html` は、このignore規約を追加しただけでは履歴から消えない。移行ゲート後の整理コミットで、必要な資料を `reference/gift/` へ選別してからGit管理対象から外す。

MVPの「納品物」は `dist/html/` と `dist/pdf/` が再現可能に生成されることを意味する。これらを常時リポジトリへコミットすることは意味しない。配布用に固定版を追跡する判断をする場合は、生成日時・入力・依存・Themeを記録し、通常の `dist/` とは別の明示的なリリース成果物として一つのレビュー可能な変更にする。

## 7. パス可搬性とファイル名規約

- 文書、設定、npm scriptsではパス区切りに `/` を使う。Windowsの `C:\...`、バックスラッシュ、ユーザー名、ホームディレクトリをリポジトリ内の設定に書かない。
- Nodeのファイル処理はリポジトリルートを設定ファイルの位置から解決し、`path.resolve`、`path.join` 等でOSの実パスへ変換する。Vivliostyleのentry、Theme、資産参照はリポジトリ相対を基本にする。
- Markdownの画像・リンクは、そのMarkdownファイルを基準にした相対参照を使う。生成HTMLやPDFの位置を基準に参照を書き換えない。
- 通常の新規ファイル名は小文字ASCII、数字、ハイフン、必要な拡張子だけで構成する。章の並びは `00-overview.md` のようにゼロ埋めする。空白、全角記号、大文字小文字だけが異なる名前を使わない。
- 日本語の表示タイトルや本文はファイル名ではなくMarkdown本文・frontmatterで表現する。移行フィクスチャだけは、旧入力との対応を保つ必要がある場合に限り旧ファイル名を保持する。
- UTF-8を使用し、OS依存の改行・エンコーディング・ファイルシステムの大小文字差に依存しない。相対参照の大文字小文字は実ファイル名と一致させる。
- シンボリックリンク、絶対パス、環境変数だけで解決するフォント・画像を新しい正本の必須条件にしない。Windowsで同じcloneを使ってbuildできることを検証する。

## 8. 将来のnpmパッケージ分離境界

MVPではworkspace/monorepoにせず、責務の境界をディレクトリと公開エントリで先に固定する。APIと意味的HTMLの出力契約が安定した後、次の単位を候補にする。

| 将来の単位 | MVPでの場所 | 分離条件 |
| --- | --- | --- |
| Markdown変換・検証コア | `src/core/` | AST入力、診断、意味的HTML出力が安定し、ThemeやCLIに依存しない。 |
| 旧記法移行 | `src/migration/` | gift固有の入力と変換規則を通常のbuildから切り離せる。必要な旧fixtureが自己完結する。 |
| CLI | `src/cli/` | core APIの呼び出し、ファイル入出力、Vivliostyle実行だけを担う境界が固定する。 |
| A5 Theme | `themes/a5/` | HTML出力契約だけに依存し、Markdown解析や変換コードを含まない。 |

分離時も、まず各ディレクトリに公開入口とテストを用意してから、npmパッケージのメタデータ・依存を切り出す。A5 Themeや移行ツールを先に別パッケージにしてMVPの実行経路を複雑化しない。Markdown正本、テストフィクスチャ、`docs/`、A5の受け入れケースは、パッケージ分離後もリポジトリ側に残す。

## 9. 文書確定後の実移動手順

以下は後続作業の順序であり、本タスクでは実行しない。各段階は、コード・移動・生成物整理を混ぜず、検証可能な単位でコミットする。

| 段階 | 実施内容 | 必須検証 | コミット単位 |
| --- | --- | --- | --- |
| 0. 構成の固定 | `docs/repository-layout.md`、`docs/syntax.md`、`docs/html-contract.md` の相互参照と責務を確定する。 | Markdown構造、相対リンク、`git diff --check` 相当。 | 文書だけのコミット。 |
| 1. ルート骨格 | ルートの `package.json`、ロック、`vivliostyle.config.js`、`src/`、`themes/a5/`、`tests/`、`manuscripts/sample/`、資産置場を作る。`gift/` は触らない。 | ルートから依存を再現できる。`gift` が新設定のentry・依存に入っていない。 | `chore: scaffold root project layout` 相当の骨格だけ。 |
| 2. 契約とfixture | 記法仕様・HTML出力契約に沿って正常系・異常系・移行系のfixtureを登録する。 | 8語彙、未知名、閉じ忘れ、属性不足、入れ子、frontmatter、H1欠落の検証対象が揃う。 | `test: add syntax and migration fixtures` 相当。 |
| 3. 変換基盤 | `src/core/` の解析・検証・意味変換と、build/previewの共有経路を実装する。 | unit/integration、buildとpreviewのHTML一致、エラー時の非成功終了と成果物非公開。正規表現HTML後処理がない。 | 変換基盤の実装だけ。Theme・移動を同じコミットにしない。 |
| 4. A5組版 | `themes/a5/`、固定フォント、代表原稿、root configを接続する。 | オフライン資産解決、A5ページ寸法、章タイトル、見出し、8ブロック、画像、リンク、改ページをPDFとHTMLで確認する。 | `feat: add reproducible A5 build` 相当。視覚ベースラインは承認した更新だけ同時に含める。 |
| 5. 旧入力の固定 | `gift` の対象Markdown、必要画像、メタデータだけを `tests/fixtures/legacy/` へ段階的に複製し、期待する新Markdownを `tests/fixtures/migration/` に置く。 | 全対象ファイルの移行dry-run、期待結果との差分、曖昧入力のエラー、ライセンス・画像漏れ。 | `test: capture gift migration fixtures` 相当。`gift`本体の削除はしない。 |
| 6. 正本の移行 | 移行ツールで `manuscripts/<scenario-id>/` を生成し、レビュー後に正本として採用する。 | 新正本を通常のroot build・previewで処理し、旧記法が恒久互換として残っていない。A5の視覚比較を記録する。 | `feat: migrate scenario manuscripts` 相当。生成HTML/PDFは含めない。 |
| 7. `gift` の縮小 | 回帰に必要な旧入力を `tests/fixtures/legacy/gift/`、比較資料を必要に応じて `reference/gift/` へ分ける。不要な旧作業領域・依存・生成物を整理する。 | 通常の設定・検索・npm scriptsが `gift/` を読まない。全fixture、移行、build、preview、visual testが通る。 | `refactor: relocate legacy gift references` 相当の移動・削除だけ。 |
| 8. ignore整理 | ルート `.gitignore` を追加し、旧追跡生成物を必要な資料の退避後に管理対象から外す。 | clean cloneでbuildできる。build後の差分が正本・設定・承認済みfixture以外を増やさない。 | `chore: ignore generated build state` 相当。 |

各段階で移動元と移動先のパスを記録し、移動と内容変換を同じ差分に詰め込まない。ファイル内容が変わる移行は、旧fixtureの追加、生成された新正本のレビュー、旧資料の整理を別々に追跡できるようにする。

## 10. 関連文書

- 要件、MVPの範囲、成果物、移行段階: [`docs/requirements.md`](requirements.md)
- 専用ブロックの文法・属性・本文の許可範囲: [`docs/syntax.md`](syntax.md)
- 意味的HTMLのタグ、属性、クラス、ARIA、章構造: [`docs/html-contract.md`](html-contract.md)
- 旧プロジェクトの確認用設定: [`gift/package.json`](../gift/package.json)、[`gift/vivliostyle.config.js`](../gift/vivliostyle.config.js)

本書の配置決定は、MVPのA5、Markdown正本、AST変換、build/preview共通経路、旧記法の一回限り移行、PDFと中間HTMLの生成という要件を前提にする。記法やHTMLの詳細が更新されても、正本・変換・Theme・生成物・fixtureの責務分離は維持する。
