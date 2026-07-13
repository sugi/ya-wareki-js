import { GREGORIAN_START_YEAR, IMPERIAL_START_YEAR, WESTERN_ERA_NAMES } from './constants.js'
import { UnsupportedDateRangeError, WarekiInvalidDateError } from './errors.js'
import { findEraByJd } from './era-lookup.js'
import { formatWareki } from './format.js'
import { gregorianToJd, italyToJd, jdToGregorian, jdToJulian } from './jd.js'
import { parseFields } from './parse.js'
import { eraYearToCivil, findDateParts, lastDayOfEraMonth } from './utils.js'
import {
  yearDataIndex,
  yearLeapMonth,
  yearMonthDays,
  yearMonthStart,
} from './year-data.js'

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
    // プライベートフィールド #jd はプロパティ記述子を持たないため freeze の影響を受けず、
    // freeze 後も内部から代入可能。jd getter のキャッシュ書き込みと fromJd の #jd 設定が機能する。
    Object.freeze(this)
  }

  static parse(str: string): WarekiDate {
    const f = parseFields(str)
    return new WarekiDate(f.era, f.year, f.month, f.day, f.isLeap)
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
  #monthIndex(leapMonth: number | null): number {
    if (WESTERN_ERA_NAMES.includes(this.eraName) || this.year >= GREGORIAN_START_YEAR) return this.month - 1
    let idx = this.month - 1
    if (this.isLeapMonth || (leapMonth !== null && this.month > leapMonth)) idx += 1
    return idx
  }

  // Ruby Date#_validate_date! の移植
  #validate(): void {
    if (!(Number.isInteger(this.month) && this.month >= 1 && this.month <= 12))
      throw new WarekiInvalidDateError(`invalid date (month out of range): ${this.inspect()}`)
    if (!(Number.isInteger(this.day) && this.day >= 1))
      throw new WarekiInvalidDateError(`invalid date (day out of range): ${this.inspect()}`)
    if (!WESTERN_ERA_NAMES.includes(this.eraName) && this.year < GREGORIAN_START_YEAR) {
      // 暦テーブル外の年は Ruby 同様、jd 変換時の UnsupportedDateRangeError に委ねる
      const yearIndex = yearDataIndex(this.year)
      if (yearIndex === undefined) return
      const leapMonth = yearLeapMonth(yearIndex)
      if (this.isLeapMonth && leapMonth !== this.month)
        throw new WarekiInvalidDateError(`invalid date (no leap month): ${this.inspect()}`)
      const lastDay = yearMonthDays(yearIndex, this.#monthIndex(leapMonth))
      if (lastDay === undefined || this.day > lastDay)
        throw new WarekiInvalidDateError(`invalid date (day out of range): ${this.inspect()}`)
    } else {
      if (this.isLeapMonth)
        throw new WarekiInvalidDateError(`invalid date (no leap month): ${this.inspect()}`)
      if (this.day > this.lastDayOfMonth)
        throw new WarekiInvalidDateError(`invalid date (day out of range): ${this.inspect()}`)
    }
  }

  inspect(): string {
    return `WarekiDate(${this.eraName}${this.eraYear}-${this.isLeapMonth ? '閏' : ''}${this.month}-${this.day})`
  }

  get jd(): number {
    if (this.#jd !== undefined) return this.#jd
    if (WESTERN_ERA_NAMES.includes(this.eraName))
      return (this.#jd = italyToJd(this.year, this.month, this.day))
    if (this.year >= GREGORIAN_START_YEAR)
      return (this.#jd = gregorianToJd(this.year, this.month, this.day))
    const yearIndex = yearDataIndex(this.year)
    if (yearIndex === undefined) throw new UnsupportedDateRangeError(`Cannot convert to jd ${this.inspect()}`)
    const leapMonth = yearLeapMonth(yearIndex)
    return (this.#jd = yearMonthStart(yearIndex, this.#monthIndex(leapMonth)) + this.day - 1)
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
}
