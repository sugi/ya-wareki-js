# Temporal 相互変換 設計

日付: 2026-07-17
ステータス: 承認済み

## 背景と目的

ya-wareki は `Date` との相互変換 (`WarekiDate.fromDate` / `toDate`、トップレベル
`toWarekiDate` / `format`) を提供している。TC39 Temporal が 2026年3月に Stage 4 に到達し
ES2026 に入ることが確定、ランタイム実装も出揃いつつある (Firefox 139+、Chrome/Edge 144+、
Node 26+ でフラグなし利用可、Safari は 2026 年内予定)。`Date` と同等の使い勝手で
Temporal との相互変換を提供する。

### 調査で確定した前提

- `WarekiDate` (時刻・TZ を持たない暦日) の対応物は `Temporal.PlainDate`。
- 非 ISO カレンダーの `PlainDate` から ISO 年月日を得る標準手段は
  `.withCalendar('iso8601')`。旧 `getISOFields()` は仕様から削除済み。
- `PlainDate` の表現範囲は約 ±271821 年で、和暦サポート範囲 (445年〜) を完全に包含する。
  負の ISO 年 (紀元前) も扱える。
- Temporal の `'japanese'` カレンダーは明治以降のみ信頼できる。1868-10-23 より前の挙動は
  実装依存 (仕様上は 1873 以前はグレゴリオ era を使うべきだが、ブラウザは旧元号の近似を
  返す)。さらに ICU の japanese 暦は月日がグレゴリオ暦のため、本ライブラリの旧暦
  (太陰太陽暦) の月日とは原理的に一致しない。**`'japanese'` カレンダー経由の往復変換は
  成立しない**。
- TypeScript 6.0+ が組み込み Temporal 型を提供 (`lib: ["esnext.temporal"]`)。ただし
  polyfill (`temporal-polyfill` / `@js-temporal/polyfill`) の型とは相互代入不可。
- 本ライブラリは `engines: node >=18` のため、Node 18〜24 ではランタイムに Temporal が
  存在しない。ハード依存にはできない。

## 決定事項

1. **対応型**: 生成は ISO カレンダーの `PlainDate` のみ。受け付けは `PlainDate` /
   `PlainDateTime` / `ZonedDateTime` (同一コードパスで処理可能)。`Instant` は TZ なしでは
   日付にならないため対象外。`'japanese'` カレンダーでの出力 API は提供しない
   (利用者が `.withCalendar('japanese')` を呼べば済む。明治以降限定)。
2. **トップレベル統合**: `toWarekiDate()` と `format()` も Temporal オブジェクトを受け
   付ける。時刻を持つ型では `%JT` 系時刻ディレクティブも展開する。
3. **ランタイム/型戦略**: 入力系は duck-typing でグローバル不要 (polyfill インスタンスも
   ネイティブもそのまま動く)。出力系 (`toPlainDate()`) のみ `globalThis.Temporal` を
   実行時検出。型は自前の構造的 interface + 条件型による native 型への自動昇格。
   依存はゼロのまま。

## 公開 API

```ts
// WarekiDate のメソッド (新規)
WarekiDate.fromTemporal(t: TemporalDateLike): WarekiDate
wd.toPlainDate(): TemporalPlainDate        // ISO カレンダーの Temporal.PlainDate

// トップレベル (シグネチャ拡張)
toWarekiDate(date: Date | TemporalDateLike): WarekiDate
format(date: Date | WarekiDate | TemporalDateLike, fmt?: string): string
```

- `fromTemporal`: `calendarId !== 'iso8601'` なら `withCalendar('iso8601')` してから
  `year` / `month` / `day` を読み、既存の `gregorianToJd` → `WarekiDate.fromJd` に接続する。
  非 ISO カレンダー入力 (japanese・buddhist 等) もこの経路で正しく変換される。
- `toPlainDate`: `toGregorianParts()` の年月日から `new Temporal.PlainDate(y, m, d)` で
  生成する。
- `parseToDate` の Temporal 版 (`parseToPlainDate` 等) はスコープ外 (将来検討)。

## 型戦略

新モジュール `src/temporal.ts` に集約する。

```ts
// 入力用の最小構造的 interface。
// native (TS6 組み込み型)・polyfill の両方が構造的に適合する。
// withCalendar はメソッド構文で宣言する (bivariance により、パラメータ型が狭い
// 実装も代入可能にするため)。
export interface TemporalDateLike {
  readonly calendarId: string
  readonly year: number
  readonly month: number
  readonly day: number
  withCalendar(calendar: string): TemporalDateLike
}

// 出力型。消費者が TS 6+ かつ esnext.temporal lib 有効なら本物の
// Temporal.PlainDate に昇格し、無効なら構造的 fallback になる。
export type TemporalPlainDate = typeof globalThis extends
  { Temporal: { PlainDate: { prototype: infer P } } } ? P : TemporalDateLike
```

- 両型を `index.ts` から export する。生成される `.d.ts` は lib 参照
  (`/// <reference lib="esnext.temporal">`) を持たないため、TS 5.x の消費者や
  `esnext.temporal` を有効にしていない消費者を壊さない。
- 自プロジェクトの tsconfig には `"lib": ["ES2022", "ESNext.Temporal"]` を追加する
  (テストコードで native 型を使うため)。ただし src 実装は構造的 interface のみに依存し、
  グローバルアクセスは guard 付きヘルパ 1 箇所に限定する。

## ランタイム戦略

- **入力系** (`fromTemporal` / `toWarekiDate` / `format`): 渡されたオブジェクトの
  フィールドを読むだけなので `globalThis.Temporal` 不要。非 Temporal オブジェクトには
  `TypeError` を投げる。duck-check の条件: 数値の `year` / `month` / `day`、文字列の
  `calendarId`、関数の `withCalendar`。
- **出力系** (`toPlainDate()`): `globalThis.Temporal` を実行時検出する。存在しなければ
  「Node 26+ / 対応ブラウザが必要。polyfill 利用時は
  `Temporal.PlainDate.from(d.toGregorianParts())` を使うか、polyfill をグローバル登録する」
  という actionable なメッセージの `Error` を投げる。新規エラークラスは追加しない
  (呼び出し側は `if (globalThis.Temporal)` で事前分岐するのが自然なため)。
- 範囲エラーは既存方針どおり伝播する: era 範囲外は `fromJd` 経由の
  `UnsupportedDateRangeError`、Temporal 側の ±271821 年制限超過 (「西暦」era の巨大年での
  `toPlainDate` のみ起こり得る) は native の `RangeError` をそのまま通す。

## format() の挙動

- 時刻を持つ型の判定は `hour` プロパティの有無 (数値かどうか) で行う。
  `PlainDateTime` / `ZonedDateTime` は `{ hour, minute, second }` を持ち、既存の
  `formatTime` が受ける `TimeParts` に構造的に一致するため、そのまま流す。
  `PlainDate` は時刻を持たないので `WarekiDate` と同様 `%JT` はリテラルのまま残す。
- `ZonedDateTime` はその TZ のウォールクロック年月日・時刻を使う (`Date` のローカル時刻と
  同じ考え方)。
- `format()` の「実 `%J` 日付ディレクティブが無ければ era 変換を経由しない」挙動
  (Date 経路の `stdStrftimeFromDate`) は Temporal 経路でも維持する。ISO 年月日から通日を
  計算する parts 版ヘルパを共通化して両経路で使う。

## モジュール構成

- `src/temporal.ts` (新規): `TemporalDateLike` / `TemporalPlainDate` 型、duck-check
  (`isTemporalDateLike`)、ISO 年月日抽出 (`temporalToIsoParts`)、時刻抽出、
  `globalThis.Temporal` 取得ヘルパ。`wareki-date.ts` には依存しない (循環回避)。
- `src/wareki-date.ts`: `static fromTemporal()` / `toPlainDate()` を追加。
- `src/index.ts`: `toWarekiDate` / `format` のシグネチャ拡張とディスパッチ、型 re-export。

## テスト・CI

- devDependency に `temporal-polyfill` (fullcalendar 製、最新仕様準拠) を追加する。
- `test/temporal.test.ts`: polyfill を必須プロバイダ、native (`globalThis.Temporal`
  存在時) を追加プロバイダとして同一スイートを両方に流す。内容:
  - 3 型 (`PlainDate` / `PlainDateTime` / `ZonedDateTime`) の入力変換
  - 非 ISO カレンダー入力 (japanese 等) の変換
  - 往復変換の代表ケース (旧暦閏月・明治改暦境界・紀元前を含む)。ゴールデン CSV の全件
    再実行はしない (変換は `toGregorianParts` の薄いシムなので境界代表で十分)
  - `toPlainDate` のグローバル未検出エラー (`vi.stubGlobal` で注入・削除)
  - `format` / `toWarekiDate` のディスパッチと `%JT` 展開
  - 非 Temporal オブジェクト入力の `TypeError`
- 型テスト: `esnext.temporal` あり (戻り値が `Temporal.PlainDate` に昇格) / なし
  (fallback でコンパイル可) の 2 構成を dist の `.d.ts` に対して検証する。
- CI: test マトリクスに Node 26 を追加 (native Temporal での実行)。smoke (Node 18/20) は
  現状のまま — dist は Temporal を遅延参照するためロード時エラーが無いことを smoke が
  保証する。

## ドキュメント

- README: 機能 bullet 追加、「Temporal との相互変換」節 (対応ランタイム状況と polyfill
  レシピを含む)。
- CHANGELOG: 0.2.0 (Unreleased) エントリ。
- 新 API の JSDoc (既存スタイルに合わせ日本語)。

## スコープ外

- `parseToPlainDate` などパース系の Temporal 出力
- `'japanese'` カレンダーでの出力 API
- `Instant` / `PlainYearMonth` / `PlainMonthDay` の受け付け
- polyfill namespace の注入オプション (`toGregorianParts` レシピで代替可能)
