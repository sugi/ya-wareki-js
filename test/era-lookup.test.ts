import { describe, expect, it } from 'vitest'
import { NORTH_COURT_ERA_NAMES } from '../src/constants.js'
import {
  ERA_DEFS, ERA_JD_LOOKUP, ERA_NAME_KEYS, ERA_NORTH_DEFS,
  eraByName, findEraByJd, normalizeKanjiVariants,
} from '../src/era-lookup.js'

describe('eraByName', () => {
  it('resolves canonical names', () => {
    expect(eraByName('明治')).toMatchObject({ name: '明治', year: 1868, start: 2403357, end: 2419613 })
    expect(eraByName('令和')!.end).toBe(Number.MAX_SAFE_INTEGER)
    // 建武は南朝定義 (ERA_DEFS) が北朝定義を上書きする
    expect(eraByName('建武')).toMatchObject({ year: 1334, start: 2208365, end: 2209133 })
    // 北朝元号も名前では引ける
    expect(eraByName('暦応')).toMatchObject({ year: 1338 })
  })

  it('resolves specials (Ruby ERA_BY_NAME の手動登録分)', () => {
    expect(eraByName('皇紀')).toMatchObject({ name: '皇紀', year: -660, start: 1480041 })
    expect(eraByName('神武天皇即位紀元')).toBe(eraByName('皇紀'))
    expect(eraByName('西暦')).toMatchObject({ name: '西暦', year: 1, start: 1721424 })
    expect(eraByName('')).toBe(eraByName('西暦'))
  })

  it('resolves square era chars and kanji variants (Ruby default_proc 相当)', () => {
    expect(eraByName('㍾')!.name).toBe('明治')
    expect(eraByName('㋿')!.name).toBe('令和')
    expect(eraByName('應德')!.name).toBe('応徳')
    expect(eraByName('慶應')!.name).toBe('慶応')
    expect(eraByName('萬延')!.name).toBe('万延')
  })

  it('returns undefined for unknown names and 紀元前 (Ruby と同じ)', () => {
    expect(eraByName('謎元号')).toBeUndefined()
    expect(eraByName('紀元前')).toBeUndefined() // パーサ側で特別扱いされる
  })
})

describe('normalizeKanjiVariants', () => {
  it('maps old glyphs to canonical ones', () => {
    expect(normalizeKanjiVariants('應德')).toBe('応徳')
    expect(normalizeKanjiVariants('平成')).toBe('平成')
  })

  it('CJK互換漢字 (CJK Compatibility Ideographs) の異体字を正準字体へ正規化する', () => {
    // \uXXXX エスケープ必須: 実体の互換漢字はエディタ・転記時に NFC 正規化で
    // 通常字へ潰れてしまう (constants.ts の KANJI_VARIANTS と同じ注意点)。
    expect(normalizeKanjiVariants('\uFA19亀')).toBe('神亀')
    expect(normalizeKanjiVariants('\uFA1A')).toBe('祥')
    expect(normalizeKanjiVariants('\uFA1B')).toBe('福')
    expect(normalizeKanjiVariants('\uFA53')).toBe('禎')
    expect(normalizeKanjiVariants('\uF9A8')).toBe('令')
  })
})

describe('findEraByJd (Ruby Utils.find_era)', () => {
  it('returns proper era around boundaries', () => {
    expect(findEraByJd(2400509)!.name).toBe('万延') // 1860-04-08
    expect(findEraByJd(2400508)!.name).toBe('安政') // 1860-04-07
    expect(findEraByJd(2447534)!.name).toBe('昭和')
    expect(findEraByJd(2424875)!.name).toBe('昭和')
    expect(findEraByJd(2403357)!.name).toBe('明治')
    expect(findEraByJd(2419613)!.name).toBe('明治')
  })

  it('returns new era on overlap day', () => {
    expect(findEraByJd(1958551)!.name).toBe('白雉')
    expect(findEraByJd(2256978)!.name).toBe('応仁')
  })

  it('returns undefined on missing era gaps', () => {
    expect(findEraByJd(1960640)).toBeUndefined() // 655-12-10 (白雉と朱鳥の間)
    expect(findEraByJd(1971894)).toBeUndefined() // 686-10-02 (朱鳥の直後)
    expect(findEraByJd(1956841)).toBeUndefined() // 大化より前
  })

  it('prefers southern court eras (nanboku-cho)', () => {
    expect(findEraByJd(2209541)!.name).toBe('延元') // 1337-06-01 (Gregorian)
    expect(findEraByJd(2210692)!.name).toBe('興国') // 1340-07-26
    expect(findEraByJd(2214492)!.name).toBe('正平') // 1350-12-21
    expect(findEraByJd(2207792)!.name).toBe('元弘') // 1332-08-17
    expect(findEraByJd(2229113)!.name).toBe('元中') // 1391-01-01
    expect(findEraByJd(2229992)!.name).toBe('明徳') // 1393-05-29
  })
})

describe('ERA_JD_LOOKUP invariants (Ruby utils_spec より転記)', () => {
  it('is sorted, disjoint and excludes north court eras', () => {
    expect(ERA_JD_LOOKUP).toHaveLength(232)
    for (let i = 0; i + 1 < ERA_JD_LOOKUP.length; i++) {
      const a = ERA_JD_LOOKUP[i]!
      const b = ERA_JD_LOOKUP[i + 1]!
      expect(a.end < b.start && a.end < b.end, `${a.name} -> ${b.name}`).toBe(true)
    }
    expect(ERA_JD_LOOKUP.filter((e) => NORTH_COURT_ERA_NAMES.includes(e.name))).toHaveLength(0)
  })

  it('keeps ERA_DEFS/ERA_NORTH_DEFS untouched and ERA_NAME_KEYS ordered', () => {
    expect(ERA_DEFS.find((e) => e.name === '慶応')!.end).toBe(2403629) // lookup 側だけ 2403356 に詰まる
    expect(ERA_NORTH_DEFS.find((e) => e.name === '建武')!.end).toBe(2210046)
    expect(ERA_NAME_KEYS).toContain('')
    // Ruby: `a = b = v` は b を先に挿入するため実際の挿入順は
    // ..., 神武天皇即位紀元, 皇紀, '', 西暦 (ruby -Ilib -r wareki -e
    // 'p Wareki::ERA_BY_NAME.keys.last(5)' で確認済み)
    expect(ERA_NAME_KEYS.slice(-4)).toEqual(['神武天皇即位紀元', '皇紀', '', '西暦'])
    expect(ERA_NAME_KEYS.at(-1)).toBe('西暦')
  })
})
