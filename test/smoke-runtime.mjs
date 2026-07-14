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

if (failures.length > 0) {
  console.error(`\n${failures.length} smoke check(s) failed`)
  process.exit(1)
}
console.log('\nall smoke checks passed')
