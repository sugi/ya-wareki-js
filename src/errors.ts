/**
 * 文字列を和暦日付としてパースできなかったときに投げられる。
 * Ruby 版 wareki の `ArgumentError` に相当する。
 */
export class WarekiParseError extends Error {
  constructor(message?: string) {
    super(message)
    this.name = 'WarekiParseError'
  }
}

/**
 * 和暦としては認識できたが、日付として成立しない (存在しない月・日、存在しない
 * 閏月、改暦で欠落した明治5年12月3日〜31日など) ときに投げられる。
 * Ruby 版 wareki の `Wareki::InvalidDate` (`ArgumentError` のサブクラス) に相当する。
 *
 * {@link WarekiParseError} のサブクラスなので `e instanceof WarekiParseError` でまとめて
 * 捕捉できる。{@link parseToDate} だけはこれを個別に見分け、`new Date(str)` への
 * フォールバックをせず常に再 throw する。
 */
export class WarekiInvalidDateError extends WarekiParseError {
  constructor(message?: string) {
    super(message)
    this.name = 'WarekiInvalidDateError'
  }
}

/**
 * サポート範囲外の日付を変換しようとしたときに投げられる。
 * 旧暦445年1月1日より前、元号「大化」開始より前、および元号の空白期間
 * (白雉〜朱鳥の間など) が対象。Ruby 版 wareki の `Wareki::UnsupportedDateRange` に相当する。
 */
export class UnsupportedDateRangeError extends Error {
  constructor(message?: string) {
    super(message)
    this.name = 'UnsupportedDateRangeError'
  }
}
