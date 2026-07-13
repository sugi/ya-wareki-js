# ya-wareki-js コア Implementation Plan (Plan 1/2: scaffold + データパイプライン + 変換コア)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ruby gem wareki の TypeScript 移植のコア部分。旧暦テーブル (445〜1872年) のコンパクト符号化、元号索引、JD 変換、immutable な WarekiDate クラスまでを構築する。

**Architecture:** すべてユリウス日 (JD) 経由で変換する (Ruby 版と同一アルゴリズム)。旧暦データは Ruby 版から JSON ダンプ → パック文字列に符号化して `src/data/` にコミットし、初回アクセス時に一度だけ復号する。パーサ・フォーマッタ・公開 API は Plan 2 (`2026-07-13-ya-wareki-api.md`) が担当する。

**Tech Stack:** TypeScript (strict) / tsdown (ESM + CJS + IIFE + d.ts) / Vitest / ya-kansuji (依存パッケージ、ローカルインストール)

**設計仕様:** `docs/superpowers/specs/2026-07-13-ya-wareki-js-design.md` の「ya-wareki API 設計」「データ戦略」「テスト戦略」「タイムゾーンと暦法の注意点」。
**移植元:** `~/works/git/github/wareki/lib/wareki/` (挙動の正) と `~/works/git/github/wareki/spec/` (期待値)。

## Global Constraints

- **移植対象の状態**: wareki リポジトリの `fix/2026-07-13-review` ブランチ (起草時 HEAD cdfa641、2026-07-13 実行中に 6459443 へ再ピン: 差分は %% エスケープ処理の強化と ChangeLog のみでデータ定義は無変更)。この計画の実行開始時に `git -C ~/works/git/github/wareki log --oneline -1` で HEAD を確認し、cdfa641 から進んでいる場合は `git -C ~/works/git/github/wareki diff cdfa641..HEAD -- lib/` を確認してコントローラが計画への影響を評価してから着手する。tools (export-data.rb / gen-golden.rb) は生成物ヘッダに `git -C ../wareki describe --always --dirty` を記録する。

- パッケージ名 `ya-wareki`、バージョン `0.1.0`、ライセンス **BSD-2-Clause** (移植元 wareki gem と同じ。ya-kansuji は MIT なので LICENSE を流用しないこと)、author `Tatsuki Sugiura <sugi@nemui.org>`、`engines: { "node": ">=22" }`。
- `"type": "module"`。tsdown ビルドで dist/index.js (ESM) + index.cjs + index.d.ts + index.d.cts + index.iife.min.js (IIFE グローバル名 `YaWareki`) の5点を出す。IIFE のみ ya-kansuji をバンドルに取り込み、ESM/CJS では通常の dependency として external に保つ。tsdown.config.ts は ya-kansuji-js のパターン (outExtensions、CJS require 対策の globalThis footer) を踏襲する。exports マップは types 先頭、unpkg/jsdelivr フィールド、`sideEffects: false`、`files: ["dist","src","README.md","LICENSE"]`。
- 依存: package.json 上は `"ya-kansuji": "^0.1.0"`。ただし npm 未公開のため開発中は `npm install ../ya-kansuji-js` でローカルインストールする (npm が `file:../ya-kansuji-js` に書き換える)。Plan 2 の最終タスクで `"^0.1.0"` に戻す (CI / publish は ya-kansuji の npm 公開が前提)。
- tsconfig は ya-kansuji-js と同一 (ES2022 / ESNext / bundler resolution / strict / noUncheckedIndexedAccess)。既知の型の罠: as const タプルの `.length` 比較はループカウンタに `: number` 注釈が要る。noUncheckedIndexedAccess のため添字アクセスは範囲内が自明でも `as string` / `!` が要る。
- テストは Vitest。コミットメッセージは英語。インラインコメントは外部要因・背景事情の説明がある場合に限る。作業ブランチは `feature/initial-port`。
- **Ruby 互換契約**: parse / format の入出力は、サポート対象の全入力について wareki gem と完全一致させる。意図的な差異は次の5点のみ:
  1. ビルトインクラス拡張 (std_ext.rb) は移植しない。
  2. WarekiDate は immutable (setter の代わりに `with()`)。
  3. エラーは ArgumentError / Wareki::UnsupportedDateRange の代わりに `WarekiParseError` / `UnsupportedDateRangeError`。
  4. ActiveSupport::Duration 連携は移植しない。
  5. strftime 委譲: 標準コードは `%Y %y %m %d %e %j %F %%` のみ自前実装し、それ以外の非 %J コードは無変換で通す。
- データ表現の注記 (観測可能な差異ではない): Ruby の `DAY_MAX` (1684383730585466947585、Bignum) と `DATE_INFINITY.jd` (102269621425) は JS では `Number.MAX_SAFE_INTEGER` に置き換える。これらは「終端なし」の比較にしか使われない。
- 期待値に疑問が出たら発明せず Ruby 版を実行して確認する (`cd ~/works/git/github/wareki && ruby -Ilib -r wareki -e '...'`)。

## ファイル構成

```
src/errors.ts          エラークラス2種
src/constants.ts       Ruby common.rb 由来の定数
src/jd.ts              純粋な暦法⇔JD変換 (Date オブジェクト不使用)
src/data/era-defs.ts   生成物: 元号定義タプル (コミットする)
src/data/year-defs.ts  生成物: 旧暦テーブルのパック文字列 (コミットする)
src/year-data.ts       パック文字列の遅延デコーダ
src/era-lookup.ts      元号の名前引き・JD引き
src/utils.ts           Ruby Utils 相当の関数群
src/wareki-date.ts     WarekiDate クラス (Plan 1 では parse/format 抜き)
src/index.ts           公開面 (Plan 1 では VERSION のみ。Plan 2 で完成)
tools/export-data.rb   Ruby 版データ → tools/data/*.json (コミットする)
tools/encode-data.mjs  JSON → src/data/*.ts
tools/gen-golden.rb    ゴールデン CSV 生成
test/                  Vitest テスト
test/golden/conversions.csv  ゴールデン対照表 (コミットする)
```

---

### Task 1: リポジトリ雛形とビルドパイプライン

**推奨モデル:** Sonnet

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsdown.config.ts`, `.gitignore`, `LICENSE`, `src/index.ts`, `test/smoke.test.ts`

**Interfaces:**
- Produces: `npm run build` が dist 5点 (index.js / index.cjs / index.d.ts / index.d.cts / index.iife.min.js) を出力する。`npm test` が Vitest を実行する。`npm run typecheck` が tsc --noEmit を実行する。src からは `import { toNumber, toKan } from 'ya-kansuji'` が解決できる。

- [ ] **Step 1: git リポジトリを初期化してブランチを切る**

リポジトリは未初期化 (docs/ のみ存在)。

```bash
cd /home/sugi/works/git/github/ya-wareki-js
git init -b main
git add docs
git commit -m "docs: add design spec and implementation plans"
git switch -c feature/initial-port
```

- [ ] **Step 2: package.json を作成**

```json
{
  "name": "ya-wareki",
  "version": "0.1.0",
  "description": "Yet another Japanese calendar (wareki) library — parses and formats Japanese era dates including the pre-1873 lunisolar calendar",
  "keywords": ["wareki", "japanese", "calendar", "era", "和暦", "旧暦", "元号", "皇紀"],
  "license": "BSD-2-Clause",
  "author": "Tatsuki Sugiura <sugi@nemui.org>",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "unpkg": "./dist/index.iife.min.js",
  "jsdelivr": "./dist/index.iife.min.js",
  "exports": {
    ".": {
      "import": {
        "types": "./dist/index.d.ts",
        "default": "./dist/index.js"
      },
      "require": {
        "types": "./dist/index.d.cts",
        "default": "./dist/index.cjs"
      }
    }
  },
  "files": ["dist", "src", "README.md", "LICENSE"],
  "sideEffects": false,
  "engines": { "node": ">=22" },
  "scripts": {
    "build": "tsdown",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "prepublishOnly": "npm run build && npm test && npx publint && npx @arethetypeswrong/cli --pack ."
  },
  "dependencies": {
    "ya-kansuji": "^0.1.0"
  },
  "devDependencies": {
    "@arethetypeswrong/cli": "^0.18.5",
    "@types/node": "^22.20.1",
    "publint": "^0.3.21",
    "tsdown": "^0.22.7",
    "typescript": "^5.8.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 3: LICENSE (BSD-2-Clause) を作成**

ya-kansuji-js の LICENSE は MIT なのでコピーしない。以下の全文で作成する。

```
BSD 2-Clause License

Copyright (c) 2026 Tatsuki Sugiura <sugi@nemui.org>

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.
```

- [ ] **Step 4: tsconfig.json と .gitignore を作成**

tsconfig.json (ya-kansuji-js と同一 + tools を除外):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "declaration": false,
    "noEmit": true
  },
  "include": ["src", "test", "tsdown.config.ts"]
}
```

.gitignore:

```
node_modules/
dist/
# ya-kansuji が npm 公開されるまで file: 依存でロックファイルが環境依存になるため除外する。
# 公開後はロックファイルをコミットして CI を npm ci に戻す。
package-lock.json
```

- [ ] **Step 5: tsdown.config.ts を作成**

ya-kansuji-js のパターンを踏襲し、グローバル名と IIFE への ya-kansuji 取り込みだけ変える。

```ts
import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    // tsdown >=0.16 defaults ESM output to .mjs/.d.mts; force back to .js/.d.ts
    // to match the package.json exports map.
    outExtensions: (ctx) => ({
      js: ctx.format === 'cjs' ? '.cjs' : '.js',
      dts: ctx.format === 'cjs' ? '.d.cts' : '.d.ts',
    }),
  },
  {
    entry: { 'index.iife.min': 'src/index.ts' },
    format: ['iife'],
    globalName: 'YaWareki',
    minify: true,
    dts: false,
    clean: false,
    // IIFE は <script> 1枚で完結させるため ya-kansuji をバンドルに取り込む。
    // ESM/CJS ビルドでは dependencies が既定で external になるので通常の依存のまま。
    noExternal: ['ya-kansuji'],
    // tsdown appends a `.iife` format suffix by default; entryFileNames
    // pins the exact filename instead.
    outputOptions: {
      entryFileNames: '[name].js',
    },
    // rolldown's IIFE output declares `var YaWareki = ...`, which stays
    // function-scoped (and invisible on globalThis) when the file is
    // loaded via CommonJS require() (Node wraps required files in a
    // function) instead of a browser <script> tag. footer runs outside
    // the IIFE wrapper, so it can assign the local var onto globalThis
    // explicitly, making both loading styles work.
    footer: 'globalThis.YaWareki = YaWareki;',
  },
])
```

- [ ] **Step 6: 依存をインストール (ya-kansuji はローカルパスから)**

```bash
npm install ../ya-kansuji-js
npm install
```

実行後、package.json の dependencies が `"ya-kansuji": "file:../ya-kansuji-js"` に書き換わっていることを確認する (これは意図どおり。Plan 2 最終タスクで `"^0.1.0"` に戻す)。

- [ ] **Step 7: 最小の src/index.ts と smoke テストを書く**

src/index.ts:

```ts
export const VERSION = '0.1.0'
```

test/smoke.test.ts:

```ts
import { describe, expect, it } from 'vitest'
import { toKan } from 'ya-kansuji'
import { VERSION } from '../src/index.js'

describe('package', () => {
  it('has a version number', () => {
    expect(VERSION).toBe('0.1.0')
  })

  it('resolves the local ya-kansuji dependency', () => {
    expect(toKan(1234)).toBe('千二百三十四')
  })
})
```

- [ ] **Step 8: テストとビルドを検証**

Run: `npm test`
Expected: 2 tests pass

Run: `npm run typecheck`
Expected: エラーなし (終了コード 0)

Run: `npm run build && ls dist/`
Expected: `index.cjs  index.d.cts  index.d.ts  index.iife.min.js  index.js` の5点

Run: `node -e "require('./dist/index.iife.min.js'); console.log(globalThis.YaWareki.VERSION)"`
Expected: `0.1.0`

- [ ] **Step 9: コミット**

```bash
git add package.json tsconfig.json tsdown.config.ts .gitignore LICENSE src test
git commit -m "chore: scaffold package with tsdown build pipeline"
```

---

### Task 2: errors.ts + constants.ts + jd.ts

**推奨モデル:** Opus

**Files:**
- Create: `src/errors.ts`, `src/constants.ts`, `src/jd.ts`
- Test: `test/jd.test.ts`, `test/constants.test.ts`

**Interfaces:**
- Consumes: なし (最下層)
- Produces:
  - `errors.ts`: `class WarekiParseError extends Error`, `class UnsupportedDateRangeError extends Error`
  - `constants.ts`: `GREGORIAN_START_JD = 2405160`, `GREGORIAN_START_YEAR = 1873`, `IMPERIAL_START_JD = 1480041`, `IMPERIAL_START_YEAR = -660`, `COMMON_ERA_START_JD = 1721424`, `ITALY_REFORM_JD = 2299161`, `JD_MAX`, `WESTERN_ERA_NAMES: readonly string[]`, `IMPERIAL_ERA_NAMES: readonly string[]`, `ALT_MONTH_NAME: readonly string[]`, `KANJI_VARIANTS: Record<string, string>`, `SQUARE_ERAS: Record<string, string>`, `NUM_CHARS: string`, `NORTH_COURT_ERA_NAMES: readonly string[]`
  - `jd.ts`: `gregorianToJd(y, m, d): number`, `jdToGregorian(jd): { year; month; day }`, `julianToJd(y, m, d): number`, `jdToJulian(jd): { year; month; day }`, `italyToJd(y, m, d): number`

- [ ] **Step 1: 失敗するテストを書く (test/jd.test.ts)**

期待値はすべて Ruby の `Date#jd` から採取済み (発明しないこと)。

```ts
import { describe, expect, it } from 'vitest'
import { WarekiParseError } from '../src/errors.js'
import { gregorianToJd, italyToJd, jdToGregorian, jdToJulian, julianToJd } from '../src/jd.js'

// Ruby: Date.new(y, m, d, Date::GREGORIAN).jd
const GREGORIAN_PAIRS: Array<[number, number, number, number]> = [
  [1873, 1, 1, 2405160], // 明治改暦日 = GREGORIAN_START_JD
  [2019, 5, 1, 2458605], // 令和開始
  [1582, 10, 15, 2299161], // Date::ITALY の改暦日
  [2000, 1, 1, 2451545],
  [-660, 2, 11, 1480041], // 皇紀元年 = IMPERIAL_START_JD
  [1, 1, 1, 1721426],
  [645, 7, 20, 1956842], // 大化元年 (ユリウス暦 645-07-17 と同日)
]

// Ruby: Date.new(y, m, d, Date::JULIAN).jd
const JULIAN_PAIRS: Array<[number, number, number, number]> = [
  [1, 1, 1, 1721424], // 擬似元号「西暦」の開始 JD
  [1582, 10, 4, 2299160], // ユリウス暦最終日
  [1865, 10, 1, 2402523], // 慶應元年八月二十四日
  [645, 7, 17, 1956842],
  [-9876, 4, 2, -1886059], // 負の JD も Ruby と一致させる
]

describe('gregorianToJd / jdToGregorian', () => {
  it.each(GREGORIAN_PAIRS)('%i-%i-%i <-> jd %i', (y, m, d, jd) => {
    expect(gregorianToJd(y, m, d)).toBe(jd)
    expect(jdToGregorian(jd)).toEqual({ year: y, month: m, day: d })
  })

  it('round-trips every 1000 days across a wide range', () => {
    for (let jd = -2000000; jd <= 3000000; jd += 1000) {
      const g = jdToGregorian(jd)
      expect(gregorianToJd(g.year, g.month, g.day)).toBe(jd)
    }
  })
})

describe('julianToJd / jdToJulian', () => {
  it.each(JULIAN_PAIRS)('%i-%i-%i <-> jd %i', (y, m, d, jd) => {
    expect(julianToJd(y, m, d)).toBe(jd)
    expect(jdToJulian(jd)).toEqual({ year: y, month: m, day: d })
  })

  it('round-trips every 1000 days across a wide range', () => {
    for (let jd = -2000000; jd <= 3000000; jd += 1000) {
      const j = jdToJulian(jd)
      expect(julianToJd(j.year, j.month, j.day)).toBe(jd)
    }
  })
})

describe('italyToJd (Ruby Date::ITALY 相当)', () => {
  it('uses Gregorian from 1582-10-15 and Julian until 1582-10-04', () => {
    expect(italyToJd(1582, 10, 15)).toBe(2299161)
    expect(italyToJd(1582, 10, 4)).toBe(2299160)
    expect(italyToJd(1873, 1, 1)).toBe(2405160)
    expect(italyToJd(1865, 10, 13)).toBe(2402523) // グレゴリオ暦 1865-10-13 = ユリウス暦 1865-10-01
    expect(italyToJd(645, 7, 17)).toBe(1956842)
    expect(italyToJd(2, 12, 31)).toBe(1722153)
    expect(italyToJd(-203, 12, 31)).toBe(1647277)
  })

  it('rejects the nonexistent 1582-10-05..14 gap like Ruby Date.new', () => {
    for (const day of [5, 9, 14]) {
      expect(() => italyToJd(1582, 10, day)).toThrow(WarekiParseError)
    }
  })
})
```

test/constants.test.ts (NFC 正規化事故の検出が主目的):

```ts
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
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run test/jd.test.ts test/constants.test.ts`
Expected: FAIL (Cannot find module '../src/jd.js' 等)

- [ ] **Step 3: src/errors.ts を実装**

```ts
export class WarekiParseError extends Error {
  constructor(message?: string) {
    super(message)
    this.name = 'WarekiParseError'
  }
}

export class UnsupportedDateRangeError extends Error {
  constructor(message?: string) {
    super(message)
    this.name = 'UnsupportedDateRangeError'
  }
}
```

- [ ] **Step 4: src/constants.ts を実装**

値はすべて Ruby common.rb / era_def.rb からの転記。

```ts
export const GREGORIAN_START_JD = 2_405_160 // 1873-01-01 (グレゴリオ暦) = 明治改暦日
export const GREGORIAN_START_YEAR = 1873
export const IMPERIAL_START_JD = 1_480_041 // -660-02-11 (先発グレゴリオ暦) = 神武天皇即位
export const IMPERIAL_START_YEAR = -660
export const COMMON_ERA_START_JD = 1_721_424 // 0001-01-01 (ユリウス暦) = 擬似元号「西暦」の開始
export const ITALY_REFORM_JD = 2_299_161 // 1582-10-15 (グレゴリオ暦)。Ruby Date::ITALY の改暦日
// Ruby の DAY_MAX (Bignum) / DATE_INFINITY.jd の代替。「終端なし」の比較にのみ使う
export const JD_MAX = Number.MAX_SAFE_INTEGER

export const WESTERN_ERA_NAMES: readonly string[] = ['', '西暦', '紀元前']
export const IMPERIAL_ERA_NAMES: readonly string[] = ['皇紀', '神武天皇即位紀元']

export const ALT_MONTH_NAME: readonly string[] = [
  '睦月', '如月', '弥生', '卯月', '皐月', '水無月',
  '文月', '葉月', '長月', '神無月', '霜月', '師走',
]

// 新字体 → 旧字体・異体字 (Ruby KANJI_VARIANTS)。値のうち CJK 互換漢字
// (U+FA19 神 など) はエディタ・ツールの NFC 正規化で通常字に潰れて別の
// コードポイントになるため、必ず \u エスケープで書くこと。
export const KANJI_VARIANTS: Record<string, string> = {
  '宝': '寳',
  '霊': '靈',
  '神': '\uFA19',
  '応': '應',
  '暦': '曆',
  '祥': '\uFA1A',
  '寿': '壽',
  '斎': '斉',
  '観': '觀',
  '寛': '寬',
  '徳': '德',
  '禄': '祿',
  '万': '萬',
  '福': '\uFA1B',
  '禎': '\uFA53',
  '国': '國',
  '亀': '龜',
  '令': '\uF9A8',
}

export const SQUARE_ERAS: Record<string, string> = {
  '㍾': '明治',
  '㍽': '大正',
  '㍼': '昭和',
  '㍻': '平成',
  '㋿': '令和',
}

export const NUM_CHARS =
  '零壱壹弌弐貳貮参參弎肆伍陸漆質柒捌玖〇一二三四五六七八九十拾什卄廿卅丗卌百陌佰皕阡仟千万萬億兆京垓0123456789０１２３４５６７８９'

// 南北朝期に北朝でのみ使われた元号。JD からの元号解決では南朝を優先するため
// 索引から除外する (名前からの解釈は eraByName で引き続き可能)。
export const NORTH_COURT_ERA_NAMES: readonly string[] = [
  '正慶', '暦応', '康永', '貞和', '観応', '文和', '延文', '康安',
  '貞治', '応安', '永和', '康暦', '永徳', '至徳', '嘉慶', '康応',
]
```

- [ ] **Step 5: src/jd.ts を実装 (Fliegel–Van Flandern)**

```ts
import { WarekiParseError } from './errors.js'

const fdiv = (a: number, b: number): number => Math.floor(a / b)

export function gregorianToJd(y: number, m: number, d: number): number {
  const a = fdiv(14 - m, 12)
  const yy = y + 4800 - a
  const mm = m + 12 * a - 3
  return d + fdiv(153 * mm + 2, 5) + 365 * yy + fdiv(yy, 4) - fdiv(yy, 100) + fdiv(yy, 400) - 32045
}

export function jdToGregorian(jd: number): { year: number; month: number; day: number } {
  const a = jd + 32044
  const b = fdiv(4 * a + 3, 146097)
  const c = a - fdiv(146097 * b, 4)
  const d = fdiv(4 * c + 3, 1461)
  const e = c - fdiv(1461 * d, 4)
  const m = fdiv(5 * e + 2, 153)
  return {
    year: 100 * b + d - 4800 + fdiv(m, 10),
    month: m + 3 - 12 * fdiv(m, 10),
    day: e - fdiv(153 * m + 2, 5) + 1,
  }
}

export function julianToJd(y: number, m: number, d: number): number {
  const a = fdiv(14 - m, 12)
  const yy = y + 4800 - a
  const mm = m + 12 * a - 3
  return d + fdiv(153 * mm + 2, 5) + 365 * yy + fdiv(yy, 4) - 32083
}

export function jdToJulian(jd: number): { year: number; month: number; day: number } {
  const c = jd + 32082
  const d = fdiv(4 * c + 3, 1461)
  const e = c - fdiv(1461 * d, 4)
  const m = fdiv(5 * e + 2, 153)
  return {
    year: d - 4800 + fdiv(m, 10),
    month: m + 3 - 12 * fdiv(m, 10),
    day: e - fdiv(153 * m + 2, 5) + 1,
  }
}

// Ruby の Date::ITALY 相当: 1582-10-15 以降はグレゴリオ暦、1582-10-04 以前は
// ユリウス暦の年月日として解釈する。改暦で存在しない 1582-10-05〜14 は Ruby の
// Date.new が ArgumentError を上げるのに合わせ WarekiParseError を投げる。
export function italyToJd(y: number, m: number, d: number): number {
  if (y > 1582 || (y === 1582 && (m > 10 || (m === 10 && d >= 15)))) return gregorianToJd(y, m, d)
  if (y < 1582 || m < 10 || d <= 4) return julianToJd(y, m, d)
  throw new WarekiParseError(`invalid date (nonexistent in Julian-Gregorian transition): ${y}-${m}-${d}`)
}
```

- [ ] **Step 6: テストが通ることを確認**

Run: `npx vitest run test/jd.test.ts test/constants.test.ts`
Expected: 全テスト PASS

Run: `npm run typecheck`
Expected: エラーなし

- [ ] **Step 7: コミット**

```bash
git add src/errors.ts src/constants.ts src/jd.ts test/jd.test.ts test/constants.test.ts
git commit -m "feat: add errors, constants and pure JD calendar conversions"
```

---

### Task 3: データパイプライン (export-data.rb / encode-data.mjs / year-data.ts)

**推奨モデル:** Opus

**Files:**
- Create: `tools/export-data.rb`, `tools/encode-data.mjs`, `src/year-data.ts`
- Create (生成物、コミットする): `tools/data/year-defs.json`, `tools/data/era-defs.json`, `src/data/year-defs.ts`, `src/data/era-defs.ts`
- Test: `test/year-data.test.ts`

**Interfaces:**
- Consumes: なし (データ層)
- Produces:
  - `src/data/era-defs.ts`: `type EraTuple = readonly [name: string, year: number, start: number, end: number]`, `ERA_TUPLES: readonly EraTuple[]` (248件), `ERA_NORTH_TUPLES: readonly EraTuple[]` (248件)
  - `src/data/year-defs.ts`: `FIRST_YEAR = 445`, `FIRST_JD = 1883618`, `YEAR_COUNT = 1428`, `PACKED: string`, `START_OVERRIDES: Readonly<Record<number, number>>`, `DAY_OVERRIDES: ReadonlyArray<readonly [number, number, number]>`
  - `year-data.ts`: `interface YearInfo { year: number; start: number; end: number; leapMonth: number | null; monthStarts: number[]; monthDays: number[] }`, `yearByNum(year: number): YearInfo | undefined`, `findYearByJd(jd: number): YearInfo | undefined`

**パック形式の仕様 (この符号化は Ruby 版データに対する実測で正当性を確認済み):**

- 旧暦テーブルは445〜1872年の1428年分。実測済みの性質:
  - `monthStarts` は先頭月の JD + `monthDays` の累積和と全年で完全一致する (例外0件)。
  - 各年の先頭月 JD は前年の全日数の直後に連続する (例外0件)。よって `FIRST_JD = 1883618` から全 `monthStarts` を復元できる。
  - `end` は全年で「先頭月 JD + 日数合計 − 1」に一致する。
  - `monthDays` は 29 か 30 の2値。唯一の例外は1872年 (明治5年) の第12月 = 2日 (改暦による打ち切り)。
  - 月数は閏月があれば13、なければ12。`leapMonth` は 1〜12 (閏N月)。
  - `start` フィールドは通常先頭月 JD に等しいが、**43年だけ** `monthStarts[0]` と異なる (例: 467年は start=1891680 だが monthStarts[0]=1891650)。Ruby の `find_year` は各年の start を判定に使わないためこの不整合は無害だが、ラウンドトリップ一致のため明示的に保持する。
- 1年を 17 ビットの整数 `v = (leapMonth << 13) | dayBits` に詰める (`leapMonth`: 閏なし=0 / 閏N月=N。`dayBits`: bit j (j=0 が第1月) が 1 なら 30 日、0 なら 29 日)。`v` を 6 ビット×3文字 (`ALPHABET[v>>12 & 63]`, `ALPHABET[(v>>6) & 63]`, `ALPHABET[v & 63]`) で符号化し、1428年×3文字 = 4284 文字の `PACKED` にする。
- ALPHABET は `'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-'` (64文字、エンコーダとデコーダで同一定義)。
- 例 (445年): leapMonth=5、monthDays=[30,29,30,29,30,29,30,29,30,29,30,29,30] → dayBits=0b1010101010101=5461 → v=(5<<13)|5461=46421 → 3文字は ALPHABET[11]+ALPHABET[21]+ALPHABET[21] = `'LVV'`。
- 例外は生成ファイルに明示する: `START_OVERRIDES` (43件、年→start)、`DAY_OVERRIDES` (`[[1872, 11, 2]]` = 1872年の月 index 11 は 2 日)。
- 元号定義は圧縮せず、読めるタプル配列としてそのまま生成する。Ruby の `DAY_MAX` (令和の end、Bignum) は `9007199254740991` (Number.MAX_SAFE_INTEGER) に置き換える。
- サイズ目標: `src/data/` 合計 25KB 以下。

- [ ] **Step 1: tools/export-data.rb を書く**

```ruby
#!/usr/bin/env ruby
# frozen_string_literal: true

# Ruby 版 wareki (../wareki) の定義データを JSON にダンプする。
# 再生成時のみ手元で実行する。CI では実行しない (生成物はコミット済み)。
require 'json'
require 'fileutils'

wareki_lib = File.expand_path('../../wareki/lib', __dir__)
File.directory?(wareki_lib) or abort "wareki gem source not found: #{wareki_lib}"
$LOAD_PATH.unshift wareki_lib
# wareki.rb 本体は ya_kansuji gem を要求するため、データ定義ファイルだけを読む
require 'wareki/calendar_def'
require 'wareki/era_def'

# JS の Number.MAX_SAFE_INTEGER。DAY_MAX (Bignum) の代替
JD_MAX = 9_007_199_254_740_991

def era_rows(defs)
  defs.map { |e| [e.name, e.year, e.start, e.end > JD_MAX ? JD_MAX : e.end] }
end

out_dir = File.expand_path('data', __dir__)
FileUtils.mkdir_p(out_dir)

years = Wareki::YEAR_DEFS.map do |y|
  { year: y.year, start: y.start, end: y.end, leapMonth: y.leap_month,
    monthStarts: y.month_starts, monthDays: y.month_days }
end
File.write(File.join(out_dir, 'year-defs.json'), JSON.pretty_generate(years))
File.write(File.join(out_dir, 'era-defs.json'), JSON.pretty_generate(
  eraDefs: era_rows(Wareki::ERA_DEFS), eraNorthDefs: era_rows(Wareki::ERA_NORTH_DEFS)
))
puts "years: #{years.size}, eras: #{Wareki::ERA_DEFS.size}, north: #{Wareki::ERA_NORTH_DEFS.size}"
```

- [ ] **Step 2: 実行して JSON を生成**

Run: `ruby tools/export-data.rb`
Expected: `years: 1428, eras: 248, north: 248`

Run: `node -e "const y=require('./tools/data/year-defs.json'); console.log(y.length, y[0].year, y.at(-1).year, y.at(-1).monthDays.at(-1))"`
Expected: `1428 445 1872 2`

- [ ] **Step 3: tools/encode-data.mjs を書く**

エンコーダは上記パック形式の仕様の前提 (連続性・累積和・end 一致) をすべて検証し、破れていれば throw する。

```js
#!/usr/bin/env node
// tools/data/*.json から src/data/*.ts を生成する。再生成時のみ実行する。
// パック形式の仕様は docs/superpowers/plans/2026-07-13-ya-wareki-core.md Task 3 を参照。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const years = JSON.parse(readFileSync(join(root, 'tools/data/year-defs.json'), 'utf8'))
const eras = JSON.parse(readFileSync(join(root, 'tools/data/era-defs.json'), 'utf8'))

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
```

- [ ] **Step 4: 実行して src/data/*.ts を生成し、サイズを確認**

Run: `node tools/encode-data.mjs`
Expected: `packed: 4284 chars, startOverrides: 43, dayOverrides: 1`

Run: `wc -c src/data/*.ts`
Expected: 合計 25,000 バイト以下 (目安: era-defs.ts ≈ 18KB、year-defs.ts ≈ 6KB)

- [ ] **Step 5: 失敗するテストを書く (test/year-data.test.ts)**

ラウンドトリップ (デコード結果が Ruby ダンプの JSON と全1428年で deep equal) が本丸。

```ts
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
      expect(yearByNum(y.year), `year ${y.year}`).toEqual(y)
    }
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

  it('resolves gap days of START_OVERRIDES years like Ruby (start は判定に使わない)', () => {
    // 467年の閏1月域: start(1891680) より前だが Ruby の bsearch は 467 年を返す
    expect(findYearByJd(1891650)!.year).toBe(467)
    expect(findYearByJd(1891679)!.year).toBe(467)
  })
})
```

- [ ] **Step 6: テストが失敗することを確認**

Run: `npx vitest run test/year-data.test.ts`
Expected: FAIL (Cannot find module '../src/year-data.js')

- [ ] **Step 7: src/year-data.ts (デコーダ) を実装**

```ts
import {
  DAY_OVERRIDES, FIRST_JD, FIRST_YEAR, PACKED, START_OVERRIDES, YEAR_COUNT,
} from './data/year-defs.js'

export interface YearInfo {
  year: number
  start: number
  end: number
  leapMonth: number | null
  monthStarts: number[]
  monthDays: number[]
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-'
const CODE = new Map(Array.from(ALPHABET, (c, i) => [c, i]))

let table: YearInfo[] | undefined

function decode(): YearInfo[] {
  const years: YearInfo[] = []
  const dayOverrides = new Map(DAY_OVERRIDES.map(([y, j, d]) => [y * 16 + j, d]))
  let jd = FIRST_JD
  for (let i = 0; i < YEAR_COUNT; i++) {
    const year = FIRST_YEAR + i
    const v =
      CODE.get(PACKED[3 * i] as string)! * 4096 +
      CODE.get(PACKED[3 * i + 1] as string)! * 64 +
      CODE.get(PACKED[3 * i + 2] as string)!
    const leapMonth = v >> 13 === 0 ? null : v >> 13
    const count = leapMonth === null ? 12 : 13
    const monthStarts: number[] = []
    const monthDays: number[] = []
    for (let j = 0; j < count; j++) {
      monthStarts.push(jd)
      const days = dayOverrides.get(year * 16 + j) ?? ((v >> j) & 1 ? 30 : 29)
      monthDays.push(days)
      jd += days
    }
    years.push({
      year,
      start: START_OVERRIDES[year] ?? (monthStarts[0] as number),
      end: jd - 1,
      leapMonth,
      monthStarts,
      monthDays,
    })
  }
  return years
}

function all(): YearInfo[] {
  return (table ??= decode())
}

export function yearByNum(year: number): YearInfo | undefined {
  if (year < FIRST_YEAR || year >= FIRST_YEAR + YEAR_COUNT) return undefined
  return all()[year - FIRST_YEAR]
}

// Ruby Utils.find_year 互換: 「end >= jd を満たす最初の年」を二分探索する。
// テーブル先頭より前だけを FIRST_JD で弾き、各年の start は判定に使わない。
// START_OVERRIDES の43年は start > monthStarts[0] だが、その隙間の日付も
// この年に解決されるのが Ruby の挙動 (find_year は end しか見ない)。
export function findYearByJd(jd: number): YearInfo | undefined {
  if (jd < FIRST_JD) return undefined
  const years = all()
  let hi = years.length - 1
  if (jd > (years[hi] as YearInfo).end) return undefined
  let lo = 0
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if ((years[mid] as YearInfo).end >= jd) hi = mid
    else lo = mid + 1
  }
  return years[lo]
}
```

- [ ] **Step 8: テストが通ることを確認**

Run: `npx vitest run test/year-data.test.ts`
Expected: 全テスト PASS

Run: `npm run typecheck`
Expected: エラーなし

- [ ] **Step 9: コミット (生成物・JSON フィクスチャ込み)**

```bash
git add tools/export-data.rb tools/encode-data.mjs tools/data src/data src/year-data.ts test/year-data.test.ts
git commit -m "feat: add data pipeline with packed lunisolar year table"
```

---

### Task 4: era-lookup.ts + utils.ts

**推奨モデル:** Sonnet

**Files:**
- Create: `src/era-lookup.ts`, `src/utils.ts`
- Test: `test/era-lookup.test.ts`, `test/utils.test.ts`

**Interfaces:**
- Consumes: Task 2 の constants/errors/jd、Task 3 の `ERA_TUPLES` / `ERA_NORTH_TUPLES` / `yearByNum` / `findYearByJd`、ya-kansuji の `toNumber`
- Produces:
  - `era-lookup.ts`: `interface EraDef { name: string; year: number; start: number; end: number }`, `ERA_DEFS: readonly EraDef[]`, `ERA_NORTH_DEFS: readonly EraDef[]`, `ERA_NAME_KEYS: readonly string[]` (ERA_BY_NAME のキー、挿入順、'' を含む — Plan 2 のパーサが正規表現構築に使う), `ERA_JD_LOOKUP (superseded: Task 6 のゴールデンテストでこの事前計算方式の南朝優先仮定が Ruby と不一致と判明し、Ruby find_era 忠実な逆順線形走査に置換済み — このスニペットを再利用しないこと): readonly EraDef[]`, `normalizeKanjiVariants(str: string): string`, `eraByName(name: string): EraDef | undefined`, `findEraByJd(jd: number): EraDef | undefined`
  - `utils.ts`: `lastDayOfMonth(year, month, isLeap): number`, `lastDayOfEraMonth(eraName: string | null | undefined, civilYear, month, isLeap): number`, `eraYearToCivil(eraName: string | null | undefined, eraYear): number`, `civilToEraYear(eraName: string | null | undefined, year): number`, `altMonthNameToNumber(name: string): number | undefined`, `altMonthName(month: number): string`, `findDateParts(jd: number): { year: number; month: number; day: number; isLeapMonth: boolean }`, `i2z(num: number): string`, `k2i(str: string): number`

- [ ] **Step 1: 失敗するテストを書く (test/era-lookup.test.ts)**

期待値は Ruby utils_spec.rb と Ruby 実行結果からの転記。JD 定数は Ruby の `Date.new(y,m,d[,GREGORIAN]).jd` で採取済み。

```ts
import { describe, expect, it } from 'vitest'
import {
  ERA_DEFS, ERA_JD_LOOKUP, ERA_NAME_KEYS, ERA_NORTH_DEFS,
  eraByName, findEraByJd, normalizeKanjiVariants,
} from '../src/era-lookup.js'
import { NORTH_COURT_ERA_NAMES } from '../src/constants.js'

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
    expect(normalizeKanjiVariants('神亀')).toBe('神亀')
    expect(normalizeKanjiVariants('平成')).toBe('平成')
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
    expect(ERA_NAME_KEYS.at(-1)).toBe('') // 皇紀, 神武天皇即位紀元, 西暦, '' の順で末尾に来る
  })
})
```

- [ ] **Step 2: 失敗するテストを書く (test/utils.test.ts)**

```ts
import { describe, expect, it } from 'vitest'
import { UnsupportedDateRangeError, WarekiParseError } from '../src/errors.js'
import {
  altMonthName, altMonthNameToNumber, civilToEraYear, eraYearToCivil,
  findDateParts, i2z, k2i, lastDayOfEraMonth, lastDayOfMonth,
} from '../src/utils.js'

describe('altMonthName (Ruby utils_spec より転記)', () => {
  it('converts alternative month names to numbers', () => {
    expect(altMonthNameToNumber('弥生')).toBe(3)
    expect(altMonthNameToNumber('師走')).toBe(12)
    expect(altMonthNameToNumber('水無月')).toBe(6)
    expect(altMonthNameToNumber('ほげ')).toBeUndefined() // Ruby は false
    expect(altMonthName(5)).toBe('皐月')
  })
})

describe('eraYearToCivil / civilToEraYear (Ruby utils_spec より転記)', () => {
  it('converts era year to civil year', () => {
    expect(eraYearToCivil('明治', 5)).toBe(1872)
    expect(eraYearToCivil('㍾', 5)).toBe(1872)
    expect(eraYearToCivil('皇紀', 2532)).toBe(1872)
    expect(eraYearToCivil('神武天皇即位紀元', 2685)).toBe(2025)
    expect(eraYearToCivil('', 2020)).toBe(2020)
    expect(eraYearToCivil(null, 2020)).toBe(2020)
    expect(eraYearToCivil('西暦', 321)).toBe(321)
    expect(eraYearToCivil('紀元前', 203)).toBe(-203)
    expect(() => eraYearToCivil('謎元号', 1)).toThrow(WarekiParseError)
  })

  it('converts civil year to era year', () => {
    expect(civilToEraYear('明治', 1872)).toBe(5)
    expect(civilToEraYear('皇紀', 1872)).toBe(2532)
    expect(civilToEraYear('紀元前', -203)).toBe(203)
    expect(civilToEraYear('', 2020)).toBe(2020)
  })
})

describe('lastDayOfMonth / lastDayOfEraMonth (Ruby utils_spec より転記)', () => {
  it('returns last day of month by era', () => {
    expect(lastDayOfEraMonth('明治', 1872, 10, false)).toBe(30)
    expect(lastDayOfEraMonth('皇紀', 1872, 10, false)).toBe(30)
    expect(lastDayOfEraMonth('', 2000, 2, false)).toBe(29)
    expect(lastDayOfEraMonth('紀元前', -1, 12, false)).toBe(31)
    expect(lastDayOfEraMonth('西暦', 300, 5, false)).toBe(31)
    expect(lastDayOfEraMonth('令和', 2021, 2, false)).toBe(28)
    // ITALY の 1582 年 10 月は月末 31 日 (Ruby: Date.new(1582,10,-1,ITALY).day)
    expect(lastDayOfEraMonth('西暦', 1582, 10, false)).toBe(31)
    // ユリウス暦の閏年 (4年毎、負の年は floored modulo)
    expect(lastDayOfEraMonth('西暦', 1500, 2, false)).toBe(29)
    expect(lastDayOfEraMonth('紀元前', -1, 2, false)).toBe(28)
  })

  it('reads the lunisolar table below 1873', () => {
    expect(lastDayOfMonth(1872, 12, false)).toBe(2) // 明治5年12月は2日
    expect(lastDayOfMonth(1683, 5, true)).toBe(29) // 天和3年閏5月
    expect(() => lastDayOfMonth(300, 1, false)).toThrow(UnsupportedDateRangeError)
  })
})

describe('findDateParts (Ruby Utils.find_date_ary)', () => {
  it('resolves lunisolar dates', () => {
    expect(findDateParts(2400508)).toEqual({ year: 1860, month: 3, day: 17, isLeapMonth: false })
    expect(findDateParts(2335942)).toEqual({ year: 1683, month: 5, day: 4, isLeapMonth: true })
    expect(findDateParts(2405159)).toEqual({ year: 1872, month: 12, day: 2, isLeapMonth: false })
  })

  it('resolves Gregorian dates from 1873-01-01', () => {
    expect(findDateParts(2405160)).toEqual({ year: 1873, month: 1, day: 1, isLeapMonth: false })
    expect(findDateParts(2458605)).toEqual({ year: 2019, month: 5, day: 1, isLeapMonth: false })
  })

  it('throws for dates before the year table', () => {
    expect(() => findDateParts(1883617)).toThrow(UnsupportedDateRangeError)
  })
})

describe('i2z / k2i', () => {
  it('converts to zenkaku digits', () => {
    expect(i2z(1234)).toBe('１２３４')
    expect(i2z(-5)).toBe('-５')
  })

  it('parses kansuji with 正/元/朔 specials (Ruby Utils.k2i)', () => {
    expect(k2i('正')).toBe(1) // ya-kansuji では正=10^40 なので短絡が必須
    expect(k2i('元')).toBe(1)
    expect(k2i('朔')).toBe(1)
    expect(k2i('二十九')).toBe(29)
    expect(k2i('卅')).toBe(30)
    expect(k2i('１７')).toBe(17)
    expect(k2i('1928')).toBe(1928)
    expect(k2i('')).toBe(0)
  })
})
```

- [ ] **Step 3: テストが失敗することを確認**

Run: `npx vitest run test/era-lookup.test.ts test/utils.test.ts`
Expected: FAIL (モジュール未実装)

- [ ] **Step 4: src/era-lookup.ts を実装**

```ts
import {
  COMMON_ERA_START_JD, IMPERIAL_START_JD, IMPERIAL_START_YEAR, JD_MAX,
  KANJI_VARIANTS, NORTH_COURT_ERA_NAMES, SQUARE_ERAS,
} from './constants.js'
import { ERA_NORTH_TUPLES, ERA_TUPLES, type EraTuple } from './data/era-defs.js'

export interface EraDef {
  name: string
  year: number
  start: number
  end: number
}

const toEra = (t: EraTuple): EraDef => ({ name: t[0], year: t[1], start: t[2], end: t[3] })

export const ERA_DEFS: readonly EraDef[] = ERA_TUPLES.map(toEra)
export const ERA_NORTH_DEFS: readonly EraDef[] = ERA_NORTH_TUPLES.map(toEra)

// Ruby ERA_BY_NAME 相当。北朝 → 南朝の順に入れ、同名 (建武) は南朝が勝つ。
const ERA_BY_NAME = new Map<string, EraDef>()
for (const e of [...ERA_NORTH_DEFS, ...ERA_DEFS]) ERA_BY_NAME.set(e.name, e)
const IMPERIAL_ERA: EraDef = { name: '皇紀', year: IMPERIAL_START_YEAR, start: IMPERIAL_START_JD, end: JD_MAX }
ERA_BY_NAME.set('皇紀', IMPERIAL_ERA)
ERA_BY_NAME.set('神武天皇即位紀元', IMPERIAL_ERA)
const COMMON_ERA: EraDef = { name: '西暦', year: 1, start: COMMON_ERA_START_JD, end: JD_MAX }
ERA_BY_NAME.set('西暦', COMMON_ERA)
ERA_BY_NAME.set('', COMMON_ERA)

// パーサが元号候補の正規表現を組むためのキー一覧 (Ruby の ERA_BY_NAME.keys と
// 同じ挿入順。空文字列 '' を含む点に注意)
export const ERA_NAME_KEYS: readonly string[] = [...ERA_BY_NAME.keys()]

const VARIANT_TO_CANONICAL = new Map<string, string>()
for (const [canonical, variants] of Object.entries(KANJI_VARIANTS)) {
  for (const v of variants) VARIANT_TO_CANONICAL.set(v, canonical)
}

export function normalizeKanjiVariants(str: string): string {
  return Array.from(str, (c) => VARIANT_TO_CANONICAL.get(c) ?? c).join('')
}

// Ruby ERA_BY_NAME[key] (default_proc 込み) 相当。
// '紀元前' は Ruby 同様ここでは引けない (undefined)。パーサ側で特別扱いする。
export function eraByName(name: string): EraDef | undefined {
  return ERA_BY_NAME.get(name) ?? ERA_BY_NAME.get(SQUARE_ERAS[name] ?? normalizeKanjiVariants(name))
}

// Ruby ERA_JD_LOOKUP 相当: 北朝元号を除き、南北朝合一で継続元号となった明徳は
// 元中の終端から充て、隣接・重複する境界は後続元号を優先するよう end を詰める。
export const ERA_JD_LOOKUP: readonly EraDef[] = (() => {
  const eras = ERA_DEFS.filter((e) => !NORTH_COURT_ERA_NAMES.includes(e.name)).map((e) => ({ ...e }))
  const meitoku = eras.find((e) => e.name === '明徳')!
  const gencyu = eras.find((e) => e.name === '元中')!
  meitoku.start = gencyu.end
  eras.sort((a, b) => a.start - b.start)
  for (let i = 0; i + 1 < eras.length; i++) {
    const a = eras[i]!
    const b = eras[i + 1]!
    if (a.end >= b.start) a.end = b.start - 1
  }
  return eras
})()

// Ruby Utils.find_era 互換: end >= jd を満たす最初の元号を二分探索し、
// start が jd 以前でなければ undefined (元号の空白期間)。
export function findEraByJd(jd: number): EraDef | undefined {
  const eras = ERA_JD_LOOKUP
  let hi = eras.length - 1
  if (jd > (eras[hi] as EraDef).end) return undefined
  let lo = 0
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if ((eras[mid] as EraDef).end >= jd) hi = mid
    else lo = mid + 1
  }
  const era = eras[lo] as EraDef
  return era.start <= jd ? era : undefined
}
```

- [ ] **Step 5: src/utils.ts を実装**

```ts
import { toNumber } from 'ya-kansuji'
import {
  ALT_MONTH_NAME, GREGORIAN_START_JD, GREGORIAN_START_YEAR,
  IMPERIAL_ERA_NAMES, IMPERIAL_START_YEAR, WESTERN_ERA_NAMES,
} from './constants.js'
import { UnsupportedDateRangeError, WarekiParseError } from './errors.js'
import { eraByName } from './era-lookup.js'
import { jdToGregorian } from './jd.js'
import { findYearByJd, yearByNum } from './year-data.js'

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const

const mod = (a: number, b: number): number => ((a % b) + b) % b

function gregorianLastDay(year: number, month: number): number {
  if (month === 2) return mod(year, 4) === 0 && (mod(year, 100) !== 0 || mod(year, 400) === 0) ? 29 : 28
  return MONTH_DAYS[month - 1] as number
}

function julianLastDay(year: number, month: number): number {
  if (month === 2) return mod(year, 4) === 0 ? 29 : 28
  return MONTH_DAYS[month - 1] as number
}

export function lastDayOfMonth(year: number, month: number, isLeap: boolean): number {
  if (year >= GREGORIAN_START_YEAR) return gregorianLastDay(year, month)
  const yobj = yearByNum(year)
  if (!yobj) throw new UnsupportedDateRangeError(`Cannot find year ${year}`)
  let monthIdx = month - 1
  if (isLeap || (yobj.leapMonth !== null && yobj.leapMonth < month)) monthIdx += 1
  // 存在しない添字 (12ヶ月年の閏12月など) は Ruby 同様 undefined を返し、
  // 呼び出し側 (WarekiDate の検証) が invalid date として拒否する
  return yobj.monthDays[monthIdx] as number
}

export function eraYearToCivil(eraName: string | null | undefined, eraYear: number): number {
  const era = eraName ?? ''
  if (era === '' || era === '西暦') return eraYear
  if (era === '紀元前') return -eraYear
  if (IMPERIAL_ERA_NAMES.includes(era)) return eraYear + IMPERIAL_START_YEAR
  const def = eraByName(era)
  if (!def) throw new WarekiParseError(`Undefined era '${era}'`)
  return def.year + eraYear - 1
}

export function civilToEraYear(eraName: string | null | undefined, year: number): number {
  const era = eraName ?? ''
  if (era === '' || era === '西暦') return year
  if (era === '紀元前') return -year
  if (IMPERIAL_ERA_NAMES.includes(era)) return year - IMPERIAL_START_YEAR
  const def = eraByName(era)
  if (!def) throw new WarekiParseError(`Undefined era '${era}'`)
  return year - def.year + 1
}

export function lastDayOfEraMonth(
  eraName: string | null | undefined,
  civilYear: number,
  month: number,
  isLeap: boolean,
): number {
  const era = eraName ?? ''
  if (WESTERN_ERA_NAMES.includes(era)) {
    // Ruby: Date.new(civil_year, month, -1, ITALY).day 相当。
    // 1582年10月は改暦月だが ITALY での月末日は 31。
    if (civilYear === 1582 && month === 10) return 31
    if (civilYear > 1582 || (civilYear === 1582 && month > 10)) return gregorianLastDay(civilYear, month)
    return julianLastDay(civilYear, month)
  }
  return lastDayOfMonth(civilYear, month, isLeap)
}

export function altMonthNameToNumber(name: string): number | undefined {
  const i = ALT_MONTH_NAME.indexOf(name)
  return i < 0 ? undefined : i + 1
}

export function altMonthName(month: number): string {
  return ALT_MONTH_NAME[month - 1] as string
}

// Ruby Utils.find_date_ary 相当
export function findDateParts(jd: number): { year: number; month: number; day: number; isLeapMonth: boolean } {
  if (jd >= GREGORIAN_START_JD) return { ...jdToGregorian(jd), isLeapMonth: false }
  const yobj = findYearByJd(jd)
  if (!yobj) throw new UnsupportedDateRangeError(`Unsupported date: jd ${jd}`)
  const ms = yobj.monthStarts
  // pos = 何番目の月に入っているか (1-based。閏月も1つと数える)
  let pos = (ms[ms.length - 1] as number) <= jd ? ms.length : ms.findIndex((m) => jd <= m - 1)
  const monthStart = ms[pos - 1] as number
  const isLeapMonth = yobj.leapMonth !== null && yobj.leapMonth === pos - 1
  if (yobj.leapMonth !== null && yobj.leapMonth < pos) pos -= 1
  return { year: yobj.year, month: pos, day: jd - monthStart + 1, isLeapMonth }
}

export function i2z(num: number): string {
  return String(num).replace(/[0-9]/g, (c) => '０１２３４５６７８９'[Number(c)] as string)
}

// Ruby Utils.k2i 相当。「正」は ya-kansuji では 10^40 の単位として解釈されて
// RangeError になるため、必ず先に特別扱いする。
export function k2i(str: string): number {
  const s = str.trim()
  if (s === '正' || s === '元' || s === '朔') return 1
  return toNumber(s)
}
```

- [ ] **Step 6: テストが通ることを確認**

Run: `npx vitest run test/era-lookup.test.ts test/utils.test.ts`
Expected: 全テスト PASS

Run: `npm run typecheck`
Expected: エラーなし

- [ ] **Step 7: コミット**

```bash
git add src/era-lookup.ts src/utils.ts test/era-lookup.test.ts test/utils.test.ts
git commit -m "feat: add era lookup and calendar utility functions"
```

---

### Task 5: WarekiDate コアクラス

**推奨モデル:** Opus

**Files:**
- Create: `src/wareki-date.ts`
- Test: `test/wareki-date.test.ts`

**Interfaces:**
- Consumes: Task 2〜4 の全 Produces (`gregorianToJd`, `italyToJd`, `jdToGregorian`, `jdToJulian`, `findEraByJd`, `eraYearToCivil`, `findDateParts`, `lastDayOfEraMonth`, `yearByNum`, 定数, エラー)
- Produces: `class WarekiDate` —
  - statics: `fromJd(jd: number): WarekiDate`, `fromDate(date: Date, opts?: { utc?: boolean }): WarekiDate`, `today(): WarekiDate`, `imperial(year: number, month?: number, day?: number, isLeapMonth?: boolean): WarekiDate`
  - ctor: `new WarekiDate(eraName: string | null, eraYear: number, month = 1, day = 1, isLeapMonth = false)`
  - getters: `eraName: string`, `eraYear: number`, `year: number`, `month: number`, `day: number`, `isLeapMonth: boolean`, `imperialYear: number`, `jd: number` (遅延計算・キャッシュ), `lastDayOfMonth: number`
  - methods: `toDate(): Date`, `toGregorianParts()`, `toJulianParts()`, `equals(other: WarekiDate): boolean`, `isSameDay(other: WarekiDate): boolean`, `addDays(n: number): WarekiDate`, `subDays(n: number): WarekiDate`, `with(fields): WarekiDate`, `inspect(): string`
  - 注: `parse` static / `format` メソッド / 漢字ゲッターは Plan 2 で追加する。

- [ ] **Step 1: 失敗するテストを書く (test/wareki-date.test.ts)**

Ruby date_spec.rb の変換系ケースを転記。ITALY 表記の期待値は JD に変換済み (JS の Date は先発グレゴリオ暦のため、1582年以前は年月日でなく JD / toJulianParts で比較する)。

```ts
import { describe, expect, it } from 'vitest'
import { UnsupportedDateRangeError, WarekiParseError } from '../src/errors.js'
import { gregorianToJd } from '../src/jd.js'
import { WarekiDate } from '../src/wareki-date.js'

const ymd = (d: Date): string => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`

// Ruby date_spec.rb の matchings (civil date は Date::ITALY 由来の JD に変換済み)
const MATCHINGS: Array<[number, string, number, number, number, boolean]> = [
  [2400508, '安政', 7, 3, 17, false], // 1860-04-07
  [2457251, '平成', 27, 8, 16, false], // 2015-08-16
  [1956842, '大化', 1, 6, 19, false], // 645-07-17 (ユリウス暦)
  [2139493, '久安', 1, 7, 22, false], // 1145-08-12
  [2139492, '天養', 2, 7, 21, false], // 1145-08-11
  [2335942, '天和', 3, 5, 4, true], // 1683-06-28
]

describe('WarekiDate constructor', () => {
  it('can be created with ymd args', () => {
    const d = new WarekiDate('明治', 8, 2, 1)
    expect(d.eraName).toBe('明治')
    expect(d.eraYear).toBe(8)
    expect(d.year).toBe(1875)

    const k = new WarekiDate('皇紀', 1234, 3, 2)
    expect(k.eraName).toBe('皇紀')
    expect(k.eraYear).toBe(1234)
    expect(k.year).toBe(574)
  })

  it('accepts null era name as western calendar', () => {
    expect(new WarekiDate(null, 2, 12, 31).jd).toBe(1722153) // Date.new(2,12,31).jd
    expect(ymd(new WarekiDate(null, 2020, 5, 4).toDate())).toBe('2020-5-4')
  })

  it('raises WarekiParseError for nonexistent dates (Ruby InvalidDate 相当)', () => {
    expect(() => new WarekiDate('明治', 5, 13, 1)).toThrow(/invalid date/)
    expect(() => new WarekiDate('明治', 5, 0, 1)).toThrow(/invalid date/)
    expect(() => new WarekiDate('天保', 1, 1, 40)).toThrow(/invalid date/)
    expect(() => new WarekiDate('令和', 2, 2, 30)).toThrow(/invalid date/)
    expect(() => new WarekiDate('令和', 2, 13, 1)).toThrow(/invalid date/)
    expect(() => new WarekiDate('西暦', 2000, 2, 30)).toThrow(/invalid date/)
    expect(() => new WarekiDate('紀元前', 203, 4, 31)).toThrow(/invalid date/)
    expect(() => new WarekiDate('元仁', 1, 6, 1, true)).toThrow(/invalid date/)
    expect(() => new WarekiDate('令和', 2, 5, 4, true)).toThrow(/invalid date/)
    expect(() => new WarekiDate('明治', 5, 12, 3)).toThrow(WarekiParseError) // 改暦による欠落日
  })

  it('rejects unknown era names', () => {
    expect(() => new WarekiDate('謎元号', 1)).toThrow(WarekiParseError)
  })
})

describe('WarekiDate.fromJd', () => {
  it.each(MATCHINGS)('jd %i -> %s%i年%i月%i日 (leap=%s)', (jd, era, eraYear, month, day, leap) => {
    const w = WarekiDate.fromJd(jd)
    expect(w.eraName).toBe(era)
    expect(w.eraYear).toBe(eraYear)
    expect(w.month).toBe(month)
    expect(w.day).toBe(day)
    expect(w.isLeapMonth).toBe(leap)
    expect(w.jd).toBe(jd)
  })

  it('handles era and calendar boundaries', () => {
    expect(WarekiDate.fromJd(2405159).inspect()).toBe("WarekiDate(明治5-12-2)") // 1872-12-31
    const meiji6 = WarekiDate.fromJd(2405160) // 1873-01-01 (グレゴリオ移行初日)
    expect([meiji6.eraName, meiji6.eraYear, meiji6.month, meiji6.day]).toEqual(['明治', 6, 1, 1])
    const b = WarekiDate.fromJd(1959964) // 654-02-05 (Gregorian)
    expect([b.eraName, b.eraYear, b.month, b.day]).toEqual(['白雉', 5, 1, 10])
    expect(WarekiDate.fromJd(2816788).eraName).toBe('令和') // 3000-01-01 は現行元号の継続とみなす
    expect(WarekiDate.fromJd(2816788).eraYear).toBe(982)
  })

  it('raises for unsupported ranges (Ruby date_spec より転記)', () => {
    expect(() => WarekiDate.fromJd(gregorianToJd(100, 1, 1))).toThrow(UnsupportedDateRangeError)
    expect(() => WarekiDate.fromJd(gregorianToJd(445, 1, 1))).toThrow(UnsupportedDateRangeError)
  })
})

describe('jd conversion (WarekiDate -> jd)', () => {
  it.each(MATCHINGS)('%s%i年%i月%i日 -> jd %i', (jd, era, eraYear, month, day, leap) => {
    expect(new WarekiDate(era, eraYear, month, day, leap).jd).toBe(jd)
  })

  it('accepts era-start leniency and valid edge dates', () => {
    expect(new WarekiDate('令和', 1, 1, 1).jd).toBe(2458485) // 2019-01-01 (実際は平成31年)
    expect(WarekiDate.fromJd(2458485).eraName).toBe('平成') // 逆変換は実際の元号
    expect(new WarekiDate('元仁', 1, 7, 1, true).jd).toBe(2168353) // = ユリウス暦 1224-08-17
  })

  it('defers out-of-table imperial years to jd conversion', () => {
    const d = WarekiDate.imperial(1)
    expect(() => d.jd).toThrow(UnsupportedDateRangeError)
  })

  it('rejects the 1582-10-05..14 gap for western eras', () => {
    expect(() => new WarekiDate('西暦', 1582, 10, 10).jd).toThrow(WarekiParseError)
    expect(new WarekiDate('西暦', 1582, 10, 4).jd).toBe(2299160)
    expect(new WarekiDate('西暦', 1582, 10, 15).jd).toBe(2299161)
  })
})

describe('toDate / toGregorianParts / toJulianParts', () => {
  it('returns local-midnight Date based on proleptic Gregorian', () => {
    const d = new WarekiDate('平成', 27, 8, 16).toDate()
    expect(ymd(d)).toBe('2015-8-16')
    expect([d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([0, 0, 0])
  })

  it('exposes both calendar representations for pre-reform dates', () => {
    const w = new WarekiDate('元仁', 1, 7, 1, true) // jd 2168353
    expect(w.toJulianParts()).toEqual({ year: 1224, month: 8, day: 17 }) // Ruby Date.new(1224,8,17)
    expect(w.toGregorianParts()).toEqual({ year: 1224, month: 8, day: 24 })
    expect(ymd(w.toDate())).toBe('1224-8-24') // JS Date は先発グレゴリオ暦
  })

  it('does not confuse years 0-99 with 1900s (setFullYear 経由)', () => {
    // ユリウス暦 45-01-02 (jd 1737496) は先発グレゴリオ暦では 44-12-31。
    // new Date(44, ...) 直呼びなら 1944 年に化けるところ
    expect(ymd(new WarekiDate('西暦', 45, 1, 2).toDate())).toBe('44-12-31')
  })
})

describe('fromDate / today', () => {
  it('uses local date parts by default and UTC with { utc: true }', () => {
    const local = new Date(2015, 7, 16, 23, 30)
    expect(WarekiDate.fromDate(local).isSameDay(new WarekiDate('平成', 27, 8, 16))).toBe(true)
    const utc = new Date(Date.UTC(2015, 7, 16, 12, 0))
    expect(WarekiDate.fromDate(utc, { utc: true }).isSameDay(new WarekiDate('平成', 27, 8, 16))).toBe(true)
  })

  it('today() equals fromDate(new Date())', () => {
    expect(WarekiDate.today().equals(WarekiDate.fromDate(new Date()))).toBe(true)
  })
})

describe('imperial', () => {
  it('creates dates with imperial year', () => {
    const d = WarekiDate.imperial(2670, 8, 3)
    expect(d.equals(new WarekiDate('皇紀', 2670, 8, 3))).toBe(true)
    expect(ymd(d.toDate())).toBe('2010-8-3')
    expect(d.imperialYear).toBe(2670)
    expect(new WarekiDate('平成', 27, 8, 16).imperialYear).toBe(2675)
  })
})

describe('equals / isSameDay (Ruby eql? / ===)', () => {
  it('compares by fields (equals) and by jd (isSameDay)', () => {
    const a = new WarekiDate('平成', 7, 11, 10)
    const b = WarekiDate.fromJd(2450032) // 1995-11-10
    expect(a.equals(b)).toBe(true)
    expect(a.isSameDay(b)).toBe(true)
    expect(a.equals(a.addDays(1))).toBe(false)
    expect(a.isSameDay(a.addDays(1))).toBe(false)
    // 皇紀2655年11月10日: 同じ日だがフィールドは違う
    const k = new WarekiDate('皇紀', 2655, 11, 10)
    expect(k.jd).toBe(a.jd)
    expect(a.isSameDay(k)).toBe(true)
    expect(a.equals(k)).toBe(false)
  })
})

describe('addDays / subDays (Ruby +/- の数値ケース)', () => {
  it('moves across month and year boundaries', () => {
    const w = new WarekiDate('平成', 7, 11, 10)
    expect(w.addDays(1).inspect()).toBe('WarekiDate(平成7-11-11)')
    expect(w.subDays(1).inspect()).toBe('WarekiDate(平成7-11-9)')
    expect(w.subDays(10).inspect()).toBe('WarekiDate(平成7-10-31)')
    expect(w.addDays(21).inspect()).toBe('WarekiDate(平成7-12-1)')
    expect(w.addDays(94).jd).toBe(w.jd + 94)
    expect(w.subDays(94).jd).toBe(w.jd - 94)
  })
})

describe('with (immutable 版 setter)', () => {
  it('derives new instances and leaves the original untouched', () => {
    const d = WarekiDate.fromJd(gregorianToJd(2025, 7, 12)) // 令和7年7月12日
    expect(ymd(d.with({ month: 1 }).toDate())).toBe('2025-1-12')
    expect(ymd(d.with({ month: 1, day: 3 }).toDate())).toBe('2025-1-3')
    expect(ymd(d.with({ eraYear: 5, month: 1, day: 3 }).toDate())).toBe('2023-1-3')
    expect(ymd(d.with({ eraName: '平成', eraYear: 5, month: 1, day: 3 }).toDate())).toBe('1993-1-3')
    expect(ymd(d.toDate())).toBe('2025-7-12') // 元は不変
  })

  it('throws on invalid combination without corrupting the source', () => {
    const d = new WarekiDate('元仁', 1, 7, 1)
    expect(d.with({ isLeapMonth: true }).jd).toBe(2168353) // 閏7月は実在する
    expect(() => d.with({ eraName: '謎元号' })).toThrow(WarekiParseError)
    expect(() => d.with({ month: 13 })).toThrow(/invalid date/)
    expect(d.jd).toBe(2168323) // 元仁元年7月1日 (非閏)。Ruby で検証済み
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run test/wareki-date.test.ts`
Expected: FAIL (Cannot find module '../src/wareki-date.js')

- [ ] **Step 3: src/wareki-date.ts を実装**

```ts
import { GREGORIAN_START_YEAR, IMPERIAL_START_YEAR, WESTERN_ERA_NAMES } from './constants.js'
import { UnsupportedDateRangeError, WarekiParseError } from './errors.js'
import { findEraByJd } from './era-lookup.js'
import { gregorianToJd, italyToJd, jdToGregorian, jdToJulian } from './jd.js'
import { eraYearToCivil, findDateParts, lastDayOfEraMonth } from './utils.js'
import { yearByNum } from './year-data.js'

export class WarekiDate {
  readonly eraName: string
  readonly eraYear: number
  readonly year: number
  readonly month: number
  readonly day: number
  readonly isLeapMonth: boolean
  #jd: number | undefined

  constructor(eraName: string | null, eraYear: number, month = 1, day = 1, isLeapMonth = false) {
    this.eraName = eraName ?? ''
    this.eraYear = eraYear
    this.month = month
    this.day = day
    this.isLeapMonth = isLeapMonth
    this.year = eraYearToCivil(this.eraName, eraYear)
    this.#validate()
  }

  static fromJd(jd: number): WarekiDate {
    const era = findEraByJd(jd)
    if (!era) throw new UnsupportedDateRangeError(`Cannot find era for jd ${jd}`)
    const p = findDateParts(jd)
    const d = new WarekiDate(era.name, p.year - era.year + 1, p.month, p.day, p.isLeapMonth)
    d.#jd = jd
    return d
  }

  static fromDate(date: Date, opts: { utc?: boolean } = {}): WarekiDate {
    const [y, m, d] = opts.utc
      ? [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()]
      : [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    return WarekiDate.fromJd(gregorianToJd(y, m, d))
  }

  static today(): WarekiDate {
    return WarekiDate.fromDate(new Date())
  }

  static imperial(year: number, month = 1, day = 1, isLeapMonth = false): WarekiDate {
    return new WarekiDate('皇紀', year, month, day, isLeapMonth)
  }

  get imperialYear(): number {
    return this.year - IMPERIAL_START_YEAR
  }

  get lastDayOfMonth(): number {
    return lastDayOfEraMonth(this.eraName, this.year, this.month, this.isLeapMonth)
  }

  // Ruby Date#month_index: YEAR_DEFS の monthStarts / monthDays に対する添字
  #monthIndex(): number {
    if (WESTERN_ERA_NAMES.includes(this.eraName) || this.year >= GREGORIAN_START_YEAR) return this.month - 1
    const yobj = yearByNum(this.year)
    if (!yobj) throw new UnsupportedDateRangeError(`Cannot get year info of ${this.inspect()}`)
    let idx = this.month - 1
    if (this.isLeapMonth || (yobj.leapMonth !== null && this.month > yobj.leapMonth)) idx += 1
    return idx
  }

  // Ruby Date#_validate_date! の移植
  #validate(): void {
    if (!(Number.isInteger(this.month) && this.month >= 1 && this.month <= 12))
      throw new WarekiParseError(`invalid date (month out of range): ${this.inspect()}`)
    if (!(Number.isInteger(this.day) && this.day >= 1))
      throw new WarekiParseError(`invalid date (day out of range): ${this.inspect()}`)
    if (!WESTERN_ERA_NAMES.includes(this.eraName) && this.year < GREGORIAN_START_YEAR) {
      // 暦テーブル外の年は Ruby 同様、jd 変換時の UnsupportedDateRangeError に委ねる
      const yobj = yearByNum(this.year)
      if (!yobj) return
      if (this.isLeapMonth && yobj.leapMonth !== this.month)
        throw new WarekiParseError(`invalid date (no leap month): ${this.inspect()}`)
      if (this.day > (yobj.monthDays[this.#monthIndex()] as number))
        throw new WarekiParseError(`invalid date (day out of range): ${this.inspect()}`)
    } else {
      if (this.isLeapMonth)
        throw new WarekiParseError(`invalid date (no leap month): ${this.inspect()}`)
      if (this.day > this.lastDayOfMonth)
        throw new WarekiParseError(`invalid date (day out of range): ${this.inspect()}`)
    }
  }

  inspect(): string {
    return `WarekiDate(${this.eraName}${this.eraYear}-${this.isLeapMonth ? "閏" : ''}${this.month}-${this.day})`
  }

  get jd(): number {
    if (this.#jd !== undefined) return this.#jd
    if (WESTERN_ERA_NAMES.includes(this.eraName))
      return (this.#jd = italyToJd(this.year, this.month, this.day))
    if (this.year >= GREGORIAN_START_YEAR)
      return (this.#jd = gregorianToJd(this.year, this.month, this.day))
    const yobj = yearByNum(this.year)
    if (!yobj) throw new UnsupportedDateRangeError(`Cannot convert to jd ${this.inspect()}`)
    return (this.#jd = (yobj.monthStarts[this.#monthIndex()] as number) + this.day - 1)
  }

  toGregorianParts(): { year: number; month: number; day: number } {
    return jdToGregorian(this.jd)
  }

  toJulianParts(): { year: number; month: number; day: number } {
    return jdToJulian(this.jd)
  }

  toDate(): Date {
    const { year, month, day } = this.toGregorianParts()
    const d = new Date(0)
    // new Date(y, ...) は 0〜99 年を 1900 年代に解釈するため setFullYear を使う
    d.setFullYear(year, month - 1, day)
    d.setHours(0, 0, 0, 0)
    return d
  }

  equals(other: WarekiDate): boolean {
    return (
      other instanceof WarekiDate &&
      other.year === this.year &&
      other.month === this.month &&
      other.day === this.day &&
      other.eraYear === this.eraYear &&
      other.eraName === this.eraName &&
      other.isLeapMonth === this.isLeapMonth
    )
  }

  isSameDay(other: WarekiDate): boolean {
    return other.jd === this.jd
  }

  addDays(n: number): WarekiDate {
    return WarekiDate.fromJd(this.jd + n)
  }

  subDays(n: number): WarekiDate {
    return WarekiDate.fromJd(this.jd - n)
  }

  with(
    fields: Partial<Pick<WarekiDate, 'eraName' | 'eraYear' | 'month' | 'day' | 'isLeapMonth'>>,
  ): WarekiDate {
    return new WarekiDate(
      fields.eraName ?? this.eraName,
      fields.eraYear ?? this.eraYear,
      fields.month ?? this.month,
      fields.day ?? this.day,
      fields.isLeapMonth ?? this.isLeapMonth,
    )
  }
}
```

実装上の注意 (Ruby との対応):

- `inspect()` のテスト期待値はこのフォーマット (`WarekiDate(明治5-12-2)`) を正とする。Step 1 のテストの `inspect()` 期待値と閏月マーク (`閏`) が一致しているか実装後に見直すこと (テスト側は非閏ケースのみ `inspect()` を使っている)。
- ctor は生成時に検証する。Ruby は `initialize` でも `jd` でも `_validate_date!` を呼ぶが、immutable なので ctor での1回で足りる。`jd` 側での再検証は不要。
- `#jd` キャッシュは immutable なので無効化不要。

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run test/wareki-date.test.ts`
Expected: 全テスト PASS

Run: `npm run typecheck && npm test`
Expected: エラーなし、全テスト PASS

- [ ] **Step 5: コミット**

```bash
git add src/wareki-date.ts test/wareki-date.test.ts
git commit -m "feat: add immutable WarekiDate core class"
```

---

### Task 6: ゴールデン変換テスト

**推奨モデル:** Sonnet

**Files:**
- Create: `tools/gen-golden.rb`, `test/golden/conversions.csv` (生成物、コミットする)
- Test: `test/golden.test.ts`

**Interfaces:**
- Consumes: Task 5 の `WarekiDate.fromJd` / ctor / `jd`
- Produces: `test/golden/conversions.csv` — ヘッダ `jd,era,eraYear,year,month,day,isLeap`。非対応 JD の行は era 列が `UNSUPPORTED` で他列は空。Plan 2 がこの CSV に `jF,jf` 列を追加する (このタスクのテストは列を添字 0〜6 で読むため、列追加されても壊れない)。

- [ ] **Step 1: tools/gen-golden.rb を書く**

```ruby
#!/usr/bin/env ruby
# frozen_string_literal: true

# Ruby 版 wareki を正として JD → 和暦の対照表 CSV を生成する。
# 再生成時のみ手元で実行する (CI では実行しない。CSV はコミット済み)。
# 実行には ya_kansuji gem が必要: gem install ya_kansuji
require 'csv'
wareki_lib = File.expand_path('../../wareki/lib', __dir__)
$LOAD_PATH.unshift wareki_lib
require 'wareki'

jds = []
# 旧暦全期間 + 近代グレゴリオ域 (〜西暦2062年ごろ) を37日刻みでサンプリング
(1_883_618..2_465_000).step(37) { |jd| jds << jd }
# 全元号 (南北朝含む) の境界 ±1
(Wareki::ERA_DEFS + Wareki::ERA_NORTH_DEFS).each do |e|
  jds.concat [e.start - 1, e.start, e.start + 1]
  next if e.end > 3_000_000 # 継続中元号 (DAY_MAX) はスキップ
  jds.concat [e.end - 1, e.end, e.end + 1]
end
# Ruby spec に登場する日付と改暦境界
jds.concat [2400508, 2457251, 1956842, 2139493, 2139492, 2335942, 2168353, 2168529,
            2153704, 2404833, 2405159, 2405160, 2447528, 2458485, 2458604, 2458605]
jds = jds.select { |j| j >= 1_883_618 && j <= 2_465_000 }.uniq.sort

CSV.open(File.expand_path('../test/golden/conversions.csv', __dir__), 'w') do |csv|
  csv << %w(jd era eraYear year month day isLeap)
  jds.each do |jd|
    begin
      w = Wareki::Date.jd(jd)
      csv << [jd, w.era_name, w.era_year, w.year, w.month, w.day, w.leap_month?]
    rescue Wareki::UnsupportedDateRange
      csv << [jd, 'UNSUPPORTED', '', '', '', '', '']
    end
  end
end
puts "rows: #{jds.size}"
```

- [ ] **Step 2: 実行して CSV を生成**

Run: `mkdir -p test/golden && ruby tools/gen-golden.rb`
Expected: `rows: 16462` (ya_kansuji gem が無ければ `gem install ya_kansuji` してから再実行)

Run: `head -3 test/golden/conversions.csv`
Expected:

```
jd,era,eraYear,year,month,day,isLeap
1883618,UNSUPPORTED,,,,,
1883655,UNSUPPORTED,,,,,
```

(旧暦テーブル先頭445年は大化 (645年) より前なので元号が無く UNSUPPORTED になる。これも Ruby の挙動どおり)

- [ ] **Step 3: 失敗するテストを書く (test/golden.test.ts)**

```ts
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
```

- [ ] **Step 4: テストを実行**

Run: `npx vitest run test/golden.test.ts`
Expected: 全テスト PASS (数秒で完了する)。失敗した場合は該当 JD を Ruby で個別確認し、JS 実装側を直す (CSV は Ruby が正)。

Run: `npm test && npm run typecheck`
Expected: 全テスト PASS

- [ ] **Step 5: コミット**

```bash
git add tools/gen-golden.rb test/golden/conversions.csv test/golden.test.ts
git commit -m "test: add golden conversion table generated from Ruby wareki"
```

---

## 完了条件

- [ ] `npm test` が全テスト PASS (smoke / jd / constants / year-data / era-lookup / utils / wareki-date / golden)。
- [ ] `npm run typecheck` がエラーなし。
- [ ] `npm run build` が dist 5点を出力する。
- [ ] `src/data/` の合計サイズが 25KB 以下。
- [ ] ゴールデン CSV 16,462行のすべてで Ruby 版と一致 (UNSUPPORTED 2,441行含む)。
- [ ] 生成物 (`tools/data/*.json`, `src/data/*.ts`, `test/golden/conversions.csv`) がコミット済みで、`ruby tools/export-data.rb && node tools/encode-data.mjs` を再実行しても差分が出ない。
- [ ] ブランチ `feature/initial-port` 上にタスクごとのコミットが揃っている。
- [ ] Plan 2 (`2026-07-13-ya-wareki-api.md`) に着手できる: `parseFields` / `formatWareki` が消費する `ERA_NAME_KEYS`, `eraByName`, `k2i`, `i2z`, `altMonthName(ToNumber)`, `lastDayOfEraMonth`, `eraYearToCivil`, `WarekiDate` がすべて Produces どおりに存在する。
