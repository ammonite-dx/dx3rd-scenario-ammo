# gift CSS忠実移植表

## 目的と境界

旧Theme gift/themes/vivliostyle-theme-dx3rd-ammonite/main.css の視覚仕様を、現行の意味的HTML契約 dx3rd-scenario/v1 に対応づける。原則は「旧HTMLのクラスを復活させず、対応する見た目の値を移す」。通常の本文・表・敵データ・専用ブロックの意味と可視ラベルは現行HTML契約に残し、CSSは位置・形・装飾を担う。

ステータスは KEEP（値を維持）、TRANSLATE（現行契約のselectorやCSS表現へ移す）、DEFER（必要な資産・判断が揃うまで保留）、DROP（移植しない。理由を併記）を表す。

## 旧CSSルールの全件対応

| 旧CSSルール | 現行の対応先・移植する値 | 状態 | 差分・根拠 |
| --- | --- | --- | --- |
| @charset "UTF-8" | CSSはUTF-8で保存し、HTML側もmeta charset=utf-8を出力 | DROP | CSSの文字コード宣言はファイル先頭のBOM等に制限がある旧構文で、現在の出力に表示上の役割はない。 |
| Google FontsのNoto Sans JP / Noto Serif JP @import | --font-body / --font-displayに旧ファミリー名を先頭指定し、一般的な日本語フォントへフォールバック | DEFER | ネットワーク資源をThemeから取得しない方針を維持する。フォントファイルの配布・ライセンス・埋め込み方針が決まるまでバイナリ導入をしない。 |
| Material Symbols @import | 専用ブロック見出しの先頭24Qをアイコン用に確保。画像や記号で代用しない | DEFER | 旧アイコンを再現するフォント資産がなく、ネットワーク取得も行わない。 |
| * { margin:0; padding:0; box-sizing:border-box } | DOM要素へbox-sizing:border-box。白枠などCSS専用疑似要素には局所指定、実ラベルには旧疑似要素と同じ寸法になるようcontent-box | TRANSLATE | 旧CSSのグローバル指定は疑似要素まで届かない。旧値が必要な疑似要素・ラベルだけ個別に指定し、余白リセットは標準Markdownの既定表示を壊すため移植しない。 |
| @page: A5、block/inline各14mm、白背景 | A5 portrait、margin 14mm、background-color #fff | KEEP | A5を基準とする。A4入口は別の@pageで上書きする。 |
| @bottom-center: page counter、16Q、開始側4mm | 同じページ領域・counter(page)・寸法 | KEEP | 追加のフォント指定はせず、本文書体を継承する。 |
| @page :right @right-middle: string(section-id)、vertical-rl、sideways、top | 現行のdocument-idとdocument-titleを「ID: タイトル」形式で同じ側柱へ表示 | TRANSLATE | 旧値は章扉のsection-id（op1ではOP-01）。現行のmain.documentにあるdata-document-idとH1由来の文書タイトルを組み合わせ、ページを開いたまま識別できるようにする。 |
| :root: 16Q / 28Q / Noto Sans JP / 400 / justify / widows1 / orphans1 | bodyへ16Q、28Q、400、justify、widows1、orphans1 | TRANSLATE | semantic HTMLのbodyを組版既定値の入口にする。 |
| text-spacing: allow-end | text-spacing-trim: normalとtext-autospace: no-autospace | TRANSLATE | 現行Vivliostyle Coreが公開するCSS Text 4のlonghandへ近似変換する。旧値と完全同義ではない。 |
| hanging-punctuation: allow-end | 同じ値を文書ルートへ指定 | KEEP | 行末約物を必要に応じてぶら下げる指定を維持する。 |
| p: text-indent 1em、margin-block 0 | 本文・section・専用block・structured data内の段落 | KEEP | 対話は旧セリフと同じく字下げなし。roleplay/choiceは通常段落の1em字下げを維持。 |
| p.no-indent: text-indent 0 | リスト項目、figure、文書ヘッダー、dialogue段落など意味的な対象 | TRANSLATE | .no-indentという入力由来の旧クラスは追加しない。 |
| h2: 18Q/24Q/700、margin 20Q 6Q、3px dotted #000、margin-break auto | section見出しとstructured-dataのsection見出し | KEEP | 目次には見出しの罫線・余白を足さない。 |
| h3,h4: 16Q/20Q/700、margin 16Q 4Q | section level 3/4および該当する意味的見出し | KEEP | section level 5/6へ値を拡張しない。 |
| h3::before "▼ " | section level 3見出し | KEEP | 見た目の階層記号のみ生成し、Markdownに属性を要求しない。 |
| h5::before "● " | 通常のh5見出し | KEEP | HTMLの意味レベルは変更しない。 |
| .section-title: section文字列、break-before page、白文字、120×25mm、下margin 3mm、中央flex、Noto Serif JP 700 | .document-headerと.document-kicker/.document-title | TRANSLATE | 寸法、改ページ、中央寄せ、表示書体の優先順位を維持。 |
| .section-title::before: section-title.pngを120mm幅で配置 | 画像を含まないCSS専用の黒帯・白枠 | DEFER | 旧PNGはコピーしない。固定寸法と色面は維持するが、切り欠きや白線の正確な形状は後続判断まで近似。 |
| .section-title p: 16Q/16Q、indent 0、下margin 8Q | .document-kicker | KEEP | frontmatter kickerを章帯の見出しとして配置する。 |
| .section-title h1: 32Q/32Q、margin 0 | .document-title | KEEP | 通常のH1をタイトルとして表示する。 |
| ul,ol: margin 0、padding-inline-start 1.5em | 標準Markdownとstructured-dataのリスト | KEEP | 旧インデント値を維持。 |
| ul li,ol li: padding-inline-start 0.5em | 同じリスト項目 | KEEP | 旧インデント値を維持。 |
| ul li p,ol li p: indent 0 | li > p | TRANSLATE | 標準Markdownのリスト段落を字下げしない。 |
| table: width 100%、left、collapse、spacing 0、14Q、上下1px solid #000、margin 16Q | 標準Markdown table | KEEP | ページ分割時の行保持以外に線・セルpaddingを追加しない。 |
| table th: left、下1px solid #000 | th | KEEP | 旧値を維持。 |
| .desc-list: margin 12Q 4Q | .field-listと.data-fields | TRANSLATE | YAML由来データと専用block fieldの双方で同じ外側余白を使う。 |
| .desc-list-item: flex、margin-block 4Q | .field-list__itemと.data-fields__item | TRANSLATE | value側の8Q marginで間隔を取るためgapは0。 |
| .desc-list-item-key: radius 5px、line 12Q、margin 2Q、padding 4Q 6Q、#999/white、12Q、min-width 30mm、height 20Q、700 | 対応するdt | KEEP | 長い見出しは折返して高さを伸ばす安全処理を加え、通常の値は維持する。 |
| .desc-list-item-value: margin-start 8Q、padding-block 0、16Q/24Q | 対応するdd | KEEP | 値は16Q/24Qで表示する。 |
| .serif,.rp,.select: break-inside avoid、margin 16Q、padding 8Q、#eee | dialogue / roleplay / choiceの.scenario-block | TRANSLATE | 三種の意味的blockへ同じ旧パネル値を適用。 |
| 三種のh4: flex、margin-top 0 / bottom 8Q、padding-bottom 4Q、height 24Q、line 20Q、font 16Q、center、700、bottom 2px dotted #999 | .scenario-block__headerと.scenario-block__title | TRANSLATE | 見出しを通常24Qのflex行、下余白8Qとして移す。長い見出しのみ24Q以上へ伸ばして文字の欠けを防ぐ。 |
| 三種h4 ::before: margin-start 24Q / end 4Q | dialogue / roleplay / choiceのDOMラベル | TRANSLATE | 24Qをアイコン用に確保し、ラベル自体はrendererが通常テキストとして出力する。 |
| .serif/.rp/.select h4::before: セリフ:/ロールプレイ:/選択: | scenario-block__kind-labelのテキスト | TRANSLATE | data-block-kindから決定するアクセシブルなDOMテキスト。入力Markdownに属性やラベルを書き足さず、CSS生成contentにも依存しない。 |
| 三種h4 ::after: Material Symbols、20Q、absolute、700、sms/voice_selection/arrow_split | タイトル先頭24Qを予約 | DEFER | アイコンフォント導入判断待ち。Unicode記号や仮画像に置換しない。 |
| 三種の本文段落: padding-inline 8Q | .scenario-blockの内側padding 8Q | TRANSLATE | 二重paddingを避けるため段落個別paddingは移さない。 |
| .serif p: indent 0 | dialogueの本文段落 | TRANSLATE | roleplay/choiceの1em字下げは維持する。 |
| .check,.info,.e-lois,.battle,.combo: avoid、relative、margin 16Q、padding-block 24Q 8Q / inline 8Q、border 2px solid #999 | 4種の情報blockおよび.combo-data | TRANSLATE | コンボは本文blockにせず、YAML由来構造データとして枠の視覚値だけ対応。コンボは旧指定どおり分割を避ける。 |
| 5種の::before: absolute、flex-center、top/left -2px、padding-inline 24Q、height/line 20Q、12Q、#999/white、700、min-width 30mm | check/info/e-lois/battleのscenario-block__kind-labelとcombo-data__kind-label | TRANSLATE | 論理プロパティへ移す。実DOMラベルのbox-sizingはcontent-boxとし、30mmの最小内容幅と左右24Qのpaddingを旧疑似要素と同じ外寸にする。24Qは保留アイコンの領域を含む。 |
| 各ラベル: 判定 / 情報収集 / Eロイス / 戦闘 / コンボ | scenario-block__kind-label / combo-data__kind-labelの通常テキスト | TRANSLATE | rendererがdata-block-kindまたはYAML由来コンボからDOMへ出力し、CSSは位置と外観だけを整える。 |
| 5種の::after: Material Symbols、absolute、top/left -2px、padding-inline 8Q、height/line 20Q、14Q、white、700、casino/search/visibility/swords | アイコン位置を帯の先頭24Qに確保 | DEFER | バイナリ資産未決定。戦闘/コンボは旧CSSで同じswords。 |
| .check/.info/.e-lois/.battle/.combo h4: margin-top 0、下2px dotted #999 | 同block見出しと.combo-data__title | TRANSLATE | 現行HTML見出しの実タグに依存させず、semantic classで値を設定。 |
| .trailer p: margin 16Q、indent 0、center | 該当する現在のHTML semantic hookなし | DROP | trailer専用のMarkdown/HTML意味構造を追加せず、任意の通常段落を推測で特別扱いしない。 |
| img: margin-block 8Q、inline auto、display block | img/.document-figure img | KEEP | max-inline-size 100%と自動高さだけをページ安全策として加える。 |
| a: #000、text-decoration none | すべてのリンク | KEEP | 旧値を維持。 |
| a.anchor::after: (p.<target-counter>) | a[data-link-kind="internal"]::after | TRANSLATE | 内部リンクを現行HTMLの意味属性で判別する。 |
| table a.anchor::after: 空 | table a[data-link-kind="internal"]::after | TRANSLATE | 表内リンクにページ表示を追加しない。 |
| hr.page-wrap: break-after page、hidden、margin/padding 0、height 1px | 現行の標準Markdown hrは可視のまま | DROP | hrは水平線として意味を持つ。隠し改ページ用の特別クラスを復活させず、op1 fixtureでもその区切りを省く。 |
| hr + h2/h3・section隣接条件のmargin-break: discard | なし | DROP | 隠しhr.page-wrap後の旧HTML専用調整で、現在の文書構造に存在しない。 |
| .toc li: padding 0、list-style none | .document-toc li | TRANSLATE | 目次のリストマーカーを除く。 |
| .toc ul: padding 0 | .document-toc ul/ol | TRANSLATE | 目次の内側インデントを除く。 |
| .toc li a: inline-flex、width 100%、no underline/currentColor、baseline | .document-toc__link | TRANSLATE | 目次リンクの行全体を旧表示へ寄せる。 |
| .toc li a::before: margin左右 0.5em、dotted bottom、empty、order 1、flex auto | .document-toc__link::before | TRANSLATE | 項目名とページ数の間にドットリーダーを生成。 |
| .toc li a::after: target page、right、flex none、order 2 | .document-toc__link::after | TRANSLATE | 現行のtarget-counterを使用。 |

## 既知の近似・未移植部分

- 旧text-spacing: allow-endはCSS Text 4の同名値ではない。現行Vivliostyle資料のtext-spacing-trimとtext-autospaceへ分け、行末約物の処理が近いtext-spacing-trim: normalを選んだ。自動欧文・数字スペースは旧CSSの指定から新たに導入しないためtext-autospace: no-autospaceとした。これは厳密な同値ではなく、改行と句読点位置はPDFで確認する。[Vivliostyleの対応CSS一覧](https://docs.vivliostyle.org/en/reference/supported-css-features/)と[CSS Text Module Level 4](https://drafts.csswg.org/css-text-4/)を根拠とする。
- chapter bandは120×25mm・黒地・白文字・中央配置を保つが、section-title.pngの角形状・罫線の細部は未移植。Material Symbolsも同様に位置だけ予約する。Notoフォントはネットワーク読込を行わないため、端末フォントへのフォールバックにより字幅・改行・PDF埋込み字形は変わり得る。
- YAML敵データのsemantic headerも、旧shiro.mdの敵用章扉に合わせて120×25mmの黒帯・「敵データ」kicker・改ページを使う。現在のrenderer/HTML契約は変更していない。
- 現行rendererはbattle block内に参照敵YAMLを展開するため、その場合だけbattleの枠を見出し・フィールドで閉じ、複数ページの敵データへ枠線が伸びないようCSSで分ける。戦闘見出しとフィールドは分割せず、意味的なbattle/敵データの入れ子は保持する。
- 旧op1の三つの[日時]等は拡張機能の置換結果として灰色のキー欄になっていた。現fixtureでは特別な置換構文を使わず、**太字の通常Markdownラベル**と値にする。そのため、この3行の灰色チップは一致しない。
- 旧op1の水平線は隠し改ページとして使われていた。現fixtureではMarkdownの水平線に別の改ページ意味を持たせず、省略する。そのため、描写2以降のページ番号・位置は旧PDFと一致しない場合がある。
- パーセント差や画像画素の同一性を合否条件にしない。Vivliostyle Core/Chromium、フォント利用可否、描画環境を記録し、A5で文字列、章帯・見出し・枠の寸法、行間、改ページと欠けを目視比較する。

## 現行HTMLにのみある拡張

引用、コードブロック、figureのcaption、テーブルのthead/tfoot、ページ分割安全策には旧CSSの対応ルールがない。ページ分割指定は、figureと目次の単一行、構造化データの見出しと直後の内容、フィールド行・表行、コンボ枠、敵シート前の明示改ページに限定する。通常見出し、通常段落、引用、コードブロックには改ページ回避を追加しない。overflow-wrapはフィールドのdt/ddとコードに局所適用し、data属性から通常本文へ継承させない。

比較用入力と設定は[visual fixtureの説明](../tests/fixtures/README.md#gift-op1-visual-parity)を参照。
