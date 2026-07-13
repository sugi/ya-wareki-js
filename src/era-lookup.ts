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

// 北朝定義を先に入れ、通常定義で上書きする。同名の建武は通常定義が勝つ。
const ERA_BY_NAME = new Map<string, EraDef>()
for (const e of [...ERA_NORTH_DEFS, ...ERA_DEFS]) ERA_BY_NAME.set(e.name, e)
const IMPERIAL_ERA: EraDef = { name: '皇紀', year: IMPERIAL_START_YEAR, start: IMPERIAL_START_JD, end: JD_MAX }
// 特殊元号もパーサーの正規表現構築に使うため、挿入順を固定する。
ERA_BY_NAME.set('神武天皇即位紀元', IMPERIAL_ERA)
ERA_BY_NAME.set('皇紀', IMPERIAL_ERA)
const COMMON_ERA: EraDef = { name: '西暦', year: 1, start: COMMON_ERA_START_JD, end: JD_MAX }
ERA_BY_NAME.set('', COMMON_ERA)
ERA_BY_NAME.set('西暦', COMMON_ERA)

// パーサが元号候補の正規表現を組むためのキー一覧。空文字列も含む。
export const ERA_NAME_KEYS: readonly string[] = [...ERA_BY_NAME.keys()]

const VARIANT_TO_CANONICAL = new Map<string, string>()
for (const [canonical, variants] of Object.entries(KANJI_VARIANTS)) {
  for (const v of variants) VARIANT_TO_CANONICAL.set(v, canonical)
}

export function normalizeKanjiVariants(str: string): string {
  return Array.from(str, (c) => VARIANT_TO_CANONICAL.get(c) ?? c).join('')
}

// 「紀元前」はここでは引かず、パーサー側で特別扱いする。
export function eraByName(name: string): EraDef | undefined {
  return ERA_BY_NAME.get(name) ?? ERA_BY_NAME.get(SQUARE_ERAS[name] ?? normalizeKanjiVariants(name))
}

// 南北朝期は元号区間が重なるため、data-localeから南朝→北朝の順で生成した
// 配列を後方から探索し、北朝元号を優先する。
export function findEraByJd(jd: number): EraDef | undefined {
  for (let i = ERA_DEFS.length - 1; i >= 0; i--) {
    const e = ERA_DEFS[i] as EraDef
    if (e.start <= jd && jd <= e.end) return e
  }
  return undefined
}
