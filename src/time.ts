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
const TIME_QUICK_FILTER = /時|正午/u

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

// 日本語の時刻表記 (漢数字・全角数字の時分秒、午前/午後、半、正午) を等価な
// "HH:MM(:SS)" 表記へ置換する。Ruby の String#sub と同じく最初の1箇所のみ置換し、
// 値の範囲チェックはしない。
export function normalizeTime(str: string): string {
  const s = String(str)
  if (!TIME_QUICK_FILTER.test(s)) return s
  return s.replace(TIME_REGEX, (...args) => {
    const groups = args[args.length - 1] as Record<string, string | undefined>
    return timeMatchToStr(groups)
  })
}

export interface TimeParts {
  hour: number
  minute: number
  second: number
}

function toTimeParts(time: TimeParts | Date): TimeParts {
  if (time instanceof Date)
    return { hour: time.getHours(), minute: time.getMinutes(), second: time.getSeconds() }
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

// Ruby Utils.expand_time_format の移植。%JT ディレクティブのみ展開し、%J 日付
// ディレクティブや %% など他はそのまま残す (呼び出し側が後段で処理する)。
// Date を渡した場合はローカル時刻の時/分/秒を使う (fromDate のローカル既定と一致)。
export function formatTime(time: TimeParts | Date, fmt: string): string {
  const t = toTimeParts(time)
  return expandJDirectives(fmt, TIME_KEY_PART, (key, opt) => formatTimeKey(t, key, opt))
}
