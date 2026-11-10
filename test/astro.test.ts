import { readFileSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { castAstro } from '../src/astro/chart.ts'
import { riseSet } from '../src/astro/hours.ts'
import { type AstroChart, AstroChartSchema } from '../src/astro/schema.ts'

/** Output of the reference `astro.py` and `hours.py`, recorded by `scripts/golden_astro.py`. */
interface GoldenCase {
  readonly name: string
  readonly time: string
  readonly latitude: number
  readonly longitude: number
  readonly utcOffset: number
  // biome-ignore lint/suspicious/noExplicitAny: reference JSON is checked field by field below
  readonly chart: any
  // biome-ignore lint/suspicious/noExplicitAny: reference JSON is checked field by field below
  readonly hours: any
}
const golden = JSON.parse(
  readFileSync(new URL('./fixtures/astro-golden.json', import.meta.url), 'utf8'),
) as { cases: GoldenCase[] }

/** Agreement required with the reference (Swiss Ephemeris, Moshier). */
const TOL = {
  /** Planet longitude, degrees. */
  planet: 0.05,
  /** Ascendant and midheaven longitude, degrees. */
  angle: 0.1,
  /** Part of Fortune: ascendant plus two luminaries, degrees. */
  fortune: 0.2,
  /** Sunrise, sunset and hour boundaries, minutes. */
  minutes: 2,
  /** Speeds this close to zero make the retrograde flag a station, degrees per day. */
  station: 0.005,
  /** Sun altitudes this close to the horizon make the sect a boundary, degrees. */
  horizon: 0.05,
}

/**
 * Quantities that sit within tolerance of a boundary, keyed `case:quantity[:subject]`.
 * Each is asserted against the tolerance instead of exact equality, and the test fails
 * when the detected set differs from this list.
 */
const BOUNDARY_CASES: readonly string[] = [
  // Planets within 0.005°/day of a station.
  'week-fri:retrograde:土星',
  'week-sat:retrograde:土星',
  'week-sun:retrograde:土星',
  'y1950-new-year:retrograde:土星',
  'y1990-birth:retrograde:土星',
  'y2020-mars-rx:retrograde:水星',
  'y2024-mercury-station:retrograde:水星',
  'y2026-sample:retrograde:土星',
  'y2030-equinox:retrograde:土星',
  'y2050-high-north:retrograde:木星',
  // The Sun within 0.05° of a cusp (solstice and equinox moments).
  'y2012-solstice:sign:太阳',
  'y2030-equinox:sign:太阳',
  // Pairs whose separation lies within 0.1° of an orb limit.
  'anchor-j2000:aspect:水星-火星',
  'north60-midsummer-night:aspect:月亮-木星',
  'north60-midsummer-night:aspect:月亮-水星',
  'south-predawn:aspect:火星-金星',
  'week-tue:aspect:月亮-火星',
  'y1984-spring:aspect:木星-水星',
  'y1990-birth:aspect:太阳-火星',
  'y2008-olympics:aspect:土星-月亮',
  'y2024-mercury-rx:aspect:月亮-火星',
  // Moments within two minutes of sunrise or sunset.
  'edge-at-sunrise:period',
  'y2030-equinox:period',
  // Moments within three minutes of a planetary-hour boundary.
  'north60-midsummer-noon:hour',
  'south-sunrise:hour',
  'y1955-summer:hour',
  'y2008-olympics:hour',
  'y2040-south-winter:hour',
]

/** Boundary quantities checked against tolerance, and how many still matched exactly. */
const boundary = { checked: 0, agreed: 0, differ: [] as string[] }
const tally = (key: string, agrees: boolean) => {
  boundary.checked++
  if (agrees) boundary.agreed++
  else boundary.differ.push(key)
}

const max = {
  planet: 0,
  ascendant: 0,
  midheaven: 0,
  fortune: 0,
  sunrise: 0,
  sunset: 0,
  hourStart: 0,
}
afterAll(() => {
  console.log(
    `max |TS - reference|: planet ${max.planet.toFixed(4)}°, ASC ${max.ascendant.toFixed(4)}°, MC ${max.midheaven.toFixed(4)}°, Fortune ${max.fortune.toFixed(4)}°, sunrise ${max.sunrise.toFixed(2)} min, sunset ${max.sunset.toFixed(2)} min, hour start ${max.hourStart.toFixed(2)} min (reference times truncated to the minute); boundary quantities matching exactly ${boundary.agreed}/${boundary.checked}, differing: ${boundary.differ.join(', ') || 'none'}`,
  )
})

/** Smallest absolute difference of two longitudes, degrees. */
const arc = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}
/** Whether a longitude lies within `tol` of a sign cusp. */
const nearCusp = (lon: number, tol: number) => {
  const r = ((lon % 30) + 30) % 30
  return r <= tol || 30 - r <= tol
}
/** Minutes since 1970 of a `YYYY-MM-DD HH:MM[:SS]` wall-clock string. */
const wall = (s: string) =>
  Date.UTC(
    +s.slice(0, 4),
    +s.slice(5, 7) - 1,
    +s.slice(8, 10),
    +s.slice(11, 13),
    +s.slice(14, 16),
  ) /
    60_000 +
  (s.length > 16 ? +s.slice(17, 19) / 60 : 0)
/** Signed minutes from a reference `HH:MM` (truncated) to ours, on the nearest day. */
const clockError = (ours: string, ref: string) => {
  let d = wall(`2000-01-01 ${ours.slice(11)}`) - wall(`2000-01-01 ${ref}`)
  if (d > 720) d -= 1440
  if (d < -720) d += 1440
  return d
}
const ASPECTS = [
  [0, 8],
  [60, 4],
  [90, 7],
  [120, 8],
  [180, 8],
] as const

function cast(c: GoldenCase): AstroChart {
  return castAstro({
    time: c.time,
    latitude: c.latitude,
    longitude: c.longitude,
    utcOffset: c.utcOffset,
  })
}

/** Boundary keys of one case derived from our chart; see {@link BOUNDARY_CASES}. */
function boundaries(c: GoldenCase, chart: AstroChart): string[] {
  const out: string[] = []
  if (nearCusp(chart.ascendant.longitude, TOL.angle)) out.push(`${c.name}:ascendant`)
  if (nearCusp(chart.midheaven.longitude, TOL.angle)) out.push(`${c.name}:midheaven`)
  if (Math.abs(chart.sunAltitude) <= TOL.horizon) out.push(`${c.name}:sect`)
  if (nearCusp(chart.fortune.longitude, TOL.fortune)) out.push(`${c.name}:fortune`)
  for (const p of chart.planets) {
    if (nearCusp(p.longitude, TOL.planet)) out.push(`${c.name}:sign:${p.name}`)
    if (Math.abs(p.speed) <= TOL.station) out.push(`${c.name}:retrograde:${p.name}`)
  }
  for (let i = 0; i < chart.planets.length; i++) {
    for (let j = i + 1; j < chart.planets.length; j++) {
      const a = chart.planets[i]!
      const b = chart.planets[j]!
      const sep = arc(a.longitude, b.longitude)
      if (ASPECTS.some(([angle, orb]) => Math.abs(Math.abs(sep - angle) - orb) <= 2 * TOL.planet)) {
        out.push(`${c.name}:aspect:${[a.name, b.name].sort().join('-')}`)
      }
    }
  }
  const h = chart.planetaryHour
  if (h !== null) {
    const at = wall(c.time)
    const edges = [h.sunrise, h.sunset, h.nextSunrise ?? h.sunset].map(wall)
    if (edges.some((e) => Math.abs(at - e) <= TOL.minutes)) out.push(`${c.name}:period`)
    else if ([h.start, h.end].some((e) => Math.abs(at - wall(e)) <= TOL.minutes + 1)) {
      out.push(`${c.name}:hour`)
    }
  }
  return out
}

describe('astro chart matches the reference implementation', () => {
  it('covers at least 40 moments and places', () => {
    expect(golden.cases.length).toBeGreaterThanOrEqual(40)
  })

  it('lists exactly the cases within tolerance of a boundary', () => {
    const detected = golden.cases.flatMap((c) => boundaries(c, cast(c)))
    expect(detected.sort()).toEqual([...BOUNDARY_CASES].sort())
  })

  for (const c of golden.cases) {
    it(c.name, () => {
      const chart = cast(c)
      expect(AstroChartSchema.parse(chart)).toEqual(chart)
      const skip = new Set(boundaries(c, chart).map((k) => k.slice(c.name.length + 1)))
      const ref = c.chart

      expect(chart.input).toMatchObject({
        time: c.time,
        utcOffset: c.utcOffset,
        latitude: c.latitude,
        longitude: c.longitude,
      })

      const asc = arc(chart.ascendant.longitude, ref.上升.黄经)
      const mc = arc(chart.midheaven.longitude, ref.中天.黄经)
      max.ascendant = Math.max(max.ascendant, asc)
      max.midheaven = Math.max(max.midheaven, mc)
      expect(asc, 'ascendant').toBeLessThanOrEqual(TOL.angle)
      expect(mc, 'midheaven').toBeLessThanOrEqual(TOL.angle)
      if (!skip.has('ascendant')) expect(chart.ascendant.sign).toBe(ref.上升.星座)
      if (!skip.has('midheaven')) expect(chart.midheaven.sign).toBe(ref.中天.星座)

      expect(chart.planets.map((p) => p.name).sort()).toEqual(Object.keys(ref.行星).sort())
      for (const p of chart.planets) {
        const r = ref.行星[p.name]
        const err = arc(p.longitude, r.黄经)
        max.planet = Math.max(max.planet, err)
        expect(err, `${p.name} longitude`).toBeLessThanOrEqual(TOL.planet)
        if (!skip.has(`sign:${p.name}`)) expect(p.sign, `${p.name} sign`).toBe(r.星座)
        if (!skip.has(`sign:${p.name}`) && !skip.has('ascendant')) {
          expect(p.house, `${p.name} house`).toBe(r.宫)
        }
        if (!skip.has(`retrograde:${p.name}`)) {
          expect(p.retrograde, `${p.name} retrograde`).toBe(r.逆行)
        } else {
          expect(Math.abs(p.speed)).toBeLessThanOrEqual(TOL.station)
          tally(`${c.name}:retrograde:${p.name}`, p.retrograde === r.逆行)
        }
        if (skip.has(`sign:${p.name}`)) tally(`${c.name}:sign:${p.name}`, p.sign === r.星座)
      }

      if (!skip.has('sect')) expect(chart.sect).toBe(ref.昼夜)
      else {
        expect(Math.abs(chart.sunAltitude)).toBeLessThanOrEqual(TOL.horizon)
        tally(`${c.name}:sect`, chart.sect === ref.昼夜)
      }
      if (!skip.has('sect')) {
        const err = arc(chart.fortune.longitude, ref.福点.黄经)
        max.fortune = Math.max(max.fortune, err)
        expect(err, 'fortune').toBeLessThanOrEqual(TOL.fortune)
        if (!skip.has('fortune')) expect(chart.fortune.sign).toBe(ref.福点.星座)
        if (!skip.has('fortune') && !skip.has('ascendant')) {
          expect(chart.fortune.house).toBe(ref.福点.宫)
        }
      }

      const key = (a: string, b: string) => [a, b].sort().join('-')
      const ours = new Map(chart.aspects.map((a) => [key(a.a, a.b), a]))
      const theirs = new Map<string, { 相位: string; 精确度: number }>(
        // biome-ignore lint/suspicious/noExplicitAny: reference JSON row
        ref.相位.map((a: any) => [key(a.星A, a.星B), a]),
      )
      const nearLimit = [...skip].filter((k) => k.startsWith('aspect:')).map((k) => k.slice(7))
      for (const pair of new Set([...ours.keys(), ...theirs.keys(), ...nearLimit])) {
        if (skip.has(`aspect:${pair}`)) {
          // Near an orb limit the aspect may differ; the separations must still agree.
          const [x, y] = pair.split('-') as [string, string]
          const sepOurs = arc(
            chart.planets.find((p) => p.name === x)!.longitude,
            chart.planets.find((p) => p.name === y)!.longitude,
          )
          const sepRef = arc(ref.行星[x].黄经, ref.行星[y].黄经)
          expect(Math.abs(sepOurs - sepRef)).toBeLessThanOrEqual(2 * TOL.planet)
          tally(`${c.name}:aspect:${pair}`, ours.get(pair)?.type === theirs.get(pair)?.相位)
          continue
        }
        expect(ours.get(pair)?.type, `aspect ${pair}`).toBe(theirs.get(pair)?.相位)
        const r = theirs.get(pair)
        if (r !== undefined) {
          expect(Math.abs(ours.get(pair)!.orb - r.精确度)).toBeLessThanOrEqual(
            2 * TOL.planet + 0.01,
          )
        }
      }
    })
  }
})

describe('planetary hours match the reference implementation', () => {
  for (const c of golden.cases) {
    it(c.name, () => {
      const ref = c.hours
      const day = riseSet(c.time.slice(0, 10), c.latitude, c.longitude, c.utcOffset)
      if (ref.日出 === null) {
        expect(day).toBeNull()
        expect(cast(c).planetaryHour).toBeNull()
        return
      }
      expect(day).not.toBeNull()
      // The reference prints minutes truncated from the exact instant.
      for (const [ours, theirs, which] of [
        [day!.sunrise, ref.日出, 'sunrise'],
        [day!.sunset, ref.日落, 'sunset'],
      ] as const) {
        const d = wall(ours) - wall(theirs)
        max[which] = Math.max(max[which], Math.abs(d - 0.5))
        expect(d, which).toBeGreaterThanOrEqual(-TOL.minutes)
        expect(d, which).toBeLessThanOrEqual(TOL.minutes + 1)
      }

      const chart = cast(c)
      const h = chart.planetaryHour
      const r = ref.行星时
      expect(h).not.toBeNull()
      const skip = new Set(boundaries(c, chart).map((k) => k.slice(c.name.length + 1)))
      if (!skip.has('period')) {
        expect(h!.period).toBe(r.昼夜)
        expect(h!.dayRuler).toBe(r.行星日主)
      }
      if (skip.has('period') || skip.has('hour')) {
        // Near a boundary the hour may differ; the reference must see the same boundary.
        const at = wall(c.time)
        const edges = [
          ref.日出,
          ref.日落,
          `${c.time.slice(0, 10)} ${r.起}`,
          `${c.time.slice(0, 10)} ${r.止}`,
        ]
        expect(Math.min(...edges.map((e) => Math.abs(at - wall(e))))).toBeLessThanOrEqual(
          TOL.minutes + 1,
        )
        tally(
          `${c.name}:hour`,
          h!.period === r.昼夜 && h!.index === r.序 && h!.hourRuler === r.主星,
        )
      }
      if (!skip.has('period') && !skip.has('hour')) {
        expect(h!.index).toBe(r.序)
        expect(h!.hourRuler).toBe(r.主星)
        expect(h!.quality).toBe(r.吉凶)
        for (const [ours, theirs] of [
          [h!.start, r.起],
          [h!.end, r.止],
        ] as const) {
          const d = clockError(ours, theirs)
          max.hourStart = Math.max(max.hourStart, Math.abs(d))
          expect(d).toBeGreaterThanOrEqual(-TOL.minutes - 1)
          expect(d).toBeLessThanOrEqual(TOL.minutes + 1)
        }
      }
    })
  }
})

describe('planetary hours when sunset falls after local midnight', () => {
  // At 65.5° N, 30° W in UTC+0 near midsummer the Sun sets about 01:14 the next morning.
  const chart = castAstro({
    time: '2024-06-21 12:00',
    latitude: 65.5,
    longitude: -30,
    utcOffset: 0,
  })

  it('reads the day from sunrise to the sunset that follows it', () => {
    const h = chart.planetaryHour!
    expect(chart.sect).toBe('昼')
    expect(h.period).toBe('昼')
    expect(h.sunrise).toBe('2024-06-21 02:49')
    expect(h.sunset).toBe('2024-06-22 01:14')
    expect(h.dayHourMinutes).toBeGreaterThan(0)
    expect(h.dayHourMinutes).toBeCloseTo(112.1, 0)
  })

  it('rules the fifth daytime hour of a Friday by Jupiter', () => {
    const h = chart.planetaryHour!
    expect(h.dayRuler).toBe('金星')
    expect(h.index).toBe(5)
    expect(h.hourRuler).toBe('木星')
  })

  it('reports the same sunrise and following sunset for the civil date', () => {
    expect(riseSet('2024-06-21', 65.5, -30, 0)).toEqual({
      sunrise: '2024-06-21 02:49:12',
      sunset: '2024-06-22 01:14:25',
    })
  })
})
