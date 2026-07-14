# Changelog

このプロジェクトの主な変更点を記録します。
書式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/)、
バージョニングは [Semantic Versioning](https://semver.org/lang/ja/) に従います。

## [0.1.0] - 2026-07-15

初回リリース。

### 追加

- 和暦文字列のパース (`parse` / `WarekiDate.parse`)。元号・漢数字・旧字体・合字 (㍾㍽㍼㍻㋿)・閏月・月の別名・朔/晦/元旦などの慣用表記に対応。
- 旧暦 (445年1月1日〜明治5年12月2日) とグレゴリオ暦 (明治6年〜) の相互変換。内部はすべてユリウス日 (JD) を経由。
- 神武天皇即位紀元 (皇紀)・西暦・紀元前の解釈。
- 日本語の時刻表記 (漢数字・全角数字の時分秒、午前/午後、半、正午) の正規化 (`normalizeTime`) と、`parseToDate` によるローカル時刻の取り込み。
- Ruby 版 wareki 互換の `%J` 系フォーマットディレクティブ、および `Date` 向けの `%JT` 系時刻ディレクティブ (`format` / `formatTime`)。
- immutable な `WarekiDate` クラス (`with` / `addDays` / `subDays` / `toDate` / `toJulianParts` / `toGregorianParts` など)。TypeScript の `readonly` に加え、実行時も `Object.freeze` で不変。
- テンプレートリテラル向けのフィールドゲッター (`eraName` / `eraYearKanji` / `monthKanji` など)。
- パブリック API: `parse` / `parseToDate` / `toWarekiDate` / `format` / `formatTime` / `normalizeTime` / `WarekiDate`、エラー型 (`WarekiParseError` / `WarekiInvalidDateError` / `UnsupportedDateRangeError`)、定数 (`VERSION` / `GREGORIAN_REFORM_JD`)。
- ESM・CommonJS・ブラウザ向け IIFE (ya-kansuji を同梱) の3ビルドと、TypeScript 型定義 (`.d.ts` / `.d.cts`) を同梱。
- 元号・旧暦の定義データは [manakai/data-locale](https://github.com/manakai/data-locale) から生成し、各入力ファイルの SHA-256 を生成物ヘッダーに記録。
- Ruby 版 wareki との対照ゴールデン (変換 15,000 件超、ビットパック旧暦テーブル) による回帰テスト。

### 既知の制限

- 旧暦445年1月1日 (先発グレゴリオ暦445年1月25日) より前、および元号「大化」開始前は `UnsupportedDateRangeError`。
- 標準 strftime のうち実装しているのは `%Y %y %m %d %e %j %F %%` のみ。その他の `%` コードは無変換で出力する。
- 紀元前 (負の西暦年) の漢数字系フォーマット・ゲッターは、ya-kansuji の制約により `RangeError` を投げる。
- その他の Ruby 版との既知挙動差は [README「既知の挙動差」](README.md#既知の挙動差) を参照。

[0.1.0]: https://github.com/sugi/ya-wareki-js/releases/tag/v0.1.0
