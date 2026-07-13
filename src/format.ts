import { toKan } from 'ya-kansuji'
import { ITALY_REFORM_JD } from './constants.js'
import { italyToJd, jdToGregorian, jdToJulian } from './jd.js'
import { altMonthName, i2z } from './utils.js'
import type { WarekiDate } from './wareki-date.js'

// Ruby: FORMAT_DIRECTIVE_REGEX = /%J(-|[_0]{0,2}[0-9]*|)([fFyYegGoOiImMsSlLdD][kK]?)/
// Ruby: FORMAT_EXPANSION_REGEX  = /(?<!%)(?:%%)*\K#{FORMAT_DIRECTIVE_REGEX}/
// 日付ディレクティブのキー部。%JT... の時刻ディレクティブとは素で排他 (T を含まない)。
const DATE_KEY_PART = '[fFyYegGoOiImMsSlLdD][kK]?'

// Ruby の (?<!%)(?:%%)*\K#{DIRECTIVE} 相当のエスケープ機構。JS には \K が無いため、
// 直前の偶数個の %% プレフィックスをキャプチャ (esc) で温存する。これにより奇数個の
// % が直前にある %J... はエスケープされ展開されない。keyPart は展開対象のキー部
// (日付側・時刻側で使い回す)。
const directiveSource = (keyPart: string): string =>
  `(?<!%)((?:%%)*)%J(-|[_0]{0,2}[0-9]*|)(${keyPart})`

// keyPart は DATE_KEY_PART / TIME_KEY_PART の2種のみなので、コンパイル済み正規表現を
// 使い回す。g フラグ付きでも String#replace は開始時に lastIndex を 0 に戻すため
// (RegExp.prototype[Symbol.replace] の仕様)、インスタンス共有で状態は漏れない。
const directiveRegexCache = new Map<string, RegExp>()

// resolve が undefined を返したディレクティブは原文のまま残す。
export function expandJDirectives(
  fmt: string,
  keyPart: string,
  resolve: (key: string, opt: string) => string | undefined,
): string {
  if (!fmt.includes('%J')) return fmt
  let re = directiveRegexCache.get(keyPart)
  if (!re) {
    re = new RegExp(directiveSource(keyPart), 'g')
    directiveRegexCache.set(keyPart, re)
  }
  return fmt.replace(re, (_whole, esc: string, opt: string, key: string) => {
    const out = resolve(key, opt)
    return out === undefined ? `${esc}%J${opt}${key}` : `${esc}${out}`
  })
}

// Ruby StdExt.wareki_directive? (format =~ FORMAT_EXPANSION_REGEX) 相当。
// エスケープされた %%JF のような箇所は本物のディレクティブとして数えない。
// directiveSource を共有して escape 判定のずれを防ぐ。g なし (test で lastIndex が進まない)。
const DATE_DIRECTIVE_REGEX = new RegExp(directiveSource(DATE_KEY_PART))

export function hasJDateDirective(fmt: string): boolean {
  return DATE_DIRECTIVE_REGEX.test(fmt)
}

// Ruby Date#_number_format 相当: フラグ文字列を sprintf 風の spec に解決し、
// spec の先頭が '0' なら 0 埋め、それ以外は空白埋めとして解釈する。
export function fmtNum(n: number, opt: string): string {
  let spec: string
  if (opt === '' || opt === '0' || opt === '_0') spec = '02'
  else if (opt === '-') spec = ''
  else if (/_$/.test(opt)) spec = '2'
  else if (/0?_/.test(opt)) spec = opt.replace(/0?_/, '')
  else if (/_?0/.test(opt)) spec = opt.replace(/_?0/, '0')
  else spec = `0${opt}`
  if (spec === '') return String(n)
  const pad = spec.startsWith('0') ? '0' : ' '
  return String(n).padStart(Number.parseInt(spec, 10), pad)
}

// Ruby Wareki::Date#format(key, opt) のテーブル移植。未定義キーは undefined
// (呼び出し側が元のディレクティブをそのまま残す)。
function formatKey(d: WarekiDate, key: string, opt: string): string | undefined {
  switch (key) {
    case 'e': return d.eraName
    case 'g': return d.eraName === '' ? '' : fmtNum(d.eraYear, opt)
    case 'G': return d.eraName === '' ? '' : i2z(d.eraYear)
    case 'Gk': return d.eraName === '' ? '' : toKan(d.eraYear, 'simple')
    case 'GK':
      if (d.eraName === '') return ''
      return d.eraYear === 1 ? '元' : toKan(d.eraYear, 'simple')
    case 'o': return String(d.year)
    case 'O': return i2z(d.year)
    case 'Ok': return toKan(d.year, 'simple')
    case 'i': return String(d.imperialYear)
    case 'I': return i2z(d.imperialYear)
    case 'Ik': return toKan(d.imperialYear, 'simple')
    case 's': return fmtNum(d.month, opt)
    case 'S': return i2z(d.month)
    case 'Sk': return toKan(d.month, 'simple')
    case 'SK': return altMonthName(d.month)
    case 'l': return d.isLeapMonth ? "'" : ''
    case 'L': return d.isLeapMonth ? '’' : ''
    case 'Lk': return d.isLeapMonth ? '閏' : ''
    case 'd': return fmtNum(d.day, opt)
    case 'D': return i2z(d.day)
    case 'Dk': return toKan(d.day, 'simple')
    case 'DK':
      if (d.month === 1 && !d.isLeapMonth && d.day === 1) return '元'
      if (d.day === 1) return '朔'
      if (d.day === d.lastDayOfMonth) return '晦'
      return toKan(d.day, 'simple')
    case 'm': return `${formatKey(d, 's', opt)}${formatKey(d, 'l', '')}`
    case 'M': return `${formatKey(d, 'Lk', '')}${formatKey(d, 'S', '')}`
    case 'Mk': return `${formatKey(d, 'Lk', '')}${formatKey(d, 'Sk', '')}`
    case 'y': return `${formatKey(d, 'e', '')}${formatKey(d, 'g', opt)}`
    case 'Y': return `${formatKey(d, 'e', '')}${formatKey(d, 'G', '')}`
    case 'Yk': return `${formatKey(d, 'e', '')}${formatKey(d, 'Gk', '')}`
    case 'YK': return `${formatKey(d, 'e', '')}${formatKey(d, 'GK', '')}`
    case 'f':
      return `${formatKey(d, 'e', '')}${formatKey(d, 'g', opt)}年${formatKey(d, 's', opt)}${formatKey(d, 'l', '')}月${formatKey(d, 'd', opt)}日`
    case 'F':
      return `${formatKey(d, 'e', '')}${formatKey(d, 'GK', '')}年${formatKey(d, 'Lk', '')}${formatKey(d, 'Sk', '')}月${formatKey(d, 'Dk', '')}日`
    default: return undefined
  }
}

const pad0 = (n: number, w: number): string => String(n).padStart(w, '0')

// Ruby 版は残りの % コードをプラットフォームの strftime に委譲するが、JS には
// 委譲先がないため %Y %y %m %d %e %j %F %% のみ自前実装し、他は無変換で通す
// (設計ドキュメントで確定した意図的差異)。
function stdStrftimeCore(year: number, month: number, day: number, dayOfYear: number, str: string): string {
  const year4 = year < 0 ? `-${pad0(-year, 4)}` : pad0(year, 4)
  return str.replace(/%([YymdejF%])/g, (whole, code: string) => {
    switch (code) {
      case 'Y': return year4
      case 'y': return pad0(((year % 100) + 100) % 100, 2)
      case 'm': return pad0(month, 2)
      case 'd': return pad0(day, 2)
      case 'e': return String(day).padStart(2, ' ')
      case 'j': return pad0(dayOfYear, 3)
      case 'F': return `${year4}-${pad0(month, 2)}-${pad0(day, 2)}`
      case '%': return '%'
      default: return whole
    }
  })
}

// 年月日は Ruby の to_date (Date::ITALY: 1582-10-15 以降グレゴリオ暦、以前は
// ユリウス暦) と同じ表現にする。
function stdStrftime(d: WarekiDate, str: string): string {
  const jd = d.jd
  const parts = jd >= ITALY_REFORM_JD ? jdToGregorian(jd) : jdToJulian(jd)
  const dayOfYear = jd - italyToJd(parts.year, 1, 1) + 1
  return stdStrftimeCore(parts.year, parts.month, parts.day, dayOfYear, str)
}

// %J 日付ディレクティブが実在しない Date 入力向けの経路 (index.ts の format() から
// 呼ばれる)。Ruby の Time#strftime はネイティブ実装にそのまま委譲するだけで改暦・
// ユリウス暦補正を経由しないため、WarekiDate/jd 変換を挟まずローカルの年月日を
// そのまま使う (改暦以前の年でも UnsupportedDateRangeError を投げない)。
export function stdStrftimeFromDate(date: Date, str: string): string {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const dayOfYear = Math.round(
    (Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / 86_400_000,
  ) + 1
  return stdStrftimeCore(year, month, day, dayOfYear, str)
}

export function formatWareki(d: WarekiDate, fmt: string): string {
  const expanded = expandJDirectives(fmt, DATE_KEY_PART, (key, opt) => formatKey(d, key, opt))
  // Ruby: expand 後に % が残らなければ strftime 委譲もしない
  if (!expanded.includes('%')) return expanded
  return stdStrftime(d, expanded)
}
