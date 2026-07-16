// esnext.temporal lib 無し (TS 5.x 相当の環境) の型検証。
// 検証点: (1) dist/index.d.ts が lib 無しでコンパイルできる (lib 参照を持ち込んでいない)
//         (2) fallback の構造的型でフィールドにアクセスできる
//         (3) duck-typing のオブジェクトが入力として型チェックを通る
import { WarekiDate } from '../../dist/index.js'
import type { TemporalDateLike, TemporalPlainDate } from '../../dist/index.js'

const pd: TemporalPlainDate = new WarekiDate('令和', 1, 5, 4).toPlainDate()
const y: number = pd.year
const m: number = pd.month
const d: number = pd.day
const cal: string = pd.calendarId

const duck: TemporalDateLike = {
  calendarId: 'iso8601',
  year: 2019,
  month: 5,
  day: 4,
  withCalendar() {
    return this
  },
}
WarekiDate.fromTemporal(duck)
void [y, m, d, cal]
