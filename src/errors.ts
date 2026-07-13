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
