import { describe, expect, it } from 'vitest'
import {
  GREGORIAN_REFORM_JD, UnsupportedDateRangeError, VERSION, WarekiDate, WarekiInvalidDateError,
  WarekiParseError, format, normalizeTime, parse, parseToDate, toWarekiDate,
} from '../src/index.js'

const ymdhms = (d: Date): string => {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

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

describe('parseToDate with kansuji time (Ruby std_ext_spec Time.parse cases 転記)', () => {
  it.each<[string, string]>([
    ['平成元年五月四日十二時三十四分五十六秒', '1989-05-04 12:34:56'],
    ['平成元年5月4日 午後三時', '1989-05-04 15:00:00'],
    ['令和三年一月一日 零時五分', '2021-01-01 00:05:00'],
    ['㍻一〇年 肆月 晦日 正午', '1998-04-30 12:00:00'],
  ])('parseToDate(%s) -> %s (local)', (input, expected) => {
    expect(ymdhms(parseToDate(input))).toBe(expected)
  })

  it('sets local time when a wareki date is followed by kansuji time', () => {
    const d = parseToDate('平成元年五月四日十二時三十四分')
    expect(ymdhms(d)).toBe('1989-05-04 12:34:00')
  })

  it('rejects out-of-range kansuji times like their ascii equivalents (Ruby: ArgumentError)', () => {
    // 二十五時 -> 25:00 (hour>24), 十二時七十分 -> 12:70 (min>59)
    expect(() => parseToDate('平成元年5月4日 二十五時')).toThrow(WarekiParseError)
    expect(() => parseToDate('十二時七十分')).toThrow(WarekiParseError)
    // 12時34分 -> 12:34 だが日付が無く new Date('12:34') も Invalid のため throw
    // (Ruby: Date.parse('12時34分') -> ArgumentError)
    expect(() => parseToDate('12時34分')).toThrow(WarekiParseError)
  })
})

describe('parse / WarekiDate.parse ignore a trailing time (Ruby: Date.parse は日付のみ)', () => {
  it('returns the date only when a time notation follows', () => {
    expect(parse('平成三十一年四月三十日 午後十一時五十九分').format('%JF')).toBe('平成三十一年四月三十日')
    expect(WarekiDate.parse('平成元年五月四日 午後十一時五十九分').format('%JF')).toBe('平成元年五月四日')
  })
})

describe('format(Date, fmt) expands %JT then %J (Ruby std_ext_spec Time#strftime 転記)', () => {
  const t = new Date(2019, 4, 4, 13, 45, 6) // 令和元年五月四日 13:45:06 (local)

  it.each<[string, string]>([
    ['%JF %JTF', '令和元年五月四日 十三時四十五分六秒'],
    ['%JTf', '13時45分06秒'],
    ['%JTHk時%JTMk分', '十三時四十五分'],
    ['x%%JTF', 'x%JTF'], // 時刻展開なし→日付側 strftime が %%→% を畳む
    ['x%%JF', 'x%JF'],
  ])('format(Date, %s) -> %s', (fmt, expected) => {
    expect(format(t, fmt)).toBe(expected)
  })

  it('keeps %JT literal on WarekiDate input (Ruby: Date は時刻を持たない)', () => {
    expect(new WarekiDate('令和', 1, 5, 4).format('%JTF')).toBe('%JTF')
    expect(format(new WarekiDate('令和', 1, 5, 4), '%JTF')).toBe('%JTF')
  })

  it('expands %JT even for pre-era times but raises on %J date directives', () => {
    // Ruby: Time.new(100,1,2,3,4,5).strftime('%JTF') -> '三時四分五秒'; '%JF' -> UnsupportedDateRange
    const d = new Date(0)
    d.setFullYear(100, 0, 2)
    d.setHours(3, 4, 5, 0)
    expect(format(d, '%JTF')).toBe('三時四分五秒')
    expect(() => format(d, '%JF')).toThrow(UnsupportedDateRangeError)
  })
})

describe('normalizeTime is exported from index', () => {
  it('round-trips a kansuji time', () => {
    expect(normalizeTime('午後三時半')).toBe('15:30')
  })
})
