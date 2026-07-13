import { WarekiParseError } from './errors.js'

const fdiv = (a: number, b: number): number => Math.floor(a / b)

export function gregorianToJd(y: number, m: number, d: number): number {
  const a = fdiv(14 - m, 12)
  const yy = y + 4800 - a
  const mm = m + 12 * a - 3
  return d + fdiv(153 * mm + 2, 5) + 365 * yy + fdiv(yy, 4) - fdiv(yy, 100) + fdiv(yy, 400) - 32045
}

export function jdToGregorian(jd: number): { year: number; month: number; day: number } {
  const a = jd + 32044
  const b = fdiv(4 * a + 3, 146097)
  const c = a - fdiv(146097 * b, 4)
  const d = fdiv(4 * c + 3, 1461)
  const e = c - fdiv(1461 * d, 4)
  const m = fdiv(5 * e + 2, 153)
  return {
    year: 100 * b + d - 4800 + fdiv(m, 10),
    month: m + 3 - 12 * fdiv(m, 10),
    day: e - fdiv(153 * m + 2, 5) + 1,
  }
}

export function julianToJd(y: number, m: number, d: number): number {
  const a = fdiv(14 - m, 12)
  const yy = y + 4800 - a
  const mm = m + 12 * a - 3
  return d + fdiv(153 * mm + 2, 5) + 365 * yy + fdiv(yy, 4) - 32083
}

export function jdToJulian(jd: number): { year: number; month: number; day: number } {
  const c = jd + 32082
  const d = fdiv(4 * c + 3, 1461)
  const e = c - fdiv(1461 * d, 4)
  const m = fdiv(5 * e + 2, 153)
  return {
    year: d - 4800 + fdiv(m, 10),
    month: m + 3 - 12 * fdiv(m, 10),
    day: e - fdiv(153 * m + 2, 5) + 1,
  }
}

// Ruby の Date::ITALY 相当: 1582-10-15 以降はグレゴリオ暦、1582-10-04 以前は
// ユリウス暦の年月日として解釈する。改暦で存在しない 1582-10-05〜14 は Ruby の
// Date.new が ArgumentError を上げるのに合わせ WarekiParseError を投げる。
export function italyToJd(y: number, m: number, d: number): number {
  if (y > 1582 || (y === 1582 && (m > 10 || (m === 10 && d >= 15)))) return gregorianToJd(y, m, d)
  if (y < 1582 || m < 10 || d <= 4) return julianToJd(y, m, d)
  throw new WarekiParseError(`invalid date (nonexistent in Julian-Gregorian transition): ${y}-${m}-${d}`)
}
