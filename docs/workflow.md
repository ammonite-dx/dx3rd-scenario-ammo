# Build workflow

このリポジトリの通常経路は、正本Markdownを自前parserで検証し、参照先の
敵YAMLを解決してから、既存rendererのsemantic HTMLを1つのpublicationへ
結合します。章順は [build.config.json](../build.config.json) の `chapters`
配列だけで決まり、globやファイル名の暗黙順には依存しません。

## 前提とインストール

- Node.js `>=22.12.0`、npm `>=10.9.0`
- Python `>=3.10` と標準位置のChrome/Chromium
- `npm install`
- `python -m pip install -r requirements-pdf.txt`
- `npm run typecheck`
- `npm test`
- `npm run test:python`

ルートの固定依存は公式 `@vivliostyle/core@2.45.0` と
`puppeteer-core@25.1.0` です。通常のPDF経路はCoreViewerをローカルの
境界サーバーへ接続し、`readyState === "complete"` をawaitしてから
PuppeteerでPDFを書き出します。PATH上の実行ファイルや別プロジェクトの依存、
TTYは通常経路の前提ではありません。

Chrome/Chromiumが標準位置にない場合は `VIVLIOSTYLE_BROWSER` または
`CHROME_PATH` に実行ファイルを指定します。`--vivliostyle` または
`VIVLIOSTYLE_BIN` は、外部の互換実行ファイルを明示したときだけ使われます。
この経路は既存のWindows `.cmd`境界を維持しますが、通常の再現経路ではありません。
Chrome sandboxは通常有効です。制限環境で起動できない場合だけ
`VIVLIOSTYLE_NO_SANDBOX=1` を明示してください。値が `1` の場合だけ
`--no-sandbox` を追加し、通常は設定不要です。

通常Core経路は `vivliostyle.config.js` と staged config を読み込まず、
`workspaceDir`を組版の作業領域として使用しません。生成HTML内のTheme linkと `--paper` を使い、一時HTML・一時PDFと127.0.0.1の
ローカル境界サーバーだけで組版します。`build.config.json` の `workspaceDir` と
`vivliostyle.config.js` は、外部実行ファイルを明示した場合の互換境界として維持し、
その場合だけstaged configとworkspaceを使います。入力の境界検証、検証成功後の
原子的公開、生成物のignore方針は変えません。

## HTML preview

```text
npm run build:html
```

既定ではA5テーマを付けた `generated/html/sample-publication.html` を生成します。
ブラウザでこのHTMLを開くと、rendererが作った4つのchapter `main`が1つの
publicationとして表示されます。A4のHTMLは次で生成できます。

```text
npm run build:html -- --paper a4
```

HTML `<head>` のstylesheet linkは、最終HTML位置からテーマへの安全な相対パス
です。出力は一時ファイルへ書いてから置き換えるため、入力エラー時にHTMLを
更新しません。

## A5/A4 PDF

```text
npm run build:pdf
npm run build:pdf -- --paper a4
```

生成HTMLは `--single-doc` などのCLI専用引数を経由せず、HTML内のTheme linkと
`--paper` を使って公式 `@vivliostyle/core` の公開 `CoreViewer` APIへ読み込みます。
Viewerの完了イベントをawaitし、PuppeteerのA5/A4固定寸法（CSSのbleedは出力寸法へ
二重計上しない設定）でPDF化します。VivliostyleのMarkdown変換やVFMは使いません。
PDFは一時HTML・一時PDF、CoreViewer、`scripts/verify-pdf.py` の順に処理し、ページ数、A判型、
本文抽出、4章タイトル、XMLエラーマーカー不在を確認できた場合だけ
`generated/pdf/` へ原子的に移動します。通常のNode `spawn`/`exec`相当の非TTY実行
でも、ブラウザ終了と検証が完了してからコマンドが終了します。

PDF検証のPython依存は `requirements-pdf.txt` に固定しています。初回は
`python -m pip install -r requirements-pdf.txt`、単体テストは
`npm run test:python` で実行します。検証時に使うPythonが自動検出できない場合は
`PDF_PYTHON` に実行ファイルを指定してください。検証用のPNGは `generated/` または
`tmp/` に置き、リポジトリへ追加しません。

## gift旧原稿の一回限り移行

旧 `gift/` を参照専用の入力として明示起動する場合は、次を使います。

```text
npm run migrate:gift -- --source gift --output tmp/gift-migration
npm run migrate:gift -- --source gift --output tmp/gift-migration --dry-run
```

この入口だけがgift旧記法を読み、通常のbuild経路には互換構文を追加しません。出力は
新規ディレクトリへステージしてから公開され、絶対パス、traversal、symlink root逸脱、
source/outputの重なり、既存出力、`gift/`・`manuscripts/`・`data/` 配下への出力を拒否
します。変換後の各Markdownは現行parserへ、契約を満たす敵YAMLはvalidatorと参照解決へ
通し、`migration-report.json` と `migration-report.md` に成功、warning、未解決、失敗を
記録します。未解決または失敗がある場合、CLIは終了コード1を返します。

対応表、実giftの旧記法件数、`_postReplaceList.json` との突合、レビューと採用手順は
[docs/migration-from-gift.md](migration-from-gift.md) を参照してください。

## 出力とトラブルシュート

- HTML: `generated/html/`
- PDF: `generated/pdf/`
- 外部互換CLIのworkspace: `generated/.vivliostyle/`（通常Core経路では未使用）
- 一時出力: 最終出力と同じディレクトリの隠し一時ファイル

すべて `.gitignore` 対象です。診断は `file:line:column CODE message` 形式でstderr
へ出ます。`CLI_UNKNOWN_OPTION`、原稿parser診断、YAML参照診断、symlinkのroot
逸脱を警告だけで通過させません。ブラウザが見つからない場合は
`VIVLIOSTYLE_BROWSER`/`CHROME_PATH`、PDF検証用Pythonが見つからない場合は
`PDF_PYTHON` を確認してください。外部互換実行ファイルを使う場合だけ
`VIVLIOSTYLE_BIN` または `--vivliostyle` を設定します。

## 自前Markdown parserを使う理由

通常のMarkdown解釈にはVFMを採用せず、parserの構文・位置診断・旧構文拒否・
semantic HTML契約をこのリポジトリの自前parser/rendererで一貫させています。
Vivliostyleは完成したHTMLからPDFを組版する境界だけに限定しています。
