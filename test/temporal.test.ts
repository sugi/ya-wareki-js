// 'temporal-polyfill' の既定 entrypoint は iso8601/gregory カレンダーのみ対応。
// このテストは japanese カレンダーの withCalendar 変換を検証するため /full を使う
// (型定義は両者とも temporal-spec を re-export しており同一)。
import { Temporal as TemporalPolyfill } from 'temporal-polyfill/full'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UnsupportedDateRangeError, WarekiDate, format, toWarekiDate } from '../src/index.js'
import {
  getTemporalNamespace,
  isTemporalDateLike,
  type TemporalDateLike,
  temporalTimeParts,
  temporalToIsoParts,
} from '../src/temporal.js'

// polyfill を必須プロバイダ、native (globalThis.Temporal 存在時 = Node 26+) を
// 追加プロバイダとして同一スイートを流す。native は polyfill と型非互換のため cast。
type TemporalNS = typeof TemporalPolyfill
export const providers: Array<[string, TemporalNS]> = [['polyfill', TemporalPolyfill]]
if (globalThis.Temporal) providers.push(['native', globalThis.Temporal as unknown as TemporalNS])

afterEach(() => {
  vi.unstubAllGlobals()
})

describe.each(providers)('temporal helpers (%s)', (_name, T) => {
  describe('isTemporalDateLike', () => {
    it('accepts PlainDate / PlainDateTime / ZonedDateTime', () => {
      expect(isTemporalDateLike(T.PlainDate.from('2019-05-04'))).toBe(true)
      expect(isTemporalDateLike(T.PlainDateTime.from('2019-05-04T12:34:56'))).toBe(true)
      expect(
        isTemporalDateLike(T.ZonedDateTime.from('2019-05-04T12:34:56+09:00[Asia/Tokyo]')),
      ).toBe(true)
    })

    it('rejects PlainYearMonth / PlainMonthDay (day / year を欠く)', () => {
      expect(isTemporalDateLike(T.PlainYearMonth.from('2019-05'))).toBe(false)
      expect(isTemporalDateLike(T.PlainMonthDay.from('05-04'))).toBe(false)
    })
  })

  describe('temporalToIsoParts', () => {
    it('returns fields as-is for iso8601 calendar', () => {
      expect(temporalToIsoParts(T.PlainDate.from('2019-05-04'))).toEqual({
        year: 2019,
        month: 5,
        day: 4,
      })
    })

    it('converts non-ISO calendar via withCalendar', () => {
      const jp = T.PlainDate.from('2019-05-04').withCalendar('japanese')
      // Temporal 仕様上 japanese カレンダーの year は ISO 相当のまま (2019) で、
      // era 年 (令和1) は eraYear が持つ。ISO へ戻して読めていることの確認
      expect(jp.eraYear).toBe(1)
      expect(temporalToIsoParts(jp)).toEqual({ year: 2019, month: 5, day: 4 })
    })
  })

  describe('temporalTimeParts', () => {
    it('extracts wall-clock time from PlainDateTime / ZonedDateTime', () => {
      expect(temporalTimeParts(T.PlainDateTime.from('2019-05-04T12:34:56'))).toEqual({
        hour: 12,
        minute: 34,
        second: 56,
      })
      expect(
        temporalTimeParts(T.ZonedDateTime.from('2019-05-04T01:02:03+09:00[Asia/Tokyo]')),
      ).toEqual({ hour: 1, minute: 2, second: 3 })
    })

    it('returns undefined for PlainDate', () => {
      expect(temporalTimeParts(T.PlainDate.from('2019-05-04'))).toBeUndefined()
    })
  })
})

describe('isTemporalDateLike (non-temporal values)', () => {
  it('rejects non-temporal values', () => {
    expect(isTemporalDateLike(null)).toBe(false)
    expect(isTemporalDateLike(undefined)).toBe(false)
    expect(isTemporalDateLike(42)).toBe(false)
    expect(isTemporalDateLike('2019-05-04')).toBe(false)
    expect(isTemporalDateLike({})).toBe(false)
    expect(isTemporalDateLike(new Date())).toBe(false)
  })

  it('accepts a structurally matching plain object (duck-typing)', () => {
    const duck = {
      calendarId: 'iso8601',
      year: 2019,
      month: 5,
      day: 4,
      withCalendar() {
        return this
      },
    }
    expect(isTemporalDateLike(duck)).toBe(true)
  })
})

describe('temporalToIsoParts (broken input)', () => {
  it('throws TypeError when withCalendar returns garbage', () => {
    // NaN は型上は number なので TemporalDateLike を満たす。実行時検証が仕事をするかの確認
    const inner: TemporalDateLike = {
      calendarId: 'iso8601',
      year: Number.NaN,
      month: 5,
      day: 4,
      withCalendar() {
        return this
      },
    }
    const broken: TemporalDateLike = {
      calendarId: 'japanese',
      year: 1,
      month: 5,
      day: 4,
      withCalendar() {
        return inner
      },
    }
    expect(() => temporalToIsoParts(broken)).toThrow(TypeError)
  })

  it('throws TypeError for non-existent ISO dates from duck-typed objects', () => {
    const duck = (year: number, month: number, day: number): TemporalDateLike => ({
      calendarId: 'iso8601',
      year,
      month,
      day,
      withCalendar() {
        return this
      },
    })
    expect(() => temporalToIsoParts(duck(2019, 13, 1))).toThrow(TypeError)
    expect(() => temporalToIsoParts(duck(2019, 2, 30))).toThrow(TypeError)
    expect(() => temporalToIsoParts(duck(2019, 0, 1))).toThrow(TypeError)
    expect(() => temporalToIsoParts(duck(2019, 1, 0))).toThrow(TypeError)
    // 正常系は通ることも確認 (閏日)
    expect(temporalToIsoParts(duck(2020, 2, 29))).toEqual({ year: 2020, month: 2, day: 29 })
  })
})

describe('getTemporalNamespace', () => {
  it('throws a helpful Error when globalThis.Temporal is missing', () => {
    vi.stubGlobal('Temporal', undefined)
    expect(() => getTemporalNamespace()).toThrow(/Temporal is not available/)
    expect(() => getTemporalNamespace()).toThrow(/toGregorianParts/)
  })

  it('returns the namespace when present', () => {
    vi.stubGlobal('Temporal', TemporalPolyfill)
    expect(getTemporalNamespace()).toBe(TemporalPolyfill)
  })
})

describe.each(providers)('WarekiDate Temporal interop (%s)', (_name, T) => {
  describe('fromTemporal', () => {
    it('converts PlainDate (Gregorian era)', () => {
      const w = WarekiDate.fromTemporal(T.PlainDate.from('2019-05-04'))
      expect(w.eraName).toBe('令和')
      expect(w.eraYear).toBe(1)
      expect(w.month).toBe(5)
      expect(w.day).toBe(4)
    })

    it('converts PlainDate (旧暦・閏月)', () => {
      // README の既知ゴールデン: 1683-06-28 (グレゴリオ) = 天和三年閏五月四日
      const w = WarekiDate.fromTemporal(T.PlainDate.from('1683-06-28'))
      expect(w.format('%JF')).toBe('天和三年閏五月四日')
      expect(w.isLeapMonth).toBe(true)
    })

    it('converts non-ISO calendar input via ISO fields', () => {
      const jp = T.PlainDate.from('2019-05-04').withCalendar('japanese')
      expect(WarekiDate.fromTemporal(jp).format('%JF')).toBe('令和元年五月四日')
    })

    it('converts PlainDateTime (日付部分のみ使用)', () => {
      const w = WarekiDate.fromTemporal(T.PlainDateTime.from('1989-01-08T12:34:56'))
      expect(w.eraName).toBe('平成')
      expect(w.eraYear).toBe(1)
    })

    it('converts ZonedDateTime using its wall-clock date', () => {
      // UTC 2019-04-30T20:00 = Asia/Tokyo 2019-05-01T05:00 → 改元当日 (令和元年)
      const zdt = T.Instant.from('2019-04-30T20:00:00Z').toZonedDateTimeISO('Asia/Tokyo')
      const w = WarekiDate.fromTemporal(zdt)
      expect(w.eraName).toBe('令和')
      expect(w.eraYear).toBe(1)
      expect(w.month).toBe(5)
      expect(w.day).toBe(1)
    })

    it('throws UnsupportedDateRangeError for dates before the era table (< 645)', () => {
      expect(() => WarekiDate.fromTemporal(T.PlainDate.from('0400-01-01'))).toThrow(
        UnsupportedDateRangeError,
      )
    })

    it('throws TypeError for non-temporal values', () => {
      // @ts-expect-error 実行時型チェックの検証
      expect(() => WarekiDate.fromTemporal(new Date())).toThrow(TypeError)
      // @ts-expect-error 実行時型チェックの検証
      expect(() => WarekiDate.fromTemporal({})).toThrow(TypeError)
      // @ts-expect-error 実行時型チェックの検証
      expect(() => WarekiDate.fromTemporal(null)).toThrow(TypeError)
    })
  })

  describe('toPlainDate', () => {
    it('creates an ISO PlainDate via globalThis.Temporal', () => {
      vi.stubGlobal('Temporal', T)
      const pd = new WarekiDate('明治', 8, 2, 1).toPlainDate()
      expect(String(pd)).toBe('1875-02-01')
    })

    it('matches toGregorianParts for pre-reform lunisolar dates', () => {
      vi.stubGlobal('Temporal', T)
      const w = WarekiDate.parse('天和3年閏5月4日')
      const pd = w.toPlainDate()
      const parts = w.toGregorianParts()
      expect(String(pd)).toBe('1683-06-28')
      expect({ year: pd.year, month: pd.month, day: pd.day }).toEqual(parts)
    })

    it('handles 紀元前 (negative/zero ISO years)', () => {
      vi.stubGlobal('Temporal', T)
      const w = new WarekiDate('紀元前', 1, 1, 1)
      const pd = w.toPlainDate()
      expect({ year: pd.year, month: pd.month, day: pd.day }).toEqual(w.toGregorianParts())
      expect(pd.year).toBeLessThanOrEqual(0)
    })

    it('round-trips through fromTemporal', () => {
      vi.stubGlobal('Temporal', T)
      for (const s of ['令和元年五月四日', '天和三年閏五月四日', '明治五年十二月二日']) {
        const w = WarekiDate.parse(s)
        expect(WarekiDate.fromTemporal(w.toPlainDate()).isSameDay(w)).toBe(true)
        expect(WarekiDate.fromTemporal(w.toPlainDate()).format('%JF')).toBe(s)
      }
    })

    it('throws when globalThis.Temporal is missing', () => {
      vi.stubGlobal('Temporal', undefined)
      expect(() => new WarekiDate('令和', 1, 5, 4).toPlainDate()).toThrow(
        /Temporal is not available/,
      )
    })

    it('propagates RangeError for dates beyond the PlainDate range (±271821年)', () => {
      vi.stubGlobal('Temporal', T)
      expect(() => new WarekiDate('西暦', 300000, 1, 1).toPlainDate()).toThrow(RangeError)
    })
  })
})

describe.each(providers)('top-level API Temporal interop (%s)', (_name, T) => {
  describe('toWarekiDate', () => {
    it('accepts Temporal objects', () => {
      expect(toWarekiDate(T.PlainDate.from('2019-05-04')).format('%JF')).toBe('令和元年五月四日')
    })

    it('still accepts Date', () => {
      expect(toWarekiDate(new Date(2019, 4, 4)).format('%JF')).toBe('令和元年五月四日')
    })
  })

  describe('format', () => {
    it('formats PlainDate with default and explicit formats', () => {
      expect(format(T.PlainDate.from('2019-05-04'))).toBe('令和元年五月四日')
      expect(format(T.PlainDate.from('2019-05-04'), '%Jf')).toBe('令和01年05月04日')
    })

    it('expands %JT time directives from PlainDateTime', () => {
      expect(format(T.PlainDateTime.from('1989-01-08T12:34:56'), '%Jf %JTHk時%JTMk分')).toBe(
        '平成01年01月08日 十二時三十四分',
      )
    })

    it('expands %JT time directives from ZonedDateTime wall-clock', () => {
      const zdt = T.Instant.from('2019-04-30T20:00:00Z').toZonedDateTimeISO('Asia/Tokyo')
      expect(format(zdt, '%JF %JTHk時')).toBe('令和元年五月一日 五時')
    })

    it('leaves %JT literal for PlainDate (時刻を持たない)', () => {
      expect(format(T.PlainDate.from('2019-05-04'), '%JTHk時')).toBe('%JTHk時')
    })

    it('skips era conversion when no %J date directive is present', () => {
      // era テーブル外 (645 年より前) でも std ディレクティブだけなら変換を経由せず成功する
      expect(format(T.PlainDate.from('0400-01-02'), '%F')).toBe('0400-01-02')
      expect(format(T.PlainDate.from('0400-01-02'), '%Y-%m-%d')).toBe('0400-01-02')
    })

    it('throws UnsupportedDateRangeError when %J directive needs an era out of range', () => {
      expect(() => format(T.PlainDate.from('0400-01-02'), '%JF')).toThrow(
        UnsupportedDateRangeError,
      )
    })
  })
})

describe('format / toWarekiDate rejects non-supported values', () => {
  it('format throws TypeError (旧: RangeError) for plain objects', () => {
    // @ts-expect-error 実行時型チェックの検証
    expect(() => format({})).toThrow(TypeError)
    // @ts-expect-error 実行時型チェックの検証
    expect(() => format(42)).toThrow(TypeError)
  })

  it('format still throws RangeError for invalid Date', () => {
    expect(() => format(new Date(Number.NaN))).toThrow(RangeError)
  })

  it('toWarekiDate throws TypeError for plain objects', () => {
    // @ts-expect-error 実行時型チェックの検証
    expect(() => toWarekiDate({})).toThrow(TypeError)
    // @ts-expect-error 実行時型チェックの検証
    expect(() => toWarekiDate({})).toThrow(/toWarekiDate\(\) expects/)
  })
})
