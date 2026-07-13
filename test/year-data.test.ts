import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ERA_NORTH_TUPLES, ERA_TUPLES } from '../src/data/era-defs.js'
import { findYearByJd, yearByNum } from '../src/year-data.js'

interface JsonYear {
  year: number
  start: number
  end: number
  leapMonth: number | null
  monthStarts: number[]
  monthDays: number[]
}

const source: JsonYear[] = JSON.parse(readFileSync('tools/data/year-defs.json', 'utf8'))
const eraJson = JSON.parse(readFileSync('tools/data/era-defs.json', 'utf8')) as {
  eraDefs: Array<[string, number, number, number]>
  eraNorthDefs: Array<[string, number, number, number]>
}

describe('year-data round trip', () => {
  it('decodes all 1428 years identical to the Ruby dump', () => {
    expect(source).toHaveLength(1428)
    for (const y of source) {
      const actual = yearByNum(y.year)!
      expect(
        { ...actual, monthStarts: [...actual.monthStarts], monthDays: [...actual.monthDays] },
        `year ${y.year}`,
      ).toEqual(y)
    }
  })

  it('stores all years in shared flat typed arrays', () => {
    const first = yearByNum(445)!
    const next = yearByNum(446)!
    expect(first.monthStarts).toBeInstanceOf(Int32Array)
    expect(first.monthDays).toBeInstanceOf(Uint8Array)
    expect(next.monthStarts.buffer).toBe(first.monthStarts.buffer)
    expect(next.monthDays.buffer).toBe(first.monthDays.buffer)
    expect(next.monthStarts.byteOffset - first.monthStarts.byteOffset).toBe(
      13 * Int32Array.BYTES_PER_ELEMENT,
    )
    expect(next.monthDays.byteOffset - first.monthDays.byteOffset).toBe(
      13 * Uint8Array.BYTES_PER_ELEMENT,
    )
  })

  it('keeps the known irregular records', () => {
    // start フィールドが先頭月と異なる代表例 (閏1月始まりの年)
    const y467 = yearByNum(467)!
    expect(y467.start).toBe(1891680)
    expect(y467.monthStarts[0]).toBe(1891650)
    // 明治5年12月は改暦打ち切りで2日しかない
    const y1872 = yearByNum(1872)!
    expect(y1872.monthDays[11]).toBe(2)
    expect(y1872.end).toBe(2405159)
    expect(y1872.leapMonth).toBeNull()
  })
})

describe('era tuples round trip', () => {
  it('matches the Ruby dump', () => {
    expect(ERA_TUPLES.map((t) => [...t])).toEqual(eraJson.eraDefs)
    expect(ERA_NORTH_TUPLES.map((t) => [...t])).toEqual(eraJson.eraNorthDefs)
    expect(ERA_TUPLES).toHaveLength(248)
    expect(ERA_NORTH_TUPLES).toHaveLength(248)
  })
})

describe('yearByNum / findYearByJd', () => {
  it('returns undefined outside the table', () => {
    expect(yearByNum(444)).toBeUndefined()
    expect(yearByNum(1873)).toBeUndefined()
    expect(yearByNum(445.5)).toBeUndefined()
    expect(findYearByJd(1883617)).toBeUndefined() // Ruby: find_year(1_883_617) → nil
    expect(findYearByJd(2405160)).toBeUndefined() // グレゴリオ移行後
  })

  it('finds years by first and last day (Ruby utils_spec より転記)', () => {
    expect(findYearByJd(1883618)!.year).toBe(445)
    expect(findYearByJd(2275903)!.year).toBe(1519)
    expect(findYearByJd(2276257)!.year).toBe(1519)
    expect(findYearByJd(2293061)!.year).toBe(1566)
    expect(findYearByJd(2293443)!.year).toBe(1566)
  })

  it('finds every year at both table boundaries', () => {
    for (const y of source) {
      expect(findYearByJd(y.monthStarts[0]!)?.year, `first jd of ${y.year}`).toBe(y.year)
      expect(findYearByJd(y.end)?.year, `last jd of ${y.year}`).toBe(y.year)
    }
  })

  it('resolves gap days of START_OVERRIDES years like Ruby (start は判定に使わない)', () => {
    // 467年の閏1月域: start(1891680) より前だが Ruby の bsearch は 467 年を返す
    expect(findYearByJd(1891650)!.year).toBe(467)
    expect(findYearByJd(1891679)!.year).toBe(467)
  })
})
