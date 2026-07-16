// esnext.temporal lib 有効時の型検証。tsc -p test/types/tsconfig.with-lib.json で実行。
// 検証点: (1) native Temporal 型がそのまま入力に渡せる
//         (2) toPlainDate() の戻り値が本物の Temporal.PlainDate に昇格する
import { format, toWarekiDate, WarekiDate } from '../../dist/index.js'
import type { TemporalDateLike, TemporalPlainDate } from '../../dist/index.js'

declare const nativePd: Temporal.PlainDate
declare const nativeDt: Temporal.PlainDateTime
declare const nativeZdt: Temporal.ZonedDateTime

WarekiDate.fromTemporal(nativePd)
WarekiDate.fromTemporal(nativeDt)
WarekiDate.fromTemporal(nativeZdt)
toWarekiDate(nativePd)
format(nativeZdt, '%JF')

const promoted: Temporal.PlainDate = new WarekiDate('令和', 1, 5, 4).toPlainDate()
const aliased: TemporalPlainDate = nativePd
const back: Temporal.PlainDate = aliased
const like: TemporalDateLike = nativePd
void [promoted, back, like]
