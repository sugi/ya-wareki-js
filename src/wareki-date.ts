import { GREGORIAN_START_YEAR, IMPERIAL_START_YEAR, WESTERN_ERA_NAMES } from './constants.js'
import { UnsupportedDateRangeError, WarekiInvalidDateError } from './errors.js'
import { findEraByJd } from './era-lookup.js'
import { formatWareki } from './format.js'
import { gregorianToJd, italyToJd, jdToGregorian, jdToJulian } from './jd.js'
import { parseFields } from './parse.js'
import {
  getTemporalNamespace,
  isTemporalDateLike,
  type TemporalDateLike,
  type TemporalPlainDate,
  temporalToIsoParts,
} from './temporal.js'
import { eraYearToCivil, findDateParts, lastDayOfEraMonth } from './utils.js'
import {
  yearDataIndex,
  yearLeapMonth,
  yearMonthDays,
  yearMonthStart,
} from './year-data.js'

/**
 * 和暦 (元号・旧暦) の1日付を表す immutable なクラス。
 *
 * TypeScript の `readonly` に加え、コンストラクタで `Object.freeze` されるため実行時も
 * 不変。日付を変えるには {@link WarekiDate.with | with} / {@link WarekiDate.addDays | addDays}
 * などで新しいインスタンスを作る。内部変換はすべてユリウス日 (JD) を経由する。
 *
 * @example
 * const d = new WarekiDate('明治', 8, 2, 1)
 * d.toDate()                    // => Date (1875-02-01)
 * d.with({ month: 3 }).format() // => '明治八年三月一日'
 */
export class WarekiDate {
  /** 元号名。元号を持たない (西暦・皇紀など) 場合は空文字列。 */
  readonly eraName: string
  /** 元号内の年 (元年 = 1)。元号を持たない場合は西暦年・皇紀年などそのままの値。 */
  readonly eraYear: number
  /** 西暦年 (先発グレゴリオ暦。紀元前は 0 以下)。内部変換の基準となる年。 */
  readonly year: number
  /** 月 (1〜12)。 */
  readonly month: number
  /** 日 (1 以上)。 */
  readonly day: number
  /** この月が閏月かどうか。 */
  readonly isLeapMonth: boolean
  #jd: number | undefined

  /**
   * @param eraName 元号名 (`null` または `''` で元号なし)
   * @param eraYear 元号内の年 (元年 = 1)。元号なしのときは西暦年・皇紀年
   * @param month 月 (1〜12、既定 1)
   * @param day 日 (1 以上、既定 1)
   * @param isLeapMonth 閏月なら `true` (既定 `false`)
   * @throws {RangeError} eraYear が安全な整数でない、または元号・皇紀で 1 未満のとき
   * @throws {WarekiInvalidDateError} 月・日・閏月がその年で成立しないとき
   */
  constructor(eraName: string | null, eraYear: number, month = 1, day = 1, isLeapMonth = false) {
    this.eraName = eraName ?? ''
    this.eraYear = eraYear
    this.month = month
    this.day = day
    this.isLeapMonth = isLeapMonth
    this.#validateEraYear()
    this.year = eraYearToCivil(this.eraName, eraYear)
    this.#validate()
    // プライベートフィールド #jd はプロパティ記述子を持たないため freeze の影響を受けず、
    // freeze 後も内部から代入可能。jd getter のキャッシュ書き込みと fromJd の #jd 設定が機能する。
    Object.freeze(this)
  }

  /**
   * 和暦文字列をパースする。トップレベルの {@link parse} と同じ実体。
   * @throws {WarekiParseError} 和暦日付として解釈できないとき
   * @throws {WarekiInvalidDateError} 和暦としては認識できたが日付として成立しないとき
   */
  static parse(str: string): WarekiDate {
    const f = parseFields(str)
    return new WarekiDate(f.era, f.year, f.month, f.day, f.isLeap)
  }

  /**
   * ユリウス日から {@link WarekiDate} を作る。逆変換では北朝の元号を優先する
   * (南北朝合一後は明徳)。
   * @throws {UnsupportedDateRangeError} 対応する元号が無い (サポート範囲外) とき
   */
  static fromJd(jd: number): WarekiDate {
    const era = findEraByJd(jd)
    if (!era) throw new UnsupportedDateRangeError(`Cannot find era for jd ${jd}`)
    const p = findDateParts(jd)
    const d = new WarekiDate(era.name, p.year - era.year + 1, p.month, p.day, p.isLeapMonth)
    d.#jd = jd
    return d
  }

  /**
   * Temporal オブジェクト (`PlainDate` / `PlainDateTime` / `ZonedDateTime`) から
   * {@link WarekiDate} を作る。非 ISO カレンダー (japanese 等) の値は
   * `withCalendar('iso8601')` で ISO の年月日に揃えてから変換する。構造的に判定するため
   * polyfill のインスタンスも受け付ける (グローバル `Temporal` は不要)。
   * `ZonedDateTime` はそのタイムゾーンのウォールクロック年月日を使う。
   * @throws {TypeError} Temporal の日付型と解釈できない値のとき
   * @throws {UnsupportedDateRangeError} サポート範囲外の日付のとき
   */
  static fromTemporal(temporal: TemporalDateLike): WarekiDate {
    if (!isTemporalDateLike(temporal))
      throw new TypeError(
        'WarekiDate.fromTemporal() expects a Temporal PlainDate / PlainDateTime / ZonedDateTime',
      )
    const { year, month, day } = temporalToIsoParts(temporal)
    return WarekiDate.fromJd(gregorianToJd(year, month, day))
  }

  /**
   * `Date` から {@link WarekiDate} を作る。既定はローカルタイムゾーンの年月日、
   * `{ utc: true }` を渡すと UTC の年月日を使う。
   * @throws {RangeError} 無効な Date (Invalid Date) を渡したとき
   */
  static fromDate(date: Date, opts: { utc?: boolean } = {}): WarekiDate {
    if (Number.isNaN(date.getTime()))
      throw new RangeError('WarekiDate.fromDate() received an invalid Date')
    const [y, m, d] = opts.utc
      ? [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()]
      : [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    return WarekiDate.fromJd(gregorianToJd(y, m, d))
  }

  /** 現在日 (ローカル) の {@link WarekiDate}。 */
  static today(): WarekiDate {
    return WarekiDate.fromDate(new Date())
  }

  /** 皇紀 (神武天皇即位紀元) 年から {@link WarekiDate} を作る。 */
  static imperial(year: number, month = 1, day = 1, isLeapMonth = false): WarekiDate {
    return new WarekiDate('皇紀', year, month, day, isLeapMonth)
  }

  /** 皇紀 (神武天皇即位紀元) 年。 */
  get imperialYear(): number {
    return this.year - IMPERIAL_START_YEAR
  }

  /** この年月 (閏月を含む) の末日。 */
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

  // 元号・皇紀は元年(=1)起点なので正の整数のみ。西暦・紀元前 (WESTERN_ERA_NAMES) は
  // civil year 0 や負数が先発グレゴリオ暦上の正当な値になり得るため下限を課さない。
  // いずれの暦でも安全な整数でなければ jd が NaN・小数になりクラスの前提が崩れる。
  #validateEraYear(): void {
    if (!Number.isSafeInteger(this.eraYear))
      throw new RangeError(`invalid eraYear (must be a safe integer): ${this.eraYear}`)
    if (!WESTERN_ERA_NAMES.includes(this.eraName) && this.eraYear <= 0)
      throw new RangeError(`invalid eraYear (must be >= 1 for era '${this.eraName}'): ${this.eraYear}`)
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

  /** デバッグ用の文字列表現 (例: `WarekiDate(令和1-1-1)`)。 */
  inspect(): string {
    return `WarekiDate(${this.eraName}${this.eraYear}-${this.isLeapMonth ? '閏' : ''}${this.month}-${this.day})`
  }

  /**
   * この日付のユリウス日。初回アクセス時に計算してキャッシュする。
   * @throws {UnsupportedDateRangeError} 旧暦テーブルに存在しない年のとき
   */
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

  /** 先発グレゴリオ暦の年月日。JS の `Date` と同じ暦なので `Date` と整合する。 */
  toGregorianParts(): { year: number; month: number; day: number } {
    return jdToGregorian(this.jd)
  }

  /** ユリウス暦の年月日。Ruby 版 `Date` の年月日表記と一致する。 */
  toJulianParts(): { year: number; month: number; day: number } {
    return jdToJulian(this.jd)
  }

  /** ローカルタイムゾーンの深夜 (00:00:00) を指す `Date`。 */
  toDate(): Date {
    const { year, month, day } = this.toGregorianParts()
    const d = new Date(0)
    // new Date(y, ...) は 0〜99 年を 1900 年代に解釈するため setFullYear を使う
    d.setFullYear(year, month - 1, day)
    d.setHours(0, 0, 0, 0)
    return d
  }

  /**
   * ISO カレンダーの `Temporal.PlainDate` へ変換する。実行環境のグローバル `Temporal` を
   * 使うため、未搭載ランタイム (Node 18〜24 など) ではエラーになる。polyfill 利用時は
   * `Temporal.PlainDate.from(d.toGregorianParts())` を使うか、polyfill をグローバル登録
   * すること。
   * @throws {Error} グローバル `Temporal` が存在しないとき
   */
  toPlainDate(): TemporalPlainDate {
    const ns = getTemporalNamespace()
    const { year, month, day } = this.toGregorianParts()
    return new ns.PlainDate(year, month, day) as TemporalPlainDate
  }

  /** 元号・年・月・日・閏月がすべて一致するか (暦表現としての同一性)。 */
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

  /** 同じ日 (同一 JD) を指すか。異なる暦表現でも JD が一致すれば `true`。 */
  isSameDay(other: WarekiDate): boolean {
    return other.jd === this.jd
  }

  /** `n` 日後の {@link WarekiDate} を返す (新しいインスタンス)。 */
  addDays(n: number): WarekiDate {
    return WarekiDate.fromJd(this.jd + n)
  }

  /** `n` 日前の {@link WarekiDate} を返す (新しいインスタンス)。 */
  subDays(n: number): WarekiDate {
    return WarekiDate.fromJd(this.jd - n)
  }

  /**
   * 一部フィールドだけを差し替えた新しい {@link WarekiDate} を返す (immutable なので
   * 自身は変化しない)。
   * @example d.with({ month: 3 })
   */
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

  /**
   * フォーマット文字列に従って文字列化する (既定 `'%JF'`、例: `令和元年五月四日`)。
   * 使用できる `%J` 系コードは README「フォーマット文字列一覧」を参照。`WarekiDate` は
   * 時刻を持たないため `%JT` 系コードはリテラルのまま残る。
   */
  format(fmt = '%JF'): string {
    return formatWareki(this, fmt)
  }

  /** 和暦年の漢数字。テンプレートリテラル向け (`%JGk`)。 */
  get eraYearKanji(): string {
    return formatWareki(this, '%JGk')
  }

  /** 和暦年の漢数字 (「元」の特殊記法対応、`%JGK`)。 */
  get eraYearKanjiSpecial(): string {
    return formatWareki(this, '%JGK')
  }

  /**
   * 旧暦年の漢数字 (`%JOk`)。
   * @throws {RangeError} 対象の年が紀元前 (負の西暦年) のとき (ya-kansuji の制約)
   */
  get yearKanji(): string {
    return formatWareki(this, '%JOk')
  }

  /** 和暦月の漢数字 (`%JSk`)。 */
  get monthKanji(): string {
    return formatWareki(this, '%JSk')
  }

  /** 和暦月の別名 (睦月・如月・弥生…、`%JSK`)。 */
  get monthAltName(): string {
    return formatWareki(this, '%JSK')
  }

  /** 和暦日の漢数字 (`%JDk`)。 */
  get dayKanji(): string {
    return formatWareki(this, '%JDk')
  }

  /** 閏月なら `'閏'`、そうでなければ空文字列 (`%JLk`)。 */
  get leapMonthMark(): string {
    return formatWareki(this, '%JLk')
  }
}
