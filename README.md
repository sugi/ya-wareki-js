# ya-wareki

[![npm version](https://img.shields.io/npm/v/ya-wareki.svg)](https://www.npmjs.com/package/ya-wareki)
[![CI](https://github.com/sugi/ya-wareki-js/actions/workflows/ci.yml/badge.svg)](https://github.com/sugi/ya-wareki-js/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/ya-wareki.svg)](./LICENSE)
[![node](https://img.shields.io/node/v/ya-wareki.svg)](https://www.npmjs.com/package/ya-wareki)

和暦・旧暦を扱う JavaScript/TypeScript ライブラリです。Ruby gem [wareki](https://github.com/sugi/wareki) の移植版で、旧暦 (445年〜) を正確な月境界・閏月付きで変換できます。

## 機能

* 和暦文字列のパース (元号・漢数字・旧字体・㍾㍽㍼㍻㋿・閏月・月の別名・朔/晦/元旦などの慣用表記に対応)
* 旧暦 (445年1月1日〜明治5年12月2日) と グレゴリオ暦 (明治6年〜) の相互変換
* 神武天皇即位紀元 (皇紀)、西暦、紀元前の解釈
* 日本語の時刻表記 (漢数字・全角数字の時分秒、午前/午後、半、正午) のパースと `%JT` 系フォーマット文字列
* Ruby 版と完全互換の `%J` 系フォーマット文字列
* テンプレートリテラル向けのフィールドゲッター (`eraYearKanji` など)
* 依存は [ya-kansuji](https://www.npmjs.com/package/ya-kansuji) のみ。ブラウザ用 IIFE は 1 ファイルで完結

## インストール

```
npm install ya-wareki
```

CDN から直接使う場合 (グローバル `YaWareki` が生えます。IIFE ビルドは ya-kansuji を同梱しているので `<script>` 1枚だけで動きます):

```html
<script src="https://cdn.jsdelivr.net/npm/ya-wareki@0.1.0"></script>
<script>
  console.log(YaWareki.format(new Date())) // => 令和八年七月十三日 (など)
</script>
```

ES Modules で使う場合:

```html
<script type="module">
  import { parse, format } from 'https://cdn.jsdelivr.net/npm/ya-wareki@0.1.0/+esm'
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
d.with({ month: 3 }).format()         // => '明治八年三月一日' (immutable なので新インスタンス)
d.addDays(30).format()                // => '明治八年三月三日' (30日後)

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

`%J` 系以外では、標準 strftime のうち **%Y %y %m %d %e %j %F %%** だけを実装しています (Ruby 版はプラットフォームの strftime に委譲しますが、JS には委譲先がないため)。これ以外の `%` コード (`%0Y` のようなフラグ付きのものを含む) は変換されずそのまま出力されます。`WarekiDate` は時刻を持たないため時刻系コードは対象外です (時刻の扱いは下記「時刻」節を参照)。

## 時刻

日付だけでなく、日本語の時刻表記 (漢数字・全角数字の時分秒、午前/午後、半、正午) も扱えます。時刻には暦のような対応表は無く、単純な数字変換として処理されます。

### normalizeTime

`normalizeTime(str)` は文字列中の**最初の**日本語時刻表記を等価な `"HH:MM(:SS)"` に置換します (値の範囲チェックはしません)。

```ts
import { normalizeTime } from 'ya-wareki'

normalizeTime('午後三時半')                    // => '15:30'
normalizeTime('十二時三十四分五十六秒')          // => '12:34:56'
normalizeTime('正午')                          // => '12:00'
normalizeTime('平成元年五月四日十二時三十四分')   // => '平成元年五月四日12:34'
```

「午前」は無変換、「午後」は12時未満のときのみ +12 します (午後十二時 → `12:00`)。範囲外の値もそのまま数字化します (二十五時 → `25:00`)。

### parseToDate の時刻対応

`parseToDate()` は入力にまず `normalizeTime` を適用し、和暦日付として解釈できてかつ時刻表記があれば、それを**ローカル時刻**として `Date` にセットします。

```ts
import { parseToDate } from 'ya-wareki'

parseToDate('平成元年五月四日十二時三十四分五十六秒') // => Date (ローカル 1989-05-04 12:34:56)
parseToDate('令和三年一月一日 零時五分')            // => Date (ローカル 2021-01-01 00:05:00)
parseToDate('㍻一〇年 肆月 晦日 正午')             // => Date (ローカル 1998-04-30 12:00:00)
```

範囲外の時刻 (`二十五時` → 25:00、`十二時七十分` → 12:70 など) は Ruby の `Time.parse` と同様に `WarekiParseError` になります (受理範囲: 時 ≤ 24 かつ 24 は 24:00:00 のみ、分 ≤ 59、秒 ≤ 60)。時刻だけで日付を含まない文字列 (`12時34分` など) も、フォールバック先の `new Date()` が解釈できないため `WarekiParseError` になります (Ruby の `Date.parse('12時34分')` 相当。`Time.parse` の「本日＋時刻」挙動は再現しません)。

`parse()` / `WarekiDate.parse()` は従来どおり**日付のみ**を返し、後続の時刻表記は無視します (Ruby の `Date.parse` と同じ)。

### %JT フォーマットディレクティブ

`format(date, fmt)` に **JS の `Date`** を渡した場合に限り、以下の `%JT` 系コードがその**ローカル時刻**から展開されます。`WarekiDate` は時刻を持たないため `%JT` はリテラルのまま残ります。

* %JTf: "%JTH時%JTM分%JTS秒" 相当の半角ゼロ埋め複合表記 (例: 13時45分06秒)
* %JTF: 漢数字の複合表記 (例: 十三時四十五分六秒)
* %JTH: 時の全角数字
* %JTHk: 時の漢数字
* %JTM: 分の全角数字
* %JTMk: 分の漢数字
* %JTS: 秒の全角数字
* %JTSk: 秒の漢数字

```ts
import { format, formatTime } from 'ya-wareki'

format(new Date(2019, 4, 4, 13, 45, 6), '%JF %JTF') // => '令和元年五月四日 十三時四十五分六秒'
format(new Date(2019, 4, 4, 13, 45, 6), '%JTf')     // => '13時45分06秒'

// 時刻オブジェクト ({ hour, minute, second }) や Date を直接渡すこともできます
formatTime({ hour: 13, minute: 45, second: 6 }, '%JTHk時%JTMk分') // => '十三時四十五分'
```

`%JT` 系も `%J-Tf` `%J03Tf` のような幅・パディング指定 (`%JTf` の複合表記に適用) が使えます。`Date` を渡したときは `%JT` を先に展開してから `%J` 日付ディレクティブを展開します。

## 仕様、限界、制限など

* 旧暦445年1月1日 (先発グレゴリオ暦 445年1月25日) より前の日付はサポートしません。扱おうとすると `UnsupportedDateRangeError` になります。
* 元号からの変換は「大化」開始 (ユリウス暦 645年2月2日... 実際には大化元年1月1日相当日) より前も `UnsupportedDateRangeError` です。元号の空白期間 (白雉〜朱鳥の間など) も同様です。
* 内部的にはすべてユリウス日 (JD) を経由して変換します。
* パース時には元号の存在しない年 (例: 霊亀百年) を受け入れます。
* 存在しない日付 (月・日の範囲超過、存在しない閏月、改暦により存在しない明治5年12月3日〜31日など) は `WarekiParseError` になります。
* 南朝・北朝どちらの元号名でもパースできますが、JD (日付) からの逆変換では北朝の元号を優先します (南北朝合一後は明徳)。
* 元号の開始日より前の日付表記 (例: 令和元年1月1日) は受理し、その元号の元年として解釈します。逆変換では実際の元号 (平成31年1月1日) になります。
* 10月の別名は「神無月」しかサポートしていません。
* 将来の日付に関しては、現在の元号がずっと継続しているとみなします。
* JS の `Date` は先発グレゴリオ暦のため、1582年10月4日以前の日付では Ruby の `Date` (ユリウス暦表記) と年月日がずれます。ユリウス暦表記が必要な場合は `toJulianParts()` を使ってください。JD は両者で同一です。
* `WarekiDate.fromDate()` は既定でローカルタイムゾーンの年月日を使います (`{ utc: true }` で UTC)。`toDate()` はローカル深夜の `Date` を返します。
* 公開 API は不正な入力を早期に拒否します。無効な `Date` (Invalid Date) を `format` / `formatTime` / `toWarekiDate` / `WarekiDate.fromDate` に渡すと `RangeError`、`WarekiDate` コンストラクタに安全な整数でない `eraYear` (元号・皇紀では 1 未満も) を渡すと `RangeError` になります。西暦・紀元前は先発グレゴリオ暦上の 0・負数を正当な年として受け付けます。

## 既知の挙動差

Ruby 版との厳密な互換を目指していますが、以下の3点は既知の差異として残っています。

1. **`%JOk` / `.yearKanji` (および他の漢数字系フォーマット・ゲッター) は、対象の年が紀元前 (負の西暦年) だと `RangeError` を投げます。** 内部で使っている [ya-kansuji](https://www.npmjs.com/package/ya-kansuji) の `toKan()` が負数を受け付けないためです。Ruby 版はこの場合エラーにならず無意味な文字列を返します (Ruby 側もこの挙動は今後修正される予定です)。
2. **標準 strftime コードは素の `%Y %y %m %d %e %j %F %%` のみ実装しています。** それ以外の `%` コード (フラグ付きの `%0Y` などを含む) は無変換でそのまま出力されます。Ruby 版はプラットフォームの `strftime(3)` に丸ごと委譲しますが、JS にはその委譲先が存在しないためです。
3. **パース時の空白の扱いが異なります。** Ruby の `[[:space:]]` と JS の `\s` はほぼ同じですが、U+0085 (NEL) は Ruby では空白として除去される一方 JS では除去されず、逆に U+FEFF (BOM) は JS では空白として除去される一方 Ruby では除去されません。

## Ruby 版 (wareki gem) との違い

1. ビルトインクラスの拡張 (`Date#strftime` の上書き等) はありません。独自クラスと純関数のみです。
2. `WarekiDate` は immutable です。setter の代わりに `with()` で派生インスタンスを作ります。
3. エラーは `WarekiParseError` (Ruby の `ArgumentError` 相当) と `UnsupportedDateRangeError` (Ruby の `Wareki::UnsupportedDateRange` 相当) です。和暦としては認識できたが日付として不成立 (存在しない月日など) な場合は、`WarekiParseError` のサブクラスである `WarekiInvalidDateError` (Ruby の `Wareki::InvalidDate` 相当) になります。`parseToDate()` はこの `WarekiInvalidDateError` の場合に限り `new Date(str)` へのフォールバックをせず、常に元のエラーを再送出します (Ruby の `rescue InvalidDate; raise` 相当)。
4. ActiveSupport::Duration との演算はサポートしません (`addDays` / `subDays` を使ってください)。
5. strftime のフル委譲はなく、標準コードは %Y %y %m %d %e %j %F %% のみ実装しています。

## 参照元データ

旧暦と元号の定義は、Wakaba 氏による
[manakai/data-locale](https://github.com/manakai/data-locale)リポジトリの最新版から直接生成しています。
旧暦には[「日本暦日原典」第4版準拠の対照表](https://github.com/manakai/data-locale/blob/master/data/calendar/kyuureki-map.txt)、
元号には[日本の元号定義](https://github.com/manakai/data-locale/blob/master/data/calendar/era-defs.json)を使用しています。
生成時に取得した各ファイルのSHA-256は、生成物のヘッダーに記録されます。

## ライセンス

[The BSD 2-Clause License](https://opensource.org/licenses/BSD-2-Clause)

## 作者

Tatsuki Sugiura <sugi@nemui.org>
