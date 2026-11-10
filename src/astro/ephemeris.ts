/**
 * Geocentric positions and chart angles from astronomy-engine. Longitudes are apparent
 * (light-time and aberration corrected) on the true ecliptic and equinox of date; the
 * library's planetary theory agrees with Swiss Ephemeris to about an arcminute.
 */
import {
  type AstroTime,
  Body,
  Ecliptic,
  Equator,
  e_tilt,
  GeoVector,
  Horizon,
  MakeTime,
  Observer,
  SearchAltitude,
  SiderealTime,
} from 'astronomy-engine'
import type { PlanetName } from './schema.ts'
import { normalize } from './zodiac.ts'

const BODY: Readonly<Record<PlanetName, Body>> = {
  太阳: Body.Sun,
  月亮: Body.Moon,
  水星: Body.Mercury,
  金星: Body.Venus,
  火星: Body.Mars,
  木星: Body.Jupiter,
  土星: Body.Saturn,
}

const RAD = Math.PI / 180
/** Half-width of the central difference behind longitude speeds, days. */
const SPEED_STEP = 0.01

/** Astronomy time of a UTC instant given as milliseconds since 1970. */
export function timeOf(utcMs: number): AstroTime {
  return MakeTime(new Date(utcMs))
}

/** Apparent geocentric ecliptic longitude of date, degrees in [0, 360). */
export function longitude(planet: PlanetName, time: AstroTime): number {
  return normalize(Ecliptic(GeoVector(BODY[planet], time, true)).elon)
}

/** Longitude and its rate of change in degrees per day; the rate is negative when retrograde. */
export function longitudeAndSpeed(
  planet: PlanetName,
  time: AstroTime,
): { longitude: number; speed: number } {
  const before = longitude(planet, time.AddDays(-SPEED_STEP))
  const after = longitude(planet, time.AddDays(SPEED_STEP))
  let delta = after - before
  if (delta > 180) delta -= 360
  if (delta < -180) delta += 360
  return { longitude: longitude(planet, time), speed: delta / (2 * SPEED_STEP) }
}

/**
 * Ascendant and midheaven longitudes, degrees, from apparent sidereal time and the true
 * obliquity of date at geographic `latitude` and east `longitude`.
 */
export function angles(
  time: AstroTime,
  latitude: number,
  longitudeEast: number,
): { ascendant: number; midheaven: number } {
  const ramc = normalize(SiderealTime(time) * 15 + longitudeEast) * RAD
  const eps = e_tilt(time).tobl * RAD
  const midheaven = normalize(Math.atan2(Math.sin(ramc), Math.cos(ramc) * Math.cos(eps)) / RAD)
  const ascendant = normalize(
    Math.atan2(
      Math.cos(ramc),
      -(Math.sin(ramc) * Math.cos(eps) + Math.tan(latitude * RAD) * Math.sin(eps)),
    ) / RAD,
  )
  // Inside the polar circle the formula can return the descendant; like Swiss Ephemeris,
  // keep the ascendant within the half of the ecliptic that follows the midheaven.
  const polar = Math.abs(latitude) >= 90 - eps / RAD
  const ahead = normalize(ascendant - midheaven) < 180
  return { ascendant: polar && !ahead ? normalize(ascendant + 180) : ascendant, midheaven }
}

/** True (unrefracted) altitude of the Sun's centre above the horizon, degrees. */
export function sunAltitude(time: AstroTime, latitude: number, longitudeEast: number): number {
  const observer = new Observer(latitude, longitudeEast, 0)
  const eq = Equator(Body.Sun, time, observer, true, true)
  return Horizon(time, observer, eq.ra, eq.dec).altitude
}

/**
 * Geometric altitude of the Sun's centre at the moment the reference calls sunrise or
 * sunset: the centre on the horizon after standard refraction for 0 °C at about 1007 hPa.
 */
export const RISE_SET_ALTITUDE = -0.6

/**
 * First time after `start` within one day at which the Sun's centre rises (`direction` 1)
 * or sets (`direction` −1) through {@link RISE_SET_ALTITUDE}; `null` when it does not.
 */
export function sunCrossing(
  start: AstroTime,
  latitude: number,
  longitudeEast: number,
  direction: 1 | -1,
): AstroTime | null {
  const observer = new Observer(latitude, longitudeEast, 0)
  return SearchAltitude(Body.Sun, observer, direction, start, 1, RISE_SET_ALTITUDE)
}
