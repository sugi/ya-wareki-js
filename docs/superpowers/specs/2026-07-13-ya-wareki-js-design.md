# ya-kansuji / ya-wareki JavaScript 移植 設計ドキュメント

作成日: 2026-07-13
対象: Ruby gem [wareki](https://github.com/sugi/wareki) と [ya_kansuji](https://github.com/sugi/ya_kansuji) の TypeScript/JavaScript 移植。

## 目的

Ruby 版 wareki の機能(和暦文字列のパース、旧暦445年からの変換、`%J` 系フォーマット)を JavaScript から使えるようにする。
npm パッケージとしてだけでなく、jsDelivr などの CDN から `<script>` タグ一枚でも使えるようにする。

## 決定事項

以下はユーザーとの対話で確定した方針である。

- **ほぼ完全移植**とする。旧暦(445年〜)、北朝元号、皇紀、和暦文字列パース、全 `%J` フォーマットコードを対象にする。
- フォーマット文字列は **Ruby 版と完全互換の `%J` 系**で提供する。加えてフィールドゲッターを一級 API とし、テンプレートリテラルでの組み立てを主経路として想定する。
- Ruby 版の「ビルトインクラス上書き」(std_ext.rb、core_ext.rb)は**移植しない**。`Date.prototype` の拡張は JS エコシステムで忌避されており、調査でも `Date` を拡張する和暦ライブラリは存在しなかった。独自クラスと純関数のみで構成する。
- 漢数字変換は **ya-kansuji を独立パッケージとして先に作り**、ya-wareki がそれに依存する。Ruby 側 (ya_kansuji gem → wareki gem) と同じ構造にする。
- パッケージ名は npm で空きを確認済みの **`ya-kansuji`** と **`ya-wareki`** を使う。

## 調査結果の要点

設計の根拠となる調査結果(3件、2026-07 実施)を要約する。

**既存 JS ライブラリ**: 和暦系 npm パッケージ (@smarthr/wareki、wareki、kanjidate など) はすべて明治改暦(1873)以降の元号変換のみで、**日本の旧暦を正確な月境界で扱うライブラリは存在しない**。中国農暦ライブラリ (lunar-javascript 等) は日本の旧暦と月境界がずれるため代替にならない。API スタイルは純関数 + immutable オブジェクトが主流。

**Intl / Temporal**: ICU の "japanese" カレンダーは「年号ラベル以外は完全にグレゴリオ暦」であり、旧暦の月日境界・閏月は表現できない。標準化の方向はむしろ逆で、1873年以前の日付は ce/bce にフォールバックする提案 (Intl Era/MonthCode) が進行中。Temporal のカスタムカレンダープロトコルは 2024 年に提案から削除されたため、「Temporal に旧暦カレンダーを差し込む」選択肢は存在しない。Intl にパーサはない。

**配布方式 (2026 年時点のベストプラクティス)**: ESM ファースト + CJS 併給のデュアル配布に、`<script>` タグ用の minified IIFE を1本添える。`exports` マップでは `types` 条件を各ブロックの先頭に置き、`unpkg`/`jsdelivr` フィールドで IIFE を指す。ビルドは tsdown (Rolldown ベース)、検証は publint + @arethetypeswrong/cli。Node 20.19+/22.12+ は `require(esm)` に対応済み。

## パッケージ構成

| | ya-kansuji | ya-wareki |
|---|---|---|
| リポジトリ | `~/works/git/github/ya-kansuji-js` | `~/works/git/github/ya-wareki-js` |
| 内容 | 漢数字 ⇔ 数値の変換 | 和暦・旧暦の変換とフォーマット |
| 依存 | なし | ya-kansuji |
| IIFE グローバル名 | `YaKansuji` | `YaWareki` |

両パッケージ共通の配布形態:

- TypeScript ソース、`"type": "module"`、ESM (`dist/index.js`) + CJS (`dist/index.cjs`) + IIFE (`dist/index.iife.min.js`)。
- `exports` マップ: `import`/`require` 条件それぞれに `types` を先頭付与。`main`/`module`/`types` はレガシー互換のため併記。
- ya-wareki の IIFE は ya-kansuji をバンドルに含める(`<script>` 1枚で完結させるため)。npm 経由では通常の dependency。
- `engines: { "node": ">=20" }`。ビルドは tsdown、テストは Vitest、公開前検証に publint + @arethetypeswrong/cli。
- `sideEffects: false`。これを成立させるため、モジュール読み込み時の副作用(自己登録など)を持たない構造にする(後述のフォーマッタレジストリ参照)。
- ライセンスは各移植元の gem と同じにする: ya-kansuji = MIT、ya-wareki = BSD-2-Clause (両 gem でライセンスが異なることに注意)。

## ya-kansuji API 設計

Ruby 版 `YaKansuji.to_i` / `to_kan` / `register_formatter` に対応する純関数を named export する。

```ts
// パース (Ruby: YaKansuji.to_i)
export function toBigInt(str: string): bigint     // マッチなしは 0n (Ruby 互換)
export function toNumber(str: string): number     // MAX_SAFE_INTEGER 超は RangeError

// フォーマット (Ruby: YaKansuji.to_kan)
export type KansujiFormatterOptions = Record<string, unknown>
export type KansujiFormatter = (num: bigint, options?: KansujiFormatterOptions) => string
export function toKan(
  num: number | bigint,
  formatter?: string | KansujiFormatter,   // 既定 'simple'
  options?: KansujiFormatterOptions,
): string

// フォーマッタプラグイン機構 (Ruby: register_formatter / formatter)
export function registerFormatter(name: string, formatter: KansujiFormatter): void
export function getFormatter(name: string): KansujiFormatter | undefined

// 組み込みフォーマッタ (個別 import も可能)
export function simple(num: bigint): string
export function gov(num: bigint): string
export function lawyer(num: bigint): string
export function judicV(num: bigint): string
export function judicH(num: bigint): string
```

設計上の判断:

- **BigInt を正とする**。Ruby の Integer は任意精度で、無量大数 (10^68) まで扱うため Number では表現できない。パースの実体は `toBigInt` で、`toNumber` は安全範囲チェック付きの便宜ラッパーとする。
- 組み込みフォーマッタの登録名は Ruby のシンボル名と同じ `'simple' | 'gov' | 'lawyer' | 'judic_v' | 'judic_h'` とする(ドキュメント互換のため)。
- 組み込みフォーマッタは**レジストリの Map 初期値として静的に登録**する。import 時の自己登録(副作用)にすると `sideEffects: false` の tree-shaking で登録が消えるため採らない。
- 負数はサポートせず `RangeError` にする(Ruby 版でも負数の挙動は未定義)。
- Ruby 版の core_ext / core_refine (String#to_i、Integer#to_kan の上書き)は移植しない。

## ya-wareki API 設計

中心は immutable な `WarekiDate` クラスで、Ruby の `Wareki::Date` に対応する。
内部表現はユリウス日 (JD) 経由の変換で、Ruby 版と同一のアルゴリズムを使う。

```ts
export class WarekiDate {
  // 生成 (Ruby: Wareki::Date.parse / .jd / .date / .today / .imperial / .new)
  static parse(str: string): WarekiDate
  static fromJd(jd: number): WarekiDate
  static fromDate(date: Date, opts?: { utc?: boolean }): WarekiDate  // 既定はローカル日付
  static today(): WarekiDate
  static imperial(year: number, month?: number, day?: number, isLeapMonth?: boolean): WarekiDate
  constructor(eraName: string, eraYear: number, month?: number, day?: number, isLeapMonth?: boolean)

  // フィールド (Ruby: attr_accessor 相当。ただし読み取り専用)
  readonly eraName: string
  readonly eraYear: number
  readonly year: number           // 西暦年
  readonly month: number
  readonly day: number
  readonly isLeapMonth: boolean
  readonly imperialYear: number   // 皇紀年
  readonly jd: number             // ユリウス日 (遅延計算・キャッシュ)

  // テンプレートリテラル用ゲッター (%J コードの主要どころに対応)
  readonly eraYearKanji: string      // %JGk (二十七 など)
  readonly eraYearKanjiSpecial: string // %JGK (元年の「元」)
  readonly yearKanji: string         // %JOk
  readonly monthKanji: string        // %JSk
  readonly monthAltName: string      // %JSK (睦月、如月...)
  readonly dayKanji: string          // %JDk
  readonly leapMonthMark: string     // %JLk ('閏' or '')

  // 変換・演算
  format(fmt?: string): string       // 既定 '%JF'。Ruby 完全互換
  toDate(): Date                     // ローカル深夜の Date (先発グレゴリオ暦ベース)
  toGregorianParts(): { year: number; month: number; day: number }  // 先発グレゴリオ暦
  toJulianParts(): { year: number; month: number; day: number }     // ユリウス暦
  equals(other: WarekiDate): boolean    // Ruby の eql?/== (フィールド一致)
  isSameDay(other: WarekiDate): boolean // Ruby の === (JD 一致)
  addDays(n: number): WarekiDate        // Ruby の +
  subDays(n: number): WarekiDate        // Ruby の -
  with(fields: Partial<Pick<WarekiDate, 'eraName' | 'eraYear' | 'month' | 'day' | 'isLeapMonth'>>): WarekiDate
}

// トップレベル純関数 (JS 慣行向けの薄いラッパー)
export function parse(str: string): WarekiDate
export function parseToDate(str: string): Date   // Ruby: Wareki.parse_to_date。失敗時は new Date(str) にフォールバック
export function toWarekiDate(date: Date): WarekiDate
export function format(date: Date | WarekiDate, fmt?: string): string

// エラー
export class WarekiParseError extends Error {}            // Ruby: ArgumentError 相当
export class UnsupportedDateRangeError extends Error {}   // Ruby: Wareki::UnsupportedDateRange

// 定数
export const GREGORIAN_REFORM_JD: number   // Ruby: Date::JAPAN 相当 (明治改暦日 JD 2405160)
```

設計上の判断:

- **immutable にする**。Ruby 版は setter を持つが、JS の日付ライブラリの慣行 (Temporal、既存和暦ライブラリ) は immutable であり、変更は `with()` で行う。
- `format()` の `%J` コードは Ruby 版の正規表現・フラグ処理 (`%-Jd` `%_Jd` `%0Jd` 等の幅指定を含む) をそのまま移植する。
- Ruby 版は `%J` 以外のコードをプラットフォームの strftime に委譲するが、JS には委譲先がない。**`%Y %y %m %d %e %j %F %%` の日付系サブセットのみ自前実装**し、それ以外の `%` コードは変換せずそのまま出力する (`Wareki::Date` は時刻を持たないため時刻系コードは対象外)。
- パース用正規表現 (旧字体正規化、㍾㍽㍼㍻㋿、閏月、月の別名、朔・晦・廿・卅など) は JS の named capture group で移植する。
- 明治5年12月3日以降の存在しない日の検査 (`_check_invalid_date`)、元号の存在しない年の受容、北朝元号のパース対応(フォーマット非対応)など、Ruby 版の挙動をそのまま踏襲する。
- ActiveSupport::Duration との加算のような Ruby 固有の相互運用は移植しない。
- Temporal 連携 (`toPlainDate()` 等) は初期リリースの対象外とする。Safari が未対応でありハード依存にできず、グローバルの `Temporal` を検出する薄いヘルパーは後から互換性を壊さず足せる。

### タイムゾーンと暦法の注意点

JS の `Date` は時刻とタイムゾーンを持つため、Ruby の `Date` にはなかった以下の decisions を明示する。

- `fromDate()` は既定で**ローカルタイムゾーンの年月日**を使う。`{ utc: true }` で UTC の年月日に切り替えられる。`today()` はローカル。
- `toDate()` はローカル深夜 (00:00) の `Date` を返す。
- JS の `Date` は先発グレゴリオ暦であり、Ruby の `Date::ITALY` (1582年以前はユリウス暦) と暦法が違う。**JD は両者で同一**で、1582年以前の年月日表記だけが異なる。ユリウス暦表記が必要な場合のために `toJulianParts()` を提供し、README に明記する。

## データ戦略

Ruby 版のデータ (calendar_def.rb 1433行、era_def.rb 506行) は、実測に基づき**コンパクト符号化して本体バンドルに同梱**する。遅延ロードはしない。

根拠となる実測 (2026-07-13、Ruby 版データに対して実施):

- 旧暦テーブル 1428 年分のうち、`month_starts` は「年始 JD + 月日数の累積和」と完全一致し (例外0件)、年始 JD も前年末と連続する (例外は改元由来の43件のみ)。月の日数は 29 か 30 の2値 (明治5年12月の2日を除く)。
- したがって符号化に必要なのは「最初の年の JD + 年ごとの (月数、閏月位置、月ごとの大小1ビット、不連続43件のみ明示 JD)」で、**旧暦テーブル全体で 5KB 程度**になる。元号定義 (約340件) を素直な配列で持っても合計 10KB 前後で、gzip 後はさらに縮む。
- この規模なら dayjs (約3KB gzip) と Luxon (約23KB gzip) の間に収まり、CDN 直読みでも問題にならない。

生成パイプライン:

1. `tools/export-data.rb`: Ruby 版 wareki の定義ファイルを require して JSON にダンプする (実行は再生成時のみ。CI では不要)。
2. `tools/encode-data.mjs`: JSON を符号化文字列に変換し、`src/generated/*.ts` を出力する。
3. 生成物はリポジトリにコミットする。デコーダは初回アクセス時に一度だけ復号し、以後キャッシュする (ネットワークではなくメモリ内の遅延復号)。

## テスト戦略

- Ruby 版の RSpec (wareki の spec 一式、ya_kansuji の spec 一式) を Vitest に移植する。
- **ゴールデンテスト**: Ruby 側スクリプトで「JD → 年月日・閏月・`%JF`・`%Jf`」の対照表 (旧暦全期間のサンプリング + 全元号境界 ±2日 + 近代の改元日) を CSV に出力し、JS 実装の出力と突き合わせる。データ符号化の誤りはこれで確実に検出できる。
- ya-kansuji には往復プロパティテスト (ランダムな整数 n について `toBigInt(toKan(n, 'simple')) === n`) を加える。

## CI・リリース

- GitHub Actions: Node 20/22/24 のマトリクスで build + test + publint + attw。
- npm publish は手動 (`npm publish --provenance` は GitHub リポジトリ公開後に検討)。初期バージョンは 0.1.0。
- README は日本語で、npm・CDN (`<script src>` と `<script type="module">` + jsDelivr) 両方の使用例を載せる。

## スコープ外

- `Date.prototype` などビルトインの拡張。
- Temporal 連携 (将来の追加候補)。
- ya_kansuji の core_ext / core_refine 相当。
- 万万進などの歴史的漢数字体系 (Ruby 版も未対応)。
- Rails I18n 相当の仕組み。

## マイルストーン

1. **M1: ya-kansuji-js** — パース + フォーマッタ + 配布一式。実装計画: `ya-kansuji-js/docs/superpowers/plans/2026-07-13-ya-kansuji-js.md`
2. **M2: ya-wareki-js コア** — データ生成、WarekiDate、パーサ、フォーマッタ。実装計画は M1 完了後に作成する (ya-kansuji の確定 API を前提にするため)。
3. **M3: ya-wareki-js 配布・公開** — IIFE、README、CI、npm publish。
