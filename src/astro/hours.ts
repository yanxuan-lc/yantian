/**
 * Sunrise, sunset and Chaldean planetary hours. Daytime (sunrise to sunset) and night
 * (sunset to the next sunrise) are each divided into twelve equal seasonal hours. The
 * planetary day starts at sunrise, so the hours before dawn belong to the previous day;
 * its first daytime hour is ruled by the weekday ruler and each hour after it advances
 * one step in the Chaldean order.
 */
import { type CivilTime, civil, formatMinute, formatSecond, partsOf } from '../bazi/civil-time.ts'
import { sunCrossing, timeOf } from './ephemeris.ts'
import type { PlanetaryHour, PlanetName } from './schema.ts'
import { CHALDEAN, WEEKDAY_RULER } from './zodiac.ts'

const DAY_US = 86_400_000_000
const HOUR_US = 3_600_000_000

/** Sunrise and sunset of one civil date as local civil times. */
interface Day {
  readonly sunrise: CivilTime
  readonly sunset: CivilTime
}

const BENEFIC: ReadonlySet<PlanetName> = new Set(['木星', '金星'])
const MALEFIC: ReadonlySet<PlanetName> = new Set(['土星', '火星'])

/**
 * First sunrise after the local `midnight` and the first sunset after that sunrise, which may
 * fall after the next midnight at high latitudes; `null` in polar day or night.
 */
function dayOf(
  midnight: CivilTime,
  latitude: number,
  longitude: number,
  offset: number,
): Day | null {
  const start = timeOf(midnight / 1000 - offset * 3_600_000)
  const rise = sunCrossing(start, latitude, longitude, 1)
  if (rise === null) return null
  const set = sunCrossing(rise, latitude, longitude, -1)
  if (set === null) return null
  const local = (ms: number) => Math.round(ms * 1000 + offset * HOUR_US)
  return { sunrise: local(rise.date.getTime()), sunset: local(set.date.getTime()) }
}

/** Local midnight of the civil date containing `t`. */
function midnightOf(t: CivilTime): CivilTime {
  const p = partsOf(t)
  return civil(p.year, p.month, p.day)
}

/**
 * Sunrise and sunset of the civil date `YYYY-MM-DD` at the place, as local
 * `YYYY-MM-DD HH:MM:SS` in a zone `utcOffset` hours east of UTC: the first sunrise after local
 * midnight and the first sunset after it, possibly on the next date. Returns `null` when the
 * Sun does not rise within that day or does not set within a day after rising.
 */
export function riseSet(
  date: string,
  latitude: number,
  longitude: number,
  utcOffset: number,
): { sunrise: string; sunset: string } | null {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const day = dayOf(civil(y, m, d), latitude, longitude, utcOffset)
  return day === null
    ? null
    : { sunrise: formatSecond(day.sunrise), sunset: formatSecond(day.sunset) }
}

const minutes = (us: number) => Math.round(us / 600_000) / 100

/**
 * Planetary hour containing the local civil time `at`, or `null` when a sunrise or sunset
 * the hour depends on does not occur (polar day or night). `nextSunrise` and the night hour
 * length are `null` only when the following sunrise is missing during a daytime hour.
 * Hour boundaries are formatted to the minute, truncated.
 */
export function planetaryHour(
  at: CivilTime,
  latitude: number,
  longitude: number,
  utcOffset: number,
): PlanetaryHour | null {
  const midnight = midnightOf(at)
  const today = dayOf(midnight, latitude, longitude, utcOffset)
  if (today === null) return null
  const neighbour = (days: number) =>
    dayOf(midnight + days * DAY_US, latitude, longitude, utcOffset)

  let dayStart: CivilTime
  let day: Day
  let next: Day | null
  if (at < today.sunrise) {
    const prev = neighbour(-1)
    if (prev === null) return null
    dayStart = midnight - DAY_US
    day = prev
    next = today
  } else {
    dayStart = midnight
    day = today
    next = neighbour(1)
    if (next === null && at >= today.sunset) return null
  }

  const night = at >= day.sunset
  const segStart = night ? day.sunset : day.sunrise
  const segEnd = night ? next!.sunrise : day.sunset
  const length = (segEnd - segStart) / 12
  const index = Math.min(Math.floor((at - segStart) / length), 11)
  const dayRuler = WEEKDAY_RULER[new Date(dayStart / 1000).getUTCDay()]!
  const hourRuler = CHALDEAN[(CHALDEAN.indexOf(dayRuler) + index + (night ? 12 : 0)) % 7]!
  const start = segStart + Math.round(length * index)
  return {
    date: formatMinute(dayStart).slice(0, 10),
    dayRuler,
    hourRuler,
    period: night ? '夜' : '昼',
    index: index + 1,
    quality: BENEFIC.has(hourRuler) ? '吉时' : MALEFIC.has(hourRuler) ? '凶时' : '平',
    start: formatMinute(start),
    end: formatMinute(start + Math.round(length)),
    sunrise: formatMinute(day.sunrise),
    sunset: formatMinute(day.sunset),
    nextSunrise: next === null ? null : formatMinute(next.sunrise),
    dayHourMinutes: minutes((day.sunset - day.sunrise) / 12),
    nightHourMinutes: next === null ? null : minutes((next.sunrise - day.sunset) / 12),
  }
}
