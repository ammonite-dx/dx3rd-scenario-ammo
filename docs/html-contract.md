# 意味的HTML出力契約

## 1. 目的と適用範囲

本書は、remark-parse/Unifiedと自前parserでMarkdownと参照先YAMLを解析・検証・正規化した後、Themeへ渡す意味的HTMLのMVP契約を定義する。対象は、文書構造、通常のMarkdown要素、目次・リンク・画像、7種類のnarrative block、専用フィールド、検証済みの敵・コンボ参照、およびアクセシビリティに関わる属性である。VFMは依存に含めない。

本書はHTMLをどのように組版するかを定義しない。ページ寸法、余白、書体、改ページ、ページ番号、running headerの表示方法、色、罫線、アイコンなどはThemeの責務である。MVPの前提と責務分離は[要件定義書](requirements.md)、入力Markdownは[記法仕様書](syntax.md)、敵YAMLのスキーマと参照解決は[外部YAMLデータ契約](data-contract.md)に従う。

以降の「必須」「禁止」は、検証済みASTから生成されるMVP HTMLに対する規範とする。HTMLは生成物であり、手編集して契約を満たす運用はしない。

## 2. 入力仕様との責務分離

`docs/syntax.md` は、frontmatter、frontmatter直後の通常H1、narrative blockの開始・終了、表示タイトル、列1の既知ラベル行、本文として許可するMarkdown、および入力エラーを定義する。`docs/data-contract.md` は、YAMLの型、ID、配列順、Markdownリンクのパス・fragment解決、および参照整合性を定義する。

本書は構文解析、正規表現置換、YAML検証を規定しない。入力が検証済みであることを前提に、次だけを固定する。

- 文書、見出し、段落、リンク、画像をどのHTML要素へ写像するか。
- 7種類のnarrative blockを識別する要素、クラス、`data-*`属性、見出し、本文領域。
- 表示タイトルと既知ラベル行を失わない出力構造。
- 検証済みの敵全体・敵内コンボ参照と、YAMLデータを展開した意味構造。
- IDとARIA参照の整合性。
- Themeが依存してよい意味情報と、依存してはいけない偶然のDOM。

入力のフェンス文字列、`.scene-title`、attribute-list、旧ブロック名をHTMLへ出力しない。構文エラー、未知ブロック、本文用ではない予約名を一般の`div`や段落へフォールバックして隠してはならない。

## 3. 契約の識別

1つのHTMLファイルは、原則として1つの文書または1つの目次文書を表す。`html`要素には契約識別子を付ける。

```html
<html lang="ja" data-html-contract="dx3rd-scenario/v1">
```

`data-html-contract`は互換性を判断するバージョンであり、表示文字列ではない。破壊的な要素・属性変更を行う場合は値を更新する。クラスの並び順、空白、生成IDの末尾、意味を持たないラッパーの有無をバージョン判定に使わない。

`lang`はfrontmatterから解決した文書言語を指定し、省略しない。CSSリンクや`title`は生成設定に従うが、Themeはそれらの偶然の内容を意味契約として解釈しない。

## 4. 文書と節

### 4.1 文書ルート

本文の唯一のランドマークは、`body`直下の`main.document`とする。

```html
<main id="document-md-04" class="document" data-document-id="MD-04">
  <header class="document-header" data-region="document-header">
    <p class="document-kicker" data-region="document-kicker">ミドルフェイズ・シーン4</p>
    <h1 id="document-md-04-title" class="document-title">Illegal Gifter</h1>
  </header>
  <div class="document-body" data-region="document-body">
    <!-- 通常Markdown、document-section、scenario-block、構造化データ展開 -->
  </div>
</main>
```

- `body`直下の`main`は1つだけにする。
- `main`の`id`は表示タイトルではなくfrontmatterの`id`から決定的に生成し、文書内で一意にする。
- `data-document-id`はfrontmatterの`id`を元の大文字・小文字を保って保持する。
- `kicker`が存在する場合だけ、`document-header`内でH1の前に`p.document-kicker[data-region="document-kicker"]`を1つ出力する。
- frontmatter直後の最初の通常H1を`h1.document-title`へ変換する。入力の`.scene-title`やattribute-listを必要とせず、それらを出力へ残さない。
- `document-body`は本文領域を識別する意味を持たないラッパーであり、内容を別の意味へ変換しない。

文書IDは同一出力集合で一意でなければならない。IDの安全化は変換器が行い、空白を含まないASCIIアンカーとして出力する。Themeやリンク生成器は安全化後の内部規則を推測しない。

### 4.2 節

H1の下にある通常のMarkdown見出しは、見出しランクに対応する`section.document-section`へ変換する。節の見出しは、その`section`の最初の見出し要素にする。

```html
<section
  id="section-md-04-01"
  class="document-section"
  data-section-id="section-md-04-01"
  data-section-level="2"
  aria-labelledby="section-md-04-01-title">
  <h2 id="section-md-04-01-title" class="document-section__title">描写1</h2>
  <p>キミたちが今後の方針を考えていると、渚が現れる。</p>
</section>
```

- `id`と`data-section-id`は同じ不透明な識別子を保持する。
- `data-section-level`はAST上の見出しレベルを数値で保持する。
- `aria-labelledby`は同じ節の見出しIDを参照する。
- 節の見出しは`h2`から`h6`を使い、`h1`は文書タイトルだけに使う。
- 子見出しは対応する子`section`へ入れ、深さを`level1`等の表示クラスで表現しない。

同名見出しが複数ある場合も、変換器は衝突を決定的に解消する。TOCやリンクは生成IDをそのまま参照し、接尾辞を解析しない。

### 4.3 通常のMarkdown要素

| Markdownの意味 | HTML | 契約上の注意 |
| --- | --- | --- |
| 段落 | `p` | 段落ごとに1要素。余白用クラスを付けない。 |
| 強調・コード等 | `em`、`strong`、`code`等 | 見た目だけの`span`を追加しない。 |
| 箇条書き・番号付き | `ul`、`ol`、`li` | 項目内の段落と入れ子を保つ。 |
| 引用 | `blockquote` | narrative blockの代用にしない。 |
| 表 | `table`、`caption`、`thead`、`tbody`、`tr`、`th`、`td` | 見出しセルを`th`で保持する。 |
| 定義・項目と値 | `dl`、`dt`、`dd` | 表示由来の旧`desc-list`を正本にしない。 |
| 水平線・主題転換 | `hr` | 改ページ用クラスや属性を付けない。 |

空の段落、余白だけの要素、見た目を揃えるための`br`を追加してはならない。Markdownの明示的な改行だけを`br`へ変換する。

## 5. リンク、画像、目次

### 5.1 通常リンク

Markdownリンクはラベルを保持した`a`へ変換する。必要な場合だけ次の`data-link-kind`を付ける。

| 値 | 用途 |
| --- | --- |
| `internal` | 同じHTML内のIDへのリンク。 |
| `cross-document` | 同じ出力集合内の別HTMLへの相対リンク。 |
| `external` | 外部URIへのリンク。 |
| `toc` | 生成された目次リンク。 |
| `structured-data` | 9章の検証済みYAML参照。 |

通常リンクに旧`class="anchor"`やページ番号文字列を付けない。同一出力集合のfragmentは新契約のIDへ解決し、旧HTMLの偶然のIDを引き継がない。ページ番号、外部リンクの印刷表現、色、下線はThemeで決める。

### 5.2 画像

独立した画像ブロックは次の構造にする。

```html
<figure class="document-figure" data-region="figure">
  <img src="./img/middle-battle-arrangement.png" alt="PCと敵の初期配置" />
  <figcaption>初期配置</figcaption>
</figure>
```

- `src`は生成HTMLから解決可能な相対URIまたは入力で許可されたURIとする。
- `alt`は必須とし、内容画像は内容を説明し、装飾画像は`alt=""`とする。
- キャプションがない場合は空の`figcaption`を追加しない。
- A5/A4の幅に合わせる`width`、`height`、`style`を埋め込まない。
- インライン画像は意味上独立していなければ`p`内の`img`として出力する。

### 5.3 目次

生成された目次は`nav.document-toc[data-region="toc"]`とし、`div.toc`は契約に含めない。

```html
<nav class="document-toc" data-region="toc" aria-labelledby="toc-title">
  <h2 id="toc-title" class="document-toc__title">目次</h2>
  <ol>
    <li><a class="document-toc__link" data-link-kind="toc" href="md4.html#section-md-04-01">描写1</a></li>
  </ol>
</nav>
```

目次リンクは文書ルート、節、narrative block、構造化データ展開の生成IDをそのまま参照する。ページ番号、リーダー罫線、改ページはThemeの責務とする。

## 6. narrative block

### 6.1 共通構造

MVPの7種類はすべて`section.scenario-block`として出力する。

```html
<section
  id="block-md-04-01-01"
  class="scenario-block scenario-block--dialogue"
  data-block-id="block-md-04-01-01"
  data-block-kind="dialogue"
  aria-labelledby="block-md-04-01-01-title">
  <header class="scenario-block__header" data-region="block-header">
    <h3 id="block-md-04-01-01-title" class="scenario-block__title">渚</h3>
  </header>
  <div class="scenario-block__body" data-region="block-body">
    <p>「あ！PC①！こんなところにいたんだ。」</p>
  </div>
</section>
```

- `id`と`data-block-id`は同じ不透明なアンカーを保持し、文書内で一意にする。
- 共通クラス`scenario-block`、modifierクラス`scenario-block--{kind}`、`data-block-kind`を必須とする。意味の正本は`data-block-kind`である。
- 開始行の検証済み表示タイトルを`scenario-block__title`へ出力する。入力の`:::`、ブロック名、フェンス行全体、attribute-listを本文テキストとして出力しない。
- `aria-labelledby`はブロック見出しIDを参照する。
- 本文と専用フィールドは`scenario-block__body`内に入力順で置く。
- 見出しランクは配置された論理階層の次のランクにし、見た目のために常に`h4`へ固定しない。
- narrative block同士は入れ子にしない。本文中の通常Markdown見出しは入力の論理階層を保つ。
- `dialogue`を`dialog`要素や`role="dialog"`にしない。静的なシナリオ本文であり対話UIではない。

### 6.2 7種類の語彙

| `data-block-kind` | modifierクラス | 意味 |
| --- | --- | --- |
| `dialogue` | `scenario-block--dialogue` | 登場人物等の台詞・会話。 |
| `roleplay` | `scenario-block--roleplay` | 自由な演技場面や進行指示。 |
| `choice` | `scenario-block--choice` | 選択、分岐、選択後の進行。 |
| `check` | `scenario-block--check` | 1つの判定と結果。 |
| `info` | `scenario-block--info` | GM向け情報、補足、複数の情報収集項目。 |
| `e-lois` | `scenario-block--e-lois` | Eロイスに関する処理や説明。 |
| `battle` | `scenario-block--battle` | 戦闘の進行、配置、終了条件、データ参照。 |

`choice`の本文は自然文、段落、リスト、表などの通常Markdownをそのまま保持する。`ul`や`ol`が存在しないことを理由にHTML生成を失敗させたり、変換器が選択肢リストを補ったりしてはならない。

## 7. 専用フィールド

### 7.1 共通出力

専用ブロック直下の列1で認識された既知ラベル行は、`dl.field-list[data-region="field-list"]`へ出力する。各行を1つの`div.field-list__item`とし、表示ラベルを`dt`、値を`dd`へ置く。

```html
<dl class="field-list" data-region="field-list">
  <div class="field-list__item" data-field-key="target">
    <dt>対象</dt>
    <dd>PC①、PC②、渚</dd>
  </div>
</dl>
```

- `data-field-key`は次表の安定したASCIIキーを用い、表示ラベルから推測しない。
- 同一ラベルの反復を許すブロックでは、同じ`data-field-key`を持つ項目を複数出力する。
- フィールド項目の順序はASTの入力順を保持する。技能・難易度の複数組をまとめたり、キー順で並べ替えたりしない。
- 連続するフィールドノードは1つの`dl`へまとめる。通常Markdown要素を挟む場合は、各フィールド列を元の位置にある別の`dl`として出力し、本文との相対順も保持する。
- 値のインラインMarkdownは`dd`内に意味を保って出力する。値を持つラベルに空の`dd`を生成しない。
- 単独`[必須]`は`dt`を`必須`、`dd`を`必須`とする表示項目へ写像する。真偽の機械判定は7.3節の属性を正本とする。

| 入力ラベル | `data-field-key` |
| --- | --- |
| 技能 | `skill` |
| 難易度 | `difficulty` |
| 必須 | `required` |
| 対象 | `target` |
| 条件 | `condition` |
| 分岐 | `branch` |
| 成功時 | `on-success` |
| 失敗時 | `on-failure` |
| エネミー | `enemy` |
| 配置 | `placement` |
| 戦闘終了条件 | `battle-end-condition` |
| 参照 | `reference` |
| 備考 | `notes` |

この表はブロックごとの許可ラベルを拡張しない。どのブロックで各ラベルを許すか、値の型、多重度、ペア規則は`docs/syntax.md`を正本とする。

### 7.2 `info`と`e-lois`

`info`と`e-lois`のフィールドはすべて人間可読である。`skill`、`difficulty`、`required`を含め、`check`の機械可読な判定属性として解釈しない。同じラベルと複数の技能・難易度ペアを入力順のまま出力する。

```html
<dl class="field-list" data-region="field-list">
  <div class="field-list__item" data-field-key="skill"><dt>技能</dt><dd>〈情報: 噂話〉</dd></div>
  <div class="field-list__item" data-field-key="difficulty"><dt>難易度</dt><dd>5</dd></div>
  <div class="field-list__item" data-field-key="required"><dt>必須</dt><dd>必須</dd></div>
  <div class="field-list__item" data-field-key="skill"><dt>技能</dt><dd>〈情報: UGN〉</dd></div>
  <div class="field-list__item" data-field-key="difficulty"><dt>難易度</dt><dd>8</dd></div>
</dl>
```

変換器やThemeは、隣接する`skill`と`difficulty`を1つへ潰したり、`required`をブロック属性へ昇格させたり、表示上の日本語からペアを再解釈したりしない。

### 7.3 `check`の固定出力

`check`は、検証済みのちょうど1組の`skill`と`difficulty`、および任意の`required`を表す。

- `section.scenario-block--check`には`data-check-mandatory`を必ず出力する。入力の単独`[必須]`が存在すれば`true`、存在しなければ`false`とする。
- 属性名は既存契約との互換性を保つため`data-check-mandatory`を維持する。入力語`[必須]`と属性名の違いをThemeが補正する必要はない。
- `skill`、`difficulty`、存在する場合の`required`は、`scenario-block__body`の最初の子である1つの`dl.field-list`へこの順で出力する。
- `required`がない場合は表示項目を生成しないが、`data-check-mandatory="false"`は省略しない。
- 本文開始後の通常Markdown、太字、引用、表から技能、難易度、必須性を推測しない。

```html
<section
  id="block-example-check"
  class="scenario-block scenario-block--check"
  data-block-id="block-example-check"
  data-block-kind="check"
  data-check-mandatory="true"
  aria-labelledby="block-example-check-title">
  <header class="scenario-block__header" data-region="block-header">
    <h3 id="block-example-check-title" class="scenario-block__title">衝動判定</h3>
  </header>
  <div class="scenario-block__body" data-region="block-body">
    <dl class="field-list" data-region="field-list">
      <div class="field-list__item" data-field-key="skill"><dt>技能</dt><dd>〈意志〉</dd></div>
      <div class="field-list__item" data-field-key="difficulty"><dt>難易度</dt><dd>8</dd></div>
      <div class="field-list__item" data-field-key="required"><dt>必須</dt><dd>必須</dd></div>
    </dl>
    <p>判定に失敗した場合、暴走を受ける。</p>
  </div>
</section>
```

## 8. 要素選択とARIA

- `main`は主本文の唯一のルートにする。
- `header`は文書またはnarrative blockの見出し領域に使い、飾り帯のためだけに追加しない。
- `section`は見出しを持つ節、narrative block、構造化データの意味的区画に使う。
- `nav`は目次などのナビゲーションに使う。
- `aside`は入力ASTが本文から独立した補足を明示した場合だけ使い、`info`を自動的に`aside`へ変換しない。
- `dialogue`にinteractive roleを付けない。静的な文書に`button`、`dialog`、`tab`等を追加しない。
- すべての`aria-labelledby`は同じHTML内に存在する一意な見出しIDを参照する。
- 装飾アイコンを追加する場合はThemeの擬似要素または`aria-hidden="true"`の装飾として扱い、見出しのアクセシブル名へ混入させない。
- リンクの可読名は元のMarkdownラベルを保持する。構造化データ展開がリンク直後にあってもリンクテキストを空にしない。

## 9. 検証済み構造化データ参照

### 9.1 参照リンク

`docs/data-contract.md`の参照検証を通った通常リンクだけを、`data-link-kind="structured-data"`として出力する。元の相対`href`と可読ラベルを保持し、表示名からIDを推測しない。

```html
<a
  class="structured-data-reference"
  data-link-kind="structured-data"
  data-data-kind="enemy"
  data-enemy-id="sample-warden"
  href="../data/enemies/sample-warden.yaml">敵データ：灰庭の番人</a>

<a
  class="structured-data-reference"
  data-link-kind="structured-data"
  data-data-kind="combo"
  data-enemy-id="sample-warden"
  data-combo-id="iron-claw"
  href="../data/enemies/sample-warden.yaml#iron-claw">コンボデータ：鉄爪の一撃</a>
```

- fragmentなしは`data-data-kind="enemy"`とし、検証済み`enemy.id`を`data-enemy-id`へ保持する。
- fragmentありは`data-data-kind="combo"`とし、`data-enemy-id`に加えて完全一致した`enemy.combos[].id`を`data-combo-id`へ保持する。
- `href`は元リンクを生成HTMLから解決できる相対URIとして保持してよい。資産コピーで位置が変わる場合だけ、同じYAMLとfragmentへ解決するよう更新する。
- `data/combos/*.yaml`、外部URI、絶対パス、未検証YAML、未知fragmentをこの構造へフォールバックしない。

### 9.2 展開位置と共通構造

参照リンクを含む通常Markdown要素はその意味を保つ。展開したデータはインラインの`a`内へ入れず、そのリンクを含む最小のブロック要素の直後に置く。同じ参照を1文書で複数回展開するか、最初の1回だけ展開して後続リンクを同じ生成IDへ向けるかは生成設定で選べるが、同じ設定では決定的にする。

敵全体の標準ルートは次のとおりである。

```html
<section
  id="enemy-sample-warden"
  class="structured-data structured-data--enemy"
  data-region="structured-data"
  data-data-kind="enemy"
  data-enemy-id="sample-warden"
  data-data-schema="dx3rd-scenario/enemy"
  data-data-version="1"
  aria-labelledby="enemy-sample-warden-title">
  <header class="structured-data__header" data-region="data-header">
    <h3 id="enemy-sample-warden-title" class="structured-data__title">灰庭の番人</h3>
  </header>
  <div class="structured-data__body" data-region="data-body">
    <!-- 9.3節の意味的区画 -->
  </div>
</section>
```

コンボ単体の標準ルートは次のとおりである。

```html
<section
  id="combo-sample-warden-iron-claw"
  class="structured-data structured-data--combo"
  data-region="structured-data"
  data-data-kind="combo"
  data-enemy-id="sample-warden"
  data-combo-id="iron-claw"
  data-data-schema="dx3rd-scenario/enemy"
  data-data-version="1"
  aria-labelledby="combo-sample-warden-iron-claw-title">
  <header class="structured-data__header" data-region="data-header">
    <h3 id="combo-sample-warden-iron-claw-title" class="structured-data__title">鉄爪の一撃</h3>
  </header>
  <div class="structured-data__body" data-region="data-body">
    <!-- 9.4節のコンボ項目 -->
  </div>
</section>
```

生成IDは文書内で一意かつ決定的にする。重複展開時の接尾辞は不透明とし、Themeは解析しない。展開された`section`は元リンクを置き換えず、リンクラベルと`href`を失わせない。

### 9.3 敵全体の表示構造

敵全体の展開は、`structured-data__body`内に次の順で意味的区画を置く。YAMLマップの記述順は使わず、この契約の区画順を使う。各配列内の項目はYAMLの記述順を厳密に保つ。

1. `basic`: `aliases`、`syndromes`、`encroachment`、`impulse`、`notes`
2. `abilities`: `primary`、`secondary`、`skills`
3. `effects`
4. `items`
5. `lois`
6. `d-lois`
7. `e-lois`
8. `combos`

各区画は次の共通形を用いる。

```html
<section class="structured-data__section" data-data-section="effects" aria-labelledby="enemy-sample-warden-effects-title">
  <h4 id="enemy-sample-warden-effects-title" class="structured-data__section-title">エフェクト</h4>
  <ol class="data-list" data-region="data-list">
    <!-- YAML配列順のli.data-list__item -->
  </ol>
</section>
```

- `basic`と`abilities`の項目と値は`dl.data-fields[data-region="data-fields"]`、各項目は`div.data-fields__item[data-field-key] > dt + dd`で表す。
- YAMLキーと一対一の`data-field-key`はYAMLのASCIIキーをそのまま使う。`level_bonus`等のアンダースコアを別表記へ変えない。
- `aliases`と`syndromes`は`dd`内の`ul`で記述順を保つ。
- `encroachment`は`data-field-key="encroachment"`の`dd`内に、`rate`、`level_bonus`、`dice_bonus`、`notes`の内側の`dl.data-fields`を置く。省略された任意キーは出力しない。
- `primary`、`secondary`、`skills`はそれぞれ見出し付きの下位区画と順序付き`ol.data-list`にする。各エントリの`id`を`data-entry-id`に保持し、許可された全キーを`dl.data-fields`へ出力する。`skills[].ability_id`は`data-ability-id`にも保持する。
- `effects`、`items`、`lois`、`d_lois`、`e_lois`は各エントリを`li.data-list__item[data-entry-id]`とし、`name`を項目見出し、その他の存在する全キーを`dl.data-fields`へ出力する。`e_lois[].count`は省略時の正規化値`1`を表示してよいが、実装方針を同じ出力集合内で統一する。
- `combos`はYAML配列順の`ol.data-list`とし、各要素を9.4節のコンボ項目で表す。
- 必須配列が空の場合も対応する区画と空の`ol.data-list`を出力する。空を表示文字列で補うかはThemeの責務とし、変換器は架空の項目を追加しない。
- `description`と`notes`は短いデータ補足として出力し、Markdown本文の会話、戦闘プラン、終了条件、裁定を補完しない。

敵YAMLの全表示写像は次のとおりである。表にある「項目」は`data-fields__item[data-field-key]`、「一覧」はYAML順の`ol.data-list`または値の`ul`を表す。IDは表示名の代わりに本文へ重複表示する必要はないが、指定した`data-*`属性へ必ず保持する。

| YAMLパス | HTML上の意味 |
| --- | --- |
| `/schema`、`/version` | 展開ルートの`data-data-schema`、`data-data-version`。表示項目にはしない。 |
| `/enemy/id` | 展開ルートの`data-enemy-id`。 |
| `/enemy/name` | `structured-data__title`。 |
| `/enemy/aliases`、`syndromes` | `basic`区画の同名項目内の一覧。 |
| `/enemy/encroachment/rate`、`level_bonus`、`dice_bonus`、`notes` | `encroachment`項目内の同名項目。存在するキーをすべて出力する。 |
| `/enemy/impulse`、`notes` | `basic`区画の同名項目。 |
| `/enemy/abilities/primary[]` | `primary`一覧。`data-entry-id`に`id`、項目に`name`と`value`。 |
| `/enemy/abilities/secondary[]` | `secondary`一覧。`data-entry-id`に`id`、項目に`name`と、存在する`value`または`formula`。 |
| `/enemy/abilities/skills[]` | `skills`一覧。`data-entry-id`に`id`、`data-ability-id`に`ability_id`、項目に`name`、`ability_id`、`value`。 |
| `/enemy/effects[]` | `effects`一覧。`data-entry-id`に`id`、項目に`name`、存在する`group`、`level`、`description`、`notes`。 |
| `/enemy/items[]` | `items`一覧。`data-entry-id`に`id`、項目に`name`、存在する`category`、`attack`、`guard`、`armor`、`range`、`description`、`notes`。 |
| `/enemy/lois[]` | `lois`一覧。`data-entry-id`に`id`、項目に`name`、存在する`relation`、`positive_emotion`、`negative_emotion`、`notes`。 |
| `/enemy/d_lois[]` | `d-lois`一覧。`data-entry-id`に`id`、項目に`name`、存在する`alias`、`description`、`notes`。 |
| `/enemy/e_lois[]` | `e-lois`一覧。`data-entry-id`に`id`、項目に`name`、`count`、存在する`description`、`notes`。 |
| `/enemy/combos[]` | `combos`一覧。`data-combo-id`に`id`、`combo-data__title`に`name`、残りは9.4節。 |

`name`を項目見出しに使う一覧でも、元の値は省略されていない。見出しがそのフィールドの意味的な表示先であり、同じ文字列を`dd`へ重複させる必要はない。`id`、`ability_id`、参照IDは正本照合に必要な属性と、上表で表示項目に指定した箇所の両方へ保持する。

### 9.4 コンボと解決済み参照

敵全体内のコンボ項目、およびコンボ単体展開は、同じ意味構造を使う。

```html
<article class="combo-data" data-combo-id="iron-claw" aria-labelledby="combo-item-iron-claw-title">
  <h5 id="combo-item-iron-claw-title" class="combo-data__title">鉄爪の一撃</h5>
  <dl class="data-fields" data-region="data-fields">
    <div class="data-fields__item" data-field-key="timing"><dt>タイミング</dt><dd>メジャーアクション</dd></div>
    <div class="data-fields__item" data-field-key="target"><dt>対象</dt><dd>単体</dd></div>
    <div class="data-fields__item" data-field-key="range"><dt>射程</dt><dd>至近</dd></div>
    <div class="data-fields__item" data-field-key="check"><dt>判定</dt><dd>8dx8+4</dd></div>
    <div class="data-fields__item" data-field-key="description"><dt>効果</dt><dd>鉄甲を使った白兵攻撃。</dd></div>
  </dl>
  <ol class="data-reference-list" data-region="effect-references">
    <li data-effect-id="beast-claw">獣爪 <span data-field-key="level">レベル2</span></li>
  </ol>
  <ol class="data-reference-list" data-region="item-references">
    <li data-item-id="iron-gauntlet">鉄甲</li>
  </ol>
</article>
```

- `effects`と`item_ids`を除く、存在するコンボキーは`dl.data-fields`に出力する。順序は`timing`、`target`、`range`、`check`、`attack_type`、`attack_power`、`uses`、`description`、`notes`とする。
- `effects`は`data-region="effect-references"`、`item_ids`は`data-region="item-references"`の順序付きリストとし、YAMLの参照順を保つ。
- エフェクト参照は解決済み`effect_id`を`data-effect-id`、解決した名称を本文へ出力する。コンボ側の`level`があればその値、なければ参照先エフェクトの`level`が存在する場合だけその値を表示する。
- アイテム参照は解決済みIDを`data-item-id`、名称を本文へ出力する。
- IDから名称を推測せず、未解決参照を文字列だけで出力しない。
- コンボ単体展開では、選択された1件だけを出力する。ファイル内の他のコンボや敵全体を暗黙に展開しない。

### 9.5 構造化データで禁止する出力

- `:::enemy`や旧`:::combo`に対応する`scenario-block`を生成しない。
- JSON、YAMLソース、ファイルシステムの絶対パスを本文へ埋め込まない。
- A5/A4、`mm`、改ページ、ページ番号、`style`、Theme固有の装飾クラスを構造化データDOMへ入れない。
- YAMLマップのキー順で区画を並べ替えず、配列を名前やIDでソートしない。
- 省略された任意値を表示名や本文から推測しない。

## 10. running headerとTheme境界

### 10.1 文書単位

Themeが文書単位のrunning headerを必要とする場合は、`main.document[data-document-id]`と`h1.document-title`の表示テキストを情報源にする。HTMLへ`ID: タイトル`のような重複文字列、ページ番号、running header専用テキストを追加しない。`kicker`は独立した表示メタデータであり、文書IDやタイトルの代替にしない。

### 10.2 節単位の補助契約

将来のThemeが節単位のrunning headerを選ぶ場合に限り、`section.document-section[data-section-id]`とその`document-section__title`を情報源にしてよい。文書単位の既定情報源と混同せず、表示タイトルを`data-section-id`へ埋め込まない。

### 10.3 Themeが依存してよいもの

- `html[data-html-contract="dx3rd-scenario/v1"]`
- `main.document`、`data-document-id`、`document-header`、`document-kicker`、`document-title`、`document-body`
- `section.document-section`、`data-section-id`、`data-section-level`、`document-section__title`
- `section.scenario-block`、7値の`data-block-kind`、対応するmodifierクラス、header/title/bodyと`data-region`
- `dl.field-list`、`field-list__item[data-field-key]`、`check`の`data-check-mandatory`
- `a.structured-data-reference[data-link-kind="structured-data"]`と`data-data-kind`、正本ID属性
- `section.structured-data`、`data-data-kind`、`data-data-schema`、`data-data-version`、`data-data-section`、`data-fields`、`data-list`、`combo-data`、解決済み参照ID
- 標準HTML要素の意味と、生成されたIDを参照アンカーとして扱うこと

### 10.4 Themeが依存してはいけないもの

- 旧`.section-title`、`.level1`〜`.level5`、`.serif`、`.rp`、`.select`、`.check`、`.info`、`.e-lois`、`.battle`、`.anchor`、`.desc-list*`
- 見出しランクや本文文字列からのブロック種別・フィールド・構造化データの推測
- クラス順、空白、テキストノード分割、意味を持たないラッパーの個数
- ID内のタイトル、ラベル、接尾辞の解析
- HTML内の`style`、A5/A4寸法、改ページ、書体、ページ番号、running header用の重複文字列
- CSS擬似要素だけで読者へ伝える唯一のラベル

## 11. 完全例

次は通常H1、kicker、`info`の反復フィールド、`check`、検証済みコンボ参照と展開を含む抜粋である。実際の生成IDは決定的な不透明値であり、例の文字列を固定値として実装へ埋め込まない。

```html
<html lang="ja" data-html-contract="dx3rd-scenario/v1">
  <body>
    <main id="document-md-04" class="document" data-document-id="MD-04">
      <header class="document-header" data-region="document-header">
        <p class="document-kicker" data-region="document-kicker">ミドルフェイズ・シーン4</p>
        <h1 id="document-md-04-title" class="document-title">Illegal Gifter</h1>
      </header>
      <div class="document-body" data-region="document-body">
        <section id="block-md-04-01" class="scenario-block scenario-block--info" data-block-id="block-md-04-01" data-block-kind="info" aria-labelledby="block-md-04-01-title">
          <header class="scenario-block__header" data-region="block-header">
            <h2 id="block-md-04-01-title" class="scenario-block__title">野原球児</h2>
          </header>
          <div class="scenario-block__body" data-region="block-body">
            <dl class="field-list" data-region="field-list">
              <div class="field-list__item" data-field-key="skill"><dt>技能</dt><dd>〈情報: 噂話〉</dd></div>
              <div class="field-list__item" data-field-key="difficulty"><dt>難易度</dt><dd>5</dd></div>
              <div class="field-list__item" data-field-key="skill"><dt>技能</dt><dd>〈情報: UGN〉</dd></div>
              <div class="field-list__item" data-field-key="difficulty"><dt>難易度</dt><dd>8</dd></div>
            </dl>
            <p>野原球児がジャームであることが分かる。</p>
          </div>
        </section>

        <section id="block-md-04-02" class="scenario-block scenario-block--check" data-block-id="block-md-04-02" data-block-kind="check" data-check-mandatory="true" aria-labelledby="block-md-04-02-title">
          <header class="scenario-block__header" data-region="block-header">
            <h2 id="block-md-04-02-title" class="scenario-block__title">衝動判定</h2>
          </header>
          <div class="scenario-block__body" data-region="block-body">
            <dl class="field-list" data-region="field-list">
              <div class="field-list__item" data-field-key="skill"><dt>技能</dt><dd>〈意志〉</dd></div>
              <div class="field-list__item" data-field-key="difficulty"><dt>難易度</dt><dd>8</dd></div>
              <div class="field-list__item" data-field-key="required"><dt>必須</dt><dd>必須</dd></div>
            </dl>
            <p>失敗した場合、暴走を受ける。</p>
          </div>
        </section>

        <p>この戦闘では<a class="structured-data-reference" data-link-kind="structured-data" data-data-kind="combo" data-enemy-id="sample-warden" data-combo-id="iron-claw" href="../data/enemies/sample-warden.yaml#iron-claw">コンボデータ：鉄爪の一撃</a>を参照する。</p>
        <section id="combo-sample-warden-iron-claw" class="structured-data structured-data--combo" data-region="structured-data" data-data-kind="combo" data-enemy-id="sample-warden" data-combo-id="iron-claw" data-data-schema="dx3rd-scenario/enemy" data-data-version="1" aria-labelledby="combo-sample-warden-iron-claw-title">
          <header class="structured-data__header" data-region="data-header">
            <h2 id="combo-sample-warden-iron-claw-title" class="structured-data__title">鉄爪の一撃</h2>
          </header>
          <div class="structured-data__body" data-region="data-body">
            <article class="combo-data" data-combo-id="iron-claw">
              <dl class="data-fields" data-region="data-fields">
                <div class="data-fields__item" data-field-key="timing"><dt>タイミング</dt><dd>メジャーアクション</dd></div>
                <div class="data-fields__item" data-field-key="target"><dt>対象</dt><dd>単体</dd></div>
                <div class="data-fields__item" data-field-key="range"><dt>射程</dt><dd>至近</dd></div>
                <div class="data-fields__item" data-field-key="check"><dt>判定</dt><dd>8dx8+4</dd></div>
                <div class="data-fields__item" data-field-key="description"><dt>効果</dt><dd>鉄甲を使った白兵攻撃。</dd></div>
              </dl>
            </article>
          </div>
        </section>
      </div>
    </main>
  </body>
</html>
```

## 12. 禁止事項と移行境界

次の出力は本契約に適合しない。

```html
<!-- 旧クラスを新契約として使用 -->
<div class="serif"><h4>渚</h4><p>...</p></div>

<!-- 組版を意味HTMLへ混入 -->
<hr class="page-wrap" />
<div style="break-before: page">...</div>

<!-- 入力フェンスを本文へ残す -->
<p>:::dialogue 渚</p>

<!-- 装飾アイコンをアクセシブル名へ混入 -->
<h3><span class="material-symbols-outlined">sms</span>渚</h3>
```

- `.scene-title`やattribute-listを前提に文書タイトルを生成しない。
- `serif`、`rp`、`select`等の旧名を別名として受け付けない。
- 旧`combo` scenario blockを`scenario-block--combo`や`data-block-kind="combo"`へ変換しない。移行ツールは対応する敵YAMLの`enemy.combos[]`とfragment付き通常リンクへ移す。
- 未知ブロック、旧タイトルブロック、旧説明リストを意味確認なしに新しい要素へ置換しない。
- A5用の`@page`、`break-*`、ページカウンター、寸法、書体を意味HTMLへ埋め込まない。

## 13. 契約テストの観点

HTML文字列の断片一致だけでなくDOMを解析し、少なくとも次を検証する。

1. **文書構造**: 契約識別子、`lang`、唯一の`main.document`、文書ID、通常H1由来の1つの`h1.document-title`、任意kicker、節の入れ子と見出しランク。
2. **IDとARIA**: 文書・節・ブロック・構造化データのIDが一意で、`data-section-id`/`data-block-id`が対応し、すべての`aria-labelledby`とfragmentリンクの参照先が存在する。
3. **7語彙**: 7種類の`data-block-kind`とmodifierクラスを検証し、`combo`や`enemy`がscenario blockとして出力されない。
4. **表示タイトル**: 開始行の表示タイトルだけが`scenario-block__title`になり、フェンス文字列、attribute-list、入力制御文字列が本文に残らない。
5. **専用フィールド**: ブロックごとの既知ラベルが`dt`/`dd`と安定したASCII`data-field-key`へ写像され、反復と本文との相対順を保つ。
6. **`check`**: `skill`、`difficulty`が先頭の`field-list`に1件ずつあり、任意`required`と`data-check-mandatory`が一致する。省略時も`false`が存在し、本文から値を推測しない。
7. **`info`/`e-lois`**: 同名フィールド、複数技能・難易度ペア、表示用`required`が入力順で残り、`data-check-mandatory`を持たない。
8. **`choice`と通常Markdown**: 自然文、リスト、表の各本文を保持し、リストのない`choice`も同じ共通構造で出力する。
9. **リンクと画像**: 通常リンク種別、相対URI、生成ID、画像の`src`/`alt`/captionを検証し、ページ番号や幅指定を含めない。
10. **構造化データ参照**: 敵全体と敵内コンボのリンクを区別し、元`href`、`data-enemy-id`、任意`data-combo-id`が検証済み正本IDと一致する。
11. **敵展開**: 全区画、全キー、空の必須配列、配列順、エントリID、能力値参照を9.3節どおり保持する。
12. **コンボ展開**: 単体選択、全フィールド、エフェクト・アイテムの解決済み名称とID、参照順を保持し、他コンボを暗黙に展開しない。
13. **Theme境界**: 同じHTMLを別Themeへ渡しても文書ID、タイトル、kicker、ブロック種別、フィールド、敵・コンボの意味を取得でき、A5/A4寸法や改ページ指定がHTMLに含まれない。
14. **build/preview一致**: 同じ入力と依存設定から、正規化DOMの要素、属性、テキスト、リンク先が一致する。

契約テストは旧`.serif`、`.scene-title`、attribute-list、旧HTMLの偶然の見出しランクへ依存しない。新しいブロックやフィールド、構造化データ種別を追加する場合は、記法仕様・データ契約・正常系/エラー系fixture・ARIA・リンク検証を同時に更新する。
