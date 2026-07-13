import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { findDateParts } from '../src/utils.js'

const rows = readFileSync('test/golden/packed-calendar.csv', 'utf8')
  .trim()
  .split('\n')
  .filter((line) => !line.startsWith('#'))
  .slice(1)
  .map((line) => line.split(','))

describe('packed calendar golden (Ruby Wareki::Calendar 対照表)', () => {
  it('covers periodic samples and every month boundary', () => {
    expect(rows.length).toBeGreaterThan(60000)
  })

  it('matches Ruby on every sampled JD', () => {
    for (const row of rows) {
      const jd = Number(row[0])
      const actual = findDateParts(jd)
      expect(
        [actual.year, actual.month, actual.day, actual.isLeapMonth].join(','),
        `jd ${jd}`,
      ).toBe(row.slice(1).join(','))
    }
  })
})
