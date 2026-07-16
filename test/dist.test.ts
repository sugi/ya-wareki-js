import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// ビルド済み dist を検証する。CI では build 後に実行される前提。
describe.skipIf(!existsSync('dist/index.cjs'))('dist artifacts', () => {
  it('works via CJS require', () => {
    const out = execFileSync('node', [
      '-e',
      "const w = require('./dist/index.cjs'); console.log(w.parse('平成7年11月10日').format('%Jf'))",
    ]).toString().trim()
    expect(out).toBe('平成07年11月10日')
  })

  it('works via ESM import', () => {
    const out = execFileSync('node', [
      '-e',
      "import('./dist/index.js').then(w => console.log(w.format(new Date(2019, 4, 4))))",
    ]).toString().trim()
    expect(out).toBe('令和元年五月四日')
  })

  it('exposes YaWareki global via IIFE with ya-kansuji bundled in', () => {
    const out = execFileSync('node', [
      '-e',
      "require('./dist/index.iife.min.js'); console.log(globalThis.YaWareki.parse('天和三年閏五月四日').format(), typeof globalThis.YaKansuji)",
    ]).toString().trim()
    expect(out).toBe('天和三年閏五月四日 undefined') // ya-kansuji は内包されるがグローバルには出さない
  })

  it('does not leak lib references into the type declarations', () => {
    // no-lib 型テスト (test/types) では triple-slash reference の混入を検出できない
    // (reference は消費側 tsconfig の lib 設定と無関係に取り込まれる) ため、ここで直接検査する。
    const dts = readFileSync('dist/index.d.ts', 'utf8')
    const dcts = readFileSync('dist/index.d.cts', 'utf8')
    expect(dts).not.toContain('/// <reference lib')
    expect(dcts).not.toContain('/// <reference lib')
  })

  it('keeps ya-kansuji external in ESM/CJS but inlined in IIFE', () => {
    const esm = readFileSync('dist/index.js', 'utf8')
    const cjs = readFileSync('dist/index.cjs', 'utf8')
    const iife = readFileSync('dist/index.iife.min.js', 'utf8')
    expect(esm).toMatch(/from ?["']ya-kansuji["']/)
    expect(cjs).toMatch(/require\(["']ya-kansuji["']\)/)
    // '無量大数' は ya-kansuji 内部の単位表にしか現れない文字列
    expect(esm).not.toContain('無量大数')
    expect(cjs).not.toContain('無量大数')
    expect(iife).toContain('無量大数')
    expect(iife).not.toMatch(/require\(["']ya-kansuji["']\)/)
  })
})
