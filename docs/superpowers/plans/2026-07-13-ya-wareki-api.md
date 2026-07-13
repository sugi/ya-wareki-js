# ya-wareki-js API Implementation Plan (Plan 2/2: パーサ + フォーマッタ + 公開 API + 配布)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plan 1 (`2026-07-13-ya-wareki-core.md`) で構築したコアの上に、和暦文字列パーサ、`%J` フォーマッタ、トップレベル API、配布物 (dist 検証・README・CI) を完成させ、npm publish 可能な状態にする。

**Architecture:** パーサは Ruby common.rb の REGEX を JS named capture group で再構築する。フォーマッタは Ruby date.rb の `format(key, opt)` テーブルの直訳 + 標準 strftime サブセット (%Y %y %m %d %e %j %F %%) の自前実装。循環 import は「format.ts は WarekiDate を type-only import」「parse.ts は WarekiDate に依存しない」ことで回避する。

**Tech Stack:** TypeScript (strict) / tsdown / Vitest / ya-kansuji

**前提:** Plan 1 が完了していること (ブランチ `feature/initial-port` 上で全テスト PASS)。
**設計仕様:** `docs/superpowers/specs/2026-07-13-ya-wareki-js-design.md`。
**移植元:** `~/works/git/github/wareki/lib/wareki/` (挙動の正) と `~/works/git/github/wareki/spec/` (期待値)。

## Global Constraints

- **南北朝裁定 (2026-07-13 ユーザー確定)**: JD→元号解決は北朝優先 (現 master / 現行 JS 実装の挙動が正)。パースは南北両元号名を受容。review ブランチの ERA_JD_LOOKUP 由来の南朝優先の期待値をテストに持ち込まないこと。パース・フォーマッタの挙動照合は review ブランチのコード (`git -C ../wareki archive fix/2026-07-13-review | tar -x -C <tmpdir>` で展開) に対して行い、era 解決のみ現行 JS / master に合わせる。詳細は設計書「南北朝期の元号解決に関する裁定」節。

- **移植対象の状態**: wareki リポジトリの `fix/2026-07-13-review` ブランチ (起草時 HEAD cdfa641、2026-07-13 実行中に 6459443 へ再ピン: 差分は %% エスケープ処理の強化と ChangeLog のみでデータ定義は無変更)。この計画の実行開始時に `git -C ~/works/git/github/wareki log --oneline -1` で HEAD を確認し、cdfa641 から進んでいる場合は `git -C ~/works/git/github/wareki diff cdfa641..HEAD -- lib/` を確認してコントローラが計画への影響を評価してから着手する。tools (export-data.rb / gen-golden.rb) は生成物ヘッダに `git -C ../wareki describe --always --dirty` を記録する。

- パッケージ名 `ya-wareki`、バージョン `0.1.0`、ライセンス **BSD-2-Clause** (移植元 wareki gem と同じ。ya-kansuji は MIT なので LICENSE を流用しないこと)、author `Tatsuki Sugiura <sugi@nemui.org>`、`engines: { "node": ">=22" }`。
- `"type": "module"`。tsdown ビルドで dist/index.js (ESM) + index.cjs + index.d.ts + index.d.cts + index.iife.min.js (IIFE グローバル名 `YaWareki`) の5点を出す。IIFE のみ ya-kansuji をバンドルに取り込み、ESM/CJS では通常の dependency として external に保つ。tsdown.config.ts は ya-kansuji-js のパターン (outExtensions、CJS require 対策の globalThis footer) を踏襲する。exports マップは types 先頭、unpkg/jsdelivr フィールド、`sideEffects: false`、`files: ["dist","src","README.md","LICENSE"]`。
- 依存: package.json 上は `"ya-kansuji": "^0.1.0"`。ただし npm 未公開のため開発中は `npm install ../ya-kansuji-js` によるローカルインストール (`file:../ya-kansuji-js`) のまま作業する。**本 Plan の最終タスクで `"^0.1.0"` に戻す** (CI / publish は ya-kansuji の npm 公開が前提)。
- tsconfig は ya-kansuji-js と同一 (ES2022 / ESNext / bundler resolution / strict / noUncheckedIndexedAccess)。既知の型の罠: as const タプルの `.length` 比較はループカウンタに `: number` 注釈が要る。noUncheckedIndexedAccess のため添字アクセスは範囲内が自明でも `as string` / `!` が要る。
- テストは Vitest。コミットメッセージは英語。インラインコメントは外部要因・背景事情の説明がある場合に限る。作業ブランチは `feature/initial-port`。
- **Ruby 互換契約**: parse / format の入出力は、サポート対象の全入力について wareki gem と完全一致させる。意図的な差異は次の5点のみ:
  1. ビルトインクラス拡張 (std_ext.rb) は移植しない。
  2. WarekiDate は immutable (setter の代わりに `with()`)。
  3. エラーは ArgumentError / Wareki::UnsupportedDateRange の代わりに `WarekiParseError` / `UnsupportedDateRangeError`。
  4. ActiveSupport::Duration 連携は移植しない。
  5. strftime 委譲: 標準コードは `%Y %y %m %d %e %j %F %%` のみ自前実装し、それ以外の非 %J コードは無変換で通す。
- 期待値に疑問が出たら発明せず Ruby 版を実行して確認する (`cd ~/works/git/github/wareki && ruby -Ilib -r wareki -e '...'`)。

## Plan 1 から引き継ぐインターフェース (Consumes の前提)

- `src/errors.ts`: `WarekiParseError`, `UnsupportedDateRangeError`
- `src/constants.ts`: `ALT_MONTH_NAME`, `KANJI_VARIANTS`, `NUM_CHARS`, `SQUARE_ERAS`, `ITALY_REFORM_JD`, `GREGORIAN_START_JD`
- `src/jd.ts`: `italyToJd`, `jdToGregorian`, `jdToJulian`, `gregorianToJd`
- `src/era-lookup.ts`: `ERA_NAME_KEYS: readonly string[]` (ERA_BY_NAME キー、挿入順、'' を含む), `eraByName(name): EraDef | undefined`
- `src/utils.ts`: `altMonthNameToNumber`, `altMonthName`, `eraYearToCivil`, `lastDayOfEraMonth`, `k2i`, `i2z`
- `src/wareki-date.ts`: `WarekiDate` (ctor / fromJd / fromDate / today / imperial / jd / lastDayOfMonth / imperialYear / toDate / toGregorianParts / toJulianParts / equals / isSameDay / addDays / subDays / with / inspect)

---

### Task 1: parse.ts と WarekiDate.parse

**推奨モデル:** Opus

**Files:**
- Create: `src/parse.ts`
- Modify: `src/wareki-date.ts` (static parse を追加)
- Test: `test/parse.test.ts`

**Interfaces:**
- Consumes: `ERA_NAME_KEYS`, `eraByName`, `KANJI_VARIANTS`, `NUM_CHARS`, `SQUARE_ERAS`, `ALT_MONTH_NAME`, `k2i`, `altMonthNameToNumber`, `eraYearToCivil`, `lastDayOfEraMonth`, `WarekiParseError`, `WarekiDate`
- Produces:
  - `parse.ts`: `parseFields(str: string): { era: string; year: number; month: number; day: number; isLeap: boolean }` — Ruby `Wareki::Date._parse` 相当。era は正規化前の表記 (例: '㍾', '應德') をそのまま返す (Ruby と同じ)。
  - `wareki-date.ts`: `static parse(str: string): WarekiDate`

- [ ] **Step 1: 失敗するテストを書く (test/parse.test.ts)**

期待値は Ruby date_spec.rb / utils_spec.rb からの転記。`Date.new(y,m,d)` (ITALY) の期待値のうち1582年以前のものは JD に変換済み (JS の Date は先発グレゴリオ暦のため)。

```ts
import { describe, expect, it } from 'vitest'
import { WarekiParseError } from '../src/errors.js'
import { WarekiDate } from '../src/wareki-date.js'
import { parseFields } from '../src/parse.js'

const ymd = (d: Date): string => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`

describe('WarekiDate.parse -> toDate (1582年以降・グレゴリオ域)', () => {
  it.each<[string, string]>([
    ['平成27年１２月八日', '2015-12-8'],
    ['安政 ７年 ３月 １７日', '1860-4-7'],
    ['平成元年元日', '1989-1-1'],
    ['平成12年十二月晦日', '2000-12-31'],
    ['平成12年2月晦日', '2000-2-29'],
    ['平成13年2月晦日', '2001-2-28'],
    ['令和元年5月2日', '2019-5-2'],
    ['令和元年1月1日', '2019-1-1'],
    ['明治5年12月2日', '1872-12-31'],
    ['西暦2000年2月晦日', '2000-2-29'],
  ])('parses %s to %s', (str, expected) => {
    expect(ymd(WarekiDate.parse(str).toDate())).toBe(expected)
  })
})

describe('WarekiDate.parse -> jd (Ruby date_spec の全パースケース転記)', () => {
  it.each<[string, number]>([
    ['安政七年　\t 弥生卅日', 2400521], // Date.new(1860,4,20)
    ['元仁元年閏七月朔日', 2168353], // Date.new(1224,8,17)
    ['元仁元年 うるう ７月１日', 2168353],
    ['元仁二年　元日', 2168529], // Date.new(1225,2,9)
    ['寿永三年 五月 晦日', 2153704], // Date.new(1184,7,9)
    ['慶應元年八月二十四日', 2402523], // Date.new(1865,10,1,JULIAN)
    ['応徳元年九月二十九日', 2117293], // Date.new(1084,10,31)
    ['応德元年九月二十九日', 2117293],
    ['應徳元年九月二十九日', 2117293],
    ['應德元年九月二十九日', 2117293],
    ['10年5月3日', 1724833], // Date.new(10,5,3)
    ['321年', 1838304], // Date.new(321,1,1)
    ['2年12月31日', 1722153], // Date.new(2,12,31)
    ['西暦10年5月3日', 1724833],
    ['西暦321年', 1838304],
    ['西暦2年12月31日', 1722153],
    ['紀元前203年12月31日', 1647277], // Date.new(-203,12,31)
    ['紀元前4年7月', 1719779], // Date.new(-4,7,1)
    ['紀元前9876年4月2日', -1886059], // Date.new(-9876,4,2)
    ['紀元前1年12月晦日', 1721057], // Date.new(-1,12,31)
    ['㍻一〇年 肆月 晦日', 2450934], // Date.new(1998,4,30) — Ruby README の例
    ['萬延三年 ５月 廿一日', 2401310], // Date.new(1862,6,18) — 元号年超過の受容
    ['皇紀二千皕卌年', 2298169], // Date.new(1580,1,17)
    ['正嘉元年 うるう3月 １２日', 2180294], // Date.new(1257,4,27)
    ['　1928 年 3 月　１１ 日  ', 2425317], // Date.new(1928,3,11) — 空白除去
    ['\t\n　1 9 2 8 年 3 月　１１ 日  ', 2425317],
  ])('parses %s to jd %i', (str, jd) => {
    expect(WarekiDate.parse(str).jd).toBe(jd)
  })

  it('parses alt month names defaulting day to 1', () => {
    expect(WarekiDate.parse('安政七年 弥生').jd).toBe(WarekiDate.parse('安政7年3月1日').jd)
  })
})

describe('era-less strings default to the current year (Ruby: Date.today.year)', () => {
  it.each(['8月22日', '2月25日', '10月2日', '3月8日', '1月3日'])('parses %s', (str) => {
    const w = WarekiDate.parse(str)
    expect(w.year).toBe(new Date().getFullYear())
    expect(w.eraName).toBe('')
  })
})

describe('晦日 resolution for any era notation (Ruby date_spec より転記)', () => {
  it('resolves last day consistently', () => {
    expect(WarekiDate.parse('皇紀2532年10月晦日').day).toBe(30)
    expect(WarekiDate.parse('明治5年10月晦日').day).toBe(30)
    expect(WarekiDate.parse('12月晦日').day).toBe(31)
  })
})

describe('leap month notations', () => {
  it("accepts 閏/うるう/5'月/5’月", () => {
    expect(WarekiDate.parse("天和3年5'月4日").isLeapMonth).toBe(true)
    expect(WarekiDate.parse('天和3年5’月4日').isLeapMonth).toBe(true)
    expect(WarekiDate.parse('天和3年5月4日').isLeapMonth).toBe(false)
    expect(WarekiDate.parse('天和三年閏五月四日').jd).toBe(2335942)
  })
})

describe('era name variants', () => {
  it('parses square era chars into canonical fields', () => {
    for (const [sq, canon] of [['㍾', '明治'], ['㍽', '大正'], ['㍼', '昭和'], ['㍻', '平成']]) {
      const w = WarekiDate.parse(`${sq}十年３月9日`)
      expect(w.eraName).toBe(sq) // Ruby も表記のまま保持する (era_year_to_civil が解決)
      expect(w.year).toBe(eraStartYear(canon as string) + 9)
      expect([w.month, w.day]).toEqual([3, 9])
    }
    function eraStartYear(name: string): number {
      return { 明治: 1868, 大正: 1912, 昭和: 1926, 平成: 1989 }[name] as number
    }
  })

  it('parses U+F9A8 令 variant', () => {
    // リテラルで書くと NFC 正規化で通常の令に潰れて無意味なテストになるため
    // 必ず \u エスケープで書く
    expect(WarekiDate.parse('\uF9A8和3年5月4日').jd).toBe(WarekiDate.parse('令和3年5月4日').jd)
  })

  it('still accepts northern court era names on parse (utils_spec より転記)', () => {
    expect(WarekiDate.parse('暦応3年1月1日').eraName).toBe('暦応')
    expect(WarekiDate.parse('正慶2年1月1日').eraName).toBe('正慶')
  })
})

describe('parse errors (Ruby date_spec より転記)', () => {
  it.each([
    '謎元号100年2月3日',
    '昭和2月3日', // 元号ありで年なし
    '昭和0年2月3日', // 年 <= 0
    '平成12年30月3日',
    '平成12年0月3日',
    '明治5年12月12日', // 改暦で存在しない日
    '明治5年12月3日',
    '明治5年12月31日',
    '㍾5年12月3日',
    '皇紀2532年12月5日',
    '天保1年1月40日',
    '', // 空文字列
    '2018-01-02', // 和暦要素なし → パーサとしては失敗 (トップレベル parseToDate がフォールバックを担う)
  ])('rejects %s', (str) => {
    expect(() => WarekiDate.parse(str)).toThrow(WarekiParseError)
  })
})

describe('parseFields (低レベル API)', () => {
  it('returns raw fields', () => {
    expect(parseFields('元仁元年閏七月朔日')).toEqual({ era: '元仁', year: 1, month: 7, day: 1, isLeap: true })
    expect(parseFields('㍾5年12月2日')).toEqual({ era: '㍾', year: 5, month: 12, day: 2, isLeap: false })
    expect(parseFields('321年')).toEqual({ era: '', year: 321, month: 1, day: 1, isLeap: false })
    expect(parseFields('平成元年元旦')).toEqual({ era: '平成', year: 1, month: 1, day: 1, isLeap: false })
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run test/parse.test.ts`
Expected: FAIL (Cannot find module '../src/parse.js')

- [ ] **Step 3: src/parse.ts を実装**

Ruby common.rb の REGEX / ERA_REGEX と date.rb の `_parse` の直訳。

```ts
import { ALT_MONTH_NAME, KANJI_VARIANTS, NUM_CHARS, SQUARE_ERAS } from './constants.js'
import { WarekiParseError } from './errors.js'
import { ERA_NAME_KEYS, eraByName } from './era-lookup.js'
import { altMonthNameToNumber, eraYearToCivil, k2i, lastDayOfEraMonth } from './utils.js'

// Ruby ERA_REGEX 相当: 元号名の各文字を KANJI_VARIANTS で文字クラスに展開する
// (例: 大宝 → 大[宝寳])。JS の | は Ruby (onigmo) と同じ先頭優先 + バックトラック
// なので、前方一致する別名 (天平 / 天平感宝) も正しく解決される。
function expandVariants(name: string): string {
  return Array.from(name, (c) => {
    const variants = KANJI_VARIANTS[c]
    return variants === undefined ? c : `[${c}${variants}]`
  }).join('')
}

const ERA_ALT = [...ERA_NAME_KEYS, ...Object.keys(SQUARE_ERAS)].map(expandVariants).join('|')

// Ruby common.rb の REGEX の直訳 (named capture group)。ERA_NAME_KEYS が
// 空文字列 '' を含むため era_name は空にもマッチしうるが、Ruby も同じ挙動で、
// _parse 側の era == '' 判定が吸収する。
const REGEX = new RegExp(
  `(?:(?<era_name>紀元前|${ERA_ALT})?` +
    `(?:(?<year>[元${NUM_CHARS}]+)年))?` +
    `(?:(?<is_leap>閏|潤|うるう)?` +
    `(?:(?<month>[正${NUM_CHARS}]+)(?<is_leap_post>['’])?月|` +
    `(?<alt_month>${ALT_MONTH_NAME.join('|')})))?` +
    `(?:(?<day>[元朔晦${NUM_CHARS}]+)日|元旦)?`,
  'u',
)

export interface ParsedFields {
  era: string
  year: number
  month: number
  day: number
  isLeap: boolean
}

// Ruby Wareki::Date._parse の移植
export function parseFields(str: string): ParsedFields {
  const s = String(str).replace(/\s+/gu, '')
  const match = REGEX.exec(s)
  if (!match || match[0] === '') throw new WarekiParseError(`Invalid Date: ${str}`)
  const g = match.groups as Record<string, string | undefined>
  const era = g['era_name'] ?? ''

  let year: number
  if (era === '' && g['year'] === undefined) {
    year = new Date().getFullYear()
  } else {
    year = k2i(g['year'] ?? '')
    if (!(year > 0)) throw new WarekiParseError(`Invalid year: ${str}`)
  }

  if (era !== '' && era !== '紀元前' && !eraByName(era))
    throw new WarekiParseError(`Date parse failed: Invalid era name '${era}'`)

  let month = 1
  if (g['month'] !== undefined) month = k2i(g['month'])
  else if (g['alt_month'] !== undefined) month = altMonthNameToNumber(g['alt_month']) as number
  if (month > 12 || month < 1)
    throw new WarekiParseError(`invalid date (month out of range): ${str}`)

  const isLeap = g['is_leap'] !== undefined || g['is_leap_post'] !== undefined

  let day = 1
  if (g['day'] !== undefined) {
    if (g['day'] === '晦') {
      const civilYear = eraYearToCivil(era, year)
      day = lastDayOfEraMonth(era, civilYear, month, isLeap)
    } else {
      day = k2i(g['day'])
    }
  }

  return { era, year, month, day, isLeap }
}
```

- [ ] **Step 4: src/wareki-date.ts に static parse を追加**

import に追記:

```ts
import { parseFields } from './parse.js'
```

クラス先頭 (fromJd の前) に追加:

```ts
  static parse(str: string): WarekiDate {
    const f = parseFields(str)
    return new WarekiDate(f.era, f.year, f.month, f.day, f.isLeap)
  }
```

(parse.ts は wareki-date.ts を import しないため循環は生じない。「明治5年12月3日」等の存在しない日の拒否は Plan 1 で移植済みの ctor 検証 (`_validate_date!` 相当) が担う — 旧 Ruby 版の `_check_invalid_date` に相当する検査は現行 Ruby では年テーブル (1872年12月=2日) 経由で行われており、本移植も同じ。)

- [ ] **Step 5: テストが通ることを確認**

Run: `npx vitest run test/parse.test.ts`
Expected: 全テスト PASS

Run: `npm test && npm run typecheck`
Expected: 全テスト PASS (Plan 1 のテスト含む)、型エラーなし

- [ ] **Step 6: コミット**

```bash
git add src/parse.ts src/wareki-date.ts test/parse.test.ts
git commit -m "feat: add wareki string parser with full Ruby-compatible regex"
```

---

### Task 2: format.ts と WarekiDate.format / 漢字ゲッター

> **再ピン (6459443) による追加要件**: Ruby 版は `%%` エスケープを尊重するようになった (commits 43f1b2b, 6459443)。
> `FORMAT_EXPANSION_REGEX = /(?<!%)(?:%%)*\K#{FORMAT_DIRECTIVE_REGEX}/` により、直前が奇数個の `%` である `%J...` は展開されない (例: `"%%JF"` は最終的にリテラル `"%JF"` になる)。
> JS には `\K` がないため等価実装が必要: 例えば `/(?<!%)((?:%%)*)(%J...)/` で偶数個の `%%` プレフィックスをキャプチャして温存しつつ展開する、または先に `%%` をプレースホルダへ退避してから展開して戻す。
> `%%` 自体の `%` への畳み込みは標準コード処理 (`%%` → `%`) の段で行う。wareki の spec/date_spec.rb に追加された 9 行のエスケープ関連ケースも全て転記すること。

**推奨モデル:** Opus

**Files:**
- Create: `src/format.ts`
- Modify: `src/wareki-date.ts` (format メソッドとゲッター群を追加)
- Test: `test/format.test.ts`

**Interfaces:**
- Consumes: `WarekiDate` (type-only + ゲッター `eraName`/`eraYear`/`year`/`month`/`day`/`isLeapMonth`/`imperialYear`/`lastDayOfMonth`/`jd`), ya-kansuji の `toKan`, `i2z`, `altMonthName`, `ITALY_REFORM_JD`, `italyToJd`, `jdToGregorian`, `jdToJulian`
- Produces:
  - `format.ts`: `formatWareki(d: WarekiDate, fmt: string): string`
  - `wareki-date.ts` 追加分: `format(fmt = '%JF'): string`, ゲッター `eraYearKanji`, `eraYearKanjiSpecial`, `yearKanji`, `monthKanji`, `monthAltName`, `dayKanji`, `leapMonthMark` (すべて `string`)

- [ ] **Step 1: 失敗するテストを書く (test/format.test.ts)**

Ruby date_spec.rb「can be formatted in string」ほか format 系ケースの転記。`date.strftime(...)` と比較しているケースは Ruby で実行した具体値に展開済み。

```ts
import { describe, expect, it } from 'vitest'
import { gregorianToJd } from '../src/jd.js'
import { WarekiDate } from '../src/wareki-date.js'

describe('format (Ruby date_spec「can be formatted in string」転記)', () => {
  const d = new WarekiDate('天和', 3, 5, 4, true)

  it.each<[string, string]>([
    ['%JF', '天和三年閏五月四日'],
    ['%Jf', "天和03年05'月04日"],
    ['%Jo %JO %JOk', '1683 １６８３ 千六百八十三'],
    ['%Ji %JI %JIk', '2343 ２３４３ 二千三百四十三'],
    ['%Jd %JD %JDk', '04 ４ 四'],
    ['%Jm %JM %JMk', "05' 閏５ 閏五"],
    ['%Jy %JY %JYk', '天和03 天和３ 天和三'],
    ['1桁: %J1f', "1桁: 天和3年5'月4日"],
    ['1桁: %J1y %J1m %J1d', "1桁: 天和3 5' 4"],
    ['1桁: %J1g %J1s', '1桁: 3 5'],
    ['空白2桁: %J_2f', "空白2桁: 天和 3年 5'月 4日"],
    ['空白2桁: %J_2y %J_2m %J_2d', "空白2桁: 天和 3  5'  4"],
    ['空白2桁: %J_2g %J_2s', '空白2桁:  3  5'],
    ['0埋3桁: %J03f', "0埋3桁: 天和003年005'月004日"],
    ['0埋3桁: %J03y %J03m %J03d', "0埋3桁: 天和003 005' 004"],
    ['0埋3桁: %J03g %J03s', '0埋3桁: 003 005'],
    ['0埋4桁: %J4f', "0埋4桁: 天和0003年0005'月0004日"],
    ['0埋4桁: %J4y %J4m %J4d', "0埋4桁: 天和0003 0005' 0004"],
    ['0埋4桁: %J4g %J4s', '0埋4桁: 0003 0005'],
    ['皇紀で%Ji年%Jm月%Jd日', "皇紀で2343年05'月04日"],
    ['%JYk年　%JSK', '天和三年　皐月'],
    ['西暦だと%Y年%m月%d日', '西暦だと1683年06月28日'],
    ['未定義なやつはそのまま %JeK', '未定義なやつはそのまま %JeK'],
    ['特殊表記が無ければ普通に漢字: %Je%JGK年%JSK%JDK日', '特殊表記が無ければ普通に漢字: 天和三年皐月四日'],
  ])('format(%s) -> %s', (fmt, expected) => {
    expect(d.format(fmt)).toBe(expected)
  })

  it('defaults to %JF', () => {
    expect(d.format()).toBe('天和三年閏五月四日')
  })

  it('handles 晦/朔/元 special day notations', () => {
    expect(WarekiDate.parse('寿永三年 五月 晦日').format('%Jd日')).toBe('30日')
    expect(WarekiDate.parse('寿永2年 3月 晦日').format('%Jd日')).toBe('29日')
    expect(new WarekiDate('寿永', 2, 3, 29).format('%JDK日')).toBe('晦日')
    expect(new WarekiDate('寿永', 1, 2, 1).format('%JYK年%Jm月%JDK日')).toBe('寿永元年02月朔日')
    expect(new WarekiDate('寿永', 1, 1, 1).format('%JYK年%JM%JL月%JDK日')).toBe('寿永元年１月元日')
  })
})

describe('number format flags (Ruby と Date#strftime の具体値で照合済み)', () => {
  const w = new WarekiDate('令和', 1, 5, 4)

  it.each<[string, string]>([
    ['%Jm %Jd', '05 04'],
    ['%J-m %J-d', '5 4'],
    ['%J_m %J_d', ' 5  4'],
    ['%J_2m %J_2d', ' 5  4'],
    ['%J03m %J03d', '005 004'],
    ['%J4m %J4d', '0005 0004'],
    ['%J0_5m %J0_5d', '    5     4'],
    ['%J_06m %J_06d', '000005 000004'],
    ['%J0m %J0d', '05 04'],
    ['%J0_m %J0_d', ' 5  4'],
    ['%J_0m %J_0d', '05 04'],
  ])('format(%s) -> %s', (fmt, expected) => {
    expect(w.format(fmt)).toBe(expected)
  })
})

describe('standard strftime subset (%Y %y %m %d %e %j %F %%)', () => {
  it('renders ITALY-calendar parts like Ruby Date#strftime', () => {
    const reiwa = new WarekiDate('令和', 1, 5, 4) // 2019-05-04
    expect(reiwa.format('%Y-%m-%d')).toBe('2019-05-04')
    expect(reiwa.format('%F')).toBe('2019-05-04')
    expect(reiwa.format('%y')).toBe('19')
    expect(reiwa.format('%e')).toBe(' 4')
    expect(reiwa.format('%j')).toBe('124')
    expect(reiwa.format('100%%')).toBe('100%') // Ruby: strftime("100%%") -> "100%"
    const seireki2 = new WarekiDate('西暦', 2, 1, 1)
    expect(seireki2.format('%Y|%y|%m|%d|%e|%j|%F')).toBe('0002|02|01|01| 1|001|0002-01-01')
    const bc = new WarekiDate('紀元前', 203, 12, 31)
    expect(bc.format('%Y|%y|%F|%j')).toBe('-0203|97|-0203-12-31|365')
    const tenna = new WarekiDate('天和', 3, 5, 4, true) // ユリウス日 2335942 = 1683-06-28
    expect(tenna.format('%Y|%j|%e')).toBe('1683|179|28')
  })

  it('passes through unimplemented % codes unchanged (意図的差異5)', () => {
    const w = new WarekiDate('令和', 1, 5, 4)
    expect(w.format('%H:%M:%S')).toBe('%H:%M:%S')
    expect(w.format('%A %a %B')).toBe('%A %a %B')
  })
})

describe('era last days / year last days (Ruby date_spec より転記)', () => {
  it.each<[number, number, number, string]>([
    [1989, 1, 7, '昭和六十四年一月七日'],
    [1912, 7, 29, '明治四十五年七月二十九日'],
    [1926, 12, 24, '大正十五年十二月二十四日'],
    [1868, 1, 24, '慶応三年十二月三十日'],
  ])('%i-%i-%i -> %s', (y, m, d, expected) => {
    expect(WarekiDate.fromJd(gregorianToJd(y, m, d)).format('%JF')).toBe(expected)
  })

  it('formats a leap month from a plain date (Ruby README の例)', () => {
    expect(WarekiDate.fromJd(2200101).format('%JF')).toBe('応長元年閏六月四日') // 1311-07-20
  })
})

describe('short era names format back to canonical (Ruby date_spec より転記)', () => {
  it.each<[string, string]>([
    ['㍾', '明治'],
    ['㍽', '大正'],
    ['㍼', '昭和'],
    ['㍻', '平成'],
  ])('%s十年３月9日 -> %s10年03月09日', (sq, canon) => {
    // 注: パース結果の eraName は '㍾' のまま。%Je はそれを出すため、Ruby の
    // Date#strftime 経由テストと同じ出力を得るには正規化した元号名で作り直す。
    const w = WarekiDate.parse(`${sq}十年３月9日`)
    expect(WarekiDate.fromJd(w.jd).format('%Jf')).toBe(`${canon}10年03月09日`)
  })
})

describe('%JDK for pre-1873 western dates (Ruby date_spec より転記)', () => {
  it('formats 晦 and kanji days', () => {
    expect(new WarekiDate('西暦', 300, 5, 15).format('%JDK')).toBe('十五')
    expect(new WarekiDate('西暦', 300, 5, 31).format('%JDK')).toBe('晦')
    expect(new WarekiDate('紀元前', 203, 12, 31).format('%JDK')).toBe('晦')
  })
})

describe('round trip: parse own strftime output (Ruby date_spec より転記)', () => {
  it('re-parses %Jf leap-month output', () => {
    const d = new WarekiDate('天和', 3, 5, 4, true)
    expect(WarekiDate.parse(d.format('%Jf')).jd).toBe(d.jd)
  })
})

describe('kanji getters (設計ドキュメントのテンプレートリテラル用 API)', () => {
  it('exposes %J codes as getters', () => {
    const d = new WarekiDate('天和', 3, 5, 4, true)
    expect(d.eraYearKanji).toBe('三') // %JGk
    expect(d.eraYearKanjiSpecial).toBe('三') // %JGK (元年なら 元)
    expect(new WarekiDate('令和', 1, 5, 4).eraYearKanjiSpecial).toBe('元')
    expect(d.yearKanji).toBe('千六百八十三') // %JOk
    expect(d.monthKanji).toBe('五') // %JSk
    expect(d.monthAltName).toBe('皐月') // %JSK
    expect(d.dayKanji).toBe('四') // %JDk
    expect(d.leapMonthMark).toBe('閏') // %JLk
    expect(new WarekiDate('令和', 1, 5, 4).leapMonthMark).toBe('')
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run test/format.test.ts`
Expected: FAIL (Cannot find module '../src/format.js')

- [ ] **Step 3: src/format.ts を実装**

Ruby date.rb の `FORMAT_DIRECTIVE_REGEX` / `_number_format` / `format(key, opt)` / `expand_wareki_format` / `strftime` の移植。

```ts
import { toKan } from 'ya-kansuji'
import { ITALY_REFORM_JD } from './constants.js'
import { italyToJd, jdToGregorian, jdToJulian } from './jd.js'
import { altMonthName, i2z } from './utils.js'
// type-only import なので実行時の循環参照にはならない
// (wareki-date.ts が実行時にこのモジュールを import する)
import type { WarekiDate } from './wareki-date.js'

// Ruby: /%J(-|[_0]{0,2}[0-9]*|)([fFyYegGoOiImMsSlLdD][kK]?)/
const DIRECTIVE_REGEX = /%J(-|[_0]{0,2}[0-9]*|)([fFyYegGoOiImMsSlLdD][kK]?)/g

// Ruby Date#_number_format 相当: フラグ文字列を sprintf 風の spec に解決し、
// spec の先頭が '0' なら 0 埋め、それ以外は空白埋めとして解釈する。
function fmtNum(n: number, opt: string): string {
  let spec: string
  if (opt === '' || opt === '0' || opt === '_0') spec = '02'
  else if (opt === '-') spec = ''
  else if (/_$/.test(opt)) spec = '2'
  else if (/0?_/.test(opt)) spec = opt.replace(/0?_/, '')
  else if (/_?0/.test(opt)) spec = opt.replace(/_?0/, '0')
  else spec = `0${opt}`
  if (spec === '') return String(n)
  const pad = spec.startsWith('0') ? '0' : ' '
  return String(n).padStart(Number.parseInt(spec, 10), pad)
}

// Ruby Wareki::Date#format(key, opt) のテーブル移植。未定義キーは undefined
// (呼び出し側が元のディレクティブをそのまま残す)。
function formatKey(d: WarekiDate, key: string, opt: string): string | undefined {
  switch (key) {
    case 'e': return d.eraName
    case 'g': return d.eraName === '' ? '' : fmtNum(d.eraYear, opt)
    case 'G': return d.eraName === '' ? '' : i2z(d.eraYear)
    case 'Gk': return d.eraName === '' ? '' : toKan(d.eraYear, 'simple')
    case 'GK':
      if (d.eraName === '') return ''
      return d.eraYear === 1 ? '元' : toKan(d.eraYear, 'simple')
    case 'o': return String(d.year)
    case 'O': return i2z(d.year)
    case 'Ok': return toKan(d.year, 'simple')
    case 'i': return String(d.imperialYear)
    case 'I': return i2z(d.imperialYear)
    case 'Ik': return toKan(d.imperialYear, 'simple')
    case 's': return fmtNum(d.month, opt)
    case 'S': return i2z(d.month)
    case 'Sk': return toKan(d.month, 'simple')
    case 'SK': return altMonthName(d.month)
    case 'l': return d.isLeapMonth ? "'" : ''
    case 'L': return d.isLeapMonth ? '’' : ''
    case 'Lk': return d.isLeapMonth ? '閏' : ''
    case 'd': return fmtNum(d.day, opt)
    case 'D': return i2z(d.day)
    case 'Dk': return toKan(d.day, 'simple')
    case 'DK':
      if (d.month === 1 && !d.isLeapMonth && d.day === 1) return '元'
      if (d.day === 1) return '朔'
      if (d.day === d.lastDayOfMonth) return '晦'
      return toKan(d.day, 'simple')
    case 'm': return `${formatKey(d, 's', opt)}${formatKey(d, 'l', '')}`
    case 'M': return `${formatKey(d, 'Lk', '')}${formatKey(d, 'S', '')}`
    case 'Mk': return `${formatKey(d, 'Lk', '')}${formatKey(d, 'Sk', '')}`
    case 'y': return `${formatKey(d, 'e', '')}${formatKey(d, 'g', opt)}`
    case 'Y': return `${formatKey(d, 'e', '')}${formatKey(d, 'G', '')}`
    case 'Yk': return `${formatKey(d, 'e', '')}${formatKey(d, 'Gk', '')}`
    case 'YK': return `${formatKey(d, 'e', '')}${formatKey(d, 'GK', '')}`
    case 'f':
      return `${formatKey(d, 'e', '')}${formatKey(d, 'g', opt)}年${formatKey(d, 's', opt)}${formatKey(d, 'l', '')}月${formatKey(d, 'd', opt)}日`
    case 'F':
      return `${formatKey(d, 'e', '')}${formatKey(d, 'GK', '')}年${formatKey(d, 'Lk', '')}${formatKey(d, 'Sk', '')}月${formatKey(d, 'Dk', '')}日`
    default: return undefined
  }
}

const pad0 = (n: number, w: number): string => String(n).padStart(w, '0')

// Ruby 版は残りの % コードをプラットフォームの strftime に委譲するが、JS には
// 委譲先がないため %Y %y %m %d %e %j %F %% のみ自前実装し、他は無変換で通す
// (設計ドキュメントで確定した意図的差異)。年月日は Ruby の to_date (Date::ITALY:
// 1582-10-15 以降グレゴリオ暦、以前はユリウス暦) と同じ表現にする。
function stdStrftime(d: WarekiDate, str: string): string {
  const jd = d.jd
  const parts = jd >= ITALY_REFORM_JD ? jdToGregorian(jd) : jdToJulian(jd)
  const year4 = parts.year < 0 ? `-${pad0(-parts.year, 4)}` : pad0(parts.year, 4)
  return str.replace(/%([YymdejF%])/g, (whole, code: string) => {
    switch (code) {
      case 'Y': return year4
      case 'y': return pad0(((parts.year % 100) + 100) % 100, 2)
      case 'm': return pad0(parts.month, 2)
      case 'd': return pad0(parts.day, 2)
      case 'e': return String(parts.day).padStart(2, ' ')
      case 'j': return pad0(jd - italyToJd(parts.year, 1, 1) + 1, 3)
      case 'F': return `${year4}-${pad0(parts.month, 2)}-${pad0(parts.day, 2)}`
      case '%': return '%'
      default: return whole
    }
  })
}

export function formatWareki(d: WarekiDate, fmt: string): string {
  const expanded = fmt.replace(DIRECTIVE_REGEX, (whole, opt: string, key: string) => formatKey(d, key, opt) ?? whole)
  // Ruby: expand 後に % が残らなければ strftime 委譲もしない
  if (!expanded.includes('%')) return expanded
  return stdStrftime(d, expanded)
}
```

- [ ] **Step 4: src/wareki-date.ts に format とゲッターを追加**

import に追記:

```ts
import { formatWareki } from './format.js'
```

クラス内 (with メソッドの後) に追加:

```ts
  format(fmt = '%JF'): string {
    return formatWareki(this, fmt)
  }

  get eraYearKanji(): string {
    return formatWareki(this, '%JGk')
  }

  get eraYearKanjiSpecial(): string {
    return formatWareki(this, '%JGK')
  }

  get yearKanji(): string {
    return formatWareki(this, '%JOk')
  }

  get monthKanji(): string {
    return formatWareki(this, '%JSk')
  }

  get monthAltName(): string {
    return formatWareki(this, '%JSK')
  }

  get dayKanji(): string {
    return formatWareki(this, '%JDk')
  }

  get leapMonthMark(): string {
    return formatWareki(this, '%JLk')
  }
```

- [ ] **Step 5: テストが通ることを確認**

Run: `npx vitest run test/format.test.ts`
Expected: 全テスト PASS

Run: `npm test && npm run typecheck`
Expected: 全テスト PASS、型エラーなし

- [ ] **Step 6: コミット**

```bash
git add src/format.ts src/wareki-date.ts test/format.test.ts
git commit -m "feat: add %J format engine with standard strftime subset"
```

---

### Task 3: トップレベル API と index.ts の完成

**推奨モデル:** Sonnet

**Files:**
- Modify: `src/index.ts`
- Test: `test/api.test.ts`

**Interfaces:**
- Consumes: `WarekiDate` (parse / fromDate / format 込みの完成形), `WarekiParseError`, `UnsupportedDateRangeError`, `GREGORIAN_START_JD`
- Produces (公開面 = 設計ドキュメントの決定):
  - `WarekiDate`, `WarekiParseError`, `UnsupportedDateRangeError`
  - `parse(str: string): WarekiDate`
  - `parseToDate(str: string): Date` — 失敗時は `new Date(str)` にフォールバックし、それも Invalid なら元のエラーを再 throw
  - `toWarekiDate(date: Date): WarekiDate`
  - `format(date: Date | WarekiDate, fmt?: string): string`
  - `GREGORIAN_REFORM_JD: number` (= GREGORIAN_START_JD = 2405160)
  - `VERSION = '0.1.0'`

- [ ] **Step 1: 失敗するテストを書く (test/api.test.ts)**

wareki_spec.rb の転記 + 公開面の検証。

```ts
import { describe, expect, it } from 'vitest'
import {
  GREGORIAN_REFORM_JD, UnsupportedDateRangeError, VERSION, WarekiDate, WarekiParseError,
  format, parse, parseToDate, toWarekiDate,
} from '../src/index.js'

describe('top-level API', () => {
  it('parse() delegates to WarekiDate.parse', () => {
    expect(parse('平成7年11月10日').equals(WarekiDate.parse('平成7年11月10日'))).toBe(true)
    expect(parse('平成４年').toDate().getTime()).toBe(parseToDate('平成４年').getTime())
  })

  it('toWarekiDate() converts a JS Date', () => {
    const w = toWarekiDate(new Date(2015, 7, 16))
    expect([w.eraName, w.eraYear, w.month, w.day]).toEqual(['平成', 27, 8, 16])
  })

  it('format() accepts both Date and WarekiDate', () => {
    expect(format(new Date(2019, 4, 4))).toBe('令和元年五月四日')
    expect(format(new WarekiDate('天和', 3, 5, 4, true), '%Jf')).toBe("天和03年05'月04日")
  })

  it('exposes constants', () => {
    expect(GREGORIAN_REFORM_JD).toBe(2405160)
    expect(VERSION).toBe('0.1.0')
  })
})

describe('parseToDate (Ruby wareki_spec より転記)', () => {
  it('falls back to native Date parsing for non-wareki strings', () => {
    const d = parseToDate('2018-01-02')
    expect(d).toBeInstanceOf(Date)
    expect(d.toISOString().startsWith('2018-01-02')).toBe(true)
  })

  it('returns a Date for weird-but-parseable input (Ruby の Date.parse("10") 相当)', () => {
    // V8 は '10' を 2001-10-01 として解釈する。Ruby 同様「変だが Date は返る」ことだけ確認
    const d = parseToDate('10')
    expect(d).toBeInstanceOf(Date)
    expect(Number.isNaN(d.getTime())).toBe(false)
  })

  it('raises on unsupported wareki range without usable fallback', () => {
    // Ruby はフォールバックの Date.parse が ArgumentError を出す。こちらは
    // フォールバック不能時に元のエラーを再 throw する (エラークラス差は意図的差異3)
    expect(() => parseToDate('皇紀1年')).toThrow(UnsupportedDateRangeError)
  })

  it('raises on nonexistent wareki dates without stdlib fallback', () => {
    expect(() => parseToDate('天保1年2月30日')).toThrow(WarekiParseError)
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run test/api.test.ts`
Expected: FAIL (index.ts に parse 等が無い)

- [ ] **Step 3: src/index.ts を完成させる**

全文を以下に置き換える:

```ts
import { GREGORIAN_START_JD } from './constants.js'
import { UnsupportedDateRangeError, WarekiParseError } from './errors.js'
import { WarekiDate } from './wareki-date.js'

export { WarekiDate } from './wareki-date.js'
export { UnsupportedDateRangeError, WarekiParseError } from './errors.js'

// Ruby の Date::JAPAN (明治改暦日 JD) 相当
export const GREGORIAN_REFORM_JD: number = GREGORIAN_START_JD
export const VERSION = '0.1.0'

export function parse(str: string): WarekiDate {
  return WarekiDate.parse(str)
}

// Ruby Wareki.parse_to_date 相当。和暦として解釈できなければ new Date(str) に
// フォールバックし、それも Invalid Date なら元のエラーを再 throw する
// (Ruby は InvalidDate をフォールバックさせず再 raise する。この実装では
// フォールバック先が Invalid になることで同じ「例外になる」結果を得る)。
export function parseToDate(str: string): Date {
  let original: unknown
  try {
    return WarekiDate.parse(str).toDate()
  } catch (e) {
    if (!(e instanceof WarekiParseError) && !(e instanceof UnsupportedDateRangeError)) throw e
    original = e
  }
  const fallback = new Date(str)
  if (Number.isNaN(fallback.getTime())) throw original
  return fallback
}

export function toWarekiDate(date: Date): WarekiDate {
  return WarekiDate.fromDate(date)
}

export function format(date: Date | WarekiDate, fmt = '%JF'): string {
  const w = date instanceof WarekiDate ? date : WarekiDate.fromDate(date)
  return w.format(fmt)
}
```

(test/smoke.test.ts の VERSION テストはそのまま通る。)

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run test/api.test.ts`
Expected: 全テスト PASS

Run: `npm test && npm run typecheck`
Expected: 全テスト PASS、型エラーなし

- [ ] **Step 5: コミット**

```bash
git add src/index.ts test/api.test.ts
git commit -m "feat: expose top-level parse/format API"
```

---

### Task 4: ゴールデンフォーマットテスト

**推奨モデル:** Sonnet

**Files:**
- Modify: `tools/gen-golden.rb` (jF / jf 列を追加), `test/golden/conversions.csv` (再生成)
- Test: `test/golden-format.test.ts`

**Interfaces:**
- Consumes: `WarekiDate.fromJd(...).format('%JF' | '%Jf')`
- Produces: `test/golden/conversions.csv` — ヘッダが `jd,era,eraYear,year,month,day,isLeap,jF,jf` に拡張される。Plan 1 の test/golden.test.ts は添字 0〜6 しか読まないため無変更で通り続ける。

- [ ] **Step 1: tools/gen-golden.rb を更新**

CSV 出力部を以下の全文に置き換える (サンプリング部は Plan 1 のまま):

```ruby
#!/usr/bin/env ruby
# frozen_string_literal: true

# Ruby 版 wareki を正として JD → 和暦・フォーマットの対照表 CSV を生成する。
# 再生成時のみ手元で実行する (CI では実行しない。CSV はコミット済み)。
# 実行には ya_kansuji gem が必要: gem install ya_kansuji
require 'csv'
wareki_lib = File.expand_path('../../wareki/lib', __dir__)
$LOAD_PATH.unshift wareki_lib
require 'wareki'

jds = []
(1_883_618..2_465_000).step(37) { |jd| jds << jd }
(Wareki::ERA_DEFS + Wareki::ERA_NORTH_DEFS).each do |e|
  jds.concat [e.start - 1, e.start, e.start + 1]
  next if e.end > 3_000_000
  jds.concat [e.end - 1, e.end, e.end + 1]
end
jds.concat [2400508, 2457251, 1956842, 2139493, 2139492, 2335942, 2168353, 2168529,
            2153704, 2404833, 2405159, 2405160, 2447528, 2458485, 2458604, 2458605]
jds = jds.select { |j| j >= 1_883_618 && j <= 2_465_000 }.uniq.sort

CSV.open(File.expand_path('../test/golden/conversions.csv', __dir__), 'w') do |csv|
  csv << %w(jd era eraYear year month day isLeap jF jf)
  jds.each do |jd|
    begin
      w = Wareki::Date.jd(jd)
      csv << [jd, w.era_name, w.era_year, w.year, w.month, w.day, w.leap_month?,
              w.strftime('%JF'), w.strftime('%Jf')]
    rescue Wareki::UnsupportedDateRange
      csv << [jd, 'UNSUPPORTED', '', '', '', '', '', '', '']
    end
  end
end
puts "rows: #{jds.size}"
```

- [ ] **Step 2: CSV を再生成**

Run: `ruby tools/gen-golden.rb`
Expected: `rows: 16462` (Plan 1 と同じ行数)

Run: `head -1 test/golden/conversions.csv`
Expected: `jd,era,eraYear,year,month,day,isLeap,jF,jf`

Run: `npx vitest run test/golden.test.ts`
Expected: PASS (Plan 1 のテストは列追加の影響を受けない)

- [ ] **Step 3: 失敗するテストを書く (test/golden-format.test.ts)**

```ts
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
```

- [ ] **Step 4: テストを実行**

Run: `npx vitest run test/golden-format.test.ts`
Expected: 全テスト PASS。失敗した場合は該当 JD を Ruby で個別確認し JS 側を直す (CSV は Ruby が正)。

Run: `npm test`
Expected: 全テスト PASS

- [ ] **Step 5: コミット**

```bash
git add tools/gen-golden.rb test/golden/conversions.csv test/golden-format.test.ts
git commit -m "test: add golden format columns and comparison test"
```

---

### Task 5: dist 検証 + README + CI + 依存の復元

**推奨モデル:** Sonnet

**Files:**
- Create: `test/dist.test.ts`, `README.md`, `.github/workflows/ci.yml`
- Modify: `package.json` (dependencies の ya-kansuji を `^0.1.0` に戻す)

**Interfaces:**
- Consumes: 完成した dist 5点、公開 API 全部
- Produces: npm publish 可能なパッケージ一式 (publint / attw クリーン)。CI は ya-kansuji publish まで fail する見込みである旨をコメントで明示。

- [ ] **Step 1: dist 検証テストを書く (test/dist.test.ts)**

ya-kansuji-js の test/dist.test.ts のパターンを踏襲し、バンドル境界の検証を加える。

```ts
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
```

- [ ] **Step 2: ビルドしてテストが通ることを確認**

Run: `npm run build && npm test`
Expected: dist 5点が生成され、dist テスト含め全テスト PASS

- [ ] **Step 3: README.md を書く**

以下の全文で作成する (Ruby 版 README の構成の移植 + JS 固有の注記):

````markdown
# ya-wareki

和暦・旧暦を扱う JavaScript/TypeScript ライブラリです。Ruby gem [wareki](https://github.com/sugi/wareki) の移植版で、旧暦 (445年〜) を正確な月境界・閏月付きで変換できます。

## 機能

* 和暦文字列のパース (元号・漢数字・旧字体・㍾㍽㍼㍻㋿・閏月・月の別名・朔/晦/元旦などの慣用表記に対応)
* 旧暦 (445年1月1日〜明治5年12月2日) と グレゴリオ暦 (明治6年〜) の相互変換
* 神武天皇即位紀元 (皇紀)、西暦、紀元前の解釈
* Ruby 版と完全互換の `%J` 系フォーマット文字列
* テンプレートリテラル向けのフィールドゲッター (`eraYearKanji` など)
* 依存は [ya-kansuji](https://www.npmjs.com/package/ya-kansuji) のみ。ブラウザ用 IIFE は 1 ファイルで完結

## インストール

```
npm install ya-wareki
```

CDN から直接使う場合 (グローバル `YaWareki` が生えます):

```html
<script src="https://cdn.jsdelivr.net/npm/ya-wareki"></script>
<script>
  console.log(YaWareki.format(new Date())) // => 令和七年七月十三日 (など)
</script>
```

ES Modules で使う場合:

```html
<script type="module">
  import { parse, format } from 'https://cdn.jsdelivr.net/npm/ya-wareki/+esm'
  console.log(format(new Date(), '%Jf'))
</script>
```

## 使い方

```ts
import { WarekiDate, parse, parseToDate, toWarekiDate, format } from 'ya-wareki'

// パース
const w = parse('元仁元年閏七月朔日')   // WarekiDate インスタンス
w.jd                                  // => 2168353 (ユリウス日)
w.toJulianParts()                     // => { year: 1224, month: 8, day: 17 } (ユリウス暦)
w.toGregorianParts()                  // => { year: 1224, month: 8, day: 24 } (先発グレゴリオ暦)
parseToDate('㍻一〇年 肆月 晦日')      // => Date (1998-04-30)。和暦でなければ new Date(str) にフォールバック

// フォーマット
format(new Date(2019, 4, 4))          // => '令和元年五月四日'
format(new Date(2019, 4, 4), '%Jf')   // => '令和01年05月04日'
toWarekiDate(new Date(1683, 5, 28)).format('%JF') // => '天和三年閏五月四日'

// WarekiDate を直接組み立てる
const d = new WarekiDate('明治', 8, 2, 1)
d.toDate()                            // => Date (1875-02-01)
d.with({ month: 3 })                  // => 明治8年3月1日 (immutable なので新インスタンス)
d.addDays(30)                         // => 30日後

// テンプレートリテラル向けゲッター
const t = parse('天和3年閏5月4日')
`${t.eraName}${t.eraYearKanji}年${t.leapMonthMark}${t.monthKanji}月${t.dayKanji}日`
// => '天和三年閏五月四日'
```

## フォーマット文字列一覧

`format(fmt)` では以下の `%J` 系コードが使えます (Ruby 版 wareki と完全互換)。

* %Jf: "%Je%Jg年%Js%Jl月%Jd日" の略 (例: 平成23年3月12日)
* %JF: "%Je%JGK年%JLk%JSk月%JDk日" の略 (例: 平成二十三年三月十二日)
* %Jy: "%Je%Jg" の略 (元号+半角数字年)
* %JY: "%Je%JG" の略 (元号+全角数字年)
* %JYk: "%Je%JGk" の略 (元号+漢数字年)
* %JYK: "%Je%JGK" の略 (元号+特殊漢数字年)
* %Je: 元号 (存在しない場合空文字列になります)
* %Jg: 和暦年の半角数字 (元号が存在しない場合空文字列)
* %JG: 和暦年の全角数字 (元号が存在しない場合空文字列)
* %JGk: 和暦年の漢数字 (元号が存在しない場合空文字列)
* %JGK: 和暦年の漢数字の特殊記法 (元) (元号が存在しない場合空文字列)
* %Jo: 旧暦年の半角数字
* %JO: 旧暦年の全角数字
* %JOk: 旧暦年の漢数字
* %Ji: 神武天皇即位紀元 (皇紀) 年の半角数字
* %JI: 神武天皇即位紀元 (皇紀) 年の全角数字
* %JIk: 神武天皇即位紀元 (皇紀) 年の漢数字
* %Jm: "%Js%Jl" の略 (和暦月の半角数字。閏月は後ろに "'" を追加)
* %JM: "%JLk%JS" の略 (和暦月の全角数字。閏月は前に "閏" を追加)
* %JMk: "%JLk%JSk" の略 (和暦月の漢数字。閏月は前に "閏" を追加)
* %Js: 和暦月の半角数字
* %JS: 和暦月の全角数字
* %JSk: 和暦月の漢数字
* %JSK: 和暦月の別名 (睦月、如月、弥生...)
* %Jl: 和暦月が閏月の場合 "'"、そうでなければ空文字列
* %JL: 和暦月が閏月の場合 "’"、そうでなければ空文字列
* %JLk: 和暦月が閏月の場合 "閏"、そうでなければ空文字列
* %Jd: 和暦日の半角数字
* %JD: 和暦日の全角数字
* %JDk: 和暦日の漢数字
* %JDK: 和暦日の漢数字の特殊記法 (元、朔、晦)

`%J1d` `%J_2d` `%J04d` のような幅・パディング指定も Ruby 版同様に使えます。

`%J` 系以外では、標準 strftime のうち **%Y %y %m %d %e %j %F %%** だけを実装しています (Ruby 版はプラットフォームの strftime に委譲しますが、JS には委譲先がないため)。これ以外の `%` コードは変換されずそのまま出力されます。`WarekiDate` は時刻を持たないため時刻系コードは対象外です。

## 仕様、限界、制限など

* 旧暦445年1月1日 (先発グレゴリオ暦 445年1月25日) より前の日付はサポートしません。扱おうとすると `UnsupportedDateRangeError` になります。
* 元号からの変換は「大化」開始 (ユリウス暦 645年2月2日... 実際には大化元年1月1日相当日) より前も `UnsupportedDateRangeError` です。元号の空白期間 (白雉〜朱鳥の間など) も同様です。
* 内部的にはすべてユリウス日 (JD) を経由して変換します。
* パース時には元号の存在しない年 (例: 霊亀百年) を受け入れます。
* 存在しない日付 (月・日の範囲超過、存在しない閏月、改暦により存在しない明治5年12月3日〜31日など) は `WarekiParseError` になります。
* 北朝の元号も解釈できますが、北朝の元号で文字列にフォーマットすることはできません。JD からの変換では南北朝期は南朝の元号になります (南北朝合一後は明徳)。
* 元号の開始日より前の日付表記 (例: 令和元年1月1日) は受理し、その元号の元年として解釈します。逆変換では実際の元号 (平成31年1月1日) になります。
* 10月の別名は「神無月」しかサポートしていません。
* 将来の日付に関しては、現在の元号がずっと継続しているとみなします。
* JS の `Date` は先発グレゴリオ暦のため、1582年10月4日以前の日付では Ruby の `Date` (ユリウス暦表記) と年月日がずれます。ユリウス暦表記が必要な場合は `toJulianParts()` を使ってください。JD は両者で同一です。
* `WarekiDate.fromDate()` は既定でローカルタイムゾーンの年月日を使います (`{ utc: true }` で UTC)。`toDate()` はローカル深夜の `Date` を返します。

## Ruby 版 (wareki gem) との違い

1. ビルトインクラスの拡張 (`Date#strftime` の上書き等) はありません。独自クラスと純関数のみです。
2. `WarekiDate` は immutable です。setter の代わりに `with()` で派生インスタンスを作ります。
3. エラーは `WarekiParseError` (Ruby の ArgumentError / Wareki::InvalidDate 相当) と `UnsupportedDateRangeError` (Wareki::UnsupportedDateRange 相当) です。
4. ActiveSupport::Duration との演算はサポートしません (`addDays` / `subDays` を使ってください)。
5. strftime のフル委譲はなく、標準コードは %Y %y %m %d %e %j %F %% のみ実装しています。

## 参照元データ

移植元の wareki gem と同一のデータを使用しています (Wakaba 氏による [data-locale](https://github.com/manakai/data-locale) の「日本暦日原典」第4版準拠対照表、および Wikipedia の元号一覧)。

## ライセンス

[The BSD 2-Clause License](https://opensource.org/licenses/BSD-2-Clause)

## 作者

Tatsuki Sugiura <sugi@nemui.org>
````

- [ ] **Step 4: CI ワークフローを書く (.github/workflows/ci.yml)**

ya-kansuji-js の ci.yml と同型だが、lockfile なし運用のため `npm install` を使う。

```yaml
name: CI
# 注意: ya-kansuji が npm に publish されるまでこのワークフローは失敗する
# (dependencies の "ya-kansuji": "^0.1.0" が registry に存在しないため)。
# ya-kansuji publish 後にやること:
#   1. package-lock.json を .gitignore から外してコミットする
#   2. 下の npm install を npm ci に戻し、setup-node に cache: 'npm' を足す
on:
  push:
    branches: [main]
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: ['22', '24']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
      - run: npm install
      - run: npm run typecheck
      - run: npm run build
      - run: npm test
      - run: npx publint
      - run: npx @arethetypeswrong/cli --pack .
```

- [ ] **Step 5: publint / attw をローカルで検証**

Run: `npx publint`
Expected: `All good!` (エラー0件。警告が出た場合は内容を確認し、exports マップ由来なら修正する)

Run: `npx @arethetypeswrong/cli --pack .`
Expected: 全解決モードで問題なし (ESM/CJS 両方の types が解決される)

- [ ] **Step 6: 依存を "^0.1.0" に戻す**

```bash
npm pkg set 'dependencies.ya-kansuji=^0.1.0'
git diff package.json
```

Expected: dependencies が `"ya-kansuji": "^0.1.0"` に戻る。node_modules 内のローカルインストールはそのまま残るため、この後も `npm install` を再実行しない限り開発・テストは動き続ける (再実行すると registry 解決に失敗するので注意。その場合は `npm install ../ya-kansuji-js` からやり直す)。

Run: `npm test`
Expected: 全テスト PASS (node_modules は無傷)

- [ ] **Step 7: 最終検証とコミット**

Run: `npm run typecheck && npm run build && npm test`
Expected: すべて成功。dist 5点生成、全テスト PASS

```bash
git add test/dist.test.ts README.md .github/workflows/ci.yml package.json
git commit -m "feat: add dist verification, README, CI and restore npm dependency spec"
```

---

## 完了条件

- [ ] `npm test` が全テスト PASS (Plan 1 の全テスト + parse / format / api / golden-format / dist)。
- [ ] `npm run typecheck` がエラーなし。`npm run build` が dist 5点を出力する。
- [ ] ゴールデン CSV の全対応行で `%JF` / `%Jf` が Ruby と一致する。
- [ ] `npx publint` と `npx @arethetypeswrong/cli --pack .` がクリーン。
- [ ] dist/index.js (ESM) と dist/index.cjs は ya-kansuji を external 参照し、dist/index.iife.min.js は内包している (test/dist.test.ts が保証)。
- [ ] README.md (日本語、フォーマット文字列一覧・Ruby 版との差異5点・BSD-2-Clause 明記) と CI ワークフロー (expected-to-fail コメント付き) がコミットされている。
- [ ] package.json の dependencies が `"ya-kansuji": "^0.1.0"` に戻っている。
- [ ] 公開面が設計ドキュメントと一致: `WarekiDate` / `parse` / `parseToDate` / `toWarekiDate` / `format` / `WarekiParseError` / `UnsupportedDateRangeError` / `GREGORIAN_REFORM_JD` / `VERSION`。
- [ ] npm publish は本プランの範囲外 (ya-kansuji の publish 後に手動で行う)。
