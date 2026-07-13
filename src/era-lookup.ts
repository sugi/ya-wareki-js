import {
  COMMON_ERA_START_JD, IMPERIAL_START_JD, IMPERIAL_START_YEAR, JD_MAX,
  KANJI_VARIANTS, SQUARE_ERAS,
} from './constants.js'
import { ERA_NORTH_TUPLES, ERA_TUPLES, type EraTuple } from './data/era-defs.js'

export interface EraDef {
  name: string
  year: number
  start: number
  end: number
}

const toEra = (t: EraTuple): EraDef => ({ name: t[0], year: t[1], start: t[2], end: t[3] })

export const ERA_DEFS: readonly EraDef[] = ERA_TUPLES.map(toEra)
export const ERA_NORTH_DEFS: readonly EraDef[] = ERA_NORTH_TUPLES.map(toEra)

// Ruby ERA_BY_NAME 相当。北朝 → 南朝の順に入れ、同名 (建武) は南朝が勝つ。
const ERA_BY_NAME = new Map<string, EraDef>()
for (const e of [...ERA_NORTH_DEFS, ...ERA_DEFS]) ERA_BY_NAME.set(e.name, e)
const IMPERIAL_ERA: EraDef = { name: '皇紀', year: IMPERIAL_START_YEAR, start: IMPERIAL_START_JD, end: JD_MAX }
// Ruby: `ERA_BY_NAME['皇紀'] = ERA_BY_NAME['神武天皇即位紀元'] = Era.new(...)`。
// 多重代入は右側 (神武天皇即位紀元) から先に挿入されるため、挿入順は
// 神武天皇即位紀元 → 皇紀 になる (`ruby -e 'h={}; h["a"]=h["b"]=1; p h.keys'`
// => ["b","a"] で確認済み)。ERA_NAME_KEYS の順序は Plan 2 の正規表現構築で
// 使われるため、この順序を忠実に再現する。
ERA_BY_NAME.set('神武天皇即位紀元', IMPERIAL_ERA)
ERA_BY_NAME.set('皇紀', IMPERIAL_ERA)
const COMMON_ERA: EraDef = { name: '西暦', year: 1, start: COMMON_ERA_START_JD, end: JD_MAX }
// 同様に `ERA_BY_NAME['西暦'] = ERA_BY_NAME[''] = Era.new(...)` は '' → 西暦 の順。
ERA_BY_NAME.set('', COMMON_ERA)
ERA_BY_NAME.set('西暦', COMMON_ERA)

// パーサが元号候補の正規表現を組むためのキー一覧 (Ruby の ERA_BY_NAME.keys と
// 同じ挿入順。空文字列 '' を含む点に注意)
export const ERA_NAME_KEYS: readonly string[] = [...ERA_BY_NAME.keys()]

const VARIANT_TO_CANONICAL = new Map<string, string>()
for (const [canonical, variants] of Object.entries(KANJI_VARIANTS)) {
  for (const v of variants) VARIANT_TO_CANONICAL.set(v, canonical)
}

export function normalizeKanjiVariants(str: string): string {
  return Array.from(str, (c) => VARIANT_TO_CANONICAL.get(c) ?? c).join('')
}

// Ruby ERA_BY_NAME[key] (default_proc 込み) 相当。
// '紀元前' は Ruby 同様ここでは引けない (undefined)。パーサ側で特別扱いする。
export function eraByName(name: string): EraDef | undefined {
  return ERA_BY_NAME.get(name) ?? ERA_BY_NAME.get(SQUARE_ERAS[name] ?? normalizeKanjiVariants(name))
}

// Ruby Utils.find_era 互換: `ERA_DEFS.reverse_each { |e| ... return e }` の直訳。
// 南北朝期は元号区間が重なる (元弘/正慶、南朝の延元〜元中/北朝の暦応〜康応、
// 元中/明徳)。Ruby は ERA_DEFS の配列順で後に定義された方を優先するため、
// ここでも配列を逆順に線形走査し最初に一致した定義を返す (南朝が常に勝つ
// わけではない — 例えば 1340-07-26 は北朝の暦応が勝つ)。
export function findEraByJd(jd: number): EraDef | undefined {
  for (let i = ERA_DEFS.length - 1; i >= 0; i--) {
    const e = ERA_DEFS[i] as EraDef
    if (e.start <= jd && jd <= e.end) return e
  }
  return undefined
}
