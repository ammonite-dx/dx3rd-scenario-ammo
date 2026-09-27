# 旧gift PDFのレンダリング監査

調査日: 2026-09-27。目的は、旧giftのA5デザインを現行Themeへ移す際の再現条件と未確定点を、完成PDFの内部情報から補うこと。本書はPDFと依存lockfileの事後調査であり、giftの再build・原稿やThemeの変更・フォントの追加は行っていない。

## 調査範囲と方法

`gift/gift.pdf` のPDFメタデータとページボックスを `pdfinfo -box` / pypdf で確認し、`pdffonts` とpypdfで全ページのフォントリソース、埋め込み形式、ToUnicode、FontDescriptorを照合した。TTFが直接埋め込まれたリソースはOS/2 weightも読んだ。代表ページ10、11、12、23、29、56はテキスト抽出とレンダリング画像で照合した。`gift` と現行プロジェクトのlockfile、およびVivliostyle.js公式release notesも調査した。

対象はリポジトリ内の `gift/gift.pdf` と、その時点で保存されている依存lockfileである。PDFのcreator文字列は実行時の厳密な再現環境を完全には記録しないため、lockfileとPDF metadataを別の証拠として扱う。

## PDFのメタデータと由来

| 項目 | 確認結果 |
| --- | --- |
| PDF仕様 / ページ数 | PDF 1.7、65ページ、Tagged PDF。暗号化なし。 |
| 文書名 | `gift` |
| Creator | `Vivliostyle (Vivliostyle.js 2.31.2; Chromium/134.0.6998.35)` |
| Producer | `Skia/PDF m134` |
| 作成・更新時刻 | `D:20250905131056+00'00'`（2025-09-05 13:10:56 UTC / 22:10:56 JST） |
| 判型・サイズ | A5相当。pdfinfo表示は419.528 × 595.276 pt（148 × 210 mm）。各ページボックスは同じ範囲で、下端座標に0.64 ptのオフセットがある。 |
| ファイルサイズ | 4,151,299 bytes |

### lockfileとの食い違い

| 証拠 | 解決バージョン |
| --- | --- |
| `gift/package-lock.json` の `@vivliostyle/core` | 2.34.1 |
| `gift/package-lock.json` の `@vivliostyle/cli` | 9.6.0（package.json側は `latest` 指定） |
| 現行プロジェクトのlockfileの `@vivliostyle/core` | 2.45.0 |
| PDFに記録されたVivliostyle.js / Chromium | 2.31.2 / 134.0.6998.35 |

したがって、PDFが `gift` の現在のlockfileにあるCore 2.34.1で生成されたとは断定できない。ProducerのSkia m134とCreatorのChromium 134は互いに整合する一方、Vivliostyle.js 2.31.2はlockfileのCore 2.34.1より古い。PDF生成時に別のインストール状態・環境が使われた可能性があり、旧PDFをCore 2.34.1の出力として扱うのは不適切である。現在のlockfileとPDFの由来をそろえるには、当時の実行記録または生成環境が別途必要。

## 埋め込みフォントの全体像

`pdffonts` は147個のページ単位フォントリソースを報告し、すべて `emb=yes`, `sub=yes`, `uni=yes`。ここで147はフォントリソース数であり、147種類の書体という意味ではない。サブセット接頭辞を除くと3ファミリーにまとまる。

| PDF上のPostScript名 | リソース数とPDF形式 | 内部辞書・埋め込み | 使用の読み取り |
| --- | --- | --- | --- |
| `NotoSansJPThin-Regular` | 129（CID TrueType / Identity-H が71、Type 3 / Custom が58） | 全てsubset埋め込み・ToUnicodeあり。CID TrueTypeは `/Subtype /Type0`、`/Encoding /Identity-H`、子CIDFontの `/FontFile2` と `/ToUnicode` を持つ。FontDescriptorのFontNameは同名。読み出せた埋め込みTTFのOS/2 `usWeightClass` は400。Type 3側はCharProcsに字形を持ち、FontDescriptor `/FontWeight` は400。 | 本文・見出し・各種ラベル。PDFテキストの大部分を占める。 |
| `Noto-Serif-JP-ExtraLight-ExtraLight` | 16（Type 3 / Custom） | subset、ToUnicodeあり。`/Subtype /Type3`、独自Encoding、CharProcs。FontDescriptorの `/FontName` はこの名前、`/FontWeight` は700。Type 3のため元TTFの `/FontFile*` はなく、元フォントファイルの実weightや輪郭はPDF辞書だけでは照合できない。 | 章扉の英字・タイトル、シーン一覧のタイトルなど。 |
| `Material-Symbols-Outlined-Filled-24pt` | 2（Type 3 / Custom） | subset、ToUnicodeあり。`/Subtype /Type3`、独自Encoding、CharProcs。FontDescriptorは同名、`/FontWeight` 700。 | 会話・RP・検索・戦闘等のアイコン。 |

全ファミリーがUnicode対応のToUnicode mapを持つため、本文・アイコンの一部はPDFからテキストとして抽出できる。Type 3フォントの `emb=yes` は字形アウトラインがPDF内のCharProcsに含まれることを表す。これは元の配布TTF/OTFファイルを埋め込んだという意味ではない。

### CSSのfont requestとPDFで確認できるweight

- 旧ThemeはGoogle FontsからNoto Sans JPをweight指定なしで要求し、本文は400、見出し・ラベルは主に700を指定する。PDFには別のSans Bold/700ファミリーが見当たらず、直接埋め込まれたSans TTFのweightも400。したがってSansの700は、通常faceをブラウザーが合成bold化した可能性が高い。ただしPDFは合成処理のフラグを記録しないため、PDF内部情報だけで合成boldだったと確定はできない。
- PDF上のSans名にある `Thin` はPostScript名の一部にすぎず、調査できた埋め込みTTFのOS/2 weightとPDF FontDescriptorは400を示す。これだけを根拠に紙面がThin weightで組まれたとは判断しない。
- 章タイトルはCSSでNoto Serif JP 700を要求し、PDFのType 3 FontDescriptorも700を報告する。一方、PDF上のFontNameは `ExtraLight-ExtraLight` と記録される。元フォントファイルがType 3として埋め込まれていないため名前と実輪郭の不一致は解消できず、紙面での見え方と照合してもweightの再現性は未確定。
- Material SymbolsはOutlined系のCSS familyを要求し、`FILL=1` とweight軸を含む可変軸を指定する。PDF名は `Material-Symbols-Outlined-Filled-24pt`、FontDescriptor weightは700。PDF内にあるのは2つのType 3 subsetで、CSSの軸設定を完全に復元することはできない。

### 代表ページで確認した実使用

| PDFページ | 内容・確認できたフォント使用 |
| --- | --- |
| 10 | 「シーン一覧」。一覧タイトルはSerif 32Q、表本文はSans 14Q。通常の階層目次ではなく、目次・リンク先ページ番号の見本としては扱えない。 |
| 11 | 章扉。`Gift from God` はSerif 32Q、kickerはSerif 16Q。フィールドラベルSans 12Q、本文16Q、見出し18Q。RPアイコンMaterial Symbols 20Q。 |
| 12 | 会話アイコンMaterial Symbols 20Q、本文Sans 16Q、見出し18Q。抽出テキスト上のicon codepointもページ画像の吹き出しと対応。 |
| 23 | 検索アイコン14Q、会話アイコン20Q、フィールドラベルSans 12Q、本文16Q、見出し18Q。 |
| 29 | 剣アイコンMaterial Symbols 14Q、戦闘ラベルSans 12Q、本文16Q。見出し周辺の抽出サイズは約13.3Q。配置図もページ画像と対応。 |
| 56 | 敵データ。本文Sans 16Q・小見出し18Q・敵名32Q。旧 `:::section-title` などのフェンス文字列が紙面に漏れているため、完成状態のデザイン見本には採用しない。 |

CSSのQ指定（本文16Q/行送り28Q、見出し18Q、ラベル12Q、章扉タイトル32Q、アイコン20Q/14Q）と、抽出したPDF上の文字サイズは代表例でおおむね整合する。ただし行送りや実際の字形・字幅はPDFフォント情報だけでは確定できない。

## Vivliostyleのバージョン差で注意すべき点

以下は `gift` lockfileのCore 2.34.1から現行lockfileの2.45.0までの公式release notesを確認し、旧Themeの宣言と関係し得る変更だけを抽出したもの。全修正項目の一覧ではない。いずれもPDFに記録されたCore 2.31.2の生成原因と断定するものではなく、現行2.45.0で比較・再現試験を行う際の注意点である。

| 版 | 旧Themeとの関係 |
| --- | --- |
| [2.34.1](https://github.com/vivliostyle/vivliostyle.js/releases/tag/v2.34.1) | Chromium 138以降の不具合に対するPDF内リンク修正を含む。gift PDFのCreatorはChromium 134なので、その修正が当該PDFの生成に関わったとは考えにくい。 |
| [2.36.0](https://github.com/vivliostyle/vivliostyle.js/releases/tag/v2.36.0) | 2.34.1で導入された印刷時 `break-before` の誤レイアウトを修正。強制改ページ、表の行・セルの改ページ、表のページ／段分割も修正・改善。giftは章タイトル帯で `break-before: page` を使うため、版差を確認すべき箇所。 |
| [2.44.0](https://github.com/vivliostyle/vivliostyle.js/releases/tag/v2.44.0) | `text-spacing` のfiller幅をインストール済みフォントに依存しないよう変更。redirectされた章URLでの `target-counter()` 参照復元、縦書き文字回転や長い脚注の再組版も修正。日本語字間・印刷ページ参照の比較に関係する。 |
| [2.44.1](https://github.com/vivliostyle/vivliostyle.js/releases/tag/v2.44.1) | `target-counter()` を使うTheme Baseの目次スタイルを復元。gift CSSの目次ページ参照を新旧版で比較する際の候補。ただしgift.pdfに標準的な「目次」ページは確認できず、実PDFでの挙動は評価できない。 |
| [2.45.0](https://github.com/vivliostyle/vivliostyle.js/releases/tag/v2.45.0) | `text-spacing` fillerの縦メトリクス、`@font-face` のcascade順と `::marker` family mapping、`@page` 背景での `var()`、body/`@page` のwriting-modeとページ溢れ等を修正。字間、フォント選択、ページ家具の再現確認に関連する。 |

旧Themeは `text-spacing: allow-end`、`break-before: page`、`margin-break`、`target-counter()`、ページmargin box、外部Web fontを使う。したがって旧PDFと現行Core 2.45.0でページ数・字間・リンクページ番号が違っても、CSSだけの変更による差と即断せず、レンダラーの版、Chromium、フォント解決状態を分けて比較する必要がある。

## 目次とページ参照について

PDF p.10は「シーン一覧」という表で、通常の階層目次とは異なる。PDF内に独立した「目次」ページは確認できなかった。旧CSSがページ参照（`target-counter()`）を定義していることは確かだが、このPDFから目次のリーダー・ページ番号・参照先の正しさを受け入れ判定する根拠は得られない。ページ参照を現行Themeで確定する場合は、`target-counter()`を含む実原稿の目次と内部リンクを用意し、現行lockfile上でPDF出力とリンク先ページを検証する。

## 次の実装・検証に引き継ぐ結論

1. A5の寸法・14mm余白、本文16Q/28Q、見出しとラベルのサイズなど、Themeの幾何・タイポグラフィは旧CSSを具体的な参照値にできる。
2. その一方で、PDFの由来バージョンは `gift` lockfileと一致しない。まずレンダラーの実際のバージョンをそろえない限り、旧PDFのピクセル相当の差をTheme調整の合否に使わない。
3. 外部フォントが生成時にどのファイル・weightへ解決されたかは、PDFのType 3化やPDF metadataだけでは全て特定できない。特にSansの700合成とSerifのExtraLight名/700 descriptorは未確定。フォント再現性を製品要件にする段階で、配布条件を確認して同一フォントファイルを固定するか、代替を受け入れるかを判断する。
4. p.56に漏れたフェンス記法は旧原稿由来の異常表示で、再現目標に含めない。

## `pdffonts` の全出力

<details>
<summary>147フォントリソースの原出力（全件）</summary>

~~~text
name                                 type              encoding         emb sub uni object ID
------------------------------------ ----------------- ---------------- --- --- --- ---------
AAAAAA+Noto-Serif-JP-ExtraLight-ExtraLight Type 3            Custom           yes yes yes      7  0
BAAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes      8  0
BAAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes      9  0
CAAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes     10  0
DAAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes     11  0
EAAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes     12  0
CAAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes     13  0
EAAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes     14  0
FAAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes     15  0
GAAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes     16  0
HAAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes     17  0
IAAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes     18  0
IAAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes     19  0
JAAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes     20  0
HAAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes     21  0
BAAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes     22  0
GAAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes     23  0
EAAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes     24  0
EAAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes     25  0
JAAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes     26  0
KAAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes     27  0
LAAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes     28  0
DAAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes     29  0
MAAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes     30  0
NAAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes     31  0
OAAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes     32  0
PAAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes     33  0
QAAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes     34  0
RAAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes     35  0
SAAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes     36  0
TAAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes     37  0
UAAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes     38  0
VAAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes     39  0
WAAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes     40  0
XAAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes     41  0
YAAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes     42  0
ZAAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes     43  0
ABAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes     44  0
JAAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes     45  0
BBAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes     46  0
CBAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes     47  0
DBAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes     48  0
FAAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes     49  0
EBAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes     50  0
FBAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes     51  0
GBAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes     52  0
HBAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes     53  0
FBAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes     56  0
IBAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes     57  0
JBAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes     58  0
KBAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes     59  0
LBAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes     60  0
MBAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes     61  0
HAAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes     62  0
NBAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes     63  0
OBAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes     64  0
PBAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes     67  0
QBAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes     68  0
RBAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes     69  0
DAAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes     72  0
QAAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes     73  0
PAAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes     76  0
KAAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes     79  0
CAAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes     80  0
FBAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes     81  0
KAAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes     82  0
XAAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes     83  0
LAAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes     86  0
SBAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes     87  0
KBAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes     90  0
TBAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes     93  0
XAAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes     94  0
GAAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes     95  0
WAAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes     96  0
OAAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes     97  0
UBAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes     98  0
VBAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes     99  0
UAAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes    100  0
WBAAAA+Noto-Serif-JP-ExtraLight-ExtraLight Type 3            Custom           yes yes yes    103  0
XBAAAA+Noto-Serif-JP-ExtraLight-ExtraLight Type 3            Custom           yes yes yes    104  0
ZAAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes    105  0
EAAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes    106  0
YBAAAA+Noto-Serif-JP-ExtraLight-ExtraLight Type 3            Custom           yes yes yes    109  0
ZBAAAA+Noto-Serif-JP-ExtraLight-ExtraLight Type 3            Custom           yes yes yes    110  0
ACAAAA+Noto-Serif-JP-ExtraLight-ExtraLight Type 3            Custom           yes yes yes    111  0
QAAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes    112  0
QBAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes    113  0
BCAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes    114  0
IAAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes    115  0
CCAAAA+Material-Symbols-Outlined-Filled-24pt Type 3            Custom           yes yes yes    116  0
DCAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes    119  0
ECAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes    120  0
DCAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes    121  0
ECAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes    122  0
FCAAAA+Noto-Serif-JP-ExtraLight-ExtraLight Type 3            Custom           yes yes yes    125  0
PBAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes    126  0
MAAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes    127  0
GCAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes    130  0
HCAAAA+Noto-Serif-JP-ExtraLight-ExtraLight Type 3            Custom           yes yes yes    133  0
ICAAAA+Noto-Serif-JP-ExtraLight-ExtraLight Type 3            Custom           yes yes yes    134  0
JCAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes    135  0
KCAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes    136  0
LCAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes    137  0
NAAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes    140  0
UAAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes    142  0
EBAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes    143  0
MCAAAA+Material-Symbols-Outlined-Filled-24pt Type 3            Custom           yes yes yes    144  0
EBAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes    147  0
NCAAAA+Noto-Serif-JP-ExtraLight-ExtraLight Type 3            Custom           yes yes yes    150  0
OCAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes    151  0
CBAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes    152  0
DBAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes    153  0
PCAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes    154  0
KBAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes    155  0
QCAAAA+Noto-Serif-JP-ExtraLight-ExtraLight Type 3            Custom           yes yes yes    160  0
RCAAAA+Noto-Serif-JP-ExtraLight-ExtraLight Type 3            Custom           yes yes yes    161  0
SCAAAA+Noto-Serif-JP-ExtraLight-ExtraLight Type 3            Custom           yes yes yes    162  0
NBAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes    163  0
SBAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes    164  0
TCAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes    167  0
YAAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes    172  0
UCAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes    177  0
TBAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes    182  0
RAAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes    185  0
JBAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes    186  0
UBAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes    187  0
VBAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes    188  0
MAAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes    192  0
OAAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes    193  0
VCAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes    196  0
WCAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes    197  0
XCAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes    198  0
BBAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes    199  0
VAAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes    200  0
FAAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes    203  0
LBAAAA+NotoSansJPThin-Regular        Type 3            Custom           yes yes yes    206  0
YCAAAA+Noto-Serif-JP-ExtraLight-ExtraLight Type 3            Custom           yes yes yes    211  0
ZCAAAA+Noto-Serif-JP-ExtraLight-ExtraLight Type 3            Custom           yes yes yes    212  0
ADAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes    215  0
BDAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes    216  0
CDAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes    219  0
DDAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes    224  0
EDAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes    227  0
FDAAAA+Noto-Serif-JP-ExtraLight-ExtraLight Type 3            Custom           yes yes yes    230  0
GDAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes    231  0
HDAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes    238  0
IDAAAA+NotoSansJPThin-Regular        CID TrueType      Identity-H       yes yes yes    257  0
~~~

</details>
