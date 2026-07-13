# ya-wareki コードベースレビュー

レビュー日：2026-07-13

対象：作業ツリーを含む `ya-wareki` コードベース全体

## 結論

暦データの復号、JD変換、元号境界、旧暦の閏月、Ruby版とのゴールデン比較には厚いテストがあり、中心となる変換処理の信頼性は高い。

一方、公開APIの入力境界と実行時不変条件には、誤った日付や時刻を例外なしで返す問題が残っている。

特に、3桁以上の時刻を別の2桁時刻として受理する問題は、利用者が入力した時刻と返される `Date` が一致しないため、リリース前に修正する必要がある。

保存時点のCIは未公開依存をGitHubから取得するが、そのインストール方法には公開用manifestを変更するリスクが残る。

## 指摘一覧

| ID | 重要度 | 対象 | 結論 |
| --- | --- | --- | --- |
| F-01 | 高 | 時刻パース | 3桁以上の時刻が部分一致し、別の有効時刻として受理される |
| F-02 | 中 | CIとパッケージ検査 | ローカル依存のインストールが検査対象の `package.json` を変更し得る |
| F-03 | 高、既知 | 配布 | `ya-kansuji` 公開前は利用者の通常インストールと公開処理が成立しない |
| F-04 | 中 | `WarekiDate` | 実行時には可変であり、フィールドとJDキャッシュが矛盾する |
| F-05 | 中 | `WarekiDate` | `eraYear` の整数性、有限性、範囲を検証していない |
| F-06 | 中 | フォーマット | 西暦0年の `%j` が1日ずれる |
| F-07 | 低 | フォーマット | Invalid Dateから `NaN` を含む文字列を返す |
| F-08 | 低 | データ生成 | 環境変数由来のパスをシェルへ直接展開している |

## F-01 3桁以上の時刻が部分一致する

### 根拠

[`TIME_OF_DAY_REGEX`](../../src/index.ts#L28) は時を1桁または2桁、分と秒を2桁に限定しているが、文字列全体や数字境界にはアンカーしていない。

[`extractTimeOfDay`](../../src/index.ts#L39) は、この正規表現が返した部分一致だけを範囲検証する。

一方、[`pad2`](../../src/time.ts#L22) は最小幅を2桁にするだけで、3桁以上の数値を切り詰めない。

そのため、`normalizeTime` が作る `100:00` や `12:100` に対して、後段の正規表現がそれぞれ `00:00` と `12:10` に部分一致する。

### 再現結果

```text
入力: 平成元年五月四日 百時
正規化: 平成元年五月四日 100:00
結果: 1989-05-04 00:00:00

入力: 平成元年五月四日 十二時百分
正規化: 平成元年五月四日 12:100
結果: 1989-05-04 12:10:00
```

READMEは、範囲外の時刻を `WarekiParseError` として拒否すると説明している。

現在の結果は単なる例外クラスの違いではなく、入力とは異なる時刻を正常値として返す。

### 推奨修正

正規化後の文字列を再解析する現在の二段階処理を維持するなら、時刻の各要素を `\d+` で捕捉し、直前と直後の数字境界を確認したうえで数値範囲を検証する。

より堅牢にするなら、`normalizeTime` の内部で捕捉した時、分、秒を構造化データとして返す関数を分離し、文字列化と `Date` への適用で同じ解析結果を使う。

### 追加テスト

次の入力がすべて `WarekiParseError` になることを確認する。

```text
平成元年五月四日 百時
平成元年五月四日 十二時百分
平成元年五月四日 十二時三十四分百秒
平成元年五月四日 千時
```

## F-02 CIが検査対象のパッケージ定義を変更し得る

### 根拠

[CI設定](../../.github/workflows/ci.yml#L32) は、ルートで次のコマンドを実行する。

```sh
npm install ./.deps/ya-kansuji-js
```

引数付きの `npm install` は既定で依存関係を保存するため、ルートの `package.json` にある `ya-kansuji` をローカル `file:` 依存へ書き換え得る。

その後の `publint` と `@arethetypeswrong/cli --pack .` は、書き換え後のパッケージ定義を検査する。

これでは、npmへ公開する `"ya-kansuji": "^0.1.0"` という定義をCIが検査したことにならない。

また、`file:` 依存がパッケージへ残れば、`.deps` を含まないtarballを利用者がインストールできない。

### 推奨修正

少なくとも `--no-save` を付けて、検査対象のmanifestを保持する。

```sh
npm install --no-save ./.deps/ya-kansuji-js
```

CI内で `git diff --exit-code -- package.json` をパッケージ検査前に実行すると、今後のnpm挙動や手順変更によるmanifest更新も検出できる。

## F-03 公開前依存が通常インストールを妨げる

### 根拠

[`package.json`](../../package.json#L51) は `ya-kansuji@^0.1.0` を通常のnpm依存として宣言している。

しかし、[`docs/RELEASING.md`](../RELEASING.md#L5) は `ya-kansuji 0.1.0` が未公開であり、先に公開する必要があると記録している。

保存時点のCIにはGitHubから依存リポジトリを取得する回避策が追加されているが、この回避策は利用者の `npm install ya-wareki` と `npm publish` の依存解決には適用されない。

### 影響

この状態では、レジストリだけを参照するクリーン環境で依存解決が完了しない。

そのため、READMEに記載されたインストール手順、公開前検査、公開後の利用を同時に成立させられない。

### 推奨対応

リリース文書の順序どおり、`ya-kansuji@0.1.0` を先に公開する。

公開後はlockfileをレジストリ依存で再生成してコミットし、CIを `npm ci` に変更する。

## F-04 `WarekiDate` が実行時に可変である

### 根拠

[`WarekiDate`](../../src/wareki-date.ts#L10) の公開フィールドにはTypeScriptの `readonly` が付いている。

しかし、`readonly` はJavaScriptのプロパティ記述子を変更しないため、JavaScript利用者は `day` などを代入で変更できる。

さらに、[`jd` getter](../../src/wareki-date.ts#L102) は計算結果を `#jd` にキャッシュする。

フィールドを変更してもキャッシュは無効化されないため、一つのインスタンスが異なる二つの日付を表す状態になる。

### 再現結果

```js
const d = new WarekiDate('令和', 1, 1, 1)
d.jd
d.day = 2

d.inspect()            // WarekiDate(令和1-1-2)
d.toGregorianParts()   // { year: 2019, month: 1, day: 1 }
```

READMEは `WarekiDate` をimmutableと説明しているため、この挙動は公開契約と一致しない。

### 推奨修正

コンストラクタで全フィールドを設定して検証した後、`Object.freeze(this)` を実行する。

プライベートフィールドはオブジェクトの凍結後もクラス内部から更新できるため、現在の `#jd` キャッシュは維持できる。

JavaScriptからの代入が失敗することと、JD参照後にも各フィールドが変化しないことをテストする。

## F-05 `eraYear` の入力不変条件がない

### 根拠

[`WarekiDate` constructor](../../src/wareki-date.ts#L19) は `eraYear` をそのまま保存し、`eraYearToCivil` に渡す。

一方、[`#validate`](../../src/wareki-date.ts#L77) は月と日だけを検証する。

そのため、0、負数、小数、`Infinity` を公開コンストラクタから渡せる。

### 再現結果

```text
new WarekiDate('令和', 0)          -> 受理される
new WarekiDate('令和', -1)         -> 受理される
new WarekiDate('令和', 1.5).jd     -> 2458667.5
new WarekiDate('令和', Infinity).jd -> NaN
```

JDは日単位の整数として扱われているため、小数JDや `NaN` を持つ `WarekiDate` はクラスの前提を破る。

### 推奨修正

通常の元号年と皇紀については、`Number.isSafeInteger(eraYear) && eraYear > 0` を要求する。

西暦と紀元前の表現で年0や負数を許すかどうかは既存のRuby互換仕様を確認し、元号年とは分岐して検証する。

`fromJd` と `addDays` に渡す値についても、安全な整数JDだけを受け付ける契約を明示すると、同じ種類の不正状態を入口で防げる。

## F-06 西暦0年の通日がずれる

### 根拠

[`stdStrftimeFromDate`](../../src/format.ts#L138) は、通日 `%j` を計算するために `Date.UTC(year, ...)` を使う。

JavaScriptの複数引数形式の `Date.UTC` は、0から99までの年を1900から1999までとして扱う。

西暦0年は先発グレゴリオ暦では閏年だが、代入先となる1900年は平年である。

この差により、3月1日以降の通日が1日小さくなる。

### 再現結果

```text
Dateのローカル日付: 0000-03-01
format(date, '%Y-%m-%d %j'): 0000-03-01 060
期待値:                       0000-03-01 061
```

### 推奨修正

`gregorianToJd(year, month, day) - gregorianToJd(year, 1, 1) + 1` で通日を計算する。

この計算なら0から99年の特殊規則とタイムゾーンの影響を受けない。

## F-07 Invalid Dateを拒否しない

### 根拠

[`format`](../../src/index.ts#L86) は、受け取った `Date` の有効性を検証しない。

[`stdStrftimeFromDate`](../../src/format.ts#L138) と [`toTimeParts`](../../src/time.ts#L54) は、Invalid Dateのgetterが返す `NaN` をそのまま文字列化する。

### 再現結果

```text
format(new Date(NaN), '%Y-%m-%d') -> 0NaN-NaN-NaN
format(new Date(NaN), '%JTf')      -> NaN時NaN分NaN秒
```

### 推奨修正

`Date` を受け取る公開APIの入口で `Number.isNaN(date.getTime())` を確認し、`RangeError` またはライブラリで定義した入力エラーを投げる。

`WarekiDate.fromDate`、トップレベルの `format`、`formatTime` で同じ方針を共有する。

## F-08 データ生成ツールがシェルへパスを展開する

2026-07-14追記: `tools/encode-data.mjs`はdata-localeを直接参照する構成へ変更され、
`WAREKI_DIR`と`execSync`への依存は解消した。
以下はレビュー時点の記録であり、現在残る対象はRuby比較用の`tools/gen-golden.rb`だけである。

### 根拠

[`tools/encode-data.mjs`](../../tools/encode-data.mjs#L21) は `WAREKI_DIR` 由来の値をテンプレート文字列で `execSync` に渡す。

[`tools/gen-golden.rb`](../../tools/gen-golden.rb#L19) も同じ値をバッククォートのコマンドへ展開する。

空白やシェルメタ文字を含むパスではコマンドが壊れ、信頼できない環境変数が入る自動化では任意の追加コマンドを実行し得る。

### 推奨修正

Node.js側は `execFileSync('git', ['-C', warekiDir, 'describe', '--always', '--dirty'])` を使う。

Ruby側は `Open3.capture3('git', '-C', wareki_dir, 'describe', '--always', '--dirty')` など、引数配列を受け取るAPIを使う。

## テストと配布物の評価

### 成功した検証

指定されたNode.js環境で次を確認した。

```text
Node.js: v22.21.1
npm:     10.9.4
```

`npm run typecheck` は成功した。

`npm run build` はESM、CJS、IIFE、型宣言を生成した。

ソース、暦データ、ゴールデン比較のテストは成功した。

CJSの `require`、ESMの `import`、IIFEの `globalThis.YaWareki` は、生成物を直接Node.jsで実行して期待値を返した。

`npm pack --dry-run --ignore-scripts` は21ファイルを含むtarball構成を生成した。

`@arethetypeswrong/cli --pack .` は、Node.jsのCJS、ESM、bundlerの各利用形態で問題を報告しなかった。

### 環境制約で完走しなかった検証

ビルド後の `npm test` では、`test/dist.test.ts` のうち子Node.jsプロセスを起動する3件がサンドボックスの `EPERM` で失敗した。

同じ3コマンドを親プロセスから直接実行した結果はすべて期待値と一致したため、配布物自体の不具合を示す失敗ではない。

`publint` は内部の `npm pack` がtarballを見つけられず完走しなかった。

直接の `npm pack --dry-run` と型エクスポート検査は成功しているが、`publint` 固有の規則をすべて通過したとは確認できていない。

## テスト設計の評価

暦の中心処理には、1428年分の復号データ照合と15000件を超えるRuby版ゴールデン比較がある。

このテスト構成は、月境界、閏月、元号境界、JD往復の回帰を検出するうえで有効である。

一方、入力値のプロパティテストは薄く、桁数、`NaN`、`Infinity`、小数、Invalid Date、実行時のプロパティ変更が対象になっていない。

今後は正常系の暦サンプルを増やすより、公開APIごとに数値境界と不正値の表を追加する方が、今回の指摘に対する回帰防止効果が高い。

推奨する追加カテゴリは次のとおりである。

- 時、分、秒の0、境界値、境界値の直後、3桁以上
- 年、月、日、JDの `NaN`、`Infinity`、小数、安全整数外
- Invalid Dateを各公開APIへ渡した場合
- JavaScriptから公開フィールドを変更した場合
- 西暦0年、1年、4年、99年、100年の `%j`
- ビルド前とビルド後における `dist.test.ts` の実行件数

## 修正優先順位

1. F-01を直し、3桁以上の時刻を拒否する回帰テストを追加する。
2. F-02を直し、CIが公開用manifestを変更しないようにする。
3. F-04とF-05を直し、`WarekiDate` の不変条件を実行時にも保証する。
4. F-06とF-07を直し、`Date` 境界の挙動を定義する。
5. `ya-kansuji` を公開し、F-03の暫定CI手順を通常の `npm ci` へ戻す。
6. F-08をデータ再生成ツールの次回変更時に修正する。

## 作業ツリーについて

レビュー中にCI、カバレッジ設定、パッケージメタデータの変更がコミット `874ffcf` として追加された。

本レポートはそのコミットを再確認したうえで更新しており、レポート以外のファイルは変更していない。
