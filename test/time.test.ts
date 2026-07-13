import { describe, expect, it } from 'vitest'
import { formatTime, normalizeTime } from '../src/time.js'

describe('normalizeTime (Ruby utils_spec「normalizes japanese time notations」転記)', () => {
  it.each<[string, string]>([
    ['十二時三十四分五十六秒', '12:34:56'],
    ['１２時３４分', '12:34'],
    ['12時34分56秒', '12:34:56'],
    ['三時半', '03:30'],
    ['午後三時', '15:00'],
    ['午後三時半', '15:30'],
    ['午前十時 五分', '10:05'],
    ['午前十時　五分', '10:05'], // U+3000 ideographic space
    ['午後 十一時 五十九分 五十九秒', '23:59:59'],
    ['正午', '12:00'],
    ['零時', '00:00'],
    ['十二時', '12:00'],
    ['午前十二時', '12:00'],
    ['午後十二時', '12:00'], // 午後だが hour>=12 なので +12 しない
    ['平成元年五月四日十二時三十四分', '平成元年五月四日12:34'],
  ])('normalizeTime(%s) -> %s', (input, expected) => {
    expect(normalizeTime(input)).toBe(expected)
  })

  it('transliterates out-of-range times as-is (Ruby: 範囲チェックしない)', () => {
    expect(normalizeTime('二十五時')).toBe('25:00')
    expect(normalizeTime('十二時七十分')).toBe('12:70')
  })

  it('replaces only the first time notation (Ruby String#sub 相当)', () => {
    expect(normalizeTime('三時と五時')).toBe('03:00と五時')
  })

  it('keeps strings without time notation unchanged', () => {
    expect(normalizeTime('平成元年5月4日')).toBe('平成元年5月4日')
    expect(normalizeTime('明治時代')).toBe('明治時代')
    expect(normalizeTime('元年時')).toBe('元年時')
  })
})

describe('formatTime (Ruby utils_spec「expands %JT time format directives」転記)', () => {
  const t = { hour: 12, minute: 34, second: 56 }

  it.each<[string, string]>([
    ['%JTf', '12時34分56秒'],
    ['%JTF', '十二時三十四分五十六秒'],
    ['%JTH', '１２'],
    ['%JTHk', '十二'],
    ['%JTM', '３４'],
    ['%JTMk', '三十四'],
    ['%JTS', '５６'],
    ['%JTSk', '五十六'],
    ['%JTHk時%JTMk分', '十二時三十四分'],
  ])('formatTime(%s) -> %s', (fmt, expected) => {
    expect(formatTime(t, fmt)).toBe(expected)
  })

  it('pads %JTf like %Jf and honors padding flags', () => {
    const t2 = { hour: 3, minute: 4, second: 5 }
    expect(formatTime(t2, '%JTf')).toBe('03時04分05秒')
    expect(formatTime(t2, '%J-Tf')).toBe('3時4分5秒')
  })

  it('always emits all three components for composite time directives', () => {
    const t0 = { hour: 0, minute: 0, second: 0 }
    expect(formatTime(t0, '%JTF')).toBe('零時零分零秒')
    expect(formatTime(t0, '%JTf')).toBe('00時00分00秒')
  })

  it('leaves escaped or unknown %JT sequences alone (%% はここでは畳まない)', () => {
    // expand_time_format 単体では %% は畳まれない (後段の日付側 strftime が処理する)
    expect(formatTime(t, 'x%%JTF %JTHk')).toBe('x%%JTF 十二')
    expect(formatTime(t, '%JTz')).toBe('%JTz')
    expect(formatTime(t, '%H:%M:%S')).toBe('%H:%M:%S')
  })

  it('accepts a JS Date and uses its LOCAL time', () => {
    const d = new Date(2019, 4, 4, 13, 45, 6)
    expect(formatTime(d, '%JTF')).toBe('十三時四十五分六秒')
    expect(formatTime(d, '%JTf')).toBe('13時45分06秒')
  })
})
