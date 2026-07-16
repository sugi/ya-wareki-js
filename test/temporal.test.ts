// 'temporal-polyfill' の既定 entrypoint は iso8601/gregory カレンダーのみ対応。
// このテストは japanese カレンダーの withCalendar 変換を検証するため /full を使う
// (型定義は両者とも temporal-spec を re-export しており同一)。
import { Temporal as TemporalPolyfill } from 'temporal-polyfill/full'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
