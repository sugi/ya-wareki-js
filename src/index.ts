import { GREGORIAN_START_JD } from './constants.js'
import { UnsupportedDateRangeError, WarekiParseError } from './errors.js'
import { WarekiDate } from './wareki-date.js'

export { WarekiDate } from './wareki-date.js'
export { UnsupportedDateRangeError, WarekiParseError } from './errors.js'

// Ruby の Date::JAPAN (明治改暦日 JD) 相当
export const GREGORIAN_REFORM_JD: number = GREGORIAN_START_JD
export const VERSION = '0.1.0'

export function parse(str: string): WarekiDate {
  return WarekiDate.parse(str)
}

// Ruby Wareki.parse_to_date 相当。和暦として解釈できなければ new Date(str) に
// フォールバックし、それも Invalid Date なら元のエラーを再 throw する
// (Ruby は InvalidDate をフォールバックさせず再 raise する。この実装では
// フォールバック先が Invalid になることで同じ「例外になる」結果を得る)。
export function parseToDate(str: string): Date {
  let original: unknown
  try {
    return WarekiDate.parse(str).toDate()
  } catch (e) {
    if (!(e instanceof WarekiParseError) && !(e instanceof UnsupportedDateRangeError)) throw e
    original = e
  }
  const fallback = new Date(str)
  if (Number.isNaN(fallback.getTime())) throw original
  return fallback
}

export function toWarekiDate(date: Date): WarekiDate {
  return WarekiDate.fromDate(date)
}

export function format(date: Date | WarekiDate, fmt = '%JF'): string {
  const w = date instanceof WarekiDate ? date : WarekiDate.fromDate(date)
  return w.format(fmt)
}
