# 契約入力フィクスチャ

このディレクトリは、docs/syntax.md に定めるMarkdown正本の入力契約を固定する。各Markdownファイルは単独で検証できる章文書とし、valid/ は成功入力、invalid/ は診断対象の失敗入力である。

## 共通方針

- ファイル名とディレクトリ名は小文字ASCIIとハイフンだけを使い、本文はUTF-8で保存する。
- 章文書は、先頭のfrontmatter、frontmatter直後の最初の通常H1、通常のMarkdown本文の順に置く。正常系のH1はplain H1であり、scene-titleや属性リストを付けない。
- narrative blockの語彙はdialogue、roleplay、choice、check、info、e-lois、battleの7種類だけである。
- ブロックの開始・終了は列1から記述し、終了行は単独の ::: とする。
- 開始行は :::名前 表示タイトル の新記法とし、旧属性リストからtitleやcheck属性を読み取らない。
- checkの技能・難易度は、開始行直後の空行を除く連続前置部にちょうど1組だけ置く。[必須] はその直後に任意で置く。
- infoとe-loisの技能・難易度は人間可読フィールドとして複数組を記述でき、入力順を保持する。
- choiceの本文はリストなしでも、リスト付きでもよい。
- comboとenemyはnarrative blockではなく、外部YAMLへの通常リンクで参照する。
- 標準Markdownのfixtureは見出し、リスト、表、内部リンク、引用、コードフェンスを含む。画像は実在する入力資産が不要な段階であり、ダミー画像参照は置かない。

## 正常系

| ファイル | 固定する観点 |
| --- | --- |
| [valid/00-chapter-minimal.md](valid/00-chapter-minimal.md) | frontmatter、plain H1、最小の本文 |
| [valid/01-standard-markdown.md](valid/01-standard-markdown.md) | 見出し、リスト、表、リンク、引用、コードフェンス |
| [valid/02-dialogue.md](valid/02-dialogue.md) | dialogueの新しい開始行と本文 |
| [valid/03-roleplay.md](valid/03-roleplay.md) | roleplayと対象フィールド |
| [valid/04-choice.md](valid/04-choice.md) | choiceと選択肢リスト |
| [valid/04-choice-no-list.md](valid/04-choice-no-list.md) | リストなしchoice |
| [valid/05-check-optional.md](valid/05-check-optional.md) | check、技能・難易度1組、必須省略 |
| [valid/06-check-mandatory.md](valid/06-check-mandatory.md) | check、技能・難易度1組、単独の必須 |
| [valid/07-info.md](valid/07-info.md) | infoの複数技能・難易度ペアと記述順 |
| [valid/08-e-lois.md](valid/08-e-lois.md) | e-loisの新しい開始行 |
| [valid/09-battle.md](valid/09-battle.md) | battle、既知フィールド、敵全体の通常リンク |
| [valid/10-enemy-links.md](valid/10-enemy-links.md) | 敵全体リンクとコンボfragmentリンク |
| [valid/11-kitchen-sink.md](valid/11-kitchen-sink.md) | 7語彙、標準Markdown、敵・コンボ通常リンクの共存 |

## fixture用の外部データ

| ファイル | 用途 |
| --- | --- |
| [data/enemies/sample-warden.yaml](data/enemies/sample-warden.yaml) | valid/09-battle.md、valid/10-enemy-links.md、valid/11-kitchen-sink.mdから参照する、data-contract準拠の敵本体と敵内コンボ |

YAMLのファイル名、enemy.id、敵全体リンク、コンボfragmentは相互に一致させる。fixture用データはこのディレクトリ内だけに置き、直下のdata/や原稿本文へ追加しない。

## 異常系

異常系の契約はエラーコード文字列ではなく、期待する分類・理由と入力位置である。位置は空行を含めた実ファイルの1始まり行・列で示す。欠落の場合は、欠落を検証するfrontmatterまたは最後の有効な前置フィールドを位置として示す。

| ファイル | 期待分類・理由 | 位置 |
| --- | --- | --- |
| [invalid/01-unknown-block.md](invalid/01-unknown-block.md) | 未知ブロック — 7語彙にない専用ブロック名 | 8行目1列目、開始行 |
| [invalid/02-unclosed-block.md](invalid/02-unclosed-block.md) | 未閉鎖ブロック — EOFまで単独の終了 ::: がない | 8行目1列目、開始行 |
| [invalid/03-extra-terminator.md](invalid/03-extra-terminator.md) | 余分な終端 — ブロック外の単独 ::: | 8行目1列目 |
| [invalid/04-missing-title.md](invalid/04-missing-title.md) | 表示タイトル欠落 — dialogue開始行にタイトルがない | 8行目1列目、開始行 |
| [invalid/05-check-skill-missing.md](invalid/05-check-skill-missing.md) | check技能欠落 — 前置部の最初が技能行でない | 10行目1列目、最初のフィールド行 |
| [invalid/06-check-difficulty-missing.md](invalid/06-check-difficulty-missing.md) | check難易度欠落 — 技能行の後に難易度行がない | 10行目1列目、最後の有効フィールド |
| [invalid/07-check-type-invalid.md](invalid/07-check-type-invalid.md) | check難易度書式不正 — 0以上の整数でない | 11行目1列目、難易度行 |
| [invalid/08-nested-block.md](invalid/08-nested-block.md) | 入れ子 — 専用ブロック本文内の専用ブロック開始 | 10行目1列目、内側の開始行 |
| [invalid/09-invalid-frontmatter.md](invalid/09-invalid-frontmatter.md) | frontmatter構文不正 — YAML値の構文が壊れている | 3行目1列目、frontmatter値 |
| [invalid/10-frontmatter-id-missing.md](invalid/10-frontmatter-id-missing.md) | frontmatter必須値欠落 — idがない | 2行目1列目、frontmatter内 |
| [invalid/11-frontmatter-unknown-key.md](invalid/11-frontmatter-unknown-key.md) | frontmatter未知キー — linkは許可されていない | 3行目1列目、frontmatter |
| [invalid/12-h1-missing.md](invalid/12-h1-missing.md) | H1欠落 — 章タイトルのH1がない | 6行目1列目、最初の見出し |
| [invalid/13-scene-title.md](invalid/13-scene-title.md) | 禁止属性 — H1にscene-titleがある | 6行目1列目、H1 |
| [invalid/14-multiple-h1.md](invalid/14-multiple-h1.md) | H1重複 — 文書内にH1が2つある | 8行目1列目、2つ目のH1 |
| [invalid/15-raw-html.md](invalid/15-raw-html.md) | raw HTML禁止 — HTMLタグを本文に含む | 8行目1列目、HTML開始タグ |
| [invalid/16-check-second-pair.md](invalid/16-check-second-pair.md) | check二組目 — 機械可読前置部に技能・難易度の2組目がある | 13行目1列目、2組目の技能行 |
| [invalid/17-field-after-body.md](invalid/17-field-after-body.md) | 本文後置フィールド — 本文開始後にcheck技能を置いている | 15行目1列目、後置フィールド |
| [invalid/18-unknown-field.md](invalid/18-unknown-field.md) | 未知フィールド — infoに定義されていない秘密度ラベルがある | 10行目1列目、未知フィールド |
| [invalid/19-attribute-list.md](invalid/19-attribute-list.md) | 開始行属性リスト禁止 — 旧title属性を開始行に置いている | 8行目1列目、開始行 |
| [invalid/20-combo-block.md](invalid/20-combo-block.md) | combo本文ブロック禁止 — コンボは敵YAML内と通常リンクで扱う | 8行目1列目、開始行 |
| [invalid/21-enemy-block.md](invalid/21-enemy-block.md) | enemy本文ブロック禁止 — 敵本体は外部YAMLと通常リンクで扱う | 8行目1列目、開始行 |
