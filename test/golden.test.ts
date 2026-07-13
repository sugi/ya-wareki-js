import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { UnsupportedDateRangeError } from '../src/errors.js'
import { WarekiDate } from '../src/wareki-date.js'

const rows = readFileSync('test/golden/conversions.csv', 'utf8')
  .trim()
  .split('\n')
  .slice(1)
  .map((l) => l.split(','))

describe('golden conversions (Ruby wareki 対照表)', () => {
  it('has a meaningful sample size', () => {
    expect(rows.length).toBeGreaterThan(15000)
  })

  it('matches Ruby on every sampled JD (fromJd fields + jd round trip)', () => {
    for (const row of rows) {
      const jd = Number(row[0])
      if (row[1] === 'UNSUPPORTED') {
        expect(() => WarekiDate.fromJd(jd), `jd ${jd}`).toThrow(UnsupportedDateRangeError)
        continue
      }
      const w = WarekiDate.fromJd(jd)
      const actual = [w.eraName, w.eraYear, w.year, w.month, w.day, w.isLeapMonth].join(',')
      expect(actual, `jd ${jd}`).toBe(row.slice(1, 7).join(','))
      // キャッシュに頼らない真の逆変換
      const back = new WarekiDate(w.eraName, w.eraYear, w.month, w.day, w.isLeapMonth)
      expect(back.jd, `round trip jd ${jd}`).toBe(jd)
    }
  })
})
