# SQL Highlighter

既存の`textarea`へ、リアルタイムSQLハイライトと論理行番号を追加する軽量ブラウザライブラリです。

- BigQuery（GoogleSQL）とDuckDBに対応
- SQL方言の定義はJSON辞書として分離
- `file://`でのローカル直開きに対応
- 標準JavaScript／CSSのみ
- npm、ビルド、バンドル、外部ライブラリ不要
- 入力面にはネイティブ`textarea`を使用
- 折り返しなし。長い行は横スクロール

## フォルダ構成

```text
sql-highlighter/
├─ src/
│  ├─ dictionaries/
│  │  ├─ bigquery.json
│  │  ├─ bigquery.js
│  │  ├─ duckdb.json
│  │  ├─ duckdb.js
│  │  └─ schema.json
│  ├─ sql-highlighter.js
│  └─ sql-highlighter.css
├─ sample/
│  └─ index.html
├─ test/
│  ├─ fixtures/
│  │  ├─ bigquery.sql
│  │  └─ duckdb.sql
│  ├─ test-runner.html
│  ├─ test-runner.js
│  ├─ decoration-api.test.js
│  └─ style-rules.test.js
└─ README.md
```

## 辞書ファイルの役割

- `bigquery.json`／`duckdb.json`: 編集・管理用のJSON辞書
- `bigquery.js`／`duckdb.js`: ブラウザへ辞書を登録するローカル直開き用ファイル
- `schema.json`: JSON辞書の形式

JSONは`file://`から`fetch()`できないブラウザがあるため、通常利用では同内容の`.js`登録ファイルを読み込みます。

## 使用方法

CSS、JavaScript本体、利用する方言の登録ファイルを順番に読み込みます。

```html
<link rel="stylesheet" href="./src/sql-highlighter.css">

<textarea id="sql" style="width: 100%; height: 320px;"></textarea>

<script src="./src/sql-highlighter.js"></script>
<script src="./src/dictionaries/bigquery.js"></script>
<script>
  var editor = SqlHighlighter.attach(
    document.getElementById("sql"),
    {
      dialect: "bigquery",
      lineNumbers: true,
      tabSize: 2
    }
  );
</script>
```

この方式は、HTTPサーバーだけでなく、ZIP展開後の`file://`でも利用できます。

## BigQueryとDuckDBを切り替える場合

```html
<script src="./src/sql-highlighter.js"></script>
<script src="./src/dictionaries/bigquery.js"></script>
<script src="./src/dictionaries/duckdb.js"></script>
<script>
  var editor = SqlHighlighter.attach(
    document.getElementById("sql"),
    { dialect: "bigquery" }
  );

  editor.setDialect("duckdb");
</script>
```

## JSONを直接読み込む場合

Webサーバー上では、JSON辞書を`fetch()`して登録できます。

```javascript
SqlHighlighter.loadDialect("./src/dictionaries/bigquery.json")
  .then(function () {
    SqlHighlighter.attach(document.getElementById("sql"), {
      dialect: "bigquery"
    });
  })
  .catch(function (error) {
    console.error(error);
  });
```

`loadDialect()`は`file://`では使用しないでください。ブラウザのセキュリティ制約により、JSON取得が拒否される場合があります。

すでにJSONオブジェクトを取得済みの場合は、直接登録できます。

```javascript
SqlHighlighter.registerDialect(dictionary);
```

## API

### `SqlHighlighter.registerDialect(dictionary)`

JSON形式の方言定義を登録します。

### `SqlHighlighter.loadDialect(url)`

HTTP経由でJSON辞書を取得して登録します。戻り値は`Promise`です。

### `SqlHighlighter.attach(textarea, options)`

既存の`HTMLTextAreaElement`へハイライトレイヤーと行番号を追加します。

```javascript
var editor = SqlHighlighter.attach(textarea, {
  dialect: "bigquery",
  lineNumbers: true,
  tabSize: 2
});
```

| オプション | 型 | 既定値 | 説明 |
|---|---|---:|---|
| `dialect` | `string` | `"bigquery"` | 登録済みの方言ID |
| `lineNumbers` | `boolean` | `true` | 論理行番号の表示 |
| `tabSize` | `number` | `2` | タブの表示幅 |

戻り値の操作用インスタンスには以下があります。

```javascript
editor.refresh();
editor.setDialect("duckdb");
editor.setDecorations([{ start: 0, end: 6, className: "search-match" }]);
editor.clearDecorations();
editor.getDialect();
editor.detach();
```

### `editor.setDecorations(decorations)`

`attach()`で返されたエディタに、文字オフセット範囲のCSSクラスを重ねます。検索・置換ロジック自体はこのライブラリの責務に含めません。

```javascript
editor.setDecorations([
  { start: 7, end: 18, className: "search-match" },
  { start: 20, end: 31, className: "search-match search-current" }
]);
```

各要素の形式は次のとおりです。

| プロパティ | 型 | 説明 |
|---|---|---|
| `start` | `number` | 開始オフセット。含む |
| `end` | `number` | 終了オフセット。含まない |
| `className` | `string` | 追加するCSSクラス。空白区切りで複数指定可能 |

`start` / `end`はJavaScript文字列および`textarea.selectionStart` / `selectionEnd`と同じUTF-16オフセットです。既存の`keyword`、`column`等の構文クラスは保持され、装飾クラスが追加されます。範囲が重複する場合は両方のクラスを適用します。

装飾クラスの見た目は呼び出し側で定義します。

```css
.search-match {
  background: #fff3a3;
}

.search-current {
  outline: 1px solid #d6a700;
}
```

入力内容を変更しても既存のオフセットは自動補正しません。検索結果などテキスト変更に追従する装飾は、呼び出し側で再計算して`setDecorations()`を呼び直してください。

### `editor.clearDecorations()`

設定済みの範囲装飾をすべて解除します。SQL構文ハイライトには影響しません。

### `SqlHighlighter.highlight(sql, dialectId)`

ハイライト済みHTML文字列を返します。SQL内のHTML特殊文字はエスケープされます。

### `SqlHighlighter.tokenize(sql, dialectId)`

トークン配列を返します。

### `SqlHighlighter.getDialect(id)`

登録済みの正規化された方言定義を返します。

## 辞書形式

辞書形式は`src/dictionaries/schema.json`に定義しています。

```json
{
  "$schema": "./schema.json",
  "id": "bigquery",
  "displayName": "BigQuery (GoogleSQL)",
  "keywords": ["SELECT", "FROM", "WHERE"],
  "dataTypes": ["STRING", "INT64"],
  "functions": ["COUNT", "ARRAY_AGG"],
  "lexical": {
    "lineComments": ["--", "#"],
    "blockComments": [["/*", "*/"]],
    "identifierQuotes": ["`"],
    "stringQuotes": ["'", "\""],
    "tripleStringQuotes": ["'''", "\"\"\""],
    "stringPrefixes": ["r", "b", "br", "rb"],
    "rawStringPrefixes": ["r", "br", "rb"],
    "dollarQuotedStrings": false,
    "parameterModes": ["question", "atName", "colonName"],
    "numericUnderscores": false
  }
}
```

辞書の単語は大文字で管理します。ハイライト時の比較は大文字・小文字を区別しません。

`parameterModes`はハイライト対象を指定する字句設定であり、そのSQL方言で実行可能かどうかを検証するものではありません。

JSON辞書を変更した場合は、対応する`.js`登録ファイルにも同じ変更を反映してください。

## ハイライトルール

| 種別 | 判定 | 色 | font-style |
|---|---|---|---|
| `keyword` | SQL構文キーワードとデータ型 | `#7B30D0` | italic |
| `operator` | 記号演算子、および`AND` / `OR` / `NOT` / `IN` / `LIKE` / `ILIKE` / `BETWEEN` / `IS` | `#7B30D0` | italic |
| `function` | 辞書登録済み関数が`(`を伴って呼び出された場合 | `#d33e82` | italic |
| `table` | `FROM` / `JOIN` / `UPDATE` / `INTO`直後、CTE名 | `#3e8ff1` + underline + `#f4f8fc` background | italic |
| `column` | 通常識別子 | `#252525` | normal |
| `alias` | `AS`で定義された別名 | `#000000` | normal |
| `string` | 文字列リテラル | `#d33e82` + `#fcf5f8` background | normal |
| `number` | 数値リテラル | `#d33e82` + `#fcf5f8` background | normal |
| `literal` | `NULL` / `TRUE` / `FALSE` | `#7B30D0` | italic |
| `comment` | 行コメント、ブロックコメント | `#7B30D0` + `#eddeff` background | italic |
| `parameter` | `@name` / `:name` / `?` | `#d33e82` + `#fcf5f8` background | normal |
| `punctuation` | 括弧・カンマ・ピリオド等 | `#7d7d7d` | normal |

テーブル・カラム・別名の判定はASTやスキーマ情報を使用しない軽量な文脈判定です。通常識別子は`column`へフォールバックします。

引用識別子も独立した色にはせず、文脈に応じて`table` / `column` / `alias`として扱います。データ型は`keyword`として扱います。

## 対応している字句

- BigQuery / DuckDBの予約語、関数、データ型
- 文字列、数値、`NULL` / `TRUE` / `FALSE`
- 行コメントとブロックコメント
- 引用識別子
- 記号演算子と条件演算子
- 区切り記号
- `@name` / `:name` / `?` / `$1` / `$name`形式のパラメーター（辞書設定に応じて有効化）
- BigQueryのraw文字列、bytes文字列、三重引用文字列
- DuckDBの`E'...'`文字列、ドル引用文字列、アンダースコア付き数値

## 対象外

- SQL構文の妥当性検証
- AST生成
- SQLフォーマット
- カラムやテーブルのサジェスト
- 差分トークン化
- 自動的な辞書更新

## サンプル

ZIPを展開して、`sample/index.html`をブラウザで直接開きます。

## テスト

`test/test-runner.html`をブラウザで直接開きます。画面下部に`ALL TESTS PASSED`と表示されれば成功です。

スタイルルールだけを確認する場合は、Node.jsがある環境では次でも確認できます。

```text
node test/style-rules.test.js
```

ライブラリ利用時にNode.jsは必要ありません。
