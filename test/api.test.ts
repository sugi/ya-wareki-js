import { describe, expect, it } from 'vitest'
import {
  GREGORIAN_REFORM_JD, UnsupportedDateRangeError, VERSION, WarekiDate, WarekiInvalidDateError,
  WarekiParseError, format, parse, parseToDate, toWarekiDate,
} from '../src/index.js'

describe('top-level API', () => {
  it('parse() delegates to WarekiDate.parse', () => {
    expect(parse('平成7年11月10日').equals(WarekiDate.parse('平成7年11月10日'))).toBe(true)
    expect(parse('平成４年').toDate().getTime()).toBe(parseToDate('平成４年').getTime())
  })

  it('toWarekiDate() converts a JS Date', () => {
    const w = toWarekiDate(new Date(2015, 7, 16))
    expect([w.eraName, w.eraYear, w.month, w.day]).toEqual(['平成', 27, 8, 16])
  })

  it('format() accepts both Date and WarekiDate', () => {
    expect(format(new Date(2019, 4, 4))).toBe('令和元年五月四日')
    expect(format(new WarekiDate('天和', 3, 5, 4, true), '%Jf')).toBe("天和03年05'月04日")
  })

  it('exposes constants', () => {
    expect(GREGORIAN_REFORM_JD).toBe(2405160)
    expect(VERSION).toBe('0.1.0')
  })
})

describe('parseToDate (Ruby wareki_spec より転記)', () => {
  it('falls back to native Date parsing for non-wareki strings', () => {
    const d = parseToDate('2018-01-02')
    expect(d).toBeInstanceOf(Date)
    expect(d.toISOString().startsWith('2018-01-02')).toBe(true)
  })

  it('returns a Date for weird-but-parseable input (Ruby の Date.parse("10") 相当)', () => {
    // V8 は '10' を 2001-10-01 として解釈する。Ruby 同様「変だが Date は返る」ことだけ確認
    const d = parseToDate('10')
    expect(d).toBeInstanceOf(Date)
    expect(Number.isNaN(d.getTime())).toBe(false)
  })

  it('raises on unsupported wareki range without usable fallback', () => {
    // Ruby はフォールバックの Date.parse が ArgumentError を出す。こちらは
    // フォールバック不能時に元のエラーを再 throw する (エラークラス差は意図的差異3)
    expect(() => parseToDate('皇紀1年')).toThrow(UnsupportedDateRangeError)
  })

  it('raises on nonexistent wareki dates without stdlib fallback', () => {
    expect(() => parseToDate('天保1年2月30日')).toThrow(WarekiParseError)
    expect(() => parseToDate('天保1年2月30日')).toThrow(WarekiInvalidDateError)
  })

  it('never falls back for a recognized-but-invalid date, even when a stdlib-parseable tail follows (Ruby: rescue InvalidDate; raise)', () => {
    // 平成五年二月三十日は和暦としては認識できるが存在しない日付 (InvalidDate 相当)。
    // 末尾の "2020-01-02" は new Date() でパース可能だが、Ruby と同様フォールバックしない。
    expect(() => parseToDate('平成五年二月三十日 2020-01-02')).toThrow(WarekiInvalidDateError)
  })

  it('WarekiInvalidDateError is a WarekiParseError (Ruby: InvalidDate < ArgumentError)', () => {
    expect(new WarekiInvalidDateError('x')).toBeInstanceOf(WarekiParseError)
    try {
      parseToDate('平成五年二月三十日')
      throw new Error('unreachable')
    } catch (e) {
      expect(e).toBeInstanceOf(WarekiInvalidDateError)
      expect(e).toBeInstanceOf(WarekiParseError)
    }
  })

  it('still falls back for plain unparseable wareki syntax (ArgumentError, not InvalidDate)', () => {
    expect(parseToDate('2020-01-02').toISOString().startsWith('2020-01-02')).toBe(true)
    expect(() => parseToDate('全く日付でない')).toThrow(WarekiParseError)
    expect(() => parseToDate('全く日付でない')).not.toThrow(WarekiInvalidDateError)
  })
})
