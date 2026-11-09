# BigQuery GoogleSQL 拡張機能 仕様・引き継ぎ資料

更新日：2026-11-10

## 1. 目的と構成

VSCode 上で BigQuery GoogleSQL を読みやすく編集し、必要なときだけ実行・ドライランできるようにする。

次の3つは**別の成果物**であり、役割を混同しない。

| 成果物 | 役割 | 現在の状態 |
| --- | --- | --- |
| `zizai-highlighter-sql`（本リポジトリ） | ブラウザの `textarea` に SQL ハイライトを重ねる JavaScript/CSS ライブラリ。BigQuery・DuckDB に対応 | 既存実装。**VSCode 拡張ではない** |
| `BigQuery GoogleSQL Language` | VSCode の言語モード、構文ハイライト、括弧補完・基本インデント | VSIX `bigquery-sql-language-0.2.0.vsix` を作成済み |
| `BigQuery Execute & Dry Run` | VSCode から明示的に SQL 実行・ドライランを行い、結果を閲覧 | VSIX `bigquery-dry-run-0.2.3.vsix` を作成済み |

VSCode 用の2つは併用する設計。本リポジトリへこの仕様書を同梱するが、**上記2つの VSIX 本体やそのソースコードを本リポジトリへ移したことは意味しない**。

## 2. VSCode：BigQuery GoogleSQL Language

### 2.1 確定した方針

- GoogleSQL の構文ハイライトを提供する独立した VSCode 拡張。
- `.sql` ファイルでも `BigQuery GoogleSQL` 言語モードを選択して利用できる。
- ベースは Microsoft 公式 SQL 文法を参照した構成。提供元が明確な実装を優先する。
- BigQuery への接続、認証、スキーマ取得、SQL 実行は担当しない。
- VSCode 全体のカラーテーマとは独立して、GoogleSQL モード用の装飾を提供する。

### 2.2 実装済み・配布済み（v0.2.0）

- GoogleSQL のキーワード、関数、データ型、数値、文字列、パラメータ等の区別。
- コメントの背景色、キーワード等の斜体、テーブル・CTE 名等の下線・色分け。
- 括弧補完、基本的なインデント。
- `bigquery-sql-language-0.2.0.vsix` を作成済み。自動テスト14件成功（VSCode 実機上の見た目は未検証）。

### 2.3 継続検討

- カーソル選択時の黄色い蛍光ペン風の表示。
- 実際の BigQuery SQL での配色・スコープの微調整。
- 後述の `%%define` など、拡張独自のマジック記法に対する専用ハイライト（**v0.2.0 への反映は未確認**）。

## 3. VSCode：BigQuery Execute & Dry Run

### 3.1 操作と接続

| 操作 | ショートカット | 動作 |
| --- | --- | --- |
| Execute SQL | `Ctrl+Enter` | 編集中の未保存 SQL を展開後、BigQuery に実行要求を送信 |
| Dry Run | `Ctrl+Shift+Enter` | SQL を展開後、`bq query --dry_run` による検証。クエリ自体は実行しない |
| Sign in to Google Cloud | コマンド／UI | VSCode 統合ターミナルから `gcloud auth login` を開始 |

- ショートカットは `BigQuery GoogleSQL` 言語モードの SQL エディタにフォーカスがあるときのみ有効。
- Google Cloud SDK の既存ユーザー認証を利用。別の API キーや独自のログイン方式は設けない。
- 実行側は BigQuery REST API、ドライラン側は Google Cloud SDK の `bq` コマンドを使用。
- プロジェクト、ロケーション、実行時の最大課金バイト数（設定した場合）を指定できる。
- 実行やドライランは明示操作時だけ。入力・保存に連動して自動実行しない。

### 3.2 実行結果と取得方式

- `SELECT` 等の結果は別のエディタグループの結果画面に表示。
- **1ページ200行を必要時に取得**するページネーション。全行を最初に取得しないため、メモリ使用量だけでなく転送量も抑える。
- ページ送り時に次ページを BigQuery から取得。フィルター・ソートは取得済みページ内に適用。
- CSV／Excel XML／クリップボードへの出力は現在の取得ページのみ。全件一括ダウンロードは対象外。
- `CREATE TABLE` 系は作成先テーブル名を表示し、行データの取得はしない。
- BigQuery の実クエリには処理量に応じた課金が発生し得る。ドライランはクエリを実行しない。

### 3.3 検証状態

- `bigquery-dry-run-0.2.3.vsix` を作成済み。オフライン自動テスト47件成功。
- **実際の BigQuery アカウント・課金プロジェクトに接続した検証は未実施**。
- 配布済み v0.2.3 は実行・ドライラン用で、構文ハイライト拡張ではない。

## 4. マジックコマンド（実行拡張 v0.2.3）

### 4.1 定義と参照

`%%define 変数名` の次行から内容を文字列として保持し、SQL 中の `%%変数名` をその内容で置換する。

```sql
%%define dataset
sales_dataset
%%define table
orders
%%define order_cte
order_cte AS (
  SELECT * FROM `%%dataset.%%table`
)
%%end

WITH %%order_cte
SELECT * FROM order_cte
```

実際に送信する SQL は以下。

```sql
WITH order_cte AS (
  SELECT * FROM `sales_dataset.orders`
)
SELECT * FROM order_cte
```

**文法ルール**

1. `%%define 変数名` は単独行に記述。値には複数行 SQL も記述可能。
2. `%%define` を連続記述すると、次の `%%define` が直前の定義を閉じる。
3. 連続定義の最後に **`%%end` を1回だけ**記述。`%%end` も単独行。
4. 参照は `%%変数名`。旧案の `{変数名}` は採用しない。
5. 別の変数を値に含めた多段展開を許可。SQL の引用識別子（バッククォート）内でも展開する。
6. **単純な文字列展開**であり、値の SQL を定義時に個別実行しない。

### 4.2 コメントアウト

- `--`、`#` の行コメント、および `/* ... */` のブロックコメントでは、`%%define`、`%%end`、`%%変数名` を無効化する。
- コメントアウトした定義は登録しない。元の SQL コメントは保持する。
- SQL 文字列内の `--` や `/* */` をコメント開始と誤認しない。

```sql
-- %%define unused
/*
%%define disabled
value
%%end
*/

%%define dataset
aaa
%%end

SELECT * FROM `%%dataset.orders` -- %%missing は展開しない
```

### 4.3 検証・エラー

- 未定義変数、循環参照、重複定義、`%%end` の欠落／不正配置を事前に検出。
- エラー時は VSCode 上で通知・診断表示し、**BigQuery への SQL 送信を行わない**。
- Run と Dry Run の両方で同じローカル展開処理を使用。
- 展開後の SQL のエラー行は可能な範囲で元のエディタ行へ対応付ける。

### 4.4 不採用・対象外

- 以前の候補 `%%query` は `%%define` に統一。
- `%%if` や `%%include` などの追加マジックコマンドは今回採用しない。
- `%%end` を空白行に置き換える方式は採用しない。
- BigQuery SQL 自体の実行エンジンや構文を変更するものではない。

## 5. 役割分担・今後の確認事項

| 項目 | 状態／担当 |
| --- | --- |
| ブラウザ `textarea` 向け SQL ハイライト | 本リポジトリ `zizai-highlighter-sql`（既存） |
| VSCode GoogleSQL ハイライトと基本編集支援 | `BigQuery GoogleSQL Language`（別 VSIX、v0.2.0） |
| VSCode 実行・ドライラン・マジック展開 | `BigQuery Execute & Dry Run`（別 VSIX、v0.2.3） |
| マジック記法専用の視覚的ハイライト | ハイライト拡張側で今後確認・検討 |
| SQL カラム・テーブル定義の接続ベース検査や補完 | 今回の実装対象外 |
| 実際の VSCode 表示／Google Cloud 環境での接続試験 | 未実施 |

### 引き継ぎ時の注意

- 本リポジトリの既存 JavaScript/CSS API と、VSCode 拡張2種の機能を混同しない。
- 仕様変更時は「Webライブラリ」「VSCodeハイライト」「VSCode実行・ドライラン」のどれに影響するか明記する。
- この文書は**2026-11-10時点の決定・配布状況**を記録する。後続改修はバージョン・検証結果を更新する。
