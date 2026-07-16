import { GREGORIAN_START_JD } from './constants.js'
import { UnsupportedDateRangeError, WarekiInvalidDateError, WarekiParseError } from './errors.js'
import { hasJDateDirective, stdStrftimeFromDate, stdStrftimeFromParts } from './format.js'
import { isTemporalDateLike, type TemporalDateLike, temporalTimeParts, temporalToIsoParts } from './temporal.js'
import { formatTime, normalizeTime, TIME_QUICK_FILTER } from './time.js'
import { WarekiDate } from './wareki-date.js'

export { WarekiDate } from './wareki-date.js'
export { UnsupportedDateRangeError, WarekiInvalidDateError, WarekiParseError } from './errors.js'
export { formatTime, normalizeTime } from './time.js'
export type { TimeParts } from './time.js'
export type { TemporalDateLike, TemporalPlainDate } from './temporal.js'

/**
 * 明治の改暦日 (明治6年1月1日 = グレゴリオ暦1873年1月1日) のユリウス日。
 * この日以降が新暦 (グレゴリオ暦)、前日までが旧暦。Ruby の `Date::JAPAN` に相当する。
 */
export const GREGORIAN_REFORM_JD: number = GREGORIAN_START_JD

/** このライブラリのバージョン (`package.json` の `version` と一致)。 */
export const VERSION = '0.1.0'

/**
 * 和暦文字列をパースして {@link WarekiDate} を返す。時刻表記が続く場合は無視して
 * 日付だけを返す (Ruby の `Date.parse` と同じ)。
 *
 * 元号・漢数字・旧字体・合字 (㍾㍽㍼㍻㋿)・閏月・月の別名・朔/晦/元旦などの慣用表記を
 * 受け付ける。
 *
 * @param str 和暦日付を表す文字列 (例: `'元仁元年閏七月朔日'`)
 * @returns パース結果の {@link WarekiDate}
 * @throws {WarekiInvalidDateError} 和暦としては認識できたが日付として成立しないとき
 * @throws {WarekiParseError} 和暦日付として解釈できないとき
 * @throws {UnsupportedDateRangeError} サポート範囲外の日付のとき
 * @example
 * parse('天和3年閏5月4日').format('%JF') // => '天和三年閏五月四日'
 */
export function parse(str: string): WarekiDate {
  return WarekiDate.parse(str)
}

// 正規化後の文字列に含まれる最初の "HH:MM(:SS)" 時刻を取り出す。数字境界
// (?<!\d) / (?!\d) で桁の連続全体を1成分として捕捉し、範囲外時刻 (3桁以上、
// 例: 百時 -> '100:00') が短い部分文字列 ('00:00' 等) に部分一致して誤って
// 正常値扱いされないようにする。Ruby Time.parse の実測受理/拒否と一致させている。
const TIME_OF_DAY_REGEX = /(?<!\d)(\d+):(\d+)(?::(\d+))?(?!\d)/

interface TimeOfDay {
  hour: number
  min: number
  sec: number
}

// 範囲外の時刻は Ruby では stdlib パーサ (Time.parse) が ArgumentError を投げる。
// Ruby Time.parse の受理範囲を検証で再現: hour<=24 (24 は 24:00:00 のみ)、min<=59、
// sec<=60。妥当な値は JS Date が正規化する (24:00 や :60 は Ruby 同様に翌時刻へ繰り上がる)。
function extractTimeOfDay(str: string): TimeOfDay | undefined {
  const m = TIME_OF_DAY_REGEX.exec(str)
  if (!m) return undefined
  const hour = Number(m[1])
  const min = Number(m[2])
  const sec = m[3] === undefined ? 0 : Number(m[3])
  if (hour > 24 || (hour === 24 && (min > 0 || sec > 0)) || min > 59 || sec > 60)
    throw new WarekiParseError(`invalid time out of range: ${str}`)
  return { hour, min, sec }
}

/**
 * 文字列を `Date` へ変換する。まず {@link normalizeTime} を適用し、和暦日付として
 * 解釈できれば、時刻表記があればそれをローカル時刻としてセットした `Date` を返す。
 * 和暦として解釈できなければ `new Date(正規化後の文字列)` にフォールバックする。
 *
 * @remarks
 * 認識できたが日付として不成立な {@link WarekiInvalidDateError} の場合はフォールバック
 * せず常に再 throw する (Ruby の `rescue InvalidDate; raise` 相当)。時刻抽出は元の
 * 文字列が「時」または「正午」を含むときだけ行う。
 *
 * @param str 和暦日付 (＋任意の時刻表記) を表す文字列
 * @returns 変換結果の `Date` (時刻表記が無ければローカル深夜)
 * @throws {WarekiInvalidDateError} 和暦として認識できたが日付として成立しないとき
 * @throws {WarekiParseError} 範囲外の時刻、または和暦としてもフォールバックとしても解釈できないとき
 * @throws {UnsupportedDateRangeError} 和暦としてサポート範囲外で、フォールバックも失敗したとき
 * @example
 * parseToDate('平成元年五月四日十二時三十四分') // => Date (ローカル 1989-05-04 12:34:00)
 * parseToDate('㍻一〇年 肆月 晦日')            // => Date (1998-04-30)
 */
export function parseToDate(str: string): Date {
  const norm = normalizeTime(str)
  const tod = TIME_QUICK_FILTER.test(str) ? extractTimeOfDay(norm) : undefined
  let dateOnly: Date | undefined
  let original: unknown
  try {
    dateOnly = WarekiDate.parse(norm).toDate()
  } catch (e) {
    if (e instanceof WarekiInvalidDateError) throw e
    if (!(e instanceof WarekiParseError) && !(e instanceof UnsupportedDateRangeError)) throw e
    original = e
  }
  if (dateOnly !== undefined) {
    if (tod) dateOnly.setHours(tod.hour, tod.min, tod.sec, 0)
    return dateOnly
  }
  const fallback = new Date(norm)
  if (Number.isNaN(fallback.getTime())) throw original
  return fallback
}

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
