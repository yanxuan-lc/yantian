/**
 * 星盘 (electional astrology) timing score of one period, read from the whole-sign chart of
 * the period's moment: the matter's houses and natural significators, the condition of the
 * house rulers, the Moon, and the planetary hour. Pure: reads a cast {@link AstroChart}.
 */
import type { AspectType, AstroChart, Planet, PlanetName, Sign } from '../astro/schema.ts'
import { normalize, SIGNS } from '../astro/zodiac.ts'
import { type SystemScore, Tally, type TimingEvent } from './types.ts'

/** Houses and natural significators (太阳 … 土星) of each matter. */
export const ASTRO_SIGNIFICATION: Readonly<
  Record<
    TimingEvent,
    { readonly houses: readonly number[]; readonly planets: readonly PlanetName[] }
  >
> = {
  求财: { houses: [2, 8, 11], planets: ['木星', '金星'] },
  求官: { houses: [10], planets: ['太阳', '木星'] },
  婚姻: { houses: [7], planets: ['金星', '月亮'] },
  疾病: { houses: [6, 1], planets: [] },
  出行: { houses: [3, 9], planets: ['水星', '木星'] },
  诉讼: { houses: [7, 10], planets: ['火星', '木星'] },
  考试: { houses: [3, 9], planets: ['水星'] },
  谒贵: { houses: [10, 11], planets: ['太阳', '木星'] },
  谋事: { houses: [1, 10], planets: ['水星', '木星'] },
}

/**
 * Every weight of the astrology score.
 *
 * - `dignity`: essential dignity of a planet in its sign (traditional rulers).
 * - `house`: accidental strength by whole-sign house: angles 1/4/7/10, the good succedents
 *   2/5/11, the bad houses 6/12; 3/8/9 count 0.
 * - `ruler`: each distinct ruler of a matter house, `dignity × dignity + house strength ×
 *   house + retrograde` when retrograde.
 * - `significator`: each natural significator of the matter, likewise with its own factors.
 * - `occupant`: a benefic or malefic standing in a matter house; a malefic that is itself a
 *   significator of the matter is not counted against it.
 * - `moonPhase`: waxing (elongation from the Sun below 180°) or waning.
 * - `moonAspect`: each applying Moon aspect: to a benefic by 合/六合/拱, to a malefic by 合/刑/冲,
 *   or to another significator of the matter by 合/六合/拱.
 * - `hourFit`: the planetary hour ruler is a significator of the matter; otherwise `hour`
 *   scores the ruler by its general nature.
 * - `combustOrb` / `ascendantOrb`: veto distances in degrees for a combust Moon and for a
 *   malefic on the ascendant.
 */
export const ASTRO_WEIGHTS = {
  dignity: { domicile: 1, exaltation: 0.7, detriment: -0.7, fall: -1 },
  house: { angular: 1, succedent: 0.5, cadent: 0, bad: -0.5 },
  ruler: { dignity: 1, house: 0.6, retrograde: -0.4 },
  significator: { dignity: 0.5, house: 0.5, retrograde: -0.4 },
  occupant: { 木星: 1.2, 金星: 0.8, 土星: -1, 火星: -0.8 } as Readonly<
    Partial<Record<PlanetName, number>>
  >,
  moonPhase: { waxing: 0.4, waning: -0.2 },
  moonAspect: { benefic: 0.5, malefic: -0.5, significator: 0.3 },
  hourFit: 1,
  hour: { 木星: 0.6, 金星: 0.4, 太阳: 0.2, 水星: 0, 月亮: 0, 土星: -0.8, 火星: -0.6 } as Readonly<
    Record<PlanetName, number>
  >,
  combustOrb: 8,
  ascendantOrb: 3,
} as const

const BENEFICS: ReadonlySet<PlanetName> = new Set(['木星', '金星'])
const MALEFICS: ReadonlySet<PlanetName> = new Set(['土星', '火星'])
const HARMONIOUS: ReadonlySet<AspectType> = new Set(['合', '六合', '拱'])
const HARD: ReadonlySet<AspectType> = new Set(['合', '刑', '冲'])
/** Matters for which a malefic on the ascendant is a veto. */
const ASCENDANT_VETO: ReadonlySet<TimingEvent> = new Set(['疾病', '婚姻'])

/** Domicile signs of each planet (traditional rulers). */
const DOMICILE_SIGNS: Readonly<Record<PlanetName, readonly Sign[]>> = {
  太阳: ['狮子'],
  月亮: ['巨蟹'],
  水星: ['双子', '处女'],
  金星: ['金牛', '天秤'],
  火星: ['白羊', '天蝎'],
  木星: ['射手', '双鱼'],
  土星: ['摩羯', '水瓶'],
}
/** Exaltation sign of each planet. */
const EXALTATION: Readonly<Record<PlanetName, Sign>> = {
  太阳: '白羊',
  月亮: '金牛',
  水星: '处女',
  金星: '双鱼',
  火星: '摩羯',
  木星: '巨蟹',
  土星: '天秤',
}
/** The sign opposite `sign`. */
const opposite = (sign: Sign) => SIGNS[(SIGNS.indexOf(sign) + 6) % 12]!

/** Essential dignity score and its name, or `[0, null]` when peregrine. */
function dignity(p: Planet): [number, string | null] {
  const d = ASTRO_WEIGHTS.dignity
  if (DOMICILE_SIGNS[p.name].includes(p.sign)) return [d.domicile, '入庙']
  if (EXALTATION[p.name] === p.sign) return [d.exaltation, '入旺']
  if (DOMICILE_SIGNS[p.name].some((s) => opposite(s) === p.sign)) return [d.detriment, '落陷']
  if (opposite(EXALTATION[p.name]) === p.sign) return [d.fall, '落弱']
  return [0, null]
}

/** Accidental strength of a whole-sign house. */
function houseStrength(house: number): number {
  const h = ASTRO_WEIGHTS.house
  if ([1, 4, 7, 10].includes(house)) return h.angular
  if ([2, 5, 11].includes(house)) return h.succedent
  if ([6, 12].includes(house)) return h.bad
  return h.cadent
}

/** Smallest separation of two longitudes, degrees in [0, 180]. */
function separation(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

/** Separations from the Moon, measured forward, at which a major aspect is exact. */
const ASPECT_TARGETS = [0, 60, 90, 120, 180, 240, 270, 300] as const

/**
 * Whether the Moon is void of course: it perfects no major aspect (合, 六合, 刑, 拱, 冲) with
 * another traditional planet before it leaves its sign. Motion is extrapolated linearly from
 * the chart's longitudes and speeds, which over the Moon's at most two and a half days in a
 * sign stays within a fraction of a degree.
 */
export function moonVoidOfCourse(chart: AstroChart): boolean {
  const moon = chart.planets.find((p) => p.name === '月亮')!
  if (moon.speed <= 0) return false
  const leave = (30 - (moon.longitude - SIGNS.indexOf(moon.sign) * 30)) / moon.speed
  for (const p of chart.planets) {
    if (p.name === '月亮') continue
    const rate = moon.speed - p.speed
    if (rate === 0) continue
    const d0 = normalize(moon.longitude - p.longitude)
    for (const target of ASPECT_TARGETS) {
      const t = rate > 0 ? normalize(target - d0) / rate : normalize(d0 - target) / -rate
      if (t <= leave) return false
    }
  }
  return true
}

/** Ruler of whole-sign house `house`. */
const rulerOf = (chart: AstroChart, house: number) =>
  chart.houses.find((h) => h.house === house)!.ruler

/** Condition of a planet in a role: score and a reason naming dignity, house and retrograde. */
function condition(
  p: Planet,
  weights: { readonly dignity: number; readonly house: number; readonly retrograde: number },
  role: string,
): [number, string] {
  const [dig, name] = dignity(p)
  const score =
    dig * weights.dignity +
    houseStrength(p.house) * weights.house +
    (p.retrograde ? weights.retrograde : 0)
  const facts = [name, `${p.house}宫`, p.retrograde ? '逆行' : null].filter((x) => x !== null)
  return [score, `${role}${p.name}${facts.join('·')}`]
}

/**
 * Scores the chart for `event` by {@link ASTRO_WEIGHTS} and {@link ASTRO_SIGNIFICATION}.
 * Vetoes, in this order: the Moon is void of course; the Moon is within the combust orb of
 * the Sun; for 疾病 and 婚姻, 火星 or 土星 within the ascendant orb of the ascendant.
 */
export function scoreAstro(event: TimingEvent, chart: AstroChart): SystemScore {
  const w = ASTRO_WEIGHTS
  const { houses, planets: significators } = ASTRO_SIGNIFICATION[event]
  const planet = (name: PlanetName) => chart.planets.find((p) => p.name === name)!
  const tally = new Tally()

  const hour = chart.planetaryHour
  if (hour !== null) {
    const ruler = hour.hourRuler
    if (significators.includes(ruler)) tally.add(w.hourFit, `${ruler}时（合事）`)
    else tally.add(w.hour[ruler], `${ruler}时`)
  }

  for (const name of new Set(houses.map((h) => rulerOf(chart, h)))) {
    tally.add(...condition(planet(name), w.ruler, '宫主'))
  }
  for (const name of significators) {
    tally.add(...condition(planet(name), w.significator, '征象'))
  }
  for (const p of chart.planets) {
    const value = w.occupant[p.name]
    if (value === undefined || !houses.includes(p.house)) continue
    if (value < 0 && significators.includes(p.name)) continue
    tally.add(value, `${p.name}临${p.house}宫`)
  }

  const moon = planet('月亮')
  const sun = planet('太阳')
  const waxing = normalize(moon.longitude - sun.longitude) < 180
  tally.add(waxing ? w.moonPhase.waxing : w.moonPhase.waning, waxing ? '月渐盈' : '月渐亏')
  for (const a of chart.aspects) {
    if (!a.applying || (a.a !== '月亮' && a.b !== '月亮')) continue
    const other = a.a === '月亮' ? a.b : a.a
    const value =
      MALEFICS.has(other) && HARD.has(a.type)
        ? w.moonAspect.malefic
        : HARMONIOUS.has(a.type) && BENEFICS.has(other)
          ? w.moonAspect.benefic
          : HARMONIOUS.has(a.type) && significators.includes(other)
            ? w.moonAspect.significator
            : undefined
    if (value !== undefined) tally.add(value, `月${a.type}${other}（入相）`)
  }

  return tally.result(astroVeto(event, chart, moon, sun))
}

/** First veto that applies, or `undefined`; see {@link scoreAstro}. */
function astroVeto(
  event: TimingEvent,
  chart: AstroChart,
  moon: Planet,
  sun: Planet,
): string | undefined {
  if (moonVoidOfCourse(chart)) return '月亮空亡（离座前无主要入相位）'
  const fromSun = separation(moon.longitude, sun.longitude)
  if (fromSun < ASTRO_WEIGHTS.combustOrb) return `月亮焦伤（距日 ${Math.round(fromSun)}°）`
  if (ASCENDANT_VETO.has(event)) {
    const onAsc = chart.planets.find(
      (p) =>
        MALEFICS.has(p.name) &&
        separation(p.longitude, chart.ascendant.longitude) <= ASTRO_WEIGHTS.ascendantOrb,
    )
    if (onAsc !== undefined) return `${onAsc.name}临上升`
  }
  return undefined
}
