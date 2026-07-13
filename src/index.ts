import { GREGORIAN_START_JD } from './constants.js'
import { UnsupportedDateRangeError, WarekiInvalidDateError, WarekiParseError } from './errors.js'
import { formatTime, normalizeTime } from './time.js'
import { WarekiDate } from './wareki-date.js'

export { WarekiDate } from './wareki-date.js'
export { UnsupportedDateRangeError, WarekiInvalidDateError, WarekiParseError } from './errors.js'
export { formatTime, normalizeTime } from './time.js'
export type { TimeParts } from './time.js'

// Ruby の Date::JAPAN (明治改暦日 JD) 相当
export const GREGORIAN_REFORM_JD: number = GREGORIAN_START_JD
export const VERSION = '0.1.0'

export function parse(str: string): WarekiDate {
  return WarekiDate.parse(str)
}

// Ruby Wareki.parse_to_date 相当。和暦として解釈できなければ new Date(str) に
// フォールバックし、それも Invalid Date なら元のエラーを再 throw する。
// Ruby は認識済みだが日付として不成立な InvalidDate はフォールバックさせず
// 再 raise し、素の ArgumentError と UnsupportedDateRange のみフォールバックする
// (common.rb の rescue InvalidDate; raise / rescue ArgumentError, UnsupportedDateRange
// 相当)。WarekiInvalidDateError はその区別のため他の分岐より先に rethrow する。
// 正規化後の文字列に含まれる最初の "HH:MM(:SS)" 時刻を取り出す。normalizeTime は
// 漢数字時刻を必ずゼロ埋め2桁の ASCII 表記へ落とすため、この単純な正規表現で拾える。
const TIME_OF_DAY_REGEX = /(\d{1,2}):(\d{2})(?::(\d{2}))?/

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

// Ruby Wareki.parse_to_date + std_ext の Time.parse 相当。まず normalizeTime を適用し、
// 和暦日付としてパースできれば、正規化後の文字列に時刻表記があればローカル時刻として
// セットする。和暦として解釈できなければ new Date(正規化文字列) にフォールバックし、
// それも Invalid Date なら元のエラーを再 throw する。範囲外時刻は WarekiParseError。
// Ruby は認識済みだが日付として不成立な InvalidDate はフォールバックさせず再 raise する。
export function parseToDate(str: string): Date {
  const norm = normalizeTime(str)
  const tod = extractTimeOfDay(norm)
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

export function toWarekiDate(date: Date): WarekiDate {
  return WarekiDate.fromDate(date)
}

// JS Date を渡した場合は Ruby std_ext の expand_all_wareki_formats と同じ順で、まず
// %JT 時刻ディレクティブをローカル時刻から展開し、続けて %J 日付ディレクティブを展開する。
// WarekiDate を渡した場合は時刻情報が無いため %JT はリテラルのまま残る (Ruby の Date と同じ)。
export function format(date: Date | WarekiDate, fmt = '%JF'): string {
  if (date instanceof WarekiDate) return date.format(fmt)
  const timeExpanded = formatTime(date, fmt)
  // %JT の展開だけで % が残らなければ日付変換は不要 (Ruby: %J 日付ディレクティブが
  // 残らなければ to_wareki_date を呼ばない)。暦対象外の年でも %JT のみなら例外にしない。
  if (!timeExpanded.includes('%')) return timeExpanded
  return WarekiDate.fromDate(date).format(timeExpanded)
}
