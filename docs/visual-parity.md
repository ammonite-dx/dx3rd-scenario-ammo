# gift視覚仕様と現行Themeの比較（A5）

## 目的と比較条件

本書は、旧 `gift` の見た目を現行の意味的HTML契約へ移植するための視覚基準である。giftのMarkdown、生成HTML、旧CSSクラスを新しい通常buildへ戻す仕様ではない。比較対象は `gift/gift.pdf`（65ページ）と、現行サンプルを現行A5 Themeで生成したPDF（22ページ）。原稿内容は異なるため、以下はレイアウト・視覚言語の定性的比較であり、改ページ位置やページ数の一致を要求しない。

現行サンプルPDFは一時出力 `tmp/pdfs/current-sample-a5.pdf` として生成した。制限環境での再現コマンドは次のとおり（Python実行ファイルのパスは各環境で設定する）。

```powershell
$env:VIVLIOSTYLE_NO_SANDBOX = '1'
$env:PDF_PYTHON = '<Python executable>'
npm run build:pdf -- --output tmp/pdfs/current-sample-a5.pdf
```

`VIVLIOSTYLE_NO_SANDBOX=1` は通常設定ではなく、この環境でChromiumのsandbox起動がタイムアウトした場合の回避策である。生成PDFとページ画像はGit追跡対象にしていない。

## 視覚比較

| 項目・確認ページ | giftの見た目 | 現行サンプルの見た目 | 現行契約での主な対応 | 判定 |
| --- | --- | --- | --- | --- |
| 判型・ページ家具（gift p.3、現行 p.2） | A5、上下左右14mm。ページ番号は下中央。右ページ外側に節名を縦書き表示。 | A5。上下16/17mm・左右14mm、3mm bleed。柱に文書名／kicker、下部に節名とページ番号を左右配置。 | `@page`、margin、running content | Themeだけで変更可能。giftの余白とページ家具へ戻せる。 |
| 文書タイトル／章扉（gift p.11、現行 p.1） | 黒地・白い枠飾りの120×25mm帯に、kickerと白い明朝体タイトルを中央配置。 | 文書冒頭にkickerと濃い青緑の21ptゴシック体H1。帯・章扉背景はなく、本文も同ページから続く。 | `.document-header`、`.document-kicker`、`.document-title` | 既存文書DOMと画像資産を使いThemeだけで大部分を再現できる。ページ先頭への配置・改ページは要確認。 |
| 本文・見出し（gift p.11–12、現行 p.2） | Noto Sans JP本文。H2は黒い太い点線、下位見出しに▼／●。 | 明朝系本文。節見出しは青緑の実線、下位見出しも色とウェイト中心で区別。 | `body`、`.document-section__title` | Themeだけで変更可能。フォントの同梱・選択は再現性の別課題。 |
| 会話・RP・選択（gift p.11–12, 31、現行 p.2, 9） | 灰色面、種別名、アイコン、点線見出し。選択肢は矢印分岐アイコン付き。 | 種別ごとの淡色面・左アクセント線。タイトルは人物名などで、種別名・アイコンは表示しない。 | `.scenario-block[data-block-kind]`、`.scenario-block__title` | 面・罫線・余白・アイコンの装飾はTheme。読み手に意味を伝える種別名を文字で出すならHTML契約の検討が必要。疑似要素の文字だけをアクセシブルなラベルとして扱わない。 |
| 判定・情報収集・Eロイス（gift p.23、現行 p.5, 8） | 灰色の種別ラベル帯とアイコン、外枠、見出し点線。技能・難易度等は灰色のキー表示。 | 判定や情報収集は種別ごとに色味・左線を変えたカード。フィールド名と値はシンプルなグリッド。 | `.scenario-block--check/info/e-lois`、`.field-list` | 現行の意味情報で装飾を寄せられる。種別名の可視テキストが必須なら契約判断を分離する。 |
| 戦闘（gift p.29、現行 p.12） | 枠と種別ラベルの中に、PC・敵の位置関係を表す配置図。 | 戦闘ブロックのフィールドと敵YAMLへの参照を表示。自動生成の配置図はない。 | `.scenario-block--battle`、`.document-figure`、structured-data | 枠・見出しはTheme。位置図は旧原稿で画像として執筆されていた（[`md4.md`](../gift/manuscripts/md4.md#L96)）。文章や敵YAMLに座標・距離関係がなければCSSだけでは生成できない。まずは図を通常の画像として扱い、自動図式化は必要な入力モデルが確定してから判断する。 |
| 敵・コンボデータ（gift p.56、現行 p.13, 18） | 旧PDF p.56には `:::section-title` 等の旧フェンスが紙面に漏れており、完成デザインの参照に適さない。旧Themeの簡易説明リストとはデータ意味も異なる。 | 敵YAMLから複数区画・フィールド・コンボを意味的に展開し、複数ページに組版する。 | `.structured-data`、`.structured-data__section`、`.data-fields`、`.combo-data` | 表現は異なるが、現行意味構造を保ったまま白黒・余白・見出しの視覚言語はThemeだけで寄せられる。p.56の漏出は模倣しない。 |
| 表・目次・リンク | 旧CSSは表、目次の点線リーダー／ページ番号、印刷時のページ参照を定義。 | 現行Themeにも表、目次リーダー、目次ページ番号の規則がある。通常リンクは色と下線、旧Themeのようなリンク先ページ番号は付けない。今回の現行サンプルには比較可能なMarkdown表・目次ページがない。 | `table`、`.document-toc`、`a[data-link-kind]` | 既存意味HTMLでTheme調整可能。表のページ分割とリンク先ページ番号は、実サンプルで後続確認する。 |

## giftの視覚要素と現行DOMの対応

| giftの旧CSS要素 | 現行の意味的フック | Themeだけで扱う内容 | 契約・入力側の検討が要る内容 |
| --- | --- | --- | --- |
| `@page`、本文、見出し（旧CSS 15–76行） | 文書要素、`.document-section__title` | A5寸法、余白、書体、行送り、点線見出し、節の改ページ、ページ家具 | なし。HTMLへ紙面寸法を持ち込まない。 |
| `.section-title`（79–117行）、`section-title.png` | `.document-header`、`.document-kicker`、`.document-title` | 背景帯、文字配置、サイズ、改ページ | 見出し以外の意味データを新たに載せる必要はない。旧画像の出所・再配布条件は資産採用前に確認。 |
| `.serif`、`.rp`、`.select`（175–226行） | `scenario-block` と `data-block-kind` | 背景、枠、点線、余白、装飾アイコン | gift同様の種別名をDOM上の表示文字として保証するか。現行契約は種別を属性で保持するが、可視のカテゴリ名はタイトル文字列に含めない。 |
| `.check`、`.info`、`.e-lois`、`.battle`、`.combo`（228–296行） | `scenario-block` と7種類のkind | 枠、タグ状の装飾、色、余白、改ページ | 旧 `.combo` は現行本文ブロックではない。コンボは敵YAMLのstructured dataとして扱う。種別の可視ラベル追加は契約判断。 |
| `.desc-list`（147–172行）、table（132–144行） | `.field-list`、`.data-fields`、Markdown `table` | キー表示、線、列幅、間隔、表の反復見出し | 既存のフィールド構造で足りる。 |
| TOC、リンク、画像（298行以降） | `.document-toc`、`a[data-link-kind]`、`.document-figure` | 点線リーダー、ページ番号、リンク印刷表現、画像幅 | 図の位置・距離など新しい意味情報が必要なら入力モデルを別途定義する。 |

現行契約は、Markdownから得た意味を保持する責務を持つ（[`docs/html-contract.md`](html-contract.md)）。そのため、種別名を `::before` 等のCSS生成文字だけで補い、それを読み上げや意味上の唯一の表示とみなす設計は避ける。種別名を可視テキストとして必須にする場合は、本文タイトルとは別の専用ラベル要素を契約に加えるか、意味を損なわない代替を先に設計する。これはThemeだけで決めず、アクセシビリティと印刷時の編集体験も含めて判断する。

## 資産・フォントと再現性

- 旧ThemeはCSSからGoogle FontsのNoto Sans JP、Noto Serif JP、Material Symbols Outlinedをネットワーク読み込みする。現行Themeはフォント名のフォールバック列を定義するが、フォントファイルを同梱せず、外部読込もしない。したがって現在の経路は外部接続への依存を避ける一方、PC間で同じフォントが選ばれる保証はまだない。
- Noto CJKの公式ライセンスはSIL Open Font License 1.1、Google Material Symbolsの配布元はApache License 2.0としている（[Noto CJK license](https://github.com/notofonts/noto-cjk/blob/main/Sans/LICENSE)、[Google Material Symbols repository](https://github.com/google/material-design-icons)）。将来フォントや選択アイコンを同梱する場合は、各ファイルのライセンス・同梱条件・必要な著作権表示を保ち、バージョンを固定する。
- 旧Theme packageは `MIT` を宣言し、リポジトリ内に `LICENSE` がある。ただし `package.json` の `files` に `img/` が含まれていない。`section-title.png` は旧リポジトリ上にあるが、画像単体の来歴・権利表示を確認してから新Themeへ複製・再配布する。MIT宣言だけで画像の個別来歴まで確認済みとはみなさない。
- `section-title.png` は1564×329pxのPNGで、旧CSSは幅120mmとして配置する。章扉再現ではトリミング・解像度・余白の見え方を実PDFで受け入れ確認する。

## ドキュメントの現状差分

視覚仕様の整理と独立したドキュメント更新が必要な箇所として記録する。今回は範囲を広げず、直さない。

1. [`docs/requirements.md`](requirements.md) §3.3 は旧gift移行ツールを「現在も未実装」としているが、現行コードには `migrate:gift` がある。
2. [`docs/repository-layout.md`](repository-layout.md) §2、§5、§9には、現在存在する実装・A5 Theme・build出力先と食い違う将来形の記述が残る。実際の設定は `generated/` を出力先とする箇所がある一方、同文書の一部は `dist/` を前提にしている。
3. [`manuscripts/sample/README.md`](../manuscripts/sample/README.md) は中間HTML・PDFの出力先を `dist/` とするが、ルートREADMEと `build.config.json` は `generated/` を使う。

## 次の作業への提案

次のTheme実装では、A5を対象に、意味的HTML契約・Markdown・敵YAMLを変更せず `themes/scenario-a5/theme.css` とTheme資産だけで次を行う。

1. giftのモノクロの視覚言語（本文書体、点線見出し、灰色枠、キー表示、余白）を現在のsemantic selectorへ適用する。
2. `.document-header` を使う章扉を実装し、ローカルの飾り画像はライセンス確認後に新Theme資産として管理する。
3. 種別名を可視テキストにする必要性はCSS実装へ埋め込まず、HTML契約変更の要否として別途判断する。
4. battleの図は当面 `document-figure` の通常画像を受け入れる。座標や距離をYAMLで構造化して自動図式化する案は、複数シナリオで共通要件が確認できてから設計する。
5. 変更後は現行サンプルの会話・選択・判定・情報収集・戦闘・敵／コンボを含むA5 PDFを生成し、代表ページの視覚比較を受け入れ条件とする。フォント固定はローカル配布・ライセンス・インストールサイズを比較する別判断にする。

現時点で今回の比較を進めるための追加ユーザー判断は不要。種別名の見せ方、フォントの固定配布、戦闘配置データの自動生成は、後続の実装前に影響と選択肢を整理して決める。
