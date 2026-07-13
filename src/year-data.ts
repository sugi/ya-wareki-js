import {
  DAY_OVERRIDES, FIRST_JD, FIRST_YEAR, PACKED, START_OVERRIDES, YEAR_COUNT,
} from './data/year-defs.js'

export interface YearInfo {
  year: number
  start: number
  end: number
  leapMonth: number | null
  monthStarts: Int32Array
  monthDays: Uint8Array
}

interface YearTable {
  starts: Int32Array
  ends: Int32Array
  leapMonths: Uint8Array
  monthStarts: Int32Array
  monthDays: Uint8Array
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-'
const CODE = new Map(Array.from(ALPHABET, (c, i) => [c, i]))

const MONTHS_PER_YEAR = 13

let table: YearTable | undefined

// 年ごとの配列やオブジェクトを保持せず、固定幅の領域へ全期間を平坦化する。
// 12ヶ月の年では13番目の領域を未使用のまま残すことで、offset を単純に保つ。
function decode(): YearTable {
  const starts = new Int32Array(YEAR_COUNT)
  const ends = new Int32Array(YEAR_COUNT)
  const leapMonths = new Uint8Array(YEAR_COUNT)
  const monthStarts = new Int32Array(YEAR_COUNT * MONTHS_PER_YEAR)
  const monthDays = new Uint8Array(YEAR_COUNT * MONTHS_PER_YEAR)
  const dayOverrides = new Map(DAY_OVERRIDES.map(([y, j, d]) => [y * 16 + j, d]))
  let jd = FIRST_JD
  for (let i = 0; i < YEAR_COUNT; i++) {
    const year = FIRST_YEAR + i
    const v =
      CODE.get(PACKED[3 * i] as string)! * 4096 +
      CODE.get(PACKED[3 * i + 1] as string)! * 64 +
      CODE.get(PACKED[3 * i + 2] as string)!
    const leapMonth = v >> 13
    const count = leapMonth === 0 ? 12 : 13
    const offset = i * MONTHS_PER_YEAR
    for (let j = 0; j < count; j++) {
      monthStarts[offset + j] = jd
      const days = dayOverrides.get(year * 16 + j) ?? ((v >> j) & 1 ? 30 : 29)
      monthDays[offset + j] = days
      jd += days
    }
    starts[i] = START_OVERRIDES[year] ?? (monthStarts[offset] as number)
    ends[i] = jd - 1
    leapMonths[i] = leapMonth
  }
  return { starts, ends, leapMonths, monthStarts, monthDays }
}

function all(): YearTable {
  return (table ??= decode())
}

function yearAt(years: YearTable, index: number): YearInfo {
  const encodedLeapMonth = years.leapMonths[index] as number
  const leapMonth = encodedLeapMonth === 0 ? null : encodedLeapMonth
  const offset = index * MONTHS_PER_YEAR
  const count = leapMonth === null ? 12 : 13
  return {
    year: FIRST_YEAR + index,
    start: years.starts[index] as number,
    end: years.ends[index] as number,
    leapMonth,
    monthStarts: years.monthStarts.subarray(offset, offset + count),
    monthDays: years.monthDays.subarray(offset, offset + count),
  }
}

export function yearDataIndex(year: number): number | undefined {
  if (!Number.isInteger(year) || year < FIRST_YEAR || year >= FIRST_YEAR + YEAR_COUNT) return undefined
  return year - FIRST_YEAR
}

export function yearLeapMonth(index: number): number | null {
  const leapMonth = all().leapMonths[index] as number
  return leapMonth === 0 ? null : leapMonth
}

export function yearMonthCount(index: number): number {
  return yearLeapMonth(index) === null ? 12 : 13
}

export function yearNum(index: number): number {
  return FIRST_YEAR + index
}

export function yearMonthStart(index: number, monthIndex: number): number {
  return all().monthStarts[index * MONTHS_PER_YEAR + monthIndex] as number
}

export function yearMonthDays(index: number, monthIndex: number): number | undefined {
  const years = all()
  const count = (years.leapMonths[index] as number) === 0 ? 12 : 13
  if (monthIndex < 0 || monthIndex >= count) return undefined
  return years.monthDays[index * MONTHS_PER_YEAR + monthIndex] as number
}

export function yearByNum(year: number): YearInfo | undefined {
  const index = yearDataIndex(year)
  return index === undefined ? undefined : yearAt(all(), index)
}

// Ruby Utils.find_year 互換: 「end >= jd を満たす最初の年」を二分探索する。
// テーブル先頭より前だけを FIRST_JD で弾き、各年の start は判定に使わない。
// START_OVERRIDES の43年は start > monthStarts[0] だが、その隙間の日付も
// この年に解決されるのが Ruby の挙動 (find_year は end しか見ない)。
export function findYearIndexByJd(jd: number): number | undefined {
  if (jd < FIRST_JD) return undefined
  const years = all()
  let hi = YEAR_COUNT - 1
  if (jd > (years.ends[hi] as number)) return undefined
  let lo = 0
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if ((years.ends[mid] as number) >= jd) hi = mid
    else lo = mid + 1
  }
  return lo
}

export function findYearByJd(jd: number): YearInfo | undefined {
  const index = findYearIndexByJd(jd)
  return index === undefined ? undefined : yearAt(all(), index)
}
