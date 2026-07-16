import { gregorianToJd, jdToGregorian } from './jd.js'
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
  // 存在しない日付 (13月・2月30日など) は gregorianToJd が黙って別の日付に正規化して
  // しまうため、往復変換の一致で実在する ISO 日付であることを確認する。
  const rt = jdToGregorian(gregorianToJd(year, month, day))
  if (rt.year !== year || rt.month !== month || rt.day !== day)
    throw new TypeError(`invalid Temporal object: no such ISO date (${year}-${month}-${day})`)
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
