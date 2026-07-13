import { describe, expect, it } from 'vitest'
import { UnsupportedDateRangeError, WarekiParseError } from '../src/errors.js'
import {
  altMonthName, altMonthNameToNumber, civilToEraYear, eraYearToCivil,
  findDateParts, i2z, k2i, lastDayOfEraMonth, lastDayOfMonth,
} from '../src/utils.js'

describe('altMonthName (Ruby utils_spec より転記)', () => {
  it('converts alternative month names to numbers', () => {
    expect(altMonthNameToNumber('弥生')).toBe(3)
    expect(altMonthNameToNumber('師走')).toBe(12)
    expect(altMonthNameToNumber('水無月')).toBe(6)
    expect(altMonthNameToNumber('ほげ')).toBeUndefined() // Ruby は false
    expect(altMonthName(5)).toBe('皐月')
  })
})

describe('eraYearToCivil / civilToEraYear (Ruby utils_spec より転記)', () => {
  it('converts era year to civil year', () => {
    expect(eraYearToCivil('明治', 5)).toBe(1872)
    expect(eraYearToCivil('㍾', 5)).toBe(1872)
    expect(eraYearToCivil('皇紀', 2532)).toBe(1872)
    expect(eraYearToCivil('神武天皇即位紀元', 2685)).toBe(2025)
    expect(eraYearToCivil('', 2020)).toBe(2020)
    expect(eraYearToCivil(null, 2020)).toBe(2020)
    expect(eraYearToCivil('西暦', 321)).toBe(321)
    expect(eraYearToCivil('紀元前', 203)).toBe(-203)
    expect(() => eraYearToCivil('謎元号', 1)).toThrow(WarekiParseError)
  })

  it('converts civil year to era year', () => {
    expect(civilToEraYear('明治', 1872)).toBe(5)
    expect(civilToEraYear('皇紀', 1872)).toBe(2532)
    expect(civilToEraYear('紀元前', -203)).toBe(203)
    expect(civilToEraYear('', 2020)).toBe(2020)
  })
})

describe('lastDayOfMonth / lastDayOfEraMonth (Ruby utils_spec より転記)', () => {
  it('returns last day of month by era', () => {
    expect(lastDayOfEraMonth('明治', 1872, 10, false)).toBe(30)
    expect(lastDayOfEraMonth('皇紀', 1872, 10, false)).toBe(30)
    expect(lastDayOfEraMonth('', 2000, 2, false)).toBe(29)
    expect(lastDayOfEraMonth('紀元前', -1, 12, false)).toBe(31)
    expect(lastDayOfEraMonth('西暦', 300, 5, false)).toBe(31)
    expect(lastDayOfEraMonth('令和', 2021, 2, false)).toBe(28)
    // ITALY の 1582 年 10 月は月末 31 日 (Ruby: Date.new(1582,10,-1,ITALY).day)
    expect(lastDayOfEraMonth('西暦', 1582, 10, false)).toBe(31)
    // ユリウス暦の閏年 (4年毎、負の年は floored modulo)
    expect(lastDayOfEraMonth('西暦', 1500, 2, false)).toBe(29)
    expect(lastDayOfEraMonth('紀元前', -1, 2, false)).toBe(28)
  })

  it('reads the lunisolar table below 1873', () => {
    expect(lastDayOfMonth(1872, 12, false)).toBe(2) // 明治5年12月は2日
    expect(lastDayOfMonth(1683, 5, true)).toBe(29) // 天和3年閏5月
    expect(() => lastDayOfMonth(300, 1, false)).toThrow(UnsupportedDateRangeError)
  })
})

describe('findDateParts (Ruby Utils.find_date_ary)', () => {
  it('resolves lunisolar dates', () => {
    expect(findDateParts(2400508)).toEqual({ year: 1860, month: 3, day: 17, isLeapMonth: false })
    expect(findDateParts(2335942)).toEqual({ year: 1683, month: 5, day: 4, isLeapMonth: true })
    expect(findDateParts(2405159)).toEqual({ year: 1872, month: 12, day: 2, isLeapMonth: false })
  })

  it('resolves Gregorian dates from 1873-01-01', () => {
    expect(findDateParts(2405160)).toEqual({ year: 1873, month: 1, day: 1, isLeapMonth: false })
    expect(findDateParts(2458605)).toEqual({ year: 2019, month: 5, day: 1, isLeapMonth: false })
  })

  it('throws for dates before the year table', () => {
    expect(() => findDateParts(1883617)).toThrow(UnsupportedDateRangeError)
  })
})

describe('i2z / k2i', () => {
  it('converts to zenkaku digits', () => {
    expect(i2z(1234)).toBe('１２３４')
    expect(i2z(-5)).toBe('-５')
  })

  it('parses kansuji with 正/元/朔 specials (Ruby Utils.k2i)', () => {
    expect(k2i('正')).toBe(1) // ya-kansuji では正=10^40 なので短絡が必須
    expect(k2i('元')).toBe(1)
    expect(k2i('朔')).toBe(1)
    expect(k2i('二十九')).toBe(29)
    expect(k2i('卅')).toBe(30)
    expect(k2i('１７')).toBe(17)
    expect(k2i('1928')).toBe(1928)
    expect(k2i('')).toBe(0)
  })
})
