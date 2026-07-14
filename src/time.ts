import { toKan } from 'ya-kansuji'
import { NUM_CHARS } from './constants.js'
import { expandJDirectives, fmtNum } from './format.js'
import { i2z, k2i } from './utils.js'

// Ruby common.rb TIME_REGEX の移植。x モードの空白は取り除き、[[:space:]] は \s に
// 対応させる (U+3000 も両者でマッチ。U+0085/U+FEFF の扱い差は README 既知の挙動差参照)。
const TIME_REGEX = new RegExp(
  `(?<noon>正午)|` +
    `(?:(?<ampm>午前|午後)\\s*)?` +
    `(?<hour>[${NUM_CHARS}]+)\\s*時` +
    `(?:\\s*(?:(?<half>半)|` +
    `(?<min>[${NUM_CHARS}]+)\\s*分` +
    `(?:\\s*(?<sec>[${NUM_CHARS}]+)\\s*秒)?))?`,
  'u',
)

// Ruby TIME_PARSE_QUICK_FILTER。時 も 正午 も含まない文字列はそのまま返す。
// index.ts の parseToDate も同じフィルタで時刻抽出の要否を判定するため export する。
export const TIME_QUICK_FILTER = /時|正午/u

const pad2 = (n: number): string => String(n).padStart(2, '0')

// Ruby Utils._time_match_to_s の移植。範囲チェックはしない (二十五時 -> '25:00')。
function timeMatchToStr(g: Record<string, string | undefined>): string {
  if (g['noon'] !== undefined) return '12:00'
  let hour = k2i(g['hour'] ?? '')
  if (g['ampm'] === '午後' && hour < 12) hour += 12
  let min = 0
  if (g['half'] !== undefined) min = 30
  if (g['min'] !== undefined) min = k2i(g['min'])
  if (g['sec'] === undefined) return `${pad2(hour)}:${pad2(min)}`
  return `${pad2(hour)}:${pad2(min)}:${pad2(k2i(g['sec']))}`
}

/**
 * 文字列中の最初の日本語時刻表記を等価な `"HH:MM"` / `"HH:MM:SS"` に置換して返す。
 *
 * 漢数字・全角数字の時分秒、午前/午後、半、正午に対応する。Ruby の `String#sub` と
 * 同じく最初の1箇所だけを置換し、値の範囲チェックはしない (`二十五時` → `25:00`)。
 * 「午前」は無変換、「午後」は12時未満のときだけ +12 する。時刻表記を含まない文字列は
 * そのまま返す。
 *
 * @param str 変換対象の文字列
 * @returns 最初の時刻表記を数字表記へ置換した文字列
 * @example
 * normalizeTime('午後三時半')            // => '15:30'
 * normalizeTime('正午')                  // => '12:00'
 * normalizeTime('平成元年五月四日十二時') // => '平成元年五月四日12:00'
 */
export function normalizeTime(str: string): string {
  const s = String(str)
  if (!TIME_QUICK_FILTER.test(s)) return s
  return s.replace(TIME_REGEX, (...args) => {
    const groups = args[args.length - 1] as Record<string, string | undefined>
    return timeMatchToStr(groups)
  })
}

/** {@link formatTime} に渡せる時刻要素。24時間制の時・分・秒。 */
export interface TimeParts {
  hour: number
  minute: number
  second: number
}

function toTimeParts(time: TimeParts | Date): TimeParts {
  if (time instanceof Date) {
    if (Number.isNaN(time.getTime()))
      throw new RangeError('formatTime() received an invalid Date')
    return { hour: time.getHours(), minute: time.getMinutes(), second: time.getSeconds() }
  }
  return time
}

// %JT... 時刻ディレクティブのキー部 (T + f/F/H/M/S(+k))。日付ディレクティブと素で排他。
const TIME_KEY_PART = 'T(?:[fF]|[HMS]k?)'

// Ruby Utils._format_time_directive の移植。未定義キーは undefined (原文を残す)。
function formatTimeKey(t: TimeParts, key: string, opt: string): string | undefined {
  switch (key) {
    case 'Tf':
      return `${fmtNum(t.hour, opt)}時${fmtNum(t.minute, opt)}分${fmtNum(t.second, opt)}秒`
    case 'TF':
      return `${toKan(t.hour, 'simple')}時${toKan(t.minute, 'simple')}分${toKan(t.second, 'simple')}秒`
    case 'TH':
      return i2z(t.hour)
    case 'THk':
      return toKan(t.hour, 'simple')
    case 'TM':
      return i2z(t.minute)
    case 'TMk':
      return toKan(t.minute, 'simple')
    case 'TS':
      return i2z(t.second)
    case 'TSk':
      return toKan(t.second, 'simple')
    default:
      return undefined
  }
}

/**
 * 時刻オブジェクトまたは `Date` を、フォーマット文字列中の `%JT` 系ディレクティブに
 * 従って展開する。`%J` 日付ディレクティブや `%%` などはそのまま残すので、呼び出し側で
 * 後続処理できる。`Date` を渡した場合はローカル時刻の時/分/秒を使う。
 *
 * 使用できる `%JT` コードは README「%JT フォーマットディレクティブ」を参照。
 *
 * @param time 時・分・秒を持つ {@link TimeParts}、または `Date`
 * @param fmt `%JT` 系コードを含むフォーマット文字列
 * @returns `%JT` ディレクティブを展開した文字列
 * @throws {RangeError} 無効な Date (Invalid Date) を渡したとき
 * @example
 * formatTime({ hour: 13, minute: 45, second: 6 }, '%JTHk時%JTMk分') // => '十三時四十五分'
 */
export function formatTime(time: TimeParts | Date, fmt: string): string {
  const t = toTimeParts(time)
  return expandJDirectives(fmt, TIME_KEY_PART, (key, opt) => formatTimeKey(t, key, opt))
}
