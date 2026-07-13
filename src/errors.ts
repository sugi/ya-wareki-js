export class WarekiParseError extends Error {
  constructor(message?: string) {
    super(message)
    this.name = 'WarekiParseError'
  }
}

// Ruby: Wareki::InvalidDate < ArgumentError。和暦としては認識できたが日付として
// 不成立 (存在しない月日など) な場合に限って投げる。WarekiParseError のサブクラスに
// することで既存の `catch (WarekiParseError)` はそのまま働きつつ、parseToDate だけは
// これを個別に見分けてフォールバックさせない。
export class WarekiInvalidDateError extends WarekiParseError {
  constructor(message?: string) {
    super(message)
    this.name = 'WarekiInvalidDateError'
  }
}

export class UnsupportedDateRangeError extends Error {
  constructor(message?: string) {
    super(message)
    this.name = 'UnsupportedDateRangeError'
  }
}
