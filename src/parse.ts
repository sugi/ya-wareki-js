import { ALT_MONTH_NAME, KANJI_VARIANTS, NUM_CHARS, SQUARE_ERAS } from './constants.js'
import { WarekiParseError } from './errors.js'
import { ERA_NAME_KEYS, eraByName } from './era-lookup.js'
import { altMonthNameToNumber, eraYearToCivil, k2i, lastDayOfEraMonth } from './utils.js'

// Ruby ERA_REGEX 相当: 元号名の各文字を KANJI_VARIANTS で文字クラスに展開する
// (例: 大宝 → 大[宝寳])。JS の | は Ruby (onigmo) と同じ先頭優先 + バックトラック
// なので、前方一致する別名 (天平 / 天平感宝) も正しく解決される。
function expandVariants(name: string): string {
  return Array.from(name, (c) => {
    const variants = KANJI_VARIANTS[c]
    return variants === undefined ? c : `[${c}${variants}]`
  }).join('')
}

const ERA_ALT = [...ERA_NAME_KEYS, ...Object.keys(SQUARE_ERAS)].map(expandVariants).join('|')

// Ruby common.rb の REGEX の直訳 (named capture group)。ERA_NAME_KEYS が
// 空文字列 '' を含むため era_name は空にもマッチしうるが、Ruby も同じ挙動で、
// _parse 側の era == '' 判定が吸収する。
const REGEX = new RegExp(
  `(?:(?<era_name>紀元前|${ERA_ALT})?` +
    `(?:(?<year>[元${NUM_CHARS}]+)年))?` +
    `(?:(?<is_leap>閏|潤|うるう)?` +
    `(?:(?<month>[正${NUM_CHARS}]+)(?<is_leap_post>['’])?月|` +
    `(?<alt_month>${ALT_MONTH_NAME.join('|')})))?` +
    `(?:(?<day>[元朔晦${NUM_CHARS}]+)日|元旦)?`,
  'u',
)

export interface ParsedFields {
  era: string
  year: number
  month: number
  day: number
  isLeap: boolean
}

// Ruby Wareki::Date._parse の移植
export function parseFields(str: string): ParsedFields {
  const s = String(str).replace(/\s+/gu, '')
  const match = REGEX.exec(s)
  if (!match || match[0] === '') throw new WarekiParseError(`Invalid Date: ${str}`)
  const g = match.groups as Record<string, string | undefined>
  const era = g['era_name'] ?? ''

  let year: number
  if (era === '' && g['year'] === undefined) {
    year = new Date().getFullYear()
  } else {
    year = k2i(g['year'] ?? '')
    if (!(year > 0)) throw new WarekiParseError(`Invalid year: ${str}`)
  }

  if (era !== '' && era !== '紀元前' && !eraByName(era))
    throw new WarekiParseError(`Date parse failed: Invalid era name '${era}'`)

  let month = 1
  if (g['month'] !== undefined) month = k2i(g['month'])
  else if (g['alt_month'] !== undefined) month = altMonthNameToNumber(g['alt_month']) as number
  if (month > 12 || month < 1)
    throw new WarekiParseError(`invalid date (month out of range): ${str}`)

  const isLeap = g['is_leap'] !== undefined || g['is_leap_post'] !== undefined

  let day = 1
  if (g['day'] !== undefined) {
    if (g['day'] === '晦') {
      const civilYear = eraYearToCivil(era, year)
      day = lastDayOfEraMonth(era, civilYear, month, isLeap)
    } else {
      day = k2i(g['day'])
    }
  }

  return { era, year, month, day, isLeap }
}
