# 意味的HTML出力契約

## 1. 目的と適用範囲

本書は、VFM/UnifiedのMarkdown ASTを検証・正規化した後、Themeへ渡す意味的HTMLのMVP契約を定義する。対象は、文書構造、通常のMarkdown要素、目次・リンク・画像、専用ブロック、およびアクセシビリティに関わる属性である。

本書は、HTMLをどのように組版するかを定義しない。ページ寸法、余白、書体、改ページ、ページ番号、running headerの表示方法、色、罫線、アイコンなどはThemeの責務である。MVPの前提と責務分離は[要件定義書](requirements.md)の第6章・第7章に従う。

以降の「必須」「禁止」は、検証済みASTから生成されるMVP HTMLに対する規範とする。HTMLは生成物であり、手編集して契約を満たす運用はしない。

## 2. 記法仕様との責務分離

`docs/syntax.md` は、Markdownの字句・構文を定義する仕様書である。専用ブロックの開始・終了記号、名前、属性の字句、属性値の形式、本文として許可するMarkdown、入れ子、frontmatterの入力規則、入力時のエラーは同仕様書の責務とする。

本書は、構文を解析する方法や正規表現による置換方法を規定しない。構文仕様に従ってASTが検証済みであることを前提に、次だけを固定する。

- ASTの文書・見出し・段落・リンク・画像をどのHTML要素へ写像するか。
- 専用ブロックの8種類を識別するタグ、クラス、`data-*`属性、見出し、本文領域。
- IDとARIA参照の整合性。
- Themeが依存してよい意味情報と、依存してはいけない偶然のDOM。

入力記法の名前を変えてもAST上の意味とこの出力契約を変えない設計にする。構文エラーや未知ブロックを、契約HTMLへフォールバックして隠してはならない。

## 3. 契約の識別

1つのHTMLファイルは、原則として1つの文書または1つの目次文書を表す。`html`要素には契約識別子を付ける。

```html
<html lang="ja" data-html-contract="dx3rd-scenario/v1">
```

`data-html-contract`の値は、互換性を判断するためのバージョンであり、表示文字列ではない。破壊的なタグ・属性変更を行う場合は値を更新する。クラスの並び順、空白、生成されたIDの末尾、不要なラッパーの有無をバージョン判定に使わない。

`lang`はfrontmatter等から解決した文書言語を指定し、省略しない。HTMLの`head`にあるCSSリンクや文書タイトルは生成処理の設定に従うが、ThemeはCSSファイルの相対パスや`title`の偶然の内容を意味契約として解釈しない。

## 4. 文書と章の基本構造

### 4.1 文書ルート

本文の唯一のランドマークは、`body`直下の`main.document`とする。通常の章文書は、frontmatterの機械可読な文書IDを`data-document-id`に保持する。

```html
<main
  id="document-md-04"
  class="document"
  data-document-id="MD-04">
  <header class="document-header" data-region="document-header">
    <p class="document-kicker" data-region="document-kicker">ミドルフェイズ・シーン4</p>
    <h1 id="document-md-04-title" class="document-title">Illegal Gifter</h1>
  </header>
  <div class="document-body" data-region="document-body">
    <!-- 通常のMarkdown本文、document-section、専用ブロック -->
  </div>
</main>
```

次を必須とする。

- `body`直下の`main`は1つだけにする。
- `main`の`id`は文書内で一意なアンカーとし、表示タイトルからではなく文書IDから決定的に生成する。
- `data-document-id`はfrontmatterの文書IDを保持する。表示用タイトルやページ上の短縮名をここへ入れない。
- frontmatterの任意キー`kicker`が非空文字列として存在する場合は、`document-header`内で`h1`の前に1つの`p.document-kicker[data-region="document-kicker"]`を出力する。`kicker`がない場合は要素を出力しない。
- 文書タイトルは、表示される通常のMarkdown H1から1つの`h1.document-title`へ変換する。専用のタイトル記法をHTML契約上の前提にしない。
- `document-body`は本文領域を識別するための意味を持たないラッパーであり、内容を別の意味に変換しない。

文書IDは同一出力集合で一意でなければならない。IDの安全化は変換器が行い、空白を含まないASCIIのアンカーとして出力する。Themeやリンク生成器は安全化後のIDの内部規則を推測しない。

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

- `data-section-id`と`id`は同じ不透明な識別子を保持する。`data-section-id`へ表示タイトルを入れない。
- `data-section-level`はAST上の論理的な見出しレベルを数値で保持する。ページ上の文字サイズや余白を表さない。
- `aria-labelledby`は同じ節の見出しの`id`を参照する。参照先を推測で省略したり、表示文字列を属性値にしたりしない。
- 節の見出しは`h2`から`h6`を使い、HTMLの見出し階層を入力の構造に合わせる。`h1`は文書タイトルだけに使う。
- 子見出しは対応する子`section`へ入れる。見出しの深さをCSSクラス`level1`等で表現しない。

IDは契約利用者にとって不透明な値である。変換器は同一文書内で重複しない、決定的でURLに使用できるIDを生成する。同名見出しが複数ある場合も、衝突を決定的に解消する。TOCやリンクは生成されたIDをそのまま参照し、IDの接尾辞を解析しない。

### 4.3 通常のMarkdown要素

通常のMarkdownの意味を保持し、次のように出力する。

| Markdownの意味 | HTML | 契約上の注意 |
| --- | --- | --- |
| 段落 | `p` | 段落ごとに1要素。インデントや余白のためのクラスを付けない。 |
| 強調・コード等 | 標準の`em`、`strong`、`code`等 | 見た目だけの`span`を追加しない。 |
| 箇条書き・番号付き | `ul`、`ol`、`li` | リスト項目内の段落や入れ子リストの意味を保つ。 |
| 引用 | `blockquote` | 引用でない専用ブロックの代用にしない。 |
| 表 | `table`、`caption`、`thead`、`tbody`、`tr`、`th`、`td` | 見出しセルの意味を`th`で保持する。 |
| 定義・項目と値 | `dl`、`dt`、`dd` | `desc-list`のような見た目由来のクラスを正本にしない。 |
| 水平線・主題転換 | `hr` | 改ページを表すクラスや属性を付けない。 |

変換器が空の段落、余白だけの要素、見た目を揃えるための`br`を追加してはならない。Markdownの明示的な改行だけを`br`へ変換する。

項目と値のまとまりは、必要に応じて次の意味構造にする。`dl`内の`div`は`dt`と`dd`を1組にまとめるためだけのラッパーであり、Themeがその個数や入れ子を前提にしてはならない。

```html
<dl class="field-list" data-region="field-list">
  <div class="field-list__item">
    <dt>技能</dt>
    <dd>〈情報: 噂話〉</dd>
  </div>
</dl>
```

## 5. リンク、画像、目次

### 5.1 リンク

Markdownリンクは、ラベルを保持した`a`要素へ変換する。リンクの意味を示すために、必要な場合だけ`data-link-kind`を付ける。

| `data-link-kind` | 用途 |
| --- | --- |
| `internal` | 同じHTML内のIDへのリンク。 |
| `cross-document` | 同じ出力集合内の別HTMLへの相対リンク。 |
| `external` | `https:`等の外部URIへのリンク。 |
| `toc` | 目次として生成されたリンク。別HTMLへのリンクでもこの値を優先する。 |

通常の本文リンクには、`class="anchor"`やページ番号の文字列を付けない。`href`の相対パスは生成HTMLの位置から解決できる形で維持し、同じ出力集合内のフラグメントは新契約の`id`へ解決する。旧HTMLにある`#h1_0`等の偶然のIDを引き継がない。

Themeはリンク文字列へ`(p.12)`などを変換器が付加することを期待してはならない。ページ番号、外部リンクの印刷上の表現、色、下線はThemeで決める。

### 5.2 画像

本文の画像は、外部CSSの背景画像ではなく、Markdownの資産参照として`img`で出力する。独立した画像ブロックは次の構造にする。

```html
<figure class="document-figure" data-region="figure">
  <img src="./img/middle-battle-arrangement.png" alt="PCと敵の初期配置" />
  <figcaption>初期配置</figcaption>
</figure>
```

- `img`の`src`は生成HTMLから解決可能な相対URIまたは入力で許可されたURIとする。変換器が出力先に資産をコピーする場合も、HTMLの相対参照を正しく更新する。
- `alt`属性は必須とする。内容画像は内容を説明し、装飾画像は`alt=""`とする。キャプションを`alt`の代わりにしない。
- Markdownにキャプションがない場合、`figcaption`を空要素として追加しない。
- `width`、`height`、`style`によるページ幅合わせをHTML契約の生成物に埋め込まない。入力資産の固有メタデータを保持する必要がある場合も、A5/A4の組版値とは分離する。
- 画像内にある文字の代替説明は`alt`またはキャプションで提供する。アイコンだけを画像にして意味を隠さない。

段落内のインライン画像は、意味上`figure`にする必要がなければ`p`内の`img`として出力する。独立画像とインライン画像の判定はMarkdown ASTの構造によって行い、CSSの表示結果で判定しない。

### 5.3 目次

生成された目次は、専用の`nav`ランドマークにする。`div.toc`は契約に含めない。

```html
<nav class="document-toc" data-region="toc" aria-labelledby="toc-title">
  <h2 id="toc-title" class="document-toc__title">目次</h2>
  <ol>
    <li>
      <a class="document-toc__link" data-link-kind="toc" href="md4.html#section-md-04-01">描写1</a>
    </li>
  </ol>
</nav>
```

目次リンクは、文書全体なら文書ルートの`id`、節やブロックなら対象ラッパーの`id`を参照する。ページ番号、リーダー罫線、改ページは目次HTMLに書かず、Themeがリンクとページ組版から生成する。目次が別HTMLなら、リンク先ファイルとフラグメントを相対URIで出力する。

## 6. 専用ブロック

### 6.1 共通構造

MVPの8種類は、意味のあるまとまりであり、すべて`section`として出力する。`dialogue`をHTMLの`dialog`要素やARIAの`role="dialog"`にしない。静的なシナリオ本文であり、対話UIではない。

標準形は次のとおりとする。

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

共通契約は次のとおりである。

- ブロックのタグは`section`とする。`section`の`id`と`data-block-id`は同じ不透明なアンカーを保持し、文書内で一意にする。
- `class`には共通の`scenario-block`と、語彙を表す`scenario-block--{kind}`を必ず付ける。`data-block-kind`の値が意味の正本であり、クラス名だけから判定しない。
- `data-block-kind`は次表の8値以外を許可しない。未知名は通常の`div`や一般段落へフォールバックさせない。
- ASTで解決済みのブロックタイトルを、`scenario-block__header`内の`h2`〜`h6`へ出力する。タイトルの入力記法、必須性、既定値は`docs/syntax.md`で定義し、HTML側には空の見出しを出力しない。
- `aria-labelledby`はブロック見出しの`id`を参照する。ブロック見出しを持たない構文を追加する場合は、構文仕様と契約バージョンを同時に更新する。
- 本文は`scenario-block__body`内に置く。本文の段落、リスト、表、画像、定義リストは通常のMarkdown要素として保持し、ブロック種別ごとに別のHTML断片を発明しない。
- ブロック見出しのランクは、配置された文書節の論理階層の次のランクにする。ブロック本文内のMarkdown見出しも、同じ論理階層に従う。見た目のために常に`h4`へ固定しない。
- 専用ブロック同士はMVPで入れ子にしない。通常の`section`の中にブロックを置くことはできるが、ブロックの本文内に別の`scenario-block`を生成しない。

`scenario-block__header`と`scenario-block__body`は、Themeがブロックの見出し領域と本文領域を識別するための安定したクラス・`data-region`である。これ以外の内部ラッパー、クラスの順序、空白、テキストノードの分割は契約にしない。

### 6.2 8種類の語彙

| `data-block-kind` | 意味 | HTML上のクラス | 標準的な見出し・本文 | 追加の機械可読データ |
| --- | --- | --- | --- | --- |
| `dialogue` | 登場人物等の台詞・会話 | `scenario-block scenario-block--dialogue` | 登場人物・会話単位の見出しと、台詞の段落・標準Markdown。 | なし |
| `roleplay` | プレイヤーが自由に演技する場面や進行指示 | `scenario-block scenario-block--roleplay` | 演技対象・場面の見出しと、GM向け指示等の本文。 | なし |
| `choice` | 選択肢、分岐、選択に応じた進行 | `scenario-block scenario-block--choice` | 選択の見出しと、必要に応じた`ul`/`ol`・本文。 | なし |
| `check` | 判定、技能、難易度、判定結果等 | `scenario-block scenario-block--check` | 判定項目の見出しと、`dl`・本文・表等。 | `data-check-mandatory`、本文冒頭の`data-field-key="skill"`/`"difficulty"`。 |
| `info` | GM向けの情報、補足、参照情報等 | `scenario-block scenario-block--info` | 情報項目の見出しと、`dl`・本文・リンク等。 | なし |
| `e-lois` | Eロイスに関するデータや処理 | `scenario-block scenario-block--e-lois` | Eロイス名の見出しと、データ・効果の本文。 | なし |
| `battle` | 戦闘の敵、配置、終了条件等 | `scenario-block scenario-block--battle` | 戦闘名の見出しと、節・表・画像等の本文。 | なし |
| `combo` | コンボの構成、条件、効果等 | `scenario-block scenario-block--combo` | コンボ名の見出しと、構成・項目・効果の本文。 | なし |

8種類であっても、表示ラベル、罫線、背景、アイコン、改ページ位置はHTMLの意味情報ではない。例えば`check`という見出しをCSS擬似要素で補うのではなく、ASTのタイトルを見出しとして出力する。種別名そのものを本文へ重複して埋め込む必要はない。

### 6.3 `check` の固定属性

`docs/syntax.md`で定義された`check`の属性は、HTMLでは本文の表示ラベルと機械可読な属性を分離して保持する。

- `skill`は必須の非空文字列であり、`scenario-block__body`冒頭の`dl.field-list`内に`data-field-key="skill"`を持つ項目として出力する。`dd`は検証済み文字列を保持する。
- `difficulty`は必須の0以上の整数であり、同じ`dl.field-list`内に`data-field-key="difficulty"`を持つ項目として出力する。`dd`は検証済み整数の10進表記を保持する。
- `mandatory`は任意の真偽値であり、省略時も`data-check-mandatory="false"`を出力する。指定時は`true`または`false`をそのまま`check`の`section`属性へ出力する。
- `data-field-key`が機械判定の正本である。`dt`の「技能」「難易度」などの表示用日本語ラベルを、機械判定のキーとして解釈してはならない。
- 必須2項目を含む`dl.field-list`は`scenario-block__body`の最初の子要素にする。判定結果や演出の本文は、その後に通常のMarkdown要素として出力する。
- `skill`、`difficulty`、`mandatory`を本文の`[技能]`、`[難易度]`、`★`等から推測・補完しない。入力型の検証はsyntax/AST段階で完了していることを前提とする。

```html
<section
  id="block-example-check"
  class="scenario-block scenario-block--check"
  data-block-id="block-example-check"
  data-block-kind="check"
  data-check-mandatory="false"
  aria-labelledby="block-example-check-title">
  <header class="scenario-block__header" data-region="block-header">
    <h3 id="block-example-check-title" class="scenario-block__title">判定</h3>
  </header>
  <div class="scenario-block__body" data-region="block-body">
    <dl class="field-list" data-region="field-list">
      <div class="field-list__item" data-field-key="skill">
        <dt>技能</dt>
        <dd>〈意志〉</dd>
      </div>
      <div class="field-list__item" data-field-key="difficulty">
        <dt>難易度</dt>
        <dd>8</dd>
      </div>
    </dl>
    <p>判定の処理を記述する。</p>
  </div>
</section>
```

### 6.4 補足的な定義リストと表

`check`、`info`、`e-lois`、`battle`、`combo`等に項目と値がある場合は、旧`desc-list`を再現せず、`dl`の`dt`/`dd`を使う。複数行の説明や手順は`p`、`ul`、`ol`、`table`の意味を保つ。`data-block-kind`だけで内容を表現できると仮定しない。

## 7. 要素選択とARIA方針

### 7.1 要素の使い分け

- `main`はHTML文書の主本文の唯一のルートにする。
- `header`は文書タイトル、または専用ブロックの見出し領域に使う。ページ上部の飾り帯を意味するためだけに追加しない。
- `section`は見出しを持つ独立した節、または8種類の専用ブロックに使う。見た目の箱を作るためだけに空の`section`を挿入しない。
- `nav`は目次など、文書内のナビゲーションに使う。
- `aside`は本文の流れから外しても意味が変わらない補足・注記を、入力ASTが明示した場合だけ使う。8種類の専用ブロックを自動的に`aside`へ変換しない。`info`も、シナリオ進行に必要な情報なら`scenario-block--info`の`section`である。
- `div`は`document-body`、ブロック本文、項目組、その他の意味を持たない領域をグループ化する場合だけ使う。旧クラスを付けた箱や、段落・見出しの代用として使わない。
- `span`は文章中の意味を持たない最小範囲に限定し、項目名・値には`dt`/`dd`等の意味要素を優先する。

### 7.2 ネイティブ意味とARIA

ネイティブHTMLの意味を優先し、ARIAで別の意味を重ねない。

- 見出しは`h1`〜`h6`、リストは`ul`/`ol`、表は`table`、リンクは`a`を使う。`role="heading"`、`role="list"`、`role="button"`等を静的本文に追加しない。
- `section`は見出しがある場合に`aria-labelledby`で見出しを参照する。見出しがあるのに`aria-label`へ別名を重ねない。
- `nav`は`aria-label`または`aria-labelledby`で目的を示す。目次見出しが出力される場合は後者を使う。
- `aside`を使う場合は、見出しまたは適切なラベルで目的を明示する。
- `choice`をインタラクティブな`listbox`、`radio`、`button`にしない。PDF・静的WebPubで読める選択肢の説明である。
- 装飾用アイコンの文字、Material Symbolsのリガチャ文字、絵文字、アイコン用の空`span`を本文・見出し・アクセシブル名へ埋め込まない。`sms`、`search`、`swords`等の表示用文字も出力しない。必要なアイコンはThemeのCSS擬似要素、同梱画像、またはTheme資産で表現し、意味のある説明は通常の見出し・本文で提供する。
- 内容画像は`alt`を持たせ、装飾画像だけを空の`alt`にする。ARIAで意味のある本文を隠してはならない。

## 8. ID、ページ内リンク、running header

### 8.1 IDの不変条件

IDは表示文字列ではなく、文書間参照のための不透明なキーである。変換器は次を保証する。

1. 文書ルート、各`document-section`、各`scenario-block`、およびそれらの見出しのIDが、同一HTML内で重複しない。
2. `main`、節、ブロックのアンカーIDは、文書IDとASTの論理アンカーから決定的に生成する。見出しの表示幅、DOMの空白、`h1_0`のような単純なタグ番号から生成しない。
3. 節の`id`と`data-section-id`、ブロックの`id`と`data-block-id`はそれぞれ同じ値になる。
4. `aria-labelledby`、同一文書のフラグメントリンク、目次リンクの参照先が実在する。
5. 別HTMLへのフラグメントリンクは、相手の契約IDを解決してから出力する。相手の現在のDOM順や旧生成IDを手作業で書かない。
6. 参照先のIDを変更する必要があるときは、リンクを同じ変換処理で再生成する。ThemeがIDの別名やリダイレクトを補う前提にしない。

見出し要素のIDはARIA参照用、節・ブロックのIDはリンクの到達先用とする。リンク先を見出し要素にするかラッパーにするかを、ThemeがDOMの近接関係から推測してはならない。

### 8.2 章単位のrunning header（既定）

既定の章単位running headerは、文書ルートの`data-document-id`と`h1.document-title`の表示テキストを情報源とする。`data-document-id`は機械可読な章ID、`document-title`は表示タイトルであり、どちらもHTML内で一度だけ正本として現れる。

Themeはこの2つから、必要に応じて右端表示相当の「ID: タイトル」を組み立ててよい。ただし、その連結文字列を`data-section-id`や別の本文要素へ重複して埋め込まない。`document-kicker`は章ヘッダーの補足表示であり、既定の章単位running headerのID・タイトルを置き換えない。

章単位running headerの取得方法、縦書き、表示位置、切替タイミング、ページ上の見た目はThemeが決める。変換器はrunning header用の重複テキスト、CSSの`string-set`、ページ番号をHTML本文へ書き出さない。

### 8.3 節単位のrunning header（将来Theme向けの補助契約）

将来のThemeが節単位のrunning headerを選ぶ場合に限り、節の`data-section-id`と、その節の`document-section__title`の表示テキストを情報源としてよい。`data-section-id`は機械的な識別子であり、旧`gift`のように「ID: 表示タイトル」を連結した文字列にはしない。この補助契約を、既定の章単位running headerの情報源と混同しない。

Themeは、契約された`document-section`、`data-section-id`、`document-section__title`の組み合わせを使って節単位running headerを設定してよい。節単位を採用しないThemeにも、HTMLの変更を要求しない。

## 9. Themeが依存してよいもの、依存してはいけないもの

### 9.1 依存してよい契約

Themeは、次の意味情報と安定名にだけ依存してよい。

- `html[data-html-contract="dx3rd-scenario/v1"]`。
- `main.document`、`data-document-id`、`document-header`、`document-kicker`、`data-region="document-kicker"`、`document-title`、`document-body`。章単位running headerの既定情報源は`data-document-id`と`document-title`の表示テキストである。
- `section.document-section`、`data-section-id`、`data-section-level`、`document-section__title`。
- `section.scenario-block`、`data-block-kind`、`data-check-mandatory`（`check`だけ）、`scenario-block--{kind}`、`scenario-block__header`、`scenario-block__title`、`scenario-block__body`。
- `check`本文冒頭の`dl.field-list`、`field-list__item[data-field-key="skill"]`、`field-list__item[data-field-key="difficulty"]`。`data-field-key`を機械判定の正本とする。
- `nav.document-toc`、`data-region="toc"`、`data-link-kind="toc"`。
- 標準HTML要素の意味（見出し、段落、リスト、表、定義リスト、リンク、画像、図）。
- 契約された`id`を、対象を参照するアンカーとして扱うこと。IDの文字列を分解してレベルや順番を求めてはならない。

`data-region`は、文書ヘッダー、本文、ブロックヘッダー、ブロック本文、目次、図、項目リストなど契約で定めた領域を識別する。未知の`data-*`属性を意味として解釈しない。

### 9.2 依存してはいけないもの

Themeは次を契約とみなしてはならない。

- `gift`由来の`.section-title`、`.level1`〜`.level5`、`.serif`、`.rp`、`.select`、`.check`、`.info`、`.e-lois`、`.battle`、`.combo`、`.anchor`、`.desc-list*`。
- `h4`なら会話、`h5`なら戦闘内項目、といった見出しランクや本文文字列からの意味推測。
- `main`直下に必ず特定の`div`がある、ブロック内に段落が必ず何個ある、`header`が何番目の子要素である、といった偶然のDOM順。
- クラス属性内のトークン順、空白、改行、生成HTMLのインデント、未定義の補助クラス。
- 見出しや`data-section-id`へ埋め込まれたアイコン、ラベル、ページ番号。
- HTML内の`style`、`@page`、`break-before`、`target-counter`、`Q`、`mm`等の組版情報。これらを前提にして変換器へ追加を要求しない。
- CSS擬似要素で補われる文字列を、読者へ伝える唯一のラベルとすること。

同じ意味的HTMLをA5用Themeと将来のA4用Themeで利用できることを、契約の受け入れ条件とする。A5用の寸法をHTMLのclass名、属性、inline style、改ページ要素へ漏らさない。

## 10. 正常出力例

次は、`dialogue`、`check`、リンク、画像を含む最小限の正常例である。実際のIDは不透明な値であり、例の文字列を固定値として実装へ埋め込まない。

```html
<html lang="ja" data-html-contract="dx3rd-scenario/v1">
  <body>
    <main id="document-md-04" class="document" data-document-id="MD-04">
      <header class="document-header" data-region="document-header">
        <p class="document-kicker" data-region="document-kicker">ミドルフェイズ・シーン4</p>
        <h1 id="document-md-04-title" class="document-title">Illegal Gifter</h1>
      </header>
      <div class="document-body" data-region="document-body">
        <section
          id="section-md-04-01"
          class="document-section"
          data-section-id="section-md-04-01"
          data-section-level="2"
          aria-labelledby="section-md-04-01-title">
          <h2 id="section-md-04-01-title" class="document-section__title">描写1</h2>
          <p>キミたちが今後の方針を考えていると、渚が現れる。</p>

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

          <section
            id="block-md-04-01-02"
            class="scenario-block scenario-block--check"
            data-block-id="block-md-04-01-02"
            data-block-kind="check"
            data-check-mandatory="true"
            aria-labelledby="block-md-04-01-02-title">
            <header class="scenario-block__header" data-region="block-header">
              <h3 id="block-md-04-01-02-title" class="scenario-block__title">魔法使いの噂</h3>
            </header>
            <div class="scenario-block__body" data-region="block-body">
              <dl class="field-list" data-region="field-list">
                <div class="field-list__item" data-field-key="skill">
                  <dt>技能</dt>
                  <dd>〈情報: 噂話〉</dd>
                </div>
                <div class="field-list__item" data-field-key="difficulty">
                  <dt>難易度</dt>
                  <dd>5</dd>
                </div>
              </dl>
              <p>成功した場合、追加の情報を得る。</p>
            </div>
          </section>

          <p>
            詳細は<a data-link-kind="cross-document" href="./liszt.html#document-liszt">エネミーデータ</a>を参照する。
          </p>
          <figure class="document-figure" data-region="figure">
            <img src="./img/middle-battle-arrangement.png" alt="PCと敵の初期配置" />
          </figure>
        </section>
      </div>
    </main>
  </body>
</html>
```

`roleplay`、`choice`、`info`、`e-lois`、`battle`、`combo`も、`data-block-kind`とmodifierクラスだけを置き換え、同じ見出し・本文構造で出力する。ブロック固有の意味は種別値と本文の標準Markdownで表し、種別ごとの装飾用HTMLを増やさない。

## 11. 禁止事項と移行方針

### 11.1 禁止事項

次の出力は本契約に違反する。

```html
<!-- 旧クラスを新契約として使う例 -->
<div class="serif"><h4>渚</h4><p>...</p></div>

<!-- ページ組版を意味HTMLへ漏らす例 -->
<hr class="page-wrap" />
<div style="break-before: page">...</div>

<!-- 装飾アイコンを本文へ埋める例 -->
<h3><span class="material-symbols-outlined">sms</span>渚</h3>
```

- HTML後処理の正規表現で、文字列をタグやクラスへ置換しない。
- 未知の専用ブロックを一般の`div`、`p`、HTML断片へ黙って変換しない。
- `section-title`、`trailer`、`toc`等のgift固有の見た目用コンテナを、意味を確認せずに踏襲しない。
- `.check`など旧クラス名と同名の単独クラスを、移行の都合だけで新契約へ持ち込まない。新契約は共通クラスと`data-block-kind`を使う。
- A5のための`@page`、`break-*`、`page-break-*`、ページカウンター、余白値、書体指定、装飾画像参照を本文HTMLへ埋め込まない。
- HTMLの本文へ`p.`やページ番号、running headerの文字を事前展開しない。

### 11.2 giftからの移行

既存資産は、意味と表示の参照としてのみ扱う。[`gift/manuscripts/md4.html`](../gift/manuscripts/md4.html)では`div.section-title`、`section.level*`、旧ブロック用`div`、`h1_0`等が混在している。[`gift/themes/vivliostyle-theme-dx3rd-ammonite/main.css`](../gift/themes/vivliostyle-theme-dx3rd-ammonite/main.css)も、これらのクラス、CSS擬似要素、A5のページ設定、Material Symbols文字に依存している。

移行ツールは旧記法をASTとして読み、新しいMarkdown正本へ変換する。旧HTMLを手修正して契約HTMLにする経路は採用しない。旧名と新名の対応は移行ツールの仕様に置き、通常のbuild・previewが旧名を恒久的に受理する互換層にはしない。例えば、旧`serif`、`rp`、`select`は、それぞれ意味を確認した上で新しい`dialogue`、`roleplay`、`choice`へ移行するが、旧CSSクラスをHTMLへ残すことは契約の要件ではない。

## 12. 契約テストの観点

HTML文字列の断片一致だけでなく、HTMLパーサーでDOMを読み、ASTの期待値と意味情報を検証する。最低限、次をテストフィクスチャに含める。

1. **文書構造**: `html`の契約識別子、`lang`、唯一の`main.document`、文書ID、1つの`h1.document-title`、節の入れ子と見出しランクを確認する。`kicker`がある入力では`document-header`内のH1前に`p.document-kicker[data-region="document-kicker"]`が1つだけ出力され、ない入力では出力されないことも確認する。
2. **IDとARIA**: 文書・節・ブロック・見出しのIDが一意で、`data-section-id`/`data-block-id`との対応が一致し、すべての`aria-labelledby`とフラグメントリンクの参照先が存在することを確認する。同名見出しも含める。
3. **通常要素**: 段落、明示的改行、リスト、表、引用、定義リスト、水平線が意味要素へ変換され、余白用の空要素や不要な`span`が出ないことを確認する。
4. **リンク**: 同一文書、別HTML、外部URI、目次リンクを用意し、相対パスが解決できること、契約IDへフラグメントが向くこと、`data-link-kind`が正しいことを確認する。ページ番号や`target-counter`が出力されないことも確認する。
5. **画像**: standalone画像が`figure`になること、`src`が生成HTMLから解決できること、`alt`が常に存在すること、キャプションの有無が正しく反映されることを確認する。ページ幅用の`style`や数値を自動挿入しないことを確認する。
7. **`check`属性**: `skill`と`difficulty`が`scenario-block__body`直下の最初の`dl.field-list`にそれぞれ1項目ずつ現れ、項目の`data-field-key`が機械判定に使えることを確認する。`skill`は非空文字列、`difficulty`は0以上の整数の10進表記であり、`mandatory`の省略時も`data-check-mandatory="false"`が出力され、指定時は`true`/`false`が一致することを確認する。`dt`の日本語ラベルを機械キーに使わないことも確認する。
8. **本文保持**: 各ブロックに段落、リスト、表、画像、定義リストを含め、本文が`scenario-block__body`に入り、種別ごとの勝手な断片化が起きないことを確認する。
9. **ARIA**: ネイティブ要素が使われ、偽のinteractive roleがなく、`nav`と`aside`のラベルが解決し、装飾アイコン文字がテキストノードやアクセシブル名に出ないことを確認する。
10. **Theme境界**: 同じHTMLを別のThemeへ渡しても、文書ID、章タイトル、kicker、種別、節、リンク、画像の意味が変換器なしに取得できることを確認する。既定の章単位running headerが`data-document-id`と`document-title`から構成でき、HTMLに「ID: タイトル」の重複文字列がないこと、HTMLにA5/A4寸法、改ページ、書体、ページ番号が含まれないことを静的検査する。節単位running headerは将来Theme向け補助契約として独立に検査する。
11. **build/preview一致**: 同じ入力をbuildとpreviewで変換し、空白や属性順ではなく正規化DOMの要素、属性、テキスト、リンク先が一致することを確認する。

契約テストは、`.serif`や`h4`など旧出力の偶然に依存しない。新しいブロックを追加する場合は、語彙表、`data-block-kind`の許可集合、正常系・エラー系フィクスチャ、ARIAとリンク検査を同時に更新する。

## 13. 参照実装・検証時の注意

要件上のA5設定、既存giftの表示、旧クラスの実例は、[要件定義書](requirements.md)、[`gift/manuscripts/md4.md`](../gift/manuscripts/md4.md)、[`gift/manuscripts/md4.html`](../gift/manuscripts/md4.html)、[`main.css`](../gift/themes/vivliostyle-theme-dx3rd-ammonite/main.css)で確認できる。ただし、これらの既存DOMやCSSは本契約そのものではない。

本書に記載したHTML例は、意味構造と属性の例であって、A5の完成レイアウトや特定Themeのスクリーンショットを保証するものではない。レイアウトの受け入れは、契約HTMLを入力にしたThemeのbuild・preview・PDF目視確認で行う。
