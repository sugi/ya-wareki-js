# 2026-07-13 コードベースレビュー指摘 F-01 / F-04 修正計画

docs/reviews/2026-07-13-codebase-review.md の指摘のうち F-01 (時刻の部分一致) と
F-04 (WarekiDate の実行時可変性) を修正する。2タスクは独立で、順に実行する。

共通制約:

- Ruby 版 wareki gem の実測挙動と README 記載の契約が正。
- コミットメッセージは英語。インラインコメントはコードから読み取れない背景事情がある箇所のみ。
- 既存テスト (263件) と `npm run typecheck` を全て通す。

## Task 1: F-01 — 3桁以上の時刻成分を部分一致で受理せず拒否する

### 背景

- `normalizeTime` は値の範囲チェックをしない (Ruby `_time_match_to_s` と同じ仕様)。
  `百時` → `100:00`、`十二時百分` → `12:100` を生成する。
- 現行の `TIME_OF_DAY_REGEX = /(\d{1,2}):(\d{2})(?::(\d{2}))?/` (src/index.ts:28) は
  数字境界にアンカーしていないため、`100:00` に `00:00`、`12:100` に `12:10` が
  部分一致し、入力と異なる時刻を例外なしの正常値として返してしまう。
- README (L141) は範囲外時刻を `WarekiParseError` にすると約束している。
- Ruby 版の実測 (これが正):
  - `平成元年五月四日 百時` (→ `100:00`) → `ArgumentError`
  - `平成元年五月四日 十二時百分` (→ `12:100`) → `ArgumentError`
  - `平成2年1月3日 12:3` → `12:03:00` として受理
  - `平成2年1月3日 12:345` → `ArgumentError`
  - `平成2年1月3日 123:45` → `ArgumentError`
  - `平成2年1月3日 12:34:5` → `12:34:05` として受理

  つまり Ruby は数字の連続全体を成分値として読み、そのうえで範囲検証する。

### 変更内容

src/index.ts の `TIME_OF_DAY_REGEX` を数字境界付き・全桁キャプチャへ変更する:

```ts
const TIME_OF_DAY_REGEX = /(?<!\d)(\d+):(\d+)(?::(\d+))?(?!\d)/
```

`extractTimeOfDay` の範囲チェック
(`hour > 24 || (hour === 24 && (min > 0 || sec > 0)) || min > 59 || sec > 60` →
`WarekiParseError`) は既存のまま流用する。これで3桁以上の成分は部分一致せず
全体が数値として検証に載り、上記 Ruby 実測と同じ受理/拒否になる。

regex 直上の既存コメント (「この単純な正規表現で拾える」) は新しい根拠に合わせて
更新する: 数字境界で桁の連続全体を捕捉して範囲検証に載せる (3桁以上の別時刻への
部分一致を防ぐ)。Ruby `Time.parse` の実測受理/拒否と一致させている、という趣旨。

### テスト (TDD: 実装前に RED を確認する)

test/api.test.ts に追加 — 以下がすべて `WarekiParseError` になること:

- `parseToDate('平成元年五月四日 百時')`
- `parseToDate('平成元年五月四日 十二時百分')`
- `parseToDate('平成元年五月四日 十二時三十四分百秒')`
- `parseToDate('平成元年五月四日 千時')`

正常系コントロール (受理されること。既存テストが同等の検証をしていれば追加不要):

- `parseToDate('平成元年5月4日 十二時三十四分')` が 12:34:00 になる

既存テスト全件と `npm run typecheck` を通すこと。

## Task 2: F-04 — WarekiDate を実行時にも immutable にする

### 背景

- README は `WarekiDate` を immutable と説明している (L61, L195) が、TypeScript の
  `readonly` はコンパイル時のみの制約で、JavaScript からは `d.day = 2` のような
  代入が通ってしまう。
- `jd` getter (src/wareki-date.ts:102) は計算結果を `#jd` にキャッシュするため、
  代入後はフィールドと jd 由来の値 (`toGregorianParts()` など) が矛盾した状態になる。

### 変更内容

src/wareki-date.ts のコンストラクタ末尾 (`this.#validate()` 成功後) に
`Object.freeze(this)` を追加する。

- プライベートフィールド `#jd` はプロパティ記述子を持たないため freeze の影響を
  受けず、freeze 後もクラス内から代入できる。`jd` getter のキャッシュ書き込みと
  `fromJd` の `d.#jd = jd` は現状のまま動く。この非自明な点は短いコメントで残す。

### テスト (TDD: 実装前に RED を確認する)

test/wareki-date.test.ts に追加:

- `Object.isFrozen(new WarekiDate('令和', 1, 1, 1))` が true
- 代入 (`(d as any).day = 2`) が `TypeError` を投げる (ESM = strict mode)
- `d.jd` を参照した後に代入を試みても、`day` と `toGregorianParts()` が元の日付の
  まま矛盾しないこと
- `WarekiDate.fromJd(jd).jd === jd` (freeze 後も `#jd` の事前セットが機能すること)

既存テスト全件と `npm run typecheck` を通すこと。
