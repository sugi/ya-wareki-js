import { describe, expect, it } from 'vitest'
import { WarekiParseError } from '../src/errors.js'
import { parseFields } from '../src/parse.js'
import { WarekiDate } from '../src/wareki-date.js'

const ymd = (d: Date): string => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`

describe('WarekiDate.parse -> toDate (1582年以降・グレゴリオ域)', () => {
  it.each<[string, string]>([
    ['平成27年１２月八日', '2015-12-8'],
    ['安政 ７年 ３月 １７日', '1860-4-7'],
    ['平成元年元日', '1989-1-1'],
    ['平成12年十二月晦日', '2000-12-31'],
    ['平成12年2月晦日', '2000-2-29'],
    ['平成13年2月晦日', '2001-2-28'],
    ['令和元年5月2日', '2019-5-2'],
    ['令和元年1月1日', '2019-1-1'],
    ['明治5年12月2日', '1872-12-31'],
    ['西暦2000年2月晦日', '2000-2-29'],
  ])('parses %s to %s', (str, expected) => {
    expect(ymd(WarekiDate.parse(str).toDate())).toBe(expected)
  })
})

describe('WarekiDate.parse -> jd (Ruby date_spec の全パースケース転記)', () => {
  it.each<[string, number]>([
    ['安政七年　\t 弥生卅日', 2400521], // Date.new(1860,4,20)
    ['元仁元年閏七月朔日', 2168353], // Date.new(1224,8,17)
    ['元仁元年 うるう ７月１日', 2168353],
    ['元仁二年　元日', 2168529], // Date.new(1225,2,9)
    ['寿永三年 五月 晦日', 2153704], // Date.new(1184,7,9)
    ['慶應元年八月二十四日', 2402523], // Date.new(1865,10,1,JULIAN)
    ['応徳元年九月二十九日', 2117293], // Date.new(1084,10,31)
    ['応德元年九月二十九日', 2117293],
    ['應徳元年九月二十九日', 2117293],
    ['應德元年九月二十九日', 2117293],
    ['10年5月3日', 1724833], // Date.new(10,5,3)
    ['321年', 1838304], // Date.new(321,1,1)
    ['2年12月31日', 1722153], // Date.new(2,12,31)
    ['西暦10年5月3日', 1724833],
    ['西暦321年', 1838304],
    ['西暦2年12月31日', 1722153],
    ['紀元前203年12月31日', 1647277], // Date.new(-203,12,31)
    ['紀元前4年7月', 1719779], // Date.new(-4,7,1)
    ['紀元前9876年4月2日', -1886059], // Date.new(-9876,4,2)
    ['紀元前1年12月晦日', 1721057], // Date.new(-1,12,31)
    ['㍻一〇年 肆月 晦日', 2450934], // Date.new(1998,4,30) — Ruby README の例
    ['萬延三年 ５月 廿一日', 2401310], // Date.new(1862,6,18) — 元号年超過の受容
    ['皇紀二千皕卌年', 2298169], // Date.new(1580,1,17)
    ['正嘉元年 うるう3月 １２日', 2180294], // Date.new(1257,4,27)
    ['　1928 年 3 月　１１ 日  ', 2425317], // Date.new(1928,3,11) — 空白除去
    ['\t\n　1 9 2 8 年 3 月　１１ 日  ', 2425317],
  ])('parses %s to jd %i', (str, jd) => {
    expect(WarekiDate.parse(str).jd).toBe(jd)
  })

  it('parses alt month names defaulting day to 1', () => {
    expect(WarekiDate.parse('安政七年 弥生').jd).toBe(WarekiDate.parse('安政7年3月1日').jd)
  })
})

describe('era-less strings default to the current year (Ruby: Date.today.year)', () => {
  it.each(['8月22日', '2月25日', '10月2日', '3月8日', '1月3日'])('parses %s', (str) => {
    const w = WarekiDate.parse(str)
    expect(w.year).toBe(new Date().getFullYear())
    expect(w.eraName).toBe('')
  })
})

describe('晦日 resolution for any era notation (Ruby date_spec より転記)', () => {
  it('resolves last day consistently', () => {
    expect(WarekiDate.parse('皇紀2532年10月晦日').day).toBe(30)
    expect(WarekiDate.parse('明治5年10月晦日').day).toBe(30)
    expect(WarekiDate.parse('12月晦日').day).toBe(31)
  })
})

describe('leap month notations', () => {
  it("accepts 閏/うるう/5'月/5’月", () => {
    expect(WarekiDate.parse("天和3年5'月4日").isLeapMonth).toBe(true)
    expect(WarekiDate.parse('天和3年5’月4日').isLeapMonth).toBe(true)
    expect(WarekiDate.parse('天和3年5月4日').isLeapMonth).toBe(false)
    expect(WarekiDate.parse('天和三年閏五月四日').jd).toBe(2335942)
  })
})

describe('era name variants', () => {
  it('parses square era chars into canonical fields', () => {
    for (const [sq, canon] of [['㍾', '明治'], ['㍽', '大正'], ['㍼', '昭和'], ['㍻', '平成']]) {
      const w = WarekiDate.parse(`${sq}十年３月9日`)
      expect(w.eraName).toBe(sq) // Ruby も表記のまま保持する (era_year_to_civil が解決)
      expect(w.year).toBe(eraStartYear(canon as string) + 9)
      expect([w.month, w.day]).toEqual([3, 9])
    }
    function eraStartYear(name: string): number {
      return { 明治: 1868, 大正: 1912, 昭和: 1926, 平成: 1989 }[name] as number
    }
  })

  it('parses U+F9A8 令 variant', () => {
    // リテラルで書くと NFC 正規化で通常の令に潰れて無意味なテストになるため
    // 必ず \u エスケープで書く
    expect(WarekiDate.parse('\uF9A8和3年5月4日').jd).toBe(WarekiDate.parse('令和3年5月4日').jd)
  })

  it('still accepts northern court era names on parse (utils_spec より転記)', () => {
    expect(WarekiDate.parse('暦応3年1月1日').eraName).toBe('暦応')
    expect(WarekiDate.parse('正慶2年1月1日').eraName).toBe('正慶')
  })
})

describe('parse errors (Ruby date_spec より転記)', () => {
  it.each([
    '謎元号100年2月3日',
    '昭和2月3日', // 元号ありで年なし
    '昭和0年2月3日', // 年 <= 0
    '平成12年30月3日',
    '平成12年0月3日',
    '明治5年12月12日', // 改暦で存在しない日
    '明治5年12月3日',
    '明治5年12月31日',
    '㍾5年12月3日',
    '皇紀2532年12月5日',
    '天保1年1月40日',
    '', // 空文字列
    '2018-01-02', // 和暦要素なし → パーサとしては失敗 (トップレベル parseToDate がフォールバックを担う)
  ])('rejects %s', (str) => {
    expect(() => WarekiDate.parse(str)).toThrow(WarekiParseError)
  })
})

describe('parseFields (低レベル API)', () => {
  it('returns raw fields', () => {
    expect(parseFields('元仁元年閏七月朔日')).toEqual({ era: '元仁', year: 1, month: 7, day: 1, isLeap: true })
    expect(parseFields('㍾5年12月2日')).toEqual({ era: '㍾', year: 5, month: 12, day: 2, isLeap: false })
    expect(parseFields('321年')).toEqual({ era: '', year: 321, month: 1, day: 1, isLeap: false })
    expect(parseFields('平成元年元旦')).toEqual({ era: '平成', year: 1, month: 1, day: 1, isLeap: false })
  })
})
