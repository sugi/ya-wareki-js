# Temporal 相互変換 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `WarekiDate` と Temporal (`PlainDate` / `PlainDateTime` / `ZonedDateTime`) の相互変換を、依存ゼロ・Node 18 互換のまま追加する。

**Architecture:** 入力側は duck-typing (構造的 interface `TemporalDateLike`) でグローバル `Temporal` 不要、polyfill もネイティブも受ける。出力側 (`toPlainDate()`) のみ `globalThis.Temporal` を実行時検出。型は条件型 (`typeof globalThis extends { Temporal: ... }`) で、消費者が `esnext.temporal` lib を有効にしていれば本物の `Temporal.PlainDate` に自動昇格する。変換は既存の `toGregorianParts()` / `gregorianToJd()` → `fromJd()` に接続するだけの薄いシム。

**Tech Stack:** TypeScript 7 / vitest 4 / tsdown / devDependency に `temporal-polyfill` (テスト専用) を追加。

**Spec:** `docs/superpowers/specs/2026-07-17-temporal-interop-design.md` (承認済み)

## Global Constraints

- ランタイム依存の追加禁止。`temporal-polyfill` は **devDependencies のみ** (テスト用)。
- `engines: node >=18` を維持。src コードはグローバル `Temporal` の存在を前提にしない (存在チェックは `src/temporal.ts` の `getTemporalNamespace()` 1 箇所のみ)。
- 生成される `dist/index.d.ts` は `/// <reference lib="esnext.temporal">` を含んではならない (TS 5.x 消費者を壊すため)。
- コミットメッセージは英語、conventional commits 形式 (feat:/test:/docs:/ci:/build:)。
- コード内コメントは日本語、既存スタイルに合わせ「コードから読み取れない背景」のみ書く。
- 公開 API の JSDoc は日本語 (既存スタイル準拠)。
- テスト検証コマンドは `npx vitest run test/temporal.test.ts` (全体は `npm test`)、型チェックは `npm run typecheck`。

## 実挙動に関する前提知識 (検証済み)

- 条件型 `typeof globalThis extends { Temporal: { PlainDate: { prototype: infer P } } } ? P : TemporalDateLike` は TS 7.0.2 で動作確認済み: `esnext.temporal` lib ありで `P = Temporal.PlainDate` に解決、lib なしで fallback。native の `PlainDate`/`PlainDateTime`/`ZonedDateTime` は `TemporalDateLike` に構造的代入可能。
- `WarekiDate.fromJd()` は era テーブル (大化 645 年〜) 外の JD で `UnsupportedDateRangeError` を投げる。西暦・皇紀へのフォールバックは**ない**。したがって 645 年より前の ISO 日付の `fromTemporal` はエラーになる (テストで検証する)。
- 逆方向 (`toPlainDate`) は「西暦」「紀元前」era でも動く (`toGregorianParts()` 経由)。
- Temporal の `'japanese'` カレンダーの `year` プロパティは era 年 (2019→令和なら 1)。ISO 年月日は `withCalendar('iso8601')` で取得する。
- TS の Temporal 型は `declare namespace Temporal { var PlainDate: PlainDateConstructor }` 形式。namespace の値側は `typeof globalThis` のプロパティとして見える。

---

### Task 1: `src/temporal.ts` — 型定義と duck-typing ヘルパ

**Files:**
- Modify: `package.json` (devDependencies に temporal-polyfill)
- Modify: `tsconfig.json` (lib 追加)
- Create: `src/temporal.ts`
- Create: `test/temporal.test.ts`

**Interfaces:**
- Produces (後続タスクが依存):
  - `interface TemporalDateLike { readonly calendarId: string; readonly year: number; readonly month: number; readonly day: number; withCalendar(calendar: string): TemporalDateLike }`
  - `type TemporalPlainDate` (条件型)
  - `isTemporalDateLike(x: unknown): x is TemporalDateLike`
  - `temporalToIsoParts(t: TemporalDateLike): { year: number; month: number; day: number }`
  - `getTemporalNamespace(): { PlainDate: new (isoYear: number, isoMonth: number, isoDay: number) => unknown }`
  - `temporalTimeParts(t: TemporalDateLike): TimeParts | undefined`

- [ ] **Step 1: temporal-polyfill を devDependency に追加**

```bash
npm install --save-dev temporal-polyfill
```

Expected: package.json の devDependencies に `"temporal-polyfill": "^1.0.1"` が入る。

- [ ] **Step 2: tsconfig.json に Temporal lib を追加**

`tsconfig.json` の compilerOptions に `lib` を追加する (現在 lib 指定なし = target 由来のデフォルト。DOM は使っていないので落として問題ない):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "ESNext.Temporal"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "declaration": false,
    "noEmit": true
  },
  "include": [
    "src",
    "test",
    "tsdown.config.ts",
    "vitest.config.ts"
  ]
}
```

Run: `npm run typecheck`
Expected: PASS (既存コードが DOM 型に依存していないことの確認)

- [ ] **Step 3: 失敗するテストを書く**

`test/temporal.test.ts` を新規作成:

```ts
import { Temporal as TemporalPolyfill } from 'temporal-polyfill'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getTemporalNamespace,
  isTemporalDateLike,
  type TemporalDateLike,
  temporalTimeParts,
  temporalToIsoParts,
} from '../src/temporal.js'

// polyfill を必須プロバイダ、native (globalThis.Temporal 存在時 = Node 26+) を
// 追加プロバイダとして同一スイートを流す。native は polyfill と型非互換のため cast。
type TemporalNS = typeof TemporalPolyfill
export const providers: Array<[string, TemporalNS]> = [['polyfill', TemporalPolyfill]]
if (globalThis.Temporal) providers.push(['native', globalThis.Temporal as unknown as TemporalNS])

afterEach(() => {
  vi.unstubAllGlobals()
})

describe.each(providers)('temporal helpers (%s)', (_name, T) => {
  describe('isTemporalDateLike', () => {
    it('accepts PlainDate / PlainDateTime / ZonedDateTime', () => {
      expect(isTemporalDateLike(T.PlainDate.from('2019-05-04'))).toBe(true)
      expect(isTemporalDateLike(T.PlainDateTime.from('2019-05-04T12:34:56'))).toBe(true)
      expect(
        isTemporalDateLike(T.ZonedDateTime.from('2019-05-04T12:34:56+09:00[Asia/Tokyo]')),
      ).toBe(true)
    })

    it('rejects PlainYearMonth / PlainMonthDay (day / year を欠く)', () => {
      expect(isTemporalDateLike(T.PlainYearMonth.from('2019-05'))).toBe(false)
      expect(isTemporalDateLike(T.PlainMonthDay.from('05-04'))).toBe(false)
    })
  })

  describe('temporalToIsoParts', () => {
    it('returns fields as-is for iso8601 calendar', () => {
      expect(temporalToIsoParts(T.PlainDate.from('2019-05-04'))).toEqual({
        year: 2019,
        month: 5,
        day: 4,
      })
    })

    it('converts non-ISO calendar via withCalendar', () => {
      const jp = T.PlainDate.from('2019-05-04').withCalendar('japanese')
      // japanese カレンダーの year は era 年 (令和1)。ISO へ戻して読めていることの確認
      expect(jp.year).not.toBe(2019)
      expect(temporalToIsoParts(jp)).toEqual({ year: 2019, month: 5, day: 4 })
    })
  })

  describe('temporalTimeParts', () => {
    it('extracts wall-clock time from PlainDateTime / ZonedDateTime', () => {
      expect(temporalTimeParts(T.PlainDateTime.from('2019-05-04T12:34:56'))).toEqual({
        hour: 12,
        minute: 34,
        second: 56,
      })
      expect(
        temporalTimeParts(T.ZonedDateTime.from('2019-05-04T01:02:03+09:00[Asia/Tokyo]')),
      ).toEqual({ hour: 1, minute: 2, second: 3 })
    })

    it('returns undefined for PlainDate', () => {
      expect(temporalTimeParts(T.PlainDate.from('2019-05-04'))).toBeUndefined()
    })
  })
})

describe('isTemporalDateLike (non-temporal values)', () => {
  it('rejects non-temporal values', () => {
    expect(isTemporalDateLike(null)).toBe(false)
    expect(isTemporalDateLike(undefined)).toBe(false)
    expect(isTemporalDateLike(42)).toBe(false)
    expect(isTemporalDateLike('2019-05-04')).toBe(false)
    expect(isTemporalDateLike({})).toBe(false)
    expect(isTemporalDateLike(new Date())).toBe(false)
  })

  it('accepts a structurally matching plain object (duck-typing)', () => {
    const duck = {
      calendarId: 'iso8601',
      year: 2019,
      month: 5,
      day: 4,
      withCalendar() {
        return this
      },
    }
    expect(isTemporalDateLike(duck)).toBe(true)
  })
})

describe('temporalToIsoParts (broken input)', () => {
  it('throws TypeError when withCalendar returns garbage', () => {
    // NaN は型上は number なので TemporalDateLike を満たす。実行時検証が仕事をするかの確認
    const inner: TemporalDateLike = {
      calendarId: 'iso8601',
      year: Number.NaN,
      month: 5,
      day: 4,
      withCalendar() {
        return this
      },
    }
    const broken: TemporalDateLike = {
      calendarId: 'japanese',
      year: 1,
      month: 5,
      day: 4,
      withCalendar() {
        return inner
      },
    }
    expect(() => temporalToIsoParts(broken)).toThrow(TypeError)
  })
})

describe('getTemporalNamespace', () => {
  it('throws a helpful Error when globalThis.Temporal is missing', () => {
    vi.stubGlobal('Temporal', undefined)
    expect(() => getTemporalNamespace()).toThrow(/Temporal is not available/)
    expect(() => getTemporalNamespace()).toThrow(/toGregorianParts/)
  })

  it('returns the namespace when present', () => {
    vi.stubGlobal('Temporal', TemporalPolyfill)
    expect(getTemporalNamespace()).toBe(TemporalPolyfill)
  })
})
```

- [ ] **Step 4: テストが失敗することを確認**

Run: `npx vitest run test/temporal.test.ts`
Expected: FAIL — `Failed to resolve import "../src/temporal.js"` (モジュール未作成)

- [ ] **Step 5: `src/temporal.ts` を実装**

```ts
import type { TimeParts } from './time.js'

/**
 * Temporal の日付型 (`PlainDate` / `PlainDateTime` / `ZonedDateTime`) を構造的に受ける
 * 最小 interface。native (TS 組み込み型)・polyfill のどちらのインスタンスも適合する。
 * `withCalendar` をメソッド構文で宣言しているのは、bivariance によりパラメータ型が
 * より狭い実装 (native の `CalendarLike` など) も代入可能にするため。
 */
export interface TemporalDateLike {
  readonly calendarId: string
  readonly year: number
  readonly month: number
  readonly day: number
  withCalendar(calendar: string): TemporalDateLike
}

/**
 * {@link WarekiDate.toPlainDate} の戻り値型。利用側の TS 設定で `esnext.temporal` lib が
 * 有効なら本物の `Temporal.PlainDate` に解決され、無効なら構造的 fallback
 * ({@link TemporalDateLike}) になる。`.d.ts` に lib 参照を持ち込まずに済ませるための条件型。
 */
export type TemporalPlainDate = typeof globalThis extends
  { Temporal: { PlainDate: { prototype: infer P } } } ? P : TemporalDateLike

export function isTemporalDateLike(x: unknown): x is TemporalDateLike {
  if (typeof x !== 'object' || x === null) return false
  const t = x as Record<string, unknown>
  return (
    typeof t['calendarId'] === 'string' &&
    typeof t['year'] === 'number' &&
    typeof t['month'] === 'number' &&
    typeof t['day'] === 'number' &&
    typeof t['withCalendar'] === 'function'
  )
}

// ISO 8601 の年月日を取り出す。非 ISO カレンダー (japanese 等) は year が era 年などに
// なっているため、必ず withCalendar('iso8601') を経由する。
export function temporalToIsoParts(t: TemporalDateLike): {
  year: number
  month: number
  day: number
} {
  const iso = t.calendarId === 'iso8601' ? t : t.withCalendar('iso8601')
  const { year, month, day } = iso
  if (!Number.isSafeInteger(year) || !Number.isSafeInteger(month) || !Number.isSafeInteger(day))
    throw new TypeError(`invalid Temporal object: non-integer ISO date fields (${year}-${month}-${day})`)
  return { year, month, day }
}

interface TemporalNamespaceLike {
  PlainDate: new (isoYear: number, isoMonth: number, isoDay: number) => unknown
}

// グローバル Temporal の実行時検出 (出力系 toPlainDate 専用)。入力系はオブジェクトの
// フィールドを読むだけなのでこのチェックを通らない。
export function getTemporalNamespace(): TemporalNamespaceLike {
  const ns = (globalThis as { Temporal?: TemporalNamespaceLike }).Temporal
  if (ns === undefined)
    throw new Error(
      'Temporal is not available in this runtime (requires Node.js >= 26 or a browser with Temporal support). ' +
        'With a polyfill, use Temporal.PlainDate.from(d.toGregorianParts()) or register the polyfill on globalThis.',
    )
  return ns
}

// PlainDateTime / ZonedDateTime のウォールクロック時刻。PlainDate (hour なし) は undefined。
export function temporalTimeParts(t: TemporalDateLike): TimeParts | undefined {
  const { hour, minute, second } = t as { hour?: unknown; minute?: unknown; second?: unknown }
  if (typeof hour !== 'number') return undefined
  return {
    hour,
    minute: typeof minute === 'number' ? minute : 0,
    second: typeof second === 'number' ? second : 0,
  }
}
```

- [ ] **Step 6: テストが通ることを確認**

Run: `npx vitest run test/temporal.test.ts`
Expected: PASS (Node 22/24 では polyfill プロバイダのみ、Node 26+ では native も実行される)

- [ ] **Step 7: 全体確認とコミット**

Run: `npm run typecheck && npm test`
Expected: 全 PASS

```bash
git add package.json package-lock.json tsconfig.json src/temporal.ts test/temporal.test.ts
git commit -m "feat: add Temporal duck-typing helpers and structural types"
```

---

### Task 2: `WarekiDate.fromTemporal()` / `toPlainDate()`

**Files:**
- Modify: `src/wareki-date.ts`
- Modify: `test/temporal.test.ts` (テスト追記)

**Interfaces:**
- Consumes (Task 1): `isTemporalDateLike`, `temporalToIsoParts`, `getTemporalNamespace`, `TemporalDateLike`, `TemporalPlainDate`。既存: `WarekiDate.fromJd(jd)`, `gregorianToJd(y, m, d)` (`src/jd.ts`), `toGregorianParts()`
- Produces: `WarekiDate.fromTemporal(temporal: TemporalDateLike): WarekiDate`、`WarekiDate.prototype.toPlainDate(): TemporalPlainDate`

- [ ] **Step 1: 失敗するテストを書く**

`test/temporal.test.ts` の `describe.each(providers)('temporal helpers (%s)', ...)` ブロックの**後**に追記:

```ts
describe.each(providers)('WarekiDate Temporal interop (%s)', (_name, T) => {
  describe('fromTemporal', () => {
    it('converts PlainDate (Gregorian era)', () => {
      const w = WarekiDate.fromTemporal(T.PlainDate.from('2019-05-04'))
      expect(w.eraName).toBe('令和')
      expect(w.eraYear).toBe(1)
      expect(w.month).toBe(5)
      expect(w.day).toBe(4)
    })

    it('converts PlainDate (旧暦・閏月)', () => {
      // README の既知ゴールデン: 1683-06-28 (グレゴリオ) = 天和三年閏五月四日
      const w = WarekiDate.fromTemporal(T.PlainDate.from('1683-06-28'))
      expect(w.format('%JF')).toBe('天和三年閏五月四日')
      expect(w.isLeapMonth).toBe(true)
    })

    it('converts non-ISO calendar input via ISO fields', () => {
      const jp = T.PlainDate.from('2019-05-04').withCalendar('japanese')
      expect(WarekiDate.fromTemporal(jp).format('%JF')).toBe('令和元年五月四日')
    })

    it('converts PlainDateTime (日付部分のみ使用)', () => {
      const w = WarekiDate.fromTemporal(T.PlainDateTime.from('1989-01-08T12:34:56'))
      expect(w.eraName).toBe('平成')
      expect(w.eraYear).toBe(1)
    })

    it('converts ZonedDateTime using its wall-clock date', () => {
      // UTC 2019-04-30T20:00 = Asia/Tokyo 2019-05-01T05:00 → 改元当日 (令和元年)
      const zdt = T.Instant.from('2019-04-30T20:00:00Z').toZonedDateTimeISO('Asia/Tokyo')
      const w = WarekiDate.fromTemporal(zdt)
      expect(w.eraName).toBe('令和')
      expect(w.eraYear).toBe(1)
      expect(w.month).toBe(5)
      expect(w.day).toBe(1)
    })

    it('throws UnsupportedDateRangeError for dates before the era table (< 645)', () => {
      expect(() => WarekiDate.fromTemporal(T.PlainDate.from('0400-01-01'))).toThrow(
        UnsupportedDateRangeError,
      )
    })

    it('throws TypeError for non-temporal values', () => {
      // @ts-expect-error 実行時型チェックの検証
      expect(() => WarekiDate.fromTemporal(new Date())).toThrow(TypeError)
      // @ts-expect-error 実行時型チェックの検証
      expect(() => WarekiDate.fromTemporal({})).toThrow(TypeError)
      // @ts-expect-error 実行時型チェックの検証
      expect(() => WarekiDate.fromTemporal(null)).toThrow(TypeError)
    })
  })

  describe('toPlainDate', () => {
    it('creates an ISO PlainDate via globalThis.Temporal', () => {
      vi.stubGlobal('Temporal', T)
      const pd = new WarekiDate('明治', 8, 2, 1).toPlainDate()
      expect(String(pd)).toBe('1875-02-01')
    })

    it('matches toGregorianParts for pre-reform lunisolar dates', () => {
      vi.stubGlobal('Temporal', T)
      const w = WarekiDate.parse('天和3年閏5月4日')
      const pd = w.toPlainDate()
      const parts = w.toGregorianParts()
      expect(String(pd)).toBe('1683-06-28')
      expect({ year: pd.year, month: pd.month, day: pd.day }).toEqual(parts)
    })

    it('handles 紀元前 (negative/zero ISO years)', () => {
      vi.stubGlobal('Temporal', T)
      const w = new WarekiDate('紀元前', 1, 1, 1)
      const pd = w.toPlainDate()
      expect({ year: pd.year, month: pd.month, day: pd.day }).toEqual(w.toGregorianParts())
      expect(pd.year).toBeLessThanOrEqual(0)
    })

    it('round-trips through fromTemporal', () => {
      vi.stubGlobal('Temporal', T)
      for (const s of ['令和元年五月四日', '天和三年閏五月四日', '明治五年十二月二日']) {
        const w = WarekiDate.parse(s)
        expect(WarekiDate.fromTemporal(w.toPlainDate()).isSameDay(w)).toBe(true)
        expect(WarekiDate.fromTemporal(w.toPlainDate()).format('%JF')).toBe(s)
      }
    })

    it('throws when globalThis.Temporal is missing', () => {
      vi.stubGlobal('Temporal', undefined)
      expect(() => new WarekiDate('令和', 1, 5, 4).toPlainDate()).toThrow(
        /Temporal is not available/,
      )
    })

    it('propagates RangeError for dates beyond the PlainDate range (±271821年)', () => {
      vi.stubGlobal('Temporal', T)
      expect(() => new WarekiDate('西暦', 300000, 1, 1).toPlainDate()).toThrow(RangeError)
    })
  })
})
```

import 行も更新する (ファイル先頭):

```ts
import { UnsupportedDateRangeError, WarekiDate } from '../src/index.js'
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run test/temporal.test.ts`
Expected: FAIL — `WarekiDate.fromTemporal is not a function`

- [ ] **Step 3: `src/wareki-date.ts` に実装**

import に追加 (既存 import 群に合流):

```ts
import {
  getTemporalNamespace,
  isTemporalDateLike,
  type TemporalDateLike,
  type TemporalPlainDate,
  temporalToIsoParts,
} from './temporal.js'
```

`fromDate` の直後にメソッド追加:

```ts
  /**
   * Temporal オブジェクト (`PlainDate` / `PlainDateTime` / `ZonedDateTime`) から
   * {@link WarekiDate} を作る。非 ISO カレンダー (japanese 等) の値は
   * `withCalendar('iso8601')` で ISO の年月日に揃えてから変換する。構造的に判定するため
   * polyfill のインスタンスも受け付ける (グローバル `Temporal` は不要)。
   * `ZonedDateTime` はそのタイムゾーンのウォールクロック年月日を使う。
   * @throws {TypeError} Temporal の日付型と解釈できない値のとき
   * @throws {UnsupportedDateRangeError} サポート範囲外の日付のとき
   */
  static fromTemporal(temporal: TemporalDateLike): WarekiDate {
    if (!isTemporalDateLike(temporal))
      throw new TypeError(
        'WarekiDate.fromTemporal() expects a Temporal PlainDate / PlainDateTime / ZonedDateTime',
      )
    const { year, month, day } = temporalToIsoParts(temporal)
    return WarekiDate.fromJd(gregorianToJd(year, month, day))
  }
```

`toDate()` の直後にメソッド追加:

```ts
  /**
   * ISO カレンダーの `Temporal.PlainDate` へ変換する。実行環境のグローバル `Temporal` を
   * 使うため、未搭載ランタイム (Node 18〜24 など) ではエラーになる。polyfill 利用時は
   * `Temporal.PlainDate.from(d.toGregorianParts())` を使うか、polyfill をグローバル登録
   * すること。
   * @throws {Error} グローバル `Temporal` が存在しないとき
   */
  toPlainDate(): TemporalPlainDate {
    const ns = getTemporalNamespace()
    const { year, month, day } = this.toGregorianParts()
    return new ns.PlainDate(year, month, day) as TemporalPlainDate
  }
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run test/temporal.test.ts`
Expected: PASS

- [ ] **Step 5: 全体確認とコミット**

Run: `npm run typecheck && npm test`
Expected: 全 PASS

```bash
git add src/wareki-date.ts test/temporal.test.ts
git commit -m "feat: add WarekiDate.fromTemporal() and toPlainDate()"
```

---

### Task 3: トップレベル `toWarekiDate()` / `format()` の Temporal 対応

**Files:**
- Modify: `src/format.ts` (`stdStrftimeFromParts` 切り出し)
- Modify: `src/index.ts` (シグネチャ拡張・ディスパッチ・型 re-export)
- Modify: `test/temporal.test.ts` (テスト追記)

**Interfaces:**
- Consumes (Task 1, 2): `isTemporalDateLike`, `temporalToIsoParts`, `temporalTimeParts`, `TemporalDateLike`, `WarekiDate.fromTemporal`。既存: `formatTime(time: TimeParts | Date, fmt)` (`src/time.ts`), `hasJDateDirective`, `stdStrftimeFromDate` (`src/format.ts`)
- Produces:
  - `stdStrftimeFromParts(year: number, month: number, day: number, str: string): string` (`src/format.ts` から export)
  - `toWarekiDate(date: Date | TemporalDateLike): WarekiDate`
  - `format(date: Date | WarekiDate | TemporalDateLike, fmt?: string): string`
  - `export type { TemporalDateLike, TemporalPlainDate }` (index.ts から re-export)

**挙動変更 (意図的、CHANGELOG に記載):** `format()` に Date でも WarekiDate でも Temporal でもない値を渡した場合、従来の `RangeError('format() received an invalid Date')` から `TypeError` に変わる。Invalid Date (NaN) は従来どおり `RangeError`。

- [ ] **Step 1: 失敗するテストを書く**

`test/temporal.test.ts` に describe ブロックを追記:

```ts
describe.each(providers)('top-level API Temporal interop (%s)', (_name, T) => {
  describe('toWarekiDate', () => {
    it('accepts Temporal objects', () => {
      expect(toWarekiDate(T.PlainDate.from('2019-05-04')).format('%JF')).toBe('令和元年五月四日')
    })

    it('still accepts Date', () => {
      expect(toWarekiDate(new Date(2019, 4, 4)).format('%JF')).toBe('令和元年五月四日')
    })
  })

  describe('format', () => {
    it('formats PlainDate with default and explicit formats', () => {
      expect(format(T.PlainDate.from('2019-05-04'))).toBe('令和元年五月四日')
      expect(format(T.PlainDate.from('2019-05-04'), '%Jf')).toBe('令和01年05月04日')
    })

    it('expands %JT time directives from PlainDateTime', () => {
      expect(format(T.PlainDateTime.from('1989-01-08T12:34:56'), '%Jf %JTHk時%JTMk分')).toBe(
        '平成01年01月08日 十二時三十四分',
      )
    })

    it('expands %JT time directives from ZonedDateTime wall-clock', () => {
      const zdt = T.Instant.from('2019-04-30T20:00:00Z').toZonedDateTimeISO('Asia/Tokyo')
      expect(format(zdt, '%JF %JTHk時')).toBe('令和元年五月一日 五時')
    })

    it('leaves %JT literal for PlainDate (時刻を持たない)', () => {
      expect(format(T.PlainDate.from('2019-05-04'), '%JTHk時')).toBe('%JTHk時')
    })

    it('skips era conversion when no %J date directive is present', () => {
      // era テーブル外 (645 年より前) でも std ディレクティブだけなら変換を経由せず成功する
      expect(format(T.PlainDate.from('0400-01-02'), '%F')).toBe('0400-01-02')
      expect(format(T.PlainDate.from('0400-01-02'), '%Y-%m-%d')).toBe('0400-01-02')
    })

    it('throws UnsupportedDateRangeError when %J directive needs an era out of range', () => {
      expect(() => format(T.PlainDate.from('0400-01-02'), '%JF')).toThrow(
        UnsupportedDateRangeError,
      )
    })
  })
})

describe('format / toWarekiDate rejects non-supported values', () => {
  it('format throws TypeError (旧: RangeError) for plain objects', () => {
    // @ts-expect-error 実行時型チェックの検証
    expect(() => format({})).toThrow(TypeError)
    // @ts-expect-error 実行時型チェックの検証
    expect(() => format(42)).toThrow(TypeError)
  })

  it('format still throws RangeError for invalid Date', () => {
    expect(() => format(new Date(Number.NaN))).toThrow(RangeError)
  })

  it('toWarekiDate throws TypeError for plain objects', () => {
    // @ts-expect-error 実行時型チェックの検証
    expect(() => toWarekiDate({})).toThrow(TypeError)
  })
})
```

import 行を更新:

```ts
import { format, toWarekiDate, UnsupportedDateRangeError, WarekiDate } from '../src/index.js'
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run test/temporal.test.ts`
Expected: FAIL — `format(T.PlainDate...)` が `RangeError: format() received an invalid Date` を投げる / `toWarekiDate` が `WarekiDate.fromDate() received an invalid Date` 相当で失敗する

- [ ] **Step 3: `src/format.ts` をリファクタリング**

`stdStrftimeFromDate` を parts 版と Date 版に分離 (既存コメントは parts 版へ移す):

```ts
// %J 日付ディレクティブが実在しない Date / Temporal 入力向けの経路 (index.ts の
// format() から呼ばれる)。Ruby の Time#strftime はネイティブ実装にそのまま委譲するだけで
// 改暦・ユリウス暦補正を経由しないため、WarekiDate/jd 変換を挟まず与えられた年月日を
// そのまま使う (改暦以前の年でも UnsupportedDateRangeError を投げない)。
export function stdStrftimeFromParts(year: number, month: number, day: number, str: string): string {
  // 先発グレゴリオ暦上の通日。多引数 Date.UTC は 0〜99 年を 1900 年代へ写すため
  // (西暦0年は閏年だが 1900 は平年)、JD 差で計算して 0〜99 年とタイムゾーンの影響を避ける。
  const dayOfYear = gregorianToJd(year, month, day) - gregorianToJd(year, 1, 1) + 1
  return stdStrftimeCore(year, month, day, dayOfYear, str)
}

export function stdStrftimeFromDate(date: Date, str: string): string {
  return stdStrftimeFromParts(date.getFullYear(), date.getMonth() + 1, date.getDate(), str)
}
```

Run: `npm test`
Expected: 既存テスト全 PASS (リファクタリングのみ)

- [ ] **Step 4: `src/index.ts` を拡張**

import を更新:

```ts
import { GREGORIAN_START_JD } from './constants.js'
import { UnsupportedDateRangeError, WarekiInvalidDateError, WarekiParseError } from './errors.js'
import { hasJDateDirective, stdStrftimeFromDate, stdStrftimeFromParts } from './format.js'
import { isTemporalDateLike, type TemporalDateLike, temporalTimeParts, temporalToIsoParts } from './temporal.js'
import { formatTime, normalizeTime, TIME_QUICK_FILTER } from './time.js'
import { WarekiDate } from './wareki-date.js'
```

re-export を追加 (`export type { TimeParts }` の行の近く):

```ts
export type { TemporalDateLike, TemporalPlainDate } from './temporal.js'
```

`toWarekiDate` を置き換え (JSDoc の @param/@throws も更新):

```ts
/**
 * `Date` または Temporal オブジェクト (`PlainDate` / `PlainDateTime` / `ZonedDateTime`) を
 * {@link WarekiDate} へ変換する。`Date` はローカルタイムゾーンの年月日
 * ({@link WarekiDate.fromDate})、Temporal は ISO の年月日 ({@link WarekiDate.fromTemporal})
 * を使う。
 *
 * @param date 変換対象の `Date` または Temporal オブジェクト
 * @returns 対応する {@link WarekiDate}
 * @throws {RangeError} 無効な Date (Invalid Date) を渡したとき
 * @throws {TypeError} Date でも Temporal の日付型でもない値を渡したとき
 * @example
 * toWarekiDate(new Date(1683, 5, 28)).format('%JF')                  // => '天和三年閏五月四日'
 * toWarekiDate(Temporal.PlainDate.from('1683-06-28')).format('%JF')  // => '天和三年閏五月四日'
 */
export function toWarekiDate(date: Date | TemporalDateLike): WarekiDate {
  if (date instanceof Date) return WarekiDate.fromDate(date)
  return WarekiDate.fromTemporal(date)
}
```

`format` を置き換え:

```ts
/**
 * `Date`・{@link WarekiDate}・Temporal オブジェクトをフォーマット文字列に従って文字列化
 * する。既定は `'%JF'` (例: `令和元年五月四日`)。使用できる `%J` / `%JT` コードは README
 * 「フォーマット文字列一覧」を参照。
 *
 * `Date` はローカル時刻、`PlainDateTime` / `ZonedDateTime` はそのウォールクロック時刻から
 * `%JT` 時刻ディレクティブを展開する。{@link WarekiDate} と `PlainDate` は時刻情報が無い
 * ため `%JT` はリテラルのまま残る。
 *
 * @param date `Date`・{@link WarekiDate}・Temporal の日付オブジェクト
 * @param fmt フォーマット文字列 (既定 `'%JF'`)
 * @returns フォーマット済み文字列
 * @throws {RangeError} 無効な Date (Invalid Date) を渡したとき
 * @throws {TypeError} 対応しない型の値を渡したとき
 * @example
 * format(new Date(2019, 4, 4))                          // => '令和元年五月四日'
 * format(Temporal.PlainDate.from('2019-05-04'), '%Jf')  // => '令和01年05月04日'
 */
export function format(date: Date | WarekiDate | TemporalDateLike, fmt = '%JF'): string {
  if (date instanceof WarekiDate) return date.format(fmt)
  if (date instanceof Date) {
    if (Number.isNaN(date.getTime())) throw new RangeError('format() received an invalid Date')
    const timeExpanded = formatTime(date, fmt)
    // Ruby: wareki_directive?(FORMAT_EXPANSION_REGEX) が実際の %J 日付ディレクティブの
    // 有無を見て to_wareki_date を呼ぶか決める (単に '%' が残っているかではない)。
    // 暦対象外の年でも、実ディレクティブが無ければ era 変換を経由しない。
    if (!hasJDateDirective(timeExpanded)) return stdStrftimeFromDate(date, timeExpanded)
    return WarekiDate.fromDate(date).format(timeExpanded)
  }
  if (!isTemporalDateLike(date))
    throw new TypeError('format() expects a Date, WarekiDate, or Temporal date object')
  const time = temporalTimeParts(date)
  const timeExpanded = time ? formatTime(time, fmt) : fmt
  if (!hasJDateDirective(timeExpanded)) {
    const { year, month, day } = temporalToIsoParts(date)
    return stdStrftimeFromParts(year, month, day, timeExpanded)
  }
  return WarekiDate.fromTemporal(date).format(timeExpanded)
}
```

(既存の「型は Date だが JS 呼び出し元は非 Date を渡し得るので…」のコメントは、TypeError へ
の変更に伴い削除する)

- [ ] **Step 5: テストが通ることを確認**

Run: `npx vitest run test/temporal.test.ts`
Expected: PASS

- [ ] **Step 6: 既存テストへの影響確認**

Run: `npm run typecheck && npm test`
Expected: 全 PASS。もし既存テストが `format()` の非 Date 入力に `RangeError` を期待していたら
(test/api.test.ts あたり)、意図的な挙動変更なので期待値を `TypeError` に更新する。
Invalid Date (`new Date(NaN)`) の `RangeError` 期待は変わらないこと。

- [ ] **Step 7: コミット**

```bash
git add src/format.ts src/index.ts test/temporal.test.ts
# 既存テストの期待値を更新した場合はそれも add
git commit -m "feat: accept Temporal objects in toWarekiDate() and format()"
```

---

### Task 4: 型テスト (esnext.temporal あり/なしの 2 構成)

**Files:**
- Create: `test/types/with-lib.ts`
- Create: `test/types/no-lib.ts`
- Create: `test/types/tsconfig.with-lib.json`
- Create: `test/types/tsconfig.no-lib.json`
- Modify: `tsconfig.json` (test/types を exclude — dist 依存のため root typecheck から外す)
- Modify: `package.json` (`test:types` script、prepublishOnly 連結)
- Modify: `.github/workflows/ci.yml` (build 後に test:types)

**Interfaces:**
- Consumes: ビルド済み `dist/index.js` / `dist/index.d.ts` (要 `npm run build`)。Task 1〜3 の公開型 (`TemporalDateLike`, `TemporalPlainDate`, `fromTemporal`, `toPlainDate`, `toWarekiDate`, `format`)
- Produces: `npm run test:types` (2 構成の tsc 実行)

- [ ] **Step 1: 型テストのフィクスチャと tsconfig を作成**

`test/types/with-lib.ts`:

```ts
// esnext.temporal lib 有効時の型検証。tsc -p test/types/tsconfig.with-lib.json で実行。
// 検証点: (1) native Temporal 型がそのまま入力に渡せる
//         (2) toPlainDate() の戻り値が本物の Temporal.PlainDate に昇格する
import { format, toWarekiDate, WarekiDate } from '../../dist/index.js'
import type { TemporalDateLike, TemporalPlainDate } from '../../dist/index.js'

declare const nativePd: Temporal.PlainDate
declare const nativeDt: Temporal.PlainDateTime
declare const nativeZdt: Temporal.ZonedDateTime

WarekiDate.fromTemporal(nativePd)
WarekiDate.fromTemporal(nativeDt)
WarekiDate.fromTemporal(nativeZdt)
toWarekiDate(nativePd)
format(nativeZdt, '%JF')

const promoted: Temporal.PlainDate = new WarekiDate('令和', 1, 5, 4).toPlainDate()
const aliased: TemporalPlainDate = nativePd
const back: Temporal.PlainDate = aliased
const like: TemporalDateLike = nativePd
void [promoted, back, like]
```

`test/types/no-lib.ts`:

```ts
// esnext.temporal lib 無し (TS 5.x 相当の環境) の型検証。
// 検証点: (1) dist/index.d.ts が lib 無しでコンパイルできる (lib 参照を持ち込んでいない)
//         (2) fallback の構造的型でフィールドにアクセスできる
//         (3) duck-typing のオブジェクトが入力として型チェックを通る
import { WarekiDate } from '../../dist/index.js'
import type { TemporalDateLike, TemporalPlainDate } from '../../dist/index.js'

const pd: TemporalPlainDate = new WarekiDate('令和', 1, 5, 4).toPlainDate()
const y: number = pd.year
const m: number = pd.month
const d: number = pd.day
const cal: string = pd.calendarId

const duck: TemporalDateLike = {
  calendarId: 'iso8601',
  year: 2019,
  month: 5,
  day: 4,
  withCalendar() {
    return this
  },
}
WarekiDate.fromTemporal(duck)
void [y, m, d, cal]
```

`test/types/tsconfig.with-lib.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "ESNext.Temporal"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "types": [],
    "skipLibCheck": false
  },
  "files": ["with-lib.ts"]
}
```

`test/types/tsconfig.no-lib.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "types": [],
    "skipLibCheck": false
  },
  "files": ["no-lib.ts"]
}
```

(`skipLibCheck: false` が肝: no-lib 構成で `dist/index.d.ts` 自体が lib 無しで型検査を
通ることを保証する。`types: []` は @types/node の自動取り込みを防ぐ)

- [ ] **Step 2: root tsconfig から test/types を除外**

`tsconfig.json` に exclude を追加 (dist の d.ts に依存するため、build 前に走る root
typecheck から外す):

```json
  "include": [
    "src",
    "test",
    "tsdown.config.ts",
    "vitest.config.ts"
  ],
  "exclude": [
    "test/types"
  ]
```

- [ ] **Step 3: npm script を追加**

`package.json` の scripts:

```json
    "test:types": "tsc -p test/types/tsconfig.with-lib.json && tsc -p test/types/tsconfig.no-lib.json",
```

prepublishOnly を更新 (test の後に test:types。build 済みなので dist がある):

```json
    "prepublishOnly": "npm run build && npm test && npm run test:types && npm run smoke && npx publint && npm_config_dry_run=false npx @arethetypeswrong/cli --pack .",
```

- [ ] **Step 4: 型テストを実行して確認**

Run: `npm run build && npm run test:types`
Expected: 両構成とも PASS。失敗する場合は tsdown の d.ts 出力を確認 (`grep -n 'TemporalPlainDate\|reference lib' dist/index.d.ts`) — 条件型 `typeof globalThis extends ...` がそのまま保存されていること、`/// <reference lib="esnext.temporal">` が**含まれない**ことを確認する。

補足: 昇格の実質的な検証は `with-lib.ts` の `const back: Temporal.PlainDate = aliased`
(fallback 型のままでは native へ代入できず型エラーになる)。lib 参照混入の検証は
`no-lib.ts` のコンパイル成功 (`skipLibCheck: false` なので `dist/index.d.ts` 自体が
lib 無しで検査される)。

- [ ] **Step 5: CI に組み込む**

`.github/workflows/ci.yml` の test ジョブ、`- run: npm run build` の直後に追加:

```yaml
      - run: npm run test:types
```

- [ ] **Step 6: コミット**

```bash
git add test/types tsconfig.json package.json .github/workflows/ci.yml
git commit -m "test: verify d.ts works with and without esnext.temporal lib"
```

---

### Task 5: CI マトリクスに Node 26 追加 + smoke 拡張

**Files:**
- Modify: `.github/workflows/ci.yml` (test マトリクスに '26')
- Modify: `test/smoke-runtime.mjs` (Temporal 入力の duck-typing チェック)

**Interfaces:**
- Consumes: Task 3 の `toWarekiDate` / `format` (Temporal 対応版)、Task 2 の `toPlainDate`
- Produces: なし (検証のみ)

- [ ] **Step 1: CI マトリクスに Node 26 を追加**

`.github/workflows/ci.yml` の test ジョブ:

```yaml
    strategy:
      matrix:
        node-version: ['22', '24', '26']
```

(Node 26 ではネイティブ Temporal が存在するため、test/temporal.test.ts の providers に
native が加わり、同一スイートがネイティブ実装でも実行される)

- [ ] **Step 2: smoke にチェックを追加**

`test/smoke-runtime.mjs` の IIFE チェックの後、`if (failures.length > 0)` の前に追加:

```js
// Temporal 相互変換: 入力側は duck-typing でグローバル Temporal 不要 (Node 18/20 でも動く)。
const duck = { calendarId: 'iso8601', year: 2019, month: 5, day: 4, withCalendar() { return this } }
check('ESM toWarekiDate(TemporalLike)', esm.format(esm.toWarekiDate(duck)), '令和元年五月四日')

// 出力側はグローバル Temporal があるときだけ動く (Node 26+)。無い環境ではエラーになることを確認。
if (globalThis.Temporal) {
  check('toPlainDate (native Temporal)', String(esm.toWarekiDate(duck).toPlainDate()), '2019-05-04')
} else {
  let threw = false
  try {
    esm.toWarekiDate(duck).toPlainDate()
  } catch (e) {
    threw = /Temporal is not available/.test(String(e && e.message))
  }
  check('toPlainDate throws without Temporal', threw, true)
}
```

- [ ] **Step 3: ローカルで smoke を実行**

Run: `npm run build && npm run smoke`
Expected: 全 ok (現行 Node に Temporal があれば native 経路、無ければ throws 経路)

- [ ] **Step 4: コミット**

```bash
git add .github/workflows/ci.yml test/smoke-runtime.mjs
git commit -m "ci: run tests on Node 26 and smoke-test Temporal interop"
```

---

### Task 6: README と CHANGELOG

**Files:**
- Modify: `README.md` (機能 bullet + 「Temporal との相互変換」節)
- Modify: `CHANGELOG.md` (0.2.0 Unreleased)

**Interfaces:**
- Consumes: Task 1〜3 の公開 API (文書化対象)

- [ ] **Step 1: README に機能 bullet を追加**

「機能」リストの `* 日本語の時刻表記...` の前に追加:

```markdown
* Temporal (`PlainDate` / `PlainDateTime` / `ZonedDateTime`) との相互変換 (入力は polyfill のインスタンスも可)
```

- [ ] **Step 2: README に「Temporal との相互変換」節を追加**

「使い方」のコードブロックの後、「フォーマット文字列一覧」の前に節を追加:

```markdown
## Temporal との相互変換

[Temporal](https://developer.mozilla.org/ja/docs/Web/JavaScript/Reference/Global_Objects/Temporal) (ES2026) の日付型とも相互変換できます。

​```ts
import { WarekiDate, toWarekiDate, format } from 'ya-wareki'

// Temporal → WarekiDate (PlainDate / PlainDateTime / ZonedDateTime を受け付け)
WarekiDate.fromTemporal(Temporal.PlainDate.from('1683-06-28')).format('%JF')
// => '天和三年閏五月四日'
toWarekiDate(Temporal.Now.plainDateISO()).format()      // 今日の和暦
format(Temporal.PlainDate.from('2019-05-04'))           // => '令和元年五月四日'
format(Temporal.PlainDateTime.from('1989-01-08T12:34:56'), '%Jf %JTHk時%JTMk分')
// => '平成01年01月08日 十二時三十四分'

// WarekiDate → Temporal.PlainDate (ISO カレンダー)
WarekiDate.parse('明治8年2月1日').toPlainDate().toString() // => '1875-02-01'
​```

* **入力側** (`fromTemporal` / `toWarekiDate` / `format`) は渡されたオブジェクトを直接読むため、グローバル `Temporal` が無い環境でも polyfill ([temporal-polyfill](https://www.npmjs.com/package/temporal-polyfill) など) のインスタンスをそのまま渡せます。`'japanese'` など非 ISO カレンダーの値も `withCalendar('iso8601')` 経由で正しく変換されます。
* **出力側** (`toPlainDate()`) は実行環境のグローバル `Temporal` を使います (Node.js 26+、Firefox 139+、Chrome/Edge 144+)。未搭載環境で polyfill を使う場合は `Temporal.PlainDate.from(d.toGregorianParts())` としてください。
* `ZonedDateTime` はそのタイムゾーンのウォールクロック年月日・時刻で解釈されます (`Date` のローカル時刻と同じ考え方)。
* Temporal の `'japanese'` カレンダーは明治以降のグレゴリオ暦ベースなので、明治5年以前の旧暦 (太陰太陽暦) の月日はこのライブラリでのみ正しく扱えます。
```

(注: 上記ブロック内の ​``` は、この計画書のコードフェンスとの入れ子を避けるための表記。実際の README にはふつうの ``` を書く)

- [ ] **Step 3: CHANGELOG に 0.2.0 エントリを追加**

`CHANGELOG.md` の先頭 (0.1.0 の前) に追加。既存のフォーマット (Keep a Changelog 風) に合わせる:

```markdown
## [0.2.0] - Unreleased

### Added

- Temporal 相互変換: `WarekiDate.fromTemporal()` / `WarekiDate#toPlainDate()` を追加。
  `toWarekiDate()` と `format()` も Temporal の `PlainDate` / `PlainDateTime` /
  `ZonedDateTime` を受け付けるようになった (時刻を持つ型では `%JT` 系も展開)。
- 型 `TemporalDateLike` / `TemporalPlainDate` を export。利用側で `esnext.temporal` lib が
  有効なら `toPlainDate()` の戻り値は `Temporal.PlainDate` に昇格する。

### Changed

- `format()` / `toWarekiDate()` に Date・WarekiDate・Temporal のいずれでもない値を渡した
  ときのエラーが `RangeError` から `TypeError` になった (Invalid Date は従来どおり
  `RangeError`)。
```

(既存 CHANGELOG に `[0.1.0]` のリンク定義がある場合は 0.2.0 分も追随させる)

- [ ] **Step 4: 検証とコミット**

Run: `npm test` (README のコード例と実挙動の齟齬がないか、test/temporal.test.ts の同等ケースで担保されていることを確認)
Expected: 全 PASS

```bash
git add README.md CHANGELOG.md
git commit -m "docs: document Temporal interop in README and CHANGELOG"
```

---

## 完了条件

- `npm run typecheck && npm run build && npm test && npm run test:types && npm run smoke` が全て成功
- Node 22/24 (polyfill プロバイダ) と Node 26 (native + polyfill) で CI green
- `dist/index.d.ts` に `/// <reference lib` が含まれない
- README / CHANGELOG 更新済み
