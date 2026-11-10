import { describe, expect, it } from 'vitest'
import { castAstro } from '../src/astro/chart.ts'
import type { AstroChart, PlanetName } from '../src/astro/schema.ts'
import { DOMICILE, SIGNS, signOf, wholeSignHouse } from '../src/astro/zodiac.ts'
import { moonVoidOfCourse, scoreAstro } from '../src/timing/astro.ts'

const real = castAstro({ time: '2026-11-12 10:00', city: '北京' })

/**
 * The real chart with the ascendant at 0° 白羊 and planets moved to the given longitudes and
 * speeds; unlisted planets park far from the Moon at 200° and beyond. Aspects are dropped
 * unless given, and the planetary hour ruler can be replaced.
 */
function synthetic(
  at: Partial<Record<PlanetName, readonly [number, number]>>,
  options: { hour?: PlanetName; aspects?: AstroChart['aspects']; ascendant?: number } = {},
): AstroChart {
  const asc = options.ascendant ?? 0
  const ascSign = signOf(asc).index
  const parked: Record<PlanetName, readonly [number, number]> = {
    太阳: [200, 1],
    月亮: [100, 13],
    水星: [215, 1],
    金星: [230, 1],
    火星: [245, 0.5],
    木星: [260, 0.1],
    土星: [275, 0.05],
  }
  const planets = real.planets.map((p) => {
    const [longitude, speed] = at[p.name] ?? parked[p.name]
    const { index, degree } = signOf(longitude)
    return {
      ...p,
      longitude,
      sign: SIGNS[index]!,
      degree,
      house: wholeSignHouse(index, ascSign),
      speed,
      retrograde: speed < 0,
    }
  })
  const { index, degree } = signOf(asc)
  return {
    ...real,
    ascendant: { longitude: asc, sign: SIGNS[index]!, degree },
    planets,
    houses: real.houses.map((h, i) => ({
      ...h,
      sign: SIGNS[(ascSign + i) % 12]!,
      ruler: DOMICILE[(ascSign + i) % 12]!,
    })),
    aspects: options.aspects ?? [],
    planetaryHour:
      options.hour === undefined
        ? real.planetaryHour
        : { ...real.planetaryHour!, hourRuler: options.hour },
  }
}

describe('astro scorer', () => {
  it('finds the Moon void of course when no major aspect perfects before it leaves its sign', () => {
    const lonely = synthetic({ 月亮: [29.5, 13], 太阳: [45, 1] })
    expect(moonVoidOfCourse(lonely)).toBe(true)
    // Venus 59.9° behind the Moon: the sextile perfects within minutes.
    const met = synthetic({ 月亮: [29.5, 13], 太阳: [45, 1], 金星: [329.6, 1] })
    expect(moonVoidOfCourse(met)).toBe(false)
    expect(scoreAstro('谋事', lonely).veto).toBe('月亮空亡（离座前无主要入相位）')
  })

  it('vetoes a combust Moon within 8° of the Sun', () => {
    const s = scoreAstro('求财', synthetic({ 月亮: [100, 13], 太阳: [95, 1] }))
    expect(s.veto).toBe('月亮焦伤（距日 5°）')
  })

  it('vetoes a malefic on the ascendant for illness and marriage only', () => {
    const chart = synthetic({ 火星: [11, 0.5] }, { ascendant: 10 })
    expect(scoreAstro('疾病', chart).veto).toBe('火星临上升')
    expect(scoreAstro('婚姻', chart).veto).toBe('火星临上升')
    expect(scoreAstro('求财', chart).veto).toBeUndefined()
  })

  it('prefers a planetary hour fitting the matter', () => {
    const jupiter = scoreAstro('求财', synthetic({}, { hour: '木星' }))
    const saturn = scoreAstro('求财', synthetic({}, { hour: '土星' }))
    expect(jupiter.score - saturn.score).toBeCloseTo(1.8)
    expect(jupiter.reasons).toContain('木星时（合事）')
  })

  it('counts a benefic in a matter house and a malefic there against it', () => {
    // Ascendant 白羊: the 2nd house is 金牛 (30°–60°).
    const plain = scoreAstro('求财', synthetic({})).score
    const jupiter = scoreAstro('求财', synthetic({ 木星: [40, 0.1] }))
    const saturn = scoreAstro('求财', synthetic({ 土星: [40, 0.05] }))
    expect(jupiter.score).toBeGreaterThan(plain)
    expect(jupiter.reasons).toContain('木星临2宫')
    expect(saturn.score).toBeLessThan(plain)
    expect(saturn.reasons).toContain('土星临2宫')
  })

  it('rewards a waxing Moon applying to a benefic', () => {
    const waxing = synthetic({ 月亮: [100, 13], 太阳: [10, 1] })
    const waning = synthetic({ 月亮: [100, 13], 太阳: [190, 1] })
    expect(scoreAstro('出行', waxing).score - scoreAstro('出行', waning).score).toBeCloseTo(0.6)
    const trine = synthetic(
      { 月亮: [100, 13], 太阳: [10, 1] },
      { aspects: [{ a: '月亮', b: '金星', type: '拱', angle: 120, orb: 2, applying: true }] },
    )
    expect(scoreAstro('出行', trine).score - scoreAstro('出行', waxing).score).toBeCloseTo(0.5)
  })

  it('scores a real chart without throwing and states the hour ruler', () => {
    const s = scoreAstro('考试', real)
    expect(Number.isFinite(s.score)).toBe(true)
    expect(s.reasons.some((r) => r.endsWith('时') || r.includes('时（'))).toBe(true)
  })
})
