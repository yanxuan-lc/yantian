/**
 * Naive local date-times with microsecond resolution, independent of the host time zone.
 * A value is the number of microseconds since 1970-01-01 00:00 on the same wall clock,
 * which stays exact for years 1–2255.
 */

/** Wall-clock microseconds since 1970-01-01 00:00, with no time-zone meaning. */
export type CivilTime = number

/** Calendar fields of a civil time; `second` is truncated toward the earlier second. */
export interface CivilParts {
  readonly year: number
  readonly month: number
  readonly day: number
  readonly hour: number
  readonly minute: number
  readonly second: number
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Builds a civil time from calendar fields. */
export function civil(year: number, month: number, day: number, hour = 0, minute = 0): CivilTime {
  const ms = Date.UTC(year, month - 1, day, hour, minute)
  // Date.UTC maps years 0–99 to 1900–1999.
  const date = new Date(ms)
  if (year < 100) date.setUTCFullYear(year)
  return date.getTime() * 1000
}

/**
 * Parses `YYYY-MM-DD HH:MM`, `YYYY-MM-DD HH:MM:SS`, `YYYY-MM-DDTHH:MM` or `YYYY-MM-DD`.
 * Returns `undefined` for other shapes and for impossible dates such as 02-30.
 */
export function parseCivil(text: string): CivilTime | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(text.trim())
  if (m === null) return undefined
  const [year, month, day, hour, minute, second] = m.slice(1).map((v) => Number(v ?? 0)) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ]
  const value = civil(year, month, day, hour, minute) + second * 1_000_000
  const p = partsOf(value)
  if (p.month !== month || p.day !== day || p.hour !== hour || p.minute !== minute) return undefined
  if (second > 59) return undefined
  return value
}

/** Adds a possibly fractional number of minutes, rounded to the nearest microsecond. */
export function addMinutes(t: CivilTime, minutes: number): CivilTime {
  return t + Math.round(minutes * 60_000_000)
}

/** Splits a civil time into calendar fields. */
export function partsOf(t: CivilTime): CivilParts {
  const date = new Date(Math.floor(t / 1000))
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds(),
  }
}

/** Day of the year, 1 for 1 January. */
export function dayOfYear(t: CivilTime): number {
  const p = partsOf(t)
  return Math.round((civil(p.year, p.month, p.day) - civil(p.year, 1, 1)) / 86_400_000_000) + 1
}

/** Formats as `YYYY-MM-DD HH:MM`. */
export function formatMinute(t: CivilTime): string {
  const p = partsOf(t)
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}`
}

/** Formats as `YYYY-MM-DD HH:MM:SS`. */
export function formatSecond(t: CivilTime): string {
  return `${formatMinute(t)}:${pad(partsOf(t).second)}`
}

/**
 * Equation of time (apparent minus mean solar time) in minutes, by the NOAA approximation;
 * within about ±0.5 minutes, ranging roughly −14 to +16 over a year.
 */
export function equationOfTime(t: CivilTime): number {
  const b = (2 * Math.PI * (dayOfYear(t) - 81)) / 364
  return 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b)
}

/**
 * Converts civil clock time to true solar time: removes one hour when daylight saving
 * applied, shifts by four minutes per degree between `longitude` and the civil `meridian`,
 * then adds the equation of time when `apparent` is set.
 */
export function trueSolarTime(
  clock: CivilTime,
  longitude: number,
  dst: boolean,
  meridian: number,
  apparent: boolean,
): CivilTime {
  let t = dst ? addMinutes(clock, -60) : clock
  t = addMinutes(t, (longitude - meridian) * 4)
  return apparent ? addMinutes(t, equationOfTime(t)) : t
}
