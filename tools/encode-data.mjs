#!/usr/bin/env node
// tools/data/*.json から src/data/*.ts を生成する。再生成時のみ実行する。
// パック形式の仕様は docs/superpowers/plans/2026-07-13-ya-wareki-core.md Task 3 を参照。
import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const years = JSON.parse(readFileSync(join(root, 'tools/data/year-defs.json'), 'utf8'))
const eras = JSON.parse(readFileSync(join(root, 'tools/data/era-defs.json'), 'utf8'))

// 生成元となった Ruby 版 wareki のリビジョンを刻印する (プロヴェナンス)。
const warekiDir = join(root, '..', 'wareki')
let warekiVersion = 'unknown'
try {
  warekiVersion = execSync(`git -C ${warekiDir} describe --always --dirty`, {
    encoding: 'utf8',
  }).trim()
} catch {
  // wareki リポジトリが手元に無い場合はスタンプを省略する
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-'

let packed = ''
const startOverrides = {}
const dayOverrides = []
let jd = years[0].monthStarts[0]
for (const y of years) {
  if (y.monthStarts[0] !== jd) throw new Error(`non-contiguous first month at ${y.year}`)
  const count = y.leapMonth === null ? 12 : 13
  if (y.monthStarts.length !== count || y.monthDays.length !== count)
    throw new Error(`month count mismatch at ${y.year}`)
  let bits = 0
  let sum = 0
  y.monthDays.forEach((d, j) => {
    if (d === 30) bits |= 1 << j
    else if (d !== 29) dayOverrides.push([y.year, j, d])
    sum += d
    if (j > 0 && y.monthStarts[j] !== y.monthStarts[j - 1] + y.monthDays[j - 1])
      throw new Error(`non-cumulative month starts at ${y.year}`)
  })
  if (y.end !== y.monthStarts[0] + sum - 1) throw new Error(`end mismatch at ${y.year}`)
  if (y.start !== y.monthStarts[0]) startOverrides[y.year] = y.start
  const v = ((y.leapMonth ?? 0) << 13) | bits
  packed += ALPHABET[(v >> 12) & 63] + ALPHABET[(v >> 6) & 63] + ALPHABET[v & 63]
  jd += sum
}

const yearTs = `// このファイルは tools/encode-data.mjs が生成する。手動編集禁止。
// 生成元 wareki: ${warekiVersion} (git -C ../wareki describe --always --dirty)
// 形式: 1年 = 17bit (leapMonth<<13 | 月の大小ビット) を6bit英数字3文字で符号化。
// 詳細は tools/encode-data.mjs と実装計画 Task 3 を参照。
export const FIRST_YEAR = ${years[0].year}
export const FIRST_JD = ${years[0].monthStarts[0]}
export const YEAR_COUNT = ${years.length}
export const PACKED =
  '${packed.match(/.{1,96}/g).join("' +\n  '")}'
export const START_OVERRIDES: Readonly<Record<number, number>> = ${JSON.stringify(startOverrides)}
export const DAY_OVERRIDES: ReadonlyArray<readonly [number, number, number]> = ${JSON.stringify(dayOverrides)}
`

const eraLine = (t) => `  [${JSON.stringify(t[0])}, ${t[1]}, ${t[2]}, ${t[3]}],`
const eraTs = `// このファイルは tools/encode-data.mjs が生成する。手動編集禁止。
// 生成元 wareki: ${warekiVersion} (git -C ../wareki describe --always --dirty)
// [name, year (元年の西暦年), start (JD), end (JD)]。
// end の 9007199254740991 は Ruby 版 DAY_MAX (Bignum) の代替で、継続中の元号を表す。
export type EraTuple = readonly [name: string, year: number, start: number, end: number]
export const ERA_TUPLES: readonly EraTuple[] = [
${eras.eraDefs.map(eraLine).join('\n')}
]
export const ERA_NORTH_TUPLES: readonly EraTuple[] = [
${eras.eraNorthDefs.map(eraLine).join('\n')}
]
`

mkdirSync(join(root, 'src/data'), { recursive: true })
writeFileSync(join(root, 'src/data/year-defs.ts'), yearTs)
writeFileSync(join(root, 'src/data/era-defs.ts'), eraTs)
console.log(`packed: ${packed.length} chars, startOverrides: ${Object.keys(startOverrides).length}, dayOverrides: ${dayOverrides.length}`)
