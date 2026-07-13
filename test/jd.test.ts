import { describe, expect, it } from 'vitest'
import { WarekiParseError } from '../src/errors.js'
import { gregorianToJd, italyToJd, jdToGregorian, jdToJulian, julianToJd } from '../src/jd.js'

// Ruby: Date.new(y, m, d, Date::GREGORIAN).jd
const GREGORIAN_PAIRS: Array<[number, number, number, number]> = [
  [1873, 1, 1, 2405160], // 明治改暦日 = GREGORIAN_START_JD
  [2019, 5, 1, 2458605], // 令和開始
  [1582, 10, 15, 2299161], // Date::ITALY の改暦日
  [2000, 1, 1, 2451545],
  [-660, 2, 11, 1480041], // 皇紀元年 = IMPERIAL_START_JD
  [1, 1, 1, 1721426],
  [645, 7, 20, 1956842], // 大化元年 (ユリウス暦 645-07-17 と同日)
]

// Ruby: Date.new(y, m, d, Date::JULIAN).jd
const JULIAN_PAIRS: Array<[number, number, number, number]> = [
  [1, 1, 1, 1721424], // 擬似元号「西暦」の開始 JD
  [1582, 10, 4, 2299160], // ユリウス暦最終日
  [1865, 10, 1, 2402523], // 慶應元年八月二十四日
  [645, 7, 17, 1956842],
  [-9876, 4, 2, -1886059], // 負の JD も Ruby と一致させる
]

describe('gregorianToJd / jdToGregorian', () => {
  it.each(GREGORIAN_PAIRS)('%i-%i-%i <-> jd %i', (y, m, d, jd) => {
    expect(gregorianToJd(y, m, d)).toBe(jd)
    expect(jdToGregorian(jd)).toEqual({ year: y, month: m, day: d })
  })

  it('round-trips every 1000 days across a wide range', () => {
    for (let jd = -2000000; jd <= 3000000; jd += 1000) {
      const g = jdToGregorian(jd)
      expect(gregorianToJd(g.year, g.month, g.day)).toBe(jd)
    }
  })
})

describe('julianToJd / jdToJulian', () => {
  it.each(JULIAN_PAIRS)('%i-%i-%i <-> jd %i', (y, m, d, jd) => {
    expect(julianToJd(y, m, d)).toBe(jd)
    expect(jdToJulian(jd)).toEqual({ year: y, month: m, day: d })
  })

  it('round-trips every 1000 days across a wide range', () => {
    for (let jd = -2000000; jd <= 3000000; jd += 1000) {
      const j = jdToJulian(jd)
      expect(julianToJd(j.year, j.month, j.day)).toBe(jd)
    }
  })
})

describe('italyToJd (Ruby Date::ITALY 相当)', () => {
  it('uses Gregorian from 1582-10-15 and Julian until 1582-10-04', () => {
    expect(italyToJd(1582, 10, 15)).toBe(2299161)
    expect(italyToJd(1582, 10, 4)).toBe(2299160)
    expect(italyToJd(1873, 1, 1)).toBe(2405160)
    expect(italyToJd(1865, 10, 13)).toBe(2402523) // グレゴリオ暦 1865-10-13 = ユリウス暦 1865-10-01
    expect(italyToJd(645, 7, 17)).toBe(1956842)
    expect(italyToJd(2, 12, 31)).toBe(1722153)
    expect(italyToJd(-203, 12, 31)).toBe(1647277)
  })

  it('rejects the nonexistent 1582-10-05..14 gap like Ruby Date.new', () => {
    for (const day of [5, 9, 14]) {
      expect(() => italyToJd(1582, 10, day)).toThrow(WarekiParseError)
    }
  })
})
