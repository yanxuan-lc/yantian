/**
 * Whole-sign chart of a moment and place: the seven traditional planets with sign, degree,
 * house and retrograde flag, ascendant and midheaven, sect by the Sun's true altitude, the
 * Part of Fortune, major aspects and the planetary hour.
 */
import { lookupCity } from '../bazi/cities.ts'
import { formatMinute, parseCivil, partsOf } from '../bazi/civil-time.ts'
import { ChartInputError } from '../errors.ts'
import { angles, longitudeAndSpeed, sunAltitude, timeOf } from './ephemeris.ts'
import { planetaryHour } from './hours.ts'
import type { Aspect, AstroChart, Planet, PlanetName } from './schema.ts'
import { ASPECTS, DOMICILE, normalize, PLANETS, SIGNS, signOf, wholeSignHouse } from './zodiac.ts'

/** Facts of the moment and place to chart. */
export interface AstroRequest {
  /** Display label; defaults to the time and place. */
  readonly label?: string
  /** Local civil clock time, `YYYY-MM-DD HH:MM`. */
  readonly time: string
  /** City resolved through the built-in table; excludes `latitude`/`longitude`. */
  readonly city?: string
  /** Geographic latitude, degrees north; given together with `longitude`. */
  readonly latitude?: number
  /** Geographic longitude, degrees east; given together with `latitude`. */
  readonly longitude?: number
  /** Hours east of UTC of the civil time; defaults to 8. */
  readonly utcOffset?: number
}

/** Place used when the request names neither a city nor coordinates. */
export const DEFAULT_CITY = '北京'
/** Civil-time offset used when the request does not give one, hours east of UTC. */
export const DEFAULT_UTC_OFFSET = 8
/** Earliest and latest chart years; astronomy-engine's ΔT model is reliable inside them. */
export const YEAR_RANGE = [1800, 2199] as const

const CONVENTIONS: AstroChart['conventions'] = {
  time: '民用钟表时按 UTC 偏移换算世界时（不用真太阳时）',
  houses: '整宫制：上升所在星座为第 1 宫，一座一宫',
  planets: '传统七政（日、月、水、金、火、木、土），不含天王、海王、冥王',
  rulers: '传统主星：火星主白羊天蝎，土星主摩羯水瓶，木星主射手双鱼',
  orbs: '合、拱、冲 8°，刑 7°，六合 4°，取最紧的一种',
  sect: '太阳中心真高度角 > 0 为昼盘；福点昼盘 上升+月−日，夜盘 上升+日−月',
  ephemeris:
    'astronomy-engine 视位置（当日真黄道与春分点），行星黄经精度约 1′；上升、中天由视恒星时与真黄赤交角算出',
}

const r2 = (x: number) => Math.round(x * 100) / 100
const r4 = (x: number) => Math.round(x * 10_000) / 10_000

/**
 * Longitude (rounded to 0.0001°), sign and degree within the sign of an ecliptic point. The
 * sign follows the rounded longitude and the degree is rounded to 0.01° but capped at 29.99°,
 * so a point just before a cusp never reads 30.00° of the earlier sign.
 */
function point(longitude: number) {
  const rounded = normalize(r4(longitude))
  const { index, degree } = signOf(rounded)
  return { longitude: rounded, sign: SIGNS[index]!, degree: Math.min(r2(degree), 29.99) }
}

/** Smallest separation of two longitudes, degrees in [0, 180]. */
function separation(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

/** Tightest major aspect within orb, or `undefined`. */
function aspectOf(sep: number) {
  let best: { type: Aspect['type']; angle: number; orb: number } | undefined
  for (const a of ASPECTS) {
    const orb = Math.abs(sep - a.angle)
    if (orb <= a.orb && (best === undefined || orb < best.orb)) best = { ...a, orb }
  }
  return best
}

/** Resolves the place: a known city, explicit coordinates, or the default city. */
function resolvePlace(request: AstroRequest) {
  const { city, latitude, longitude } = request
  const hasCoordinates = latitude !== undefined || longitude !== undefined
  if (city !== undefined && hasCoordinates) {
    throw new ChartInputError('city: give either a city or latitude/longitude, not both')
  }
  if (hasCoordinates) {
    if (latitude === undefined || longitude === undefined) {
      throw new ChartInputError('latitude/longitude: give both coordinates together')
    }
    if (!(latitude > -90 && latitude < 90)) {
      throw new ChartInputError('latitude: expected degrees north strictly between -90 and 90')
    }
    if (!(longitude >= -180 && longitude <= 180)) {
      throw new ChartInputError('longitude: expected degrees east between -180 and 180')
    }
    return { name: null, latitude, longitude }
  }
  const hit = lookupCity(city ?? DEFAULT_CITY)
  if (hit === undefined) {
    throw new ChartInputError(
      `city: unknown city "${city}"; use a common Chinese city name such as 北京 or 上海, or give latitude/longitude`,
    )
  }
  return { name: hit.name, latitude: hit.latitude, longitude: hit.longitude }
}

/** Casts the chart; rejects malformed time, offset or place with {@link ChartInputError}. */
export function castAstro(request: AstroRequest): AstroChart {
  const clock = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(request.time)
    ? parseCivil(request.time)
    : undefined
  if (clock === undefined) {
    throw new ChartInputError(`time: expected a real date and time as YYYY-MM-DD HH:MM`)
  }
  const year = partsOf(clock).year
  if (year < YEAR_RANGE[0] || year > YEAR_RANGE[1]) {
    throw new ChartInputError(`time: year must be between ${YEAR_RANGE[0]} and ${YEAR_RANGE[1]}`)
  }
  // Without an explicit offset a named city uses its standard (non-DST) civil time.
  const cityMeridian = request.city === undefined ? undefined : lookupCity(request.city)?.meridian
  const utcOffset =
    request.utcOffset ?? (cityMeridian === undefined ? DEFAULT_UTC_OFFSET : cityMeridian / 15)
  if (!(utcOffset >= -12 && utcOffset <= 14)) {
    throw new ChartInputError('utcOffset: expected hours east of UTC between -12 and 14')
  }
  const place = resolvePlace(request)
  const utMs = clock / 1000 - utcOffset * 3_600_000
  const time = timeOf(utMs)

  const { ascendant, midheaven } = angles(time, place.latitude, place.longitude)
  const ascSign = signOf(ascendant).index
  const raw = PLANETS.map((name) => ({ name, ...longitudeAndSpeed(name, time) }))
  const planets: Planet[] = raw.map((p) => ({
    name: p.name,
    ...point(p.longitude),
    house: wholeSignHouse(signOf(p.longitude).index, ascSign),
    retrograde: p.speed < 0,
    speed: r4(p.speed),
  }))

  const altitude = sunAltitude(time, place.latitude, place.longitude)
  const day = altitude > 0
  const lon = (name: PlanetName) => raw.find((p) => p.name === name)!.longitude
  const sun = lon('太阳')
  const moon = lon('月亮')
  const fortune = normalize(ascendant + (day ? moon - sun : sun - moon))

  const aspects: Aspect[] = []
  for (let i = 0; i < raw.length; i++) {
    for (let j = i + 1; j < raw.length; j++) {
      const a = raw[i]!
      const b = raw[j]!
      const found = aspectOf(separation(a.longitude, b.longitude))
      if (found === undefined) continue
      // Applying when the distance from the exact angle shrinks over the next moment.
      const step = 1e-3
      const later = Math.abs(
        separation(a.longitude + a.speed * step, b.longitude + b.speed * step) - found.angle,
      )
      aspects.push({
        a: a.name,
        b: b.name,
        type: found.type,
        angle: found.angle,
        orb: r2(found.orb),
        applying: later < found.orb,
      })
    }
  }

  const label = request.label ?? `${request.time}${place.name === null ? '' : ` ${place.name}`}`
  return {
    label,
    input: {
      time: request.time,
      utcOffset,
      city: place.name,
      latitude: place.latitude,
      longitude: place.longitude,
    },
    ut: formatMinute(utMs * 1000),
    conventions: CONVENTIONS,
    ascendant: point(ascendant),
    midheaven: point(midheaven),
    sect: day ? '昼' : '夜',
    sunAltitude: r2(altitude),
    planets,
    houses: SIGNS.map((_, h) => {
      const sign = (ascSign + h) % 12
      return { house: h + 1, sign: SIGNS[sign]!, ruler: DOMICILE[sign]! }
    }),
    fortune: { ...point(fortune), house: wholeSignHouse(signOf(fortune).index, ascSign) },
    aspects,
    planetaryHour: planetaryHour(clock, place.latitude, place.longitude, utcOffset),
  }
}
