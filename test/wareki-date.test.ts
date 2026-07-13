import { describe, expect, it } from 'vitest'
import { UnsupportedDateRangeError, WarekiParseError } from '../src/errors.js'
import { gregorianToJd } from '../src/jd.js'
import { WarekiDate } from '../src/wareki-date.js'

const ymd = (d: Date): string => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`

// Ruby date_spec.rb の matchings (civil date は Date::ITALY 由来の JD に変換済み)
const MATCHINGS: Array<[number, string, number, number, number, boolean]> = [
  [2400508, '安政', 7, 3, 17, false], // 1860-04-07
  [2457251, '平成', 27, 8, 16, false], // 2015-08-16
  [1956842, '大化', 1, 6, 19, false], // 645-07-17 (ユリウス暦)
  [2139493, '久安', 1, 7, 22, false], // 1145-08-12
  [2139492, '天養', 2, 7, 21, false], // 1145-08-11
  [2335942, '天和', 3, 5, 4, true], // 1683-06-28
]

describe('WarekiDate constructor', () => {
  it('can be created with ymd args', () => {
    const d = new WarekiDate('明治', 8, 2, 1)
    expect(d.eraName).toBe('明治')
    expect(d.eraYear).toBe(8)
    expect(d.year).toBe(1875)

    const k = new WarekiDate('皇紀', 1234, 3, 2)
    expect(k.eraName).toBe('皇紀')
    expect(k.eraYear).toBe(1234)
    expect(k.year).toBe(574)
  })

  it('accepts null era name as western calendar', () => {
    expect(new WarekiDate(null, 2, 12, 31).jd).toBe(1722153) // Date.new(2,12,31).jd
    expect(ymd(new WarekiDate(null, 2020, 5, 4).toDate())).toBe('2020-5-4')
  })

  it('raises WarekiParseError for nonexistent dates (Ruby InvalidDate 相当)', () => {
    expect(() => new WarekiDate('明治', 5, 13, 1)).toThrow(/invalid date/)
    expect(() => new WarekiDate('明治', 5, 0, 1)).toThrow(/invalid date/)
    expect(() => new WarekiDate('天保', 1, 1, 40)).toThrow(/invalid date/)
    expect(() => new WarekiDate('令和', 2, 2, 30)).toThrow(/invalid date/)
    expect(() => new WarekiDate('令和', 2, 13, 1)).toThrow(/invalid date/)
    expect(() => new WarekiDate('西暦', 2000, 2, 30)).toThrow(/invalid date/)
    expect(() => new WarekiDate('紀元前', 203, 4, 31)).toThrow(/invalid date/)
    expect(() => new WarekiDate('元仁', 1, 6, 1, true)).toThrow(/invalid date/)
    expect(() => new WarekiDate('令和', 2, 5, 4, true)).toThrow(/invalid date/)
    expect(() => new WarekiDate('明治', 5, 12, 3)).toThrow(WarekiParseError) // 改暦による欠落日
  })

  it('rejects unknown era names', () => {
    expect(() => new WarekiDate('謎元号', 1)).toThrow(WarekiParseError)
  })
})

describe('WarekiDate.fromJd', () => {
  it.each(MATCHINGS)('jd %i -> %s%i年%i月%i日 (leap=%s)', (jd, era, eraYear, month, day, leap) => {
    const w = WarekiDate.fromJd(jd)
    expect(w.eraName).toBe(era)
    expect(w.eraYear).toBe(eraYear)
    expect(w.month).toBe(month)
    expect(w.day).toBe(day)
    expect(w.isLeapMonth).toBe(leap)
    expect(w.jd).toBe(jd)
  })

  it('handles era and calendar boundaries', () => {
    expect(WarekiDate.fromJd(2405159).inspect()).toBe('WarekiDate(明治5-12-2)') // 1872-12-31
    const meiji6 = WarekiDate.fromJd(2405160) // 1873-01-01 (グレゴリオ移行初日)
    expect([meiji6.eraName, meiji6.eraYear, meiji6.month, meiji6.day]).toEqual(['明治', 6, 1, 1])
    const b = WarekiDate.fromJd(1959964) // 654-02-05 (Gregorian)
    expect([b.eraName, b.eraYear, b.month, b.day]).toEqual(['白雉', 5, 1, 10])
    expect(WarekiDate.fromJd(2816788).eraName).toBe('令和') // 3000-01-01 は現行元号の継続とみなす
    expect(WarekiDate.fromJd(2816788).eraYear).toBe(982)
  })

  it('raises for unsupported ranges (Ruby date_spec より転記)', () => {
    expect(() => WarekiDate.fromJd(gregorianToJd(100, 1, 1))).toThrow(UnsupportedDateRangeError)
    expect(() => WarekiDate.fromJd(gregorianToJd(445, 1, 1))).toThrow(UnsupportedDateRangeError)
  })
})

describe('jd conversion (WarekiDate -> jd)', () => {
  it.each(MATCHINGS)('%s%i年%i月%i日 -> jd %i', (jd, era, eraYear, month, day, leap) => {
    expect(new WarekiDate(era, eraYear, month, day, leap).jd).toBe(jd)
  })

  it('accepts era-start leniency and valid edge dates', () => {
    expect(new WarekiDate('令和', 1, 1, 1).jd).toBe(2458485) // 2019-01-01 (実際は平成31年)
    expect(WarekiDate.fromJd(2458485).eraName).toBe('平成') // 逆変換は実際の元号
    expect(new WarekiDate('元仁', 1, 7, 1, true).jd).toBe(2168353) // = ユリウス暦 1224-08-17
  })

  it('defers out-of-table imperial years to jd conversion', () => {
    const d = WarekiDate.imperial(1)
    expect(() => d.jd).toThrow(UnsupportedDateRangeError)
  })

  it('rejects the 1582-10-05..14 gap for western eras', () => {
    expect(() => new WarekiDate('西暦', 1582, 10, 10).jd).toThrow(WarekiParseError)
    expect(new WarekiDate('西暦', 1582, 10, 4).jd).toBe(2299160)
    expect(new WarekiDate('西暦', 1582, 10, 15).jd).toBe(2299161)
  })
})

describe('toDate / toGregorianParts / toJulianParts', () => {
  it('returns local-midnight Date based on proleptic Gregorian', () => {
    const d = new WarekiDate('平成', 27, 8, 16).toDate()
    expect(ymd(d)).toBe('2015-8-16')
    expect([d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([0, 0, 0])
  })

  it('exposes both calendar representations for pre-reform dates', () => {
    const w = new WarekiDate('元仁', 1, 7, 1, true) // jd 2168353
    expect(w.toJulianParts()).toEqual({ year: 1224, month: 8, day: 17 }) // Ruby Date.new(1224,8,17)
    expect(w.toGregorianParts()).toEqual({ year: 1224, month: 8, day: 24 })
    expect(ymd(w.toDate())).toBe('1224-8-24') // JS Date は先発グレゴリオ暦
  })

  it('does not confuse years 0-99 with 1900s (setFullYear 経由)', () => {
    // ユリウス暦 45-01-02 (jd 1737496) は先発グレゴリオ暦では 44-12-31。
    // new Date(44, ...) 直呼びなら 1944 年に化けるところ
    expect(ymd(new WarekiDate('西暦', 45, 1, 2).toDate())).toBe('44-12-31')
  })
})

describe('fromDate / today', () => {
  it('uses local date parts by default and UTC with { utc: true }', () => {
    const local = new Date(2015, 7, 16, 23, 30)
    expect(WarekiDate.fromDate(local).isSameDay(new WarekiDate('平成', 27, 8, 16))).toBe(true)
    const utc = new Date(Date.UTC(2015, 7, 16, 12, 0))
    expect(WarekiDate.fromDate(utc, { utc: true }).isSameDay(new WarekiDate('平成', 27, 8, 16))).toBe(true)
  })

  it('today() equals fromDate(new Date())', () => {
    expect(WarekiDate.today().equals(WarekiDate.fromDate(new Date()))).toBe(true)
  })
})

describe('imperial', () => {
  it('creates dates with imperial year', () => {
    const d = WarekiDate.imperial(2670, 8, 3)
    expect(d.equals(new WarekiDate('皇紀', 2670, 8, 3))).toBe(true)
    expect(ymd(d.toDate())).toBe('2010-8-3')
    expect(d.imperialYear).toBe(2670)
    expect(new WarekiDate('平成', 27, 8, 16).imperialYear).toBe(2675)
  })
})

describe('equals / isSameDay (Ruby eql? / ===)', () => {
  it('compares by fields (equals) and by jd (isSameDay)', () => {
    const a = new WarekiDate('平成', 7, 11, 10)
    const b = WarekiDate.fromJd(2450032) // 1995-11-10
    expect(a.equals(b)).toBe(true)
    expect(a.isSameDay(b)).toBe(true)
    expect(a.equals(a.addDays(1))).toBe(false)
    expect(a.isSameDay(a.addDays(1))).toBe(false)
    // 皇紀2655年11月10日: 同じ日だがフィールドは違う
    const k = new WarekiDate('皇紀', 2655, 11, 10)
    expect(k.jd).toBe(a.jd)
    expect(a.isSameDay(k)).toBe(true)
    expect(a.equals(k)).toBe(false)
  })
})

describe('addDays / subDays (Ruby +/- の数値ケース)', () => {
  it('moves across month and year boundaries', () => {
    const w = new WarekiDate('平成', 7, 11, 10)
    expect(w.addDays(1).inspect()).toBe('WarekiDate(平成7-11-11)')
    expect(w.subDays(1).inspect()).toBe('WarekiDate(平成7-11-9)')
    expect(w.subDays(10).inspect()).toBe('WarekiDate(平成7-10-31)')
    expect(w.addDays(21).inspect()).toBe('WarekiDate(平成7-12-1)')
    expect(w.addDays(94).jd).toBe(w.jd + 94)
    expect(w.subDays(94).jd).toBe(w.jd - 94)
  })
})

describe('with (immutable 版 setter)', () => {
  it('derives new instances and leaves the original untouched', () => {
    const d = WarekiDate.fromJd(gregorianToJd(2025, 7, 12)) // 令和7年7月12日
    expect(ymd(d.with({ month: 1 }).toDate())).toBe('2025-1-12')
    expect(ymd(d.with({ month: 1, day: 3 }).toDate())).toBe('2025-1-3')
    expect(ymd(d.with({ eraYear: 5, month: 1, day: 3 }).toDate())).toBe('2023-1-3')
    expect(ymd(d.with({ eraName: '平成', eraYear: 5, month: 1, day: 3 }).toDate())).toBe('1993-1-3')
    expect(ymd(d.toDate())).toBe('2025-7-12') // 元は不変
  })

  it('throws on invalid combination without corrupting the source', () => {
    const d = new WarekiDate('元仁', 1, 7, 1)
    expect(d.with({ isLeapMonth: true }).jd).toBe(2168353) // 閏7月は実在する
    expect(() => d.with({ eraName: '謎元号' })).toThrow(WarekiParseError)
    expect(() => d.with({ month: 13 })).toThrow(/invalid date/)
    expect(d.jd).toBe(2168323) // 元仁元年7月1日 (非閏)。Ruby で検証済み
  })
})
