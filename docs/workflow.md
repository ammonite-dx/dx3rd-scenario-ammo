# Build workflow

このリポジトリの通常経路は、正本Markdownを自前parserで検証し、参照先の
敵YAMLを解決してから、既存rendererのsemantic HTMLを1つのpublicationへ
結合します。章順は [build.config.json](../build.config.json) の `chapters`
配列だけで決まり、globやファイル名の暗黙順には依存しません。

## 前提とインストール

- Node.js `>=22.12.0`、npm `>=10.9.0`
- `npm install`
- `npm run typecheck`
- `npm test`

Vivliostyle CLIはルートの必須依存にしていません。VFMの旧依存を通常parserへ
持ち込まず、PDF境界だけで公式の `@vivliostyle/cli` を任意ツールとして呼ぶ
構成です。CLIは次の順で探します。

1. `VIVLIOSTYLE_BIN` に指定した実行ファイル
2. ルート `node_modules/.bin/vivliostyle`
3. PATH上の `vivliostyle`

必要なら、脆弱性監査を確認した公式CLIの固定版を明示的に導入し、または
`VIVLIOSTYLE_BIN` を設定してください。Chrome/Chromiumが標準位置にあれば
既存実行ファイルを `--executable-browser` へ渡し、不要なブラウザ再取得を
避けます。

`build.config.json` の `workspaceDir` は、公式CLI設定の `workspaceDir` と
対応する管理項目です。実行時に独自の `--workspace-dir` を追加せず、
`vivliostyle.config.js` の公式設定へ委ねるため、CLIの引数契約と設定の責務を
分離しています。

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

PDFは生成HTMLを `--single-doc` でVivliostyle CLIへ渡します。Vivliostyleの
Markdown変換やVFMは使いません。A5/A4の選択はCLI `--paper` と設定内の
`themes`/`output.pdf` に集約されています。PDFは一時HTML・一時PDF、公式CLI、
`scripts/verify-pdf.py` の順に処理し、ページ数、A判型、本文抽出、4章タイトルを
確認できた場合だけ `generated/pdf/` へ原子的に移動します。

`pypdf` を使えるPythonが必要です。見つからない場合は `PDF_PYTHON` にPython
実行ファイルを指定してください。検証用のPNGは `generated/` または `tmp/` に
置き、リポジトリへ追加しません。

## 出力とトラブルシュート

- HTML: `generated/html/`
- PDF: `generated/pdf/`
- Vivliostyle作業領域: `generated/.vivliostyle/`
- 一時出力: 最終出力と同じディレクトリの隠し一時ファイル

すべて `.gitignore` 対象です。診断は `file:line:column CODE message` 形式でstderr
へ出ます。`CLI_UNKNOWN_OPTION`、原稿parser診断、YAML参照診断、symlinkのroot
逸脱を警告だけで通過させません。Vivliostyleが見つからない場合は公式CLIを
導入するか `VIVLIOSTYLE_BIN` を設定し、ブラウザ取得が必要な場合だけCLIの
公式手順に従ってください。

## VFMをMarkdown parserに使わない理由

VFMは以前の依存脆弱性を避けるため、通常のMarkdown解釈には採用しません。
parserの構文・位置診断・旧構文拒否・semantic HTML契約をこのリポジトリの
自前parser/rendererで一貫させ、Vivliostyleは完成したHTMLからPDFを組版する
境界だけに限定しています。
