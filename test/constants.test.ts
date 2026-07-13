import { describe, expect, it } from 'vitest'
import {
  ALT_MONTH_NAME, GREGORIAN_START_JD, IMPERIAL_START_YEAR, KANJI_VARIANTS, NUM_CHARS, SQUARE_ERAS,
} from '../src/constants.js'

describe('constants', () => {
  it('has expected scalar values', () => {
    expect(GREGORIAN_START_JD).toBe(2405160)
    expect(IMPERIAL_START_YEAR).toBe(-660)
    expect(ALT_MONTH_NAME).toHaveLength(12)
    expect(ALT_MONTH_NAME[0]).toBe('睦月')
    expect(ALT_MONTH_NAME[11]).toBe('師走')
    expect(NUM_CHARS).toContain('卅')
    expect(NUM_CHARS).toContain('９')
    expect(SQUARE_ERAS['㋿']).toBe('令和')
  })

  it('keeps CJK compatibility ideographs un-normalized', () => {
    // これらの値が通常字に一致したらソースが NFC 正規化で壊れている
    expect(KANJI_VARIANTS['神']).toBe('\uFA19')
    expect(KANJI_VARIANTS['神']).not.toBe('\u795E') // 通常の神
    expect(KANJI_VARIANTS['令']).toBe('\uF9A8')
    expect(KANJI_VARIANTS['福']).toBe('\uFA1B')
    expect(KANJI_VARIANTS['祥']).toBe('\uFA1A')
    expect(KANJI_VARIANTS['禎']).toBe('\uFA53')
    expect(Object.keys(KANJI_VARIANTS)).toHaveLength(18)
  })
})
