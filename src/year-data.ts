import {
  DAY_OVERRIDES, FIRST_JD, FIRST_YEAR, PACKED, START_OVERRIDES, YEAR_COUNT,
} from './data/year-defs.js'

export interface YearInfo {
  year: number
  start: number
  end: number
  leapMonth: number | null
  monthStarts: number[]
  monthDays: number[]
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-'
const CODE = new Map(Array.from(ALPHABET, (c, i) => [c, i]))

let table: YearInfo[] | undefined

function decode(): YearInfo[] {
  const years: YearInfo[] = []
  const dayOverrides = new Map(DAY_OVERRIDES.map(([y, j, d]) => [y * 16 + j, d]))
  let jd = FIRST_JD
  for (let i = 0; i < YEAR_COUNT; i++) {
    const year = FIRST_YEAR + i
    const v =
      CODE.get(PACKED[3 * i] as string)! * 4096 +
      CODE.get(PACKED[3 * i + 1] as string)! * 64 +
      CODE.get(PACKED[3 * i + 2] as string)!
    const leapMonth = v >> 13 === 0 ? null : v >> 13
    const count = leapMonth === null ? 12 : 13
    const monthStarts: number[] = []
    const monthDays: number[] = []
    for (let j = 0; j < count; j++) {
      monthStarts.push(jd)
      const days = dayOverrides.get(year * 16 + j) ?? ((v >> j) & 1 ? 30 : 29)
      monthDays.push(days)
      jd += days
    }
    years.push({
      year,
      start: START_OVERRIDES[year] ?? (monthStarts[0] as number),
      end: jd - 1,
      leapMonth,
      monthStarts,
      monthDays,
    })
  }
  return years
}

function all(): YearInfo[] {
  return (table ??= decode())
}

export function yearByNum(year: number): YearInfo | undefined {
  if (year < FIRST_YEAR || year >= FIRST_YEAR + YEAR_COUNT) return undefined
  return all()[year - FIRST_YEAR]
}

// Ruby Utils.find_year 互換: 「end >= jd を満たす最初の年」を二分探索する。
// テーブル先頭より前だけを FIRST_JD で弾き、各年の start は判定に使わない。
// START_OVERRIDES の43年は start > monthStarts[0] だが、その隙間の日付も
// この年に解決されるのが Ruby の挙動 (find_year は end しか見ない)。
export function findYearByJd(jd: number): YearInfo | undefined {
  if (jd < FIRST_JD) return undefined
  const years = all()
  let hi = years.length - 1
  if (jd > (years[hi] as YearInfo).end) return undefined
  let lo = 0
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if ((years[mid] as YearInfo).end >= jd) hi = mid
    else lo = mid + 1
  }
  return years[lo]
}
