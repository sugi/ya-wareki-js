// 最低サポートランタイムでの簡易スモークテスト。
// vitest/tsdown は最低ランタイムでは動かないため、ビルド済み dist を
// 素の node で読み込んで ESM / CJS / IIFE の3経路が動くことだけを確認する。
// 事前に `npm run build` で dist を生成しておくこと。
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const failures = []

function check(label, actual, expected) {
  if (actual === expected) {
    console.log(`ok   ${label}: ${actual}`)
  } else {
    failures.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
    console.error(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

console.log(`node ${process.version}`)

const esm = await import('../dist/index.js')
check('ESM format', esm.format(new Date(2019, 4, 4)), '令和元年五月四日')

const cjs = require('../dist/index.cjs')
check('CJS parse+format', cjs.parse('平成7年11月10日').format('%Jf'), '平成07年11月10日')

// IIFE はブラウザ <script> 向けだが、type:module 配下では .js が ESM 扱いになり
// require() は Node 18 で ERR_REQUIRE_ESM になる。import() なら全 Node で評価でき、
// footer の globalThis.YaWareki 代入も実行される。
await import('../dist/index.iife.min.js')
check('IIFE global', globalThis.YaWareki.parse('天和三年閏五月四日').format(), '天和三年閏五月四日')

// Temporal 相互変換: 入力側は duck-typing でグローバル Temporal 不要 (Node 18/20 でも動く)。
const duck = { calendarId: 'iso8601', year: 2019, month: 5, day: 4, withCalendar() { return this } }
check('ESM toWarekiDate(TemporalLike)', esm.format(esm.toWarekiDate(duck)), '令和元年五月四日')

// 出力側はグローバル Temporal があるときだけ動く (Node 26+)。無い環境ではエラーになることを確認。
if (globalThis.Temporal) {
  check('toPlainDate (native Temporal)', String(esm.toWarekiDate(duck).toPlainDate()), '2019-05-04')
} else {
  let threw = false
  try {
    esm.toWarekiDate(duck).toPlainDate()
  } catch (e) {
    threw = /Temporal is not available/.test(String(e && e.message))
  }
  check('toPlainDate throws without Temporal', threw, true)
}

if (failures.length > 0) {
  console.error(`\n${failures.length} smoke check(s) failed`)
  process.exit(1)
}
console.log('\nall smoke checks passed')
