# DX3rd Scenario Ammo

Markdownと外部YAMLを正本にして、意味的HTMLとA5/A4 PDFを再生成するシナリオ組版環境です。Node/npmから公式Vivliostyle Coreを固定版で読み込み、Puppeteerでブラウザ組版を待機するため、別プロジェクトのインストールやPATH上の偶然の実行ファイルには依存しません。

## 最短手順

Node.js `>=22.12.0`、npm `>=10.9.0`、Python 3.10以降、標準位置のChrome/Chromiumを用意します。

```text
npm install
python -m pip install -r requirements-pdf.txt
npm run typecheck
npm test
npm run test:python
```

Python実行ファイルを明示する場合は、`PDF_PYTHON` を設定できます。OS標準のPython自体はリポジトリへ同梱しません。

## HTMLとPDF

```text
npm run build:html
npm run build:html -- --paper a4
npm run build:pdf
npm run build:pdf -- --paper a4
```

既定の出力先は次のとおりです。

- HTML: `generated/html/sample-publication.html`
- A5 PDF: `generated/pdf/sample-a5.pdf`
- A4 PDF: `generated/pdf/sample-a4.pdf`

PDFビルドは、生成HTML内のTheme linkをローカルの境界サーバーから公式 `@vivliostyle/core@2.45.0` の `CoreViewer`へ渡し、`readyState === "complete"` を待ってから `puppeteer-core@25.1.0` の `page.pdf()`を実行します。通常のCore経路が使う作業物は一時HTML・一時PDF・ローカルサーバーだけで、`vivliostyle.config.js`とstaged configは読み込まず、`workspaceDir`は組版に使用しません。したがって通常の `npm run build:pdf` はTTYを要求せず、完了・検証・原子的公開まで待機します。A5/A4は `--paper` で切り替えます。

`vivliostyle.config.js`、`workspaceDir`、一時configは、`--vivliostyle <path>` または `VIVLIOSTYLE_BIN` で外部実行ファイルを明示した場合だけ使う互換境界として維持しています。通常経路にVivliostyle CLIはインストールしません。Chromeが標準位置にない場合は `VIVLIOSTYLE_BROWSER` または `CHROME_PATH` に実行ファイルを指定してください。

Chrome sandboxは通常有効です。制限環境で起動できない場合だけ `VIVLIOSTYLE_NO_SANDBOX=1` を明示して再試行してください。値が `1` の場合だけ `--no-sandbox` を追加します。sandboxを無効化するため、通常の環境では設定不要です。

`generated/`、`dist/`、`tmp/` などの生成物は `.gitignore` 対象です。詳細な設計と診断は [docs/workflow.md](docs/workflow.md)、要件の達成状況は [docs/requirements.md](docs/requirements.md) を参照してください。
