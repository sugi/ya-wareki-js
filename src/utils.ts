import { toNumber } from 'ya-kansuji'
import {
  ALT_MONTH_NAME, GREGORIAN_START_JD, GREGORIAN_START_YEAR,
  IMPERIAL_ERA_NAMES, IMPERIAL_START_YEAR, WESTERN_ERA_NAMES,
} from './constants.js'
import { UnsupportedDateRangeError, WarekiParseError } from './errors.js'
import { eraByName } from './era-lookup.js'
import { jdToGregorian } from './jd.js'
import {
  findYearIndexByJd,
  yearDataIndex,
  yearLeapMonth,
  yearMonthCount,
  yearMonthDays,
  yearMonthStart,
  yearNum,
} from './year-data.js'

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const

const mod = (a: number, b: number): number => ((a % b) + b) % b

function gregorianLastDay(year: number, month: number): number {
  if (month === 2) return mod(year, 4) === 0 && (mod(year, 100) !== 0 || mod(year, 400) === 0) ? 29 : 28
  return MONTH_DAYS[month - 1] as number
}

function julianLastDay(year: number, month: number): number {
  if (month === 2) return mod(year, 4) === 0 ? 29 : 28
  return MONTH_DAYS[month - 1] as number
}

export function lastDayOfMonth(year: number, month: number, isLeap: boolean): number {
  if (year >= GREGORIAN_START_YEAR) return gregorianLastDay(year, month)
  const yearIndex = yearDataIndex(year)
  if (yearIndex === undefined) throw new UnsupportedDateRangeError(`Cannot find year ${year}`)
  const leapMonth = yearLeapMonth(yearIndex)
  let monthIdx = month - 1
  if (isLeap || (leapMonth !== null && leapMonth < month)) monthIdx += 1
  // 存在しない添字 (12ヶ月年の閏12月など) は Ruby 同様 undefined を返し、
  // 呼び出し側 (WarekiDate の検証) が invalid date として拒否する
  return yearMonthDays(yearIndex, monthIdx) as number
}

export function eraYearToCivil(eraName: string | null | undefined, eraYear: number): number {
  const era = eraName ?? ''
  if (era === '' || era === '西暦') return eraYear
  if (era === '紀元前') return -eraYear
  if (IMPERIAL_ERA_NAMES.includes(era)) return eraYear + IMPERIAL_START_YEAR
  const def = eraByName(era)
  if (!def) throw new WarekiParseError(`Undefined era '${era}'`)
  return def.year + eraYear - 1
}

export function civilToEraYear(eraName: string | null | undefined, year: number): number {
  const era = eraName ?? ''
  if (era === '' || era === '西暦') return year
  if (era === '紀元前') return -year
  if (IMPERIAL_ERA_NAMES.includes(era)) return year - IMPERIAL_START_YEAR
  const def = eraByName(era)
  if (!def) throw new WarekiParseError(`Undefined era '${era}'`)
  return year - def.year + 1
}

export function lastDayOfEraMonth(
  eraName: string | null | undefined,
  civilYear: number,
  month: number,
  isLeap: boolean,
): number {
  const era = eraName ?? ''
  if (WESTERN_ERA_NAMES.includes(era)) {
    // Ruby: Date.new(civil_year, month, -1, ITALY).day 相当。
    // 1582年10月は改暦月だが ITALY での月末日は 31。
    if (civilYear === 1582 && month === 10) return 31
    if (civilYear > 1582 || (civilYear === 1582 && month > 10)) return gregorianLastDay(civilYear, month)
    return julianLastDay(civilYear, month)
  }
  return lastDayOfMonth(civilYear, month, isLeap)
}

export function altMonthNameToNumber(name: string): number | undefined {
  const i = ALT_MONTH_NAME.indexOf(name)
  return i < 0 ? undefined : i + 1
}

export function altMonthName(month: number): string {
  return ALT_MONTH_NAME[month - 1] as string
}

// Ruby Utils.find_date_ary 相当
export function findDateParts(jd: number): { year: number; month: number; day: number; isLeapMonth: boolean } {
  if (jd >= GREGORIAN_START_JD) return { ...jdToGregorian(jd), isLeapMonth: false }
  const yearIndex = findYearIndexByJd(jd)
  if (yearIndex === undefined) throw new UnsupportedDateRangeError(`Unsupported date: jd ${jd}`)
  const count = yearMonthCount(yearIndex)
  // pos = 何番目の月に入っているか (1-based。閏月も1つと数える)
  let pos = count
  for (let i = 1; i < count; i++) {
    if (jd <= yearMonthStart(yearIndex, i) - 1) {
      pos = i
      break
    }
  }
  const monthStart = yearMonthStart(yearIndex, pos - 1)
  const leapMonth = yearLeapMonth(yearIndex)
  const isLeapMonth = leapMonth !== null && leapMonth === pos - 1
  if (leapMonth !== null && leapMonth < pos) pos -= 1
  return { year: yearNum(yearIndex), month: pos, day: jd - monthStart + 1, isLeapMonth }
}

export function i2z(num: number): string {
  return String(num).replace(/[0-9]/g, (c) => '０１２３４５６７８９'[Number(c)] as string)
}

// Ruby Utils.k2i 相当。「正」は ya-kansuji では 10^40 の単位として解釈されて
// RangeError になるため、必ず先に特別扱いする。
export function k2i(str: string): number {
  const s = str.trim()
  if (s === '正' || s === '元' || s === '朔') return 1
  return toNumber(s)
}
