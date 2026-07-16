import { describe, expect, it } from 'vitest'
import { format, toWarekiDate } from '../src/index.js'
import { gregorianToJd } from '../src/jd.js'
import { WarekiDate } from '../src/wareki-date.js'

describe('format (Ruby date_spec「can be formatted in string」転記)', () => {
  const d = new WarekiDate('天和', 3, 5, 4, true)

  it.each<[string, string]>([
    ['%JF', '天和三年閏五月四日'],
    ['%Jf', "天和03年05'月04日"],
    ['%Jo %JO %JOk', '1683 １６８３ 千六百八十三'],
    ['%Ji %JI %JIk', '2343 ２３４３ 二千三百四十三'],
    ['%Jd %JD %JDk', '04 ４ 四'],
    ['%Jm %JM %JMk', "05' 閏５ 閏五"],
    ['%Jy %JY %JYk', '天和03 天和３ 天和三'],
    ['1桁: %J1f', "1桁: 天和3年5'月4日"],
    ['1桁: %J1y %J1m %J1d', "1桁: 天和3 5' 4"],
    ['1桁: %J1g %J1s', '1桁: 3 5'],
    ['空白2桁: %J_2f', "空白2桁: 天和 3年 5'月 4日"],
    ['空白2桁: %J_2y %J_2m %J_2d', "空白2桁: 天和 3  5'  4"],
    ['空白2桁: %J_2g %J_2s', '空白2桁:  3  5'],
    ['0埋3桁: %J03f', "0埋3桁: 天和003年005'月004日"],
    ['0埋3桁: %J03y %J03m %J03d', "0埋3桁: 天和003 005' 004"],
    ['0埋3桁: %J03g %J03s', '0埋3桁: 003 005'],
    ['0埋4桁: %J4f', "0埋4桁: 天和0003年0005'月0004日"],
    ['0埋4桁: %J4y %J4m %J4d', "0埋4桁: 天和0003 0005' 0004"],
    ['0埋4桁: %J4g %J4s', '0埋4桁: 0003 0005'],
    ['皇紀で%Ji年%Jm月%Jd日', "皇紀で2343年05'月04日"],
    ['%JYk年　%JSK', '天和三年　皐月'],
    ['西暦だと%Y年%m月%d日', '西暦だと1683年06月28日'],
    ['未定義なやつはそのまま %JeK', '未定義なやつはそのまま %JeK'],
    ['特殊表記が無ければ普通に漢字: %Je%JGK年%JSK%JDK日', '特殊表記が無ければ普通に漢字: 天和三年皐月四日'],
  ])('format(%s) -> %s', (fmt, expected) => {
    expect(d.format(fmt)).toBe(expected)
  })

  it('defaults to %JF', () => {
    expect(d.format()).toBe('天和三年閏五月四日')
  })

  it('handles 晦/朔/元 special day notations', () => {
    expect(WarekiDate.parse('寿永三年 五月 晦日').format('%Jd日')).toBe('30日')
    expect(WarekiDate.parse('寿永2年 3月 晦日').format('%Jd日')).toBe('29日')
    expect(new WarekiDate('寿永', 2, 3, 29).format('%JDK日')).toBe('晦日')
    expect(new WarekiDate('寿永', 1, 2, 1).format('%JYK年%Jm月%JDK日')).toBe('寿永元年02月朔日')
    expect(new WarekiDate('寿永', 1, 1, 1).format('%JYK年%JM%JL月%JDK日')).toBe('寿永元年１月元日')
  })
})

describe('%% escape handling (Ruby date_spec「honors %% escapes」転記)', () => {
  const d = new WarekiDate('天和', 3, 5, 4, true)

  it.each<[string, string]>([
    ['x%%JF', 'x%JF'],
    ['%%%JF', '%天和三年閏五月四日'],
    ['rate: 100%% %JF', 'rate: 100% 天和三年閏五月四日'],
    ['%%%%JF', '%%JF'],
    ['%%%%%JF', '%%天和三年閏五月四日'],
  ])('format(%s) -> %s', (fmt, expected) => {
    expect(d.format(fmt)).toBe(expected)
  })
})

describe('number format flags (Ruby と Date#strftime の具体値で照合済み)', () => {
  const w = new WarekiDate('令和', 1, 5, 4)

  it.each<[string, string]>([
    ['%Jm %Jd', '05 04'],
    ['%J-m %J-d', '5 4'],
    ['%J_m %J_d', ' 5  4'],
    ['%J_2m %J_2d', ' 5  4'],
    ['%J03m %J03d', '005 004'],
    ['%J4m %J4d', '0005 0004'],
    ['%J0_5m %J0_5d', '    5     4'],
    ['%J_06m %J_06d', '000005 000004'],
    ['%J0m %J0d', '05 04'],
    ['%J0_m %J0_d', ' 5  4'],
    ['%J_0m %J_0d', '05 04'],
  ])('format(%s) -> %s', (fmt, expected) => {
    expect(w.format(fmt)).toBe(expected)
  })
})

describe('standard strftime subset (%Y %y %m %d %e %j %F %%)', () => {
  it('renders ITALY-calendar parts like Ruby Date#strftime', () => {
    const reiwa = new WarekiDate('令和', 1, 5, 4) // 2019-05-04
    expect(reiwa.format('%Y-%m-%d')).toBe('2019-05-04')
    expect(reiwa.format('%F')).toBe('2019-05-04')
    expect(reiwa.format('%y')).toBe('19')
    expect(reiwa.format('%e')).toBe(' 4')
    expect(reiwa.format('%j')).toBe('124')
    expect(reiwa.format('100%%')).toBe('100%') // Ruby: strftime("100%%") -> "100%"
    const seireki2 = new WarekiDate('西暦', 2, 1, 1)
    expect(seireki2.format('%Y|%y|%m|%d|%e|%j|%F')).toBe('0002|02|01|01| 1|001|0002-01-01')
    const bc = new WarekiDate('紀元前', 203, 12, 31)
    expect(bc.format('%Y|%y|%F|%j')).toBe('-0203|97|-0203-12-31|365')
    const tenna = new WarekiDate('天和', 3, 5, 4, true) // ユリウス日 2335942 = 1683-06-28
    expect(tenna.format('%Y|%j|%e')).toBe('1683|179|28')
  })

  it('passes through unimplemented % codes unchanged (意図的差異5)', () => {
    const w = new WarekiDate('令和', 1, 5, 4)
    expect(w.format('%H:%M:%S')).toBe('%H:%M:%S')
    expect(w.format('%A %a %B')).toBe('%A %a %B')
  })
})

describe('era last days / year last days (Ruby date_spec より転記)', () => {
  it.each<[number, number, number, string]>([
    [1989, 1, 7, '昭和六十四年一月七日'],
    [1912, 7, 29, '明治四十五年七月二十九日'],
    [1926, 12, 24, '大正十五年十二月二十四日'],
    [1868, 1, 24, '慶応三年十二月三十日'],
  ])('%i-%i-%i -> %s', (y, m, day, expected) => {
    expect(WarekiDate.fromJd(gregorianToJd(y, m, day)).format('%JF')).toBe(expected)
  })

  it('formats a leap month from a plain date (Ruby README の例)', () => {
    expect(WarekiDate.fromJd(2200101).format('%JF')).toBe('応長元年閏六月四日') // 1311-07-20
  })
})

describe('short era names format back to canonical (Ruby date_spec より転記)', () => {
  it.each<[string, string]>([
    ['㍾', '明治'],
    ['㍽', '大正'],
    ['㍼', '昭和'],
    ['㍻', '平成'],
  ])('%s十年３月9日 -> %s10年03月09日', (sq, canon) => {
    // 注: パース結果の eraName は '㍾' のまま。%Je はそれを出すため、Ruby の
    // Date#strftime 経由テストと同じ出力を得るには正規化した元号名で作り直す。
    const w = WarekiDate.parse(`${sq}十年３月9日`)
    expect(WarekiDate.fromJd(w.jd).format('%Jf')).toBe(`${canon}10年03月09日`)
  })
})

describe('%JDK for pre-1873 western dates (Ruby date_spec より転記)', () => {
  it('formats 晦 and kanji days', () => {
    expect(new WarekiDate('西暦', 300, 5, 15).format('%JDK')).toBe('十五')
    expect(new WarekiDate('西暦', 300, 5, 31).format('%JDK')).toBe('晦')
    expect(new WarekiDate('紀元前', 203, 12, 31).format('%JDK')).toBe('晦')
  })
})

describe('round trip: parse own strftime output (Ruby date_spec より転記)', () => {
  it('re-parses %Jf leap-month output', () => {
    const d = new WarekiDate('天和', 3, 5, 4, true)
    expect(WarekiDate.parse(d.format('%Jf')).jd).toBe(d.jd)
  })
})

describe('kanji getters (設計ドキュメントのテンプレートリテラル用 API)', () => {
  it('exposes %J codes as getters', () => {
    const d = new WarekiDate('天和', 3, 5, 4, true)
    expect(d.eraYearKanji).toBe('三') // %JGk
    expect(d.eraYearKanjiSpecial).toBe('三') // %JGK (元年なら 元)
    expect(new WarekiDate('令和', 1, 5, 4).eraYearKanjiSpecial).toBe('元')
    expect(d.yearKanji).toBe('千六百八十三') // %JOk
    expect(d.monthKanji).toBe('五') // %JSk
    expect(d.monthAltName).toBe('皐月') // %JSK
    expect(d.dayKanji).toBe('四') // %JDk
    expect(d.leapMonthMark).toBe('閏') // %JLk
    expect(new WarekiDate('令和', 1, 5, 4).leapMonthMark).toBe('')
  })
})

describe('Date-path format: %j for years 0-99 and Invalid Date guard (F-06 / F-07)', () => {
  const atYear = (y: number, m: number, d: number): Date => {
    const date = new Date(2000, 0, 1)
    date.setFullYear(y, m - 1, d)
    date.setHours(0, 0, 0, 0)
    return date
  }

  it('computes %j from proleptic Gregorian, not Date.UTC 1900s aliasing (F-06)', () => {
    // 西暦0年は先発グレゴリオ暦で閏年 (Date.UTC が化ける 1900 は平年)。3月以降が1日ずれていた。
    expect(format(atYear(0, 3, 1), '%Y-%m-%d %j')).toBe('0000-03-01 061')
    expect(format(atYear(0, 1, 1), '%j')).toBe('001')
    expect(format(atYear(0, 12, 31), '%j')).toBe('366')
    expect(format(atYear(99, 3, 1), '%j')).toBe('060') // 99 は平年
  })

  it('rejects Invalid Date at the Date-accepting entry points (F-07)', () => {
    expect(() => format(new Date(NaN), '%Y-%m-%d')).toThrow(RangeError)
    expect(() => format(new Date(NaN), '%JTf')).toThrow(RangeError)
    expect(() => format(new Date(NaN))).toThrow(RangeError)
    expect(() => toWarekiDate(new Date(NaN))).toThrow(RangeError)
  })

  it('rejects non-Date arguments to format() with TypeError, not garbage', () => {
    expect(() => format(null as unknown as Date)).toThrow(TypeError)
    expect(() => format('2019-05-04' as unknown as Date)).toThrow(TypeError)
    expect(() => format({} as unknown as Date)).toThrow(TypeError)
  })
})
