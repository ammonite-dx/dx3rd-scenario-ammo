# Sample Manuscript

`manuscripts/sample/` は、A5 MVPの受け入れ確認に使う代表原稿の置き場です。

## 用途

このサンプルは、Markdown正本から意味的HTMLとA5 PDFを生成する経路の入力として使います。

- `00-overview.md` は、Markdown正本としてレビュー・変換する動作確認用ダミーシナリオです。
- 通常の見出し、段落、リスト、表、内部リンクと、MVPで定義した8種類の専用ブロックをまとめて確認できます。
- 本文は既存の `gift` 本文を複製せず、DX3rd風の架空データだけで構成しています。

このディレクトリのMarkdownが正本です。生成HTMLやPDFをこのディレクトリと同じ階層へ置かず、生成物はbuildが定める `dist/html/` と `dist/pdf/` に出力します。

画像資産はまだないため、このサンプルから画像を参照しません。画像ケースはTheme段階で追加予定です。

記法と配置の根拠は、[要件定義](../../docs/requirements.md)、[記法仕様](../../docs/syntax.md)、[HTML出力契約](../../docs/html-contract.md)、[リポジトリ配置](../../docs/repository-layout.md)を参照してください。
