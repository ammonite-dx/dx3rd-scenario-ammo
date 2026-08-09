# 契約入力フィクスチャ

このディレクトリは、`docs/syntax.md` に定めるMarkdown正本の入力契約を固定する。各Markdownファイルは単独で検証できる章文書とし、`valid/` は成功入力、`invalid/` は診断対象の失敗入力である。

## 共通方針

- ファイル名とディレクトリ名は小文字ASCIIとハイフンだけを使う。本文はUTF-8で保存する。
- 章文書は、先頭のfrontmatter、`.scene-title`付きの唯一のH1、通常のMarkdown本文の順に置く。
- ブロックの開始・終了は列1から記述し、終了行は単独の `:::` とする。
- `title`、`check` の `skill` / `difficulty`、`choice` のリストを暗黙補完しない。
- 期待HTMLはまだ置かない。意味的HTMLのfixtureはコア実装タスクで追加する。
- 標準Markdownのfixtureは見出し、リスト、表、内部リンク、引用、コードフェンスを含む。画像は実在する入力資産が不要な段階であり、ダミー画像参照は置かない。

## 正常系

| ファイル | 固定する観点 |
| --- | --- |
| [valid/00-chapter-minimal.md](valid/00-chapter-minimal.md) | frontmatter、章H1、最小の本文 |
| [valid/01-standard-markdown.md](valid/01-standard-markdown.md) | 見出し、リスト、表、リンク、引用、コードフェンス |
| [valid/02-dialogue.md](valid/02-dialogue.md) | `dialogue` の最小例 |
| [valid/03-roleplay.md](valid/03-roleplay.md) | `roleplay` の最小例 |
| [valid/04-choice.md](valid/04-choice.md) | `choice` と選択肢リスト |
| [valid/05-check-optional.md](valid/05-check-optional.md) | `check`、`mandatory` 省略時の例 |
| [valid/06-check-mandatory.md](valid/06-check-mandatory.md) | `check`、`mandatory=true` の例 |
| [valid/07-info.md](valid/07-info.md) | `info` の最小例 |
| [valid/08-e-lois.md](valid/08-e-lois.md) | `e-lois` の最小例 |
| [valid/09-battle.md](valid/09-battle.md) | `battle` と本文中の見出し |
| [valid/10-combo.md](valid/10-combo.md) | `combo` と本文中の表 |

## 異常系

仕様書はエラーコードの文字列を固定していないため、下表の「期待分類・理由」を契約とする。実装がコードを返す場合も、この分類と開始位置（または該当行）を特定できることを検証し、メッセージ全文や句読点には依存しない。

| ファイル | 期待分類・理由 | 位置 |
| --- | --- | --- |
| [invalid/01-unknown-block.md](invalid/01-unknown-block.md) | `unknown-block`: 8語彙にない専用ブロック名 | 8行目1列目、開始行 |
| [invalid/02-unclosed-block.md](invalid/02-unclosed-block.md) | `unclosed-block`: EOFまで単独の終了 `:::` がない | 8行目1列目、開始行 |
| [invalid/03-extra-terminator.md](invalid/03-extra-terminator.md) | `extra-terminator`: ブロック外の単独 `:::` | 8行目1列目 |
| [invalid/04-missing-title.md](invalid/04-missing-title.md) | `missing-attribute`: `title` がない | 8行目1列目、開始行 |
| [invalid/05-check-skill-missing.md](invalid/05-check-skill-missing.md) | `missing-attribute`: `check` の `skill` がない | 8行目1列目、開始行 |
| [invalid/06-check-difficulty-missing.md](invalid/06-check-difficulty-missing.md) | `missing-attribute`: `check` の `difficulty` がない | 8行目1列目、開始行 |
| [invalid/07-check-type-invalid.md](invalid/07-check-type-invalid.md) | `invalid-attribute-type`: `difficulty` は整数でなければならない | 8行目1列目、開始行 |
| [invalid/08-nested-block.md](invalid/08-nested-block.md) | `nested-block`: 専用ブロック本文内の専用ブロック開始 | 10行目1列目、内側の開始行 |
| [invalid/09-invalid-frontmatter.md](invalid/09-invalid-frontmatter.md) | `invalid-frontmatter`: YAML値の構文が壊れている | 3行目1列目、frontmatter値 |
| [invalid/10-frontmatter-id-missing.md](invalid/10-frontmatter-id-missing.md) | `frontmatter-id-missing`: 必須の `id` がない | 2行目1列目、frontmatter内（id欠落） |
| [invalid/11-frontmatter-unknown-key.md](invalid/11-frontmatter-unknown-key.md) | `frontmatter-unknown-key`: `link` は未知のトップレベルキー | 3行目1列目、frontmatter |
| [invalid/12-h1-missing.md](invalid/12-h1-missing.md) | `h1-missing`: 章H1がない | 6行目1列目、最初の見出し |
| [invalid/13-scene-title-missing.md](invalid/13-scene-title-missing.md) | `scene-title-missing`: H1に `.scene-title` がない | 6行目1列目、H1 |
| [invalid/14-multiple-h1.md](invalid/14-multiple-h1.md) | `multiple-h1`: 文書内にH1が2つある | 8行目1列目、2つ目のH1 |
| [invalid/15-raw-html.md](invalid/15-raw-html.md) | `raw-html`: raw HTMLタグを含む | 8行目1列目 |
