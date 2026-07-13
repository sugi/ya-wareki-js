#!/usr/bin/env node
// data-locale の旧暦対照表と元号定義を JSON にダンプする。
// 再生成時のみ手元で実行する。CI では実行しない (生成物はコミット済み)。
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const KYUUREKI_MAP_URL =
  'https://raw.githubusercontent.com/manakai/data-locale/master/data/calendar/kyuureki-map.txt'
const ERA_DEFS_URL =
  'https://raw.githubusercontent.com/manakai/data-locale/master/data/calendar/era-defs.json'
const JD_MAX = Number.MAX_SAFE_INTEGER
const root = dirname(dirname(fileURLToPath(import.meta.url)))

async function readSource(url, envName) {
  if (process.env[envName]) return readFileSync(process.env[envName])

  const response = await fetch(url)
  if (!response.ok)
    throw new Error(`failed to fetch ${url}: ${response.status} ${response.statusText}`)
  return Buffer.from(await response.arrayBuffer())
}

function gregorianJd(year, month, day) {
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (month < 1 || month > 12 || day < 1 || day > monthDays[month - 1])
    throw new Error(`invalid Gregorian date: ${year}-${month}-${day}`)

  const a = Math.floor((14 - month) / 12)
  const y = year + 4800 - a
  const m = month + 12 * a - 3
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  )
}

function yearRows(source) {
  // ../wareki/build-util/gen-jp-cal-def.rb と同じ規則で、対照表の日次データを
  // 年・月単位の定義へ集約する。
  const calinfo = new Map()

  for (const line of source.toString('utf8').split(/\r?\n/)) {
    const match = line.match(
      /^(?<gy>[0-9]+)-(?<gm>[0-9]+)-(?<gd>[0-9]+)\s+(?<jy>[0-9]+)-(?<jm>[0-9]+)(?<jl>')?-(?<jd>[0-9]+)/,
    )
    if (!match) continue

    const gy = Number(match.groups.gy)
    if (gy === 1873) break
    const jd = gregorianJd(gy, Number(match.groups.gm), Number(match.groups.gd))
    const year = Number(match.groups.jy)
    const month = Number(match.groups.jm)
    const day = Number(match.groups.jd)
    const leap = match.groups.jl !== undefined
    let current = calinfo.get(year)
    if (!current) {
      current = { monthStarts: [], monthDays: [] }
      calinfo.set(year, current)
    }
    current.end = jd
    if (day === 1) {
      if (month === 1) current.start = jd
      current.monthStarts.push(jd)
      if (leap) {
        if (current.leapMonth !== undefined)
          throw new Error(
            `${year} already has leap month (${current.leapMonth} vs ${month})`,
          )
        current.leapMonth = month
      }
    }
    const index = current.monthStarts.length - 1
    if (index < 0) throw new Error(`day found before first month at JD ${jd}`)
    current.monthDays[index] = jd - current.monthStarts[index] + 1
  }

  return [...calinfo]
    .sort(([a], [b]) => a - b)
    .filter(([year]) => year >= 445)
    .map(([year, data]) => ({
      year,
      start: data.start,
      end: data.end,
      leapMonth: data.leapMonth ?? null,
      monthStarts: data.monthStarts,
      monthDays: data.monthDays,
    }))
}

function dayJd(day, label) {
  if (!day || !Number.isFinite(day.jd)) throw new Error(`missing ${label}`)
  return Math.ceil(day.jd)
}

function eraTuple(era, startDay, endDay, meijiStart) {
  if (!era.name_ja || !Number.isInteger(era.offset))
    throw new Error(`incomplete era definition: ${era.key}`)
  const modern = era.start_year >= 1868
  return [
    era.name_ja,
    era.offset + 1,
    era.key === '明治' ? meijiStart : dayJd(startDay, `${era.key} start_day`),
    endDay ? dayJd(endDay, `${era.key} end_day`) + (modern ? 0 : 1) : JD_MAX,
  ]
}

function eraRows(source, years) {
  const eras = Object.values(source.eras).filter(
    (era) => era.jp_era || era.jp_south_era || era.jp_north_era,
  )
  const kenmu = eras.find((era) => era.key === '建武')
  const meiji = years.find((year) => year.year === 1868)
  if (!kenmu || !meiji) throw new Error('missing 建武 or 明治 calendar definition')
  const splitStart = dayJd(kenmu.start_day, '建武 start_day')
  const southOnly = (era) => era.jp_south_era && !era.jp_north_era
  const northCourt = (era) =>
    era.jp_north_era && dayJd(era.north_start_day, `${era.key} north_start_day`) > splitStart

  function list(court) {
    const south = eras.filter(southOnly)
    const rest = eras.filter((era) => !southOnly(era))
    const north = rest.filter(northCourt)
    const main = rest.filter((era) => !northCourt(era))
    const mainRows = main
      .sort((a, b) => a.start_day.jd - b.start_day.jd)
      .map((era) =>
        eraTuple(era, era.start_day, era[`${court}_end_day`] ?? era.end_day, meiji.start),
      )
    const southRows = south
      .sort((a, b) => a.south_start_day.jd - b.south_start_day.jd)
      .map((era) => eraTuple(era, era.south_start_day, era.south_end_day, meiji.start))
    const northRows = north
      .sort((a, b) => a.north_start_day.jd - b.north_start_day.jd)
      .map((era) => eraTuple(era, era.north_start_day, era.north_end_day, meiji.start))
    const beforeSplit = mainRows.filter((era) => era[2] <= splitStart)
    const afterSplit = mainRows.filter((era) => era[2] > splitStart)
    const rows = [...beforeSplit, ...southRows, ...northRows, ...afterSplit]
    if (rows.length !== 248 || new Set(rows.map((era) => era[0])).size !== 248)
      throw new Error(`unexpected official era count: ${rows.length}`)
    return rows
  }

  // data-localeを正としつつ、Ruby版と共通の互換規則を適用する。
  // 明治以前は改元日を旧元号のendにも含め、明治は元年1月1日に遡及する。
  return { eraDefs: list('south'), eraNorthDefs: list('north') }
}

const [kyuurekiMap, eraDefsSource] = await Promise.all([
  readSource(KYUUREKI_MAP_URL, 'KYUUREKI_MAP'),
  readSource(ERA_DEFS_URL, 'ERA_DEFS_SOURCE'),
])
const years = yearRows(kyuurekiMap)
if (years.length !== 1428 || years[0].year !== 445 || years.at(-1).year !== 1872)
  throw new Error(
    `unexpected year range: ${years[0]?.year}..${years.at(-1)?.year} (${years.length} years)`,
  )

const { eraDefs, eraNorthDefs } = eraRows(
  JSON.parse(eraDefsSource.toString('utf8')),
  years,
)
const kyuurekiMapSha256 = createHash('sha256').update(kyuurekiMap).digest('hex')
const eraDefsSha256 = createHash('sha256').update(eraDefsSource).digest('hex')
const outDir = join(root, 'tools/data')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'year-defs.json'), JSON.stringify(years, null, 2))
writeFileSync(
  join(outDir, 'year-defs-source.json'),
  JSON.stringify({ url: KYUUREKI_MAP_URL, sha256: kyuurekiMapSha256 }, null, 2),
)
writeFileSync(
  join(outDir, 'era-defs-source.json'),
  JSON.stringify({ url: ERA_DEFS_URL, sha256: eraDefsSha256 }, null, 2),
)
writeFileSync(join(outDir, 'era-defs.json'), JSON.stringify({ eraDefs, eraNorthDefs }, null, 2))
console.log(
  `years: ${years.length}, eras: ${eraDefs.length}, north: ${eraNorthDefs.length}, ` +
    `kyuureki-map SHA-256: ${kyuurekiMapSha256}, era-defs SHA-256: ${eraDefsSha256}`,
)
