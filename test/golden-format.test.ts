import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { WarekiDate } from '../src/wareki-date.js'

const rows = readFileSync('test/golden/conversions.csv', 'utf8')
  .trim()
  .split('\n')
  .slice(1)
  .map((l) => l.split(','))

describe('golden format (%JF / %Jf を Ruby と照合)', () => {
  it('matches Ruby strftime on every supported JD', () => {
    let checked = 0
    for (const row of rows) {
      if (row[1] === 'UNSUPPORTED') continue
      const w = WarekiDate.fromJd(Number(row[0]))
      expect(w.format('%JF'), `jd ${row[0]} %JF`).toBe(row[7])
      expect(w.format('%Jf'), `jd ${row[0]} %Jf`).toBe(row[8])
      checked++
    }
    expect(checked).toBeGreaterThan(13000)
  })
})
