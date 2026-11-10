/**
 * Two-person comparison of natal charts: synastry (inter-aspects, whole-sign house overlays,
 * weighted key contacts) and the midpoint composite chart.
 */
import { ChartInputError } from '../errors.ts'
import { type AstroRequest, castAstro } from './chart.ts'
import type { AspectType, AstroChart, PlanetName } from './schema.ts'
import type {
  AstroSynastry,
  BodyName,
  Composite,
  CompositeAspect,
  Contact,
  ContactTheme,
  InterAspect,
  Overlay,
  Tally,
} from './synastry-schema.ts'
import { ASPECTS, DOMICILE, normalize, PLANETS, SIGNS, signOf, wholeSignHouse } from './zodiac.ts'

/** Two people to compare and an optional title. */
export interface SynastryRequest {
  /** Display label; defaults to `<A label> × <B label>`. */
  readonly label?: string
  /** Person A; A's ascendant orients the bi-wheel. */
  readonly a: AstroRequest
  /** Person B. */
  readonly b: AstroRequest
}

/** Compared bodies in chart order: the seven planets, then the ascendant and midheaven. */
export const BODIES: readonly BodyName[] = [...PLANETS, '上升', '中天']

/** Weight each key-contact theme adds to the tally of its tone. */
export const CONTACT_WEIGHTS: Readonly<Record<ContactTheme, number>> = {
  日月: 3,
  金火: 2,
  土星: 2,
  上升: 2,
}

/**
 * Separations within this many degrees of 180° make the shorter arc undecidable at the
 * ephemeris accuracy; such a pair takes the tie rule of {@link midpoint}.
 */
export const AMBIGUITY_DEGREES = 0.1

/** Personal points a Saturn contact must touch. */
const PERSONAL: ReadonlySet<BodyName> = new Set(['太阳', '月亮', '水星', '金星', '火星', '上升'])

const CONVENTIONS: AstroSynastry['conventions'] = {
  bodies: '双方七政与上升、中天两两比对（9×9 对）',
  orbs: '与本命盘相同：合、拱、冲 8°，刑 7°，六合 4°，取最紧的一种',
  applying: '入相／出相按双方本命日速同时推进时容许度是否缩小判断，含上升、中天或日速相同时不判',
  overlays: '一方的七政与上升、中天落入另一方的整宫制宫位',
  contacts:
    '日月（太阳—月亮）、金火（金星—火星）、土星（土星对日月水金火与上升）、上升（上升对七政），一对只归一类，按此顺序取先',
  weights:
    '权重日月 3、金火 2、土星 2、上升 2；拱、六合为和谐，刑、冲为挑战；合相含火星或土星为挑战（金火合为和谐），其余合相和谐；和谐与挑战分别累计，不给总评',
  composite: '组合中点盘：同名行星各取短弧中点，整宫制宫位从组合上升起算',
  angles: '组合中天取两中天短弧中点；组合上升取两上升短弧中点，不在组合中天之后 180° 内时取其对点',
  ambiguity: `两点相距与 180° 差 ${AMBIGUITY_DEGREES}° 以内时短弧不可判，取黄经算术平均（不跨白羊 0°）并标记不确定`,
}

const r2 = (x: number) => Math.round(x * 100) / 100
const r4 = (x: number) => Math.round(x * 10_000) / 10_000

/** Longitude, sign and in-sign degree of a point, rounded as the natal chart rounds them. */
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
function aspectOf(sep: number): { type: AspectType; angle: number; orb: number } | undefined {
  let best: { type: AspectType; angle: number; orb: number } | undefined
  for (const a of ASPECTS) {
    const orb = Math.abs(sep - a.angle)
    if (orb <= a.orb && (best === undefined || orb < best.orb)) best = { ...a, orb }
  }
  return best
}

/**
 * Midpoint of two longitudes on the shorter arc, in [0, 360). When the separation lies
 * within {@link AMBIGUITY_DEGREES} of 180° the result is the arithmetic mean of the two
 * longitudes (the midpoint whose arc does not cross 0° Aries) and `ambiguous` is true; the
 * result is the same whichever argument comes first.
 */
export function midpoint(a: number, b: number): { longitude: number; ambiguous: boolean } {
  const x = normalize(a)
  const y = normalize(b)
  if (separation(x, y) > 180 - AMBIGUITY_DEGREES) {
    return { longitude: normalize((x + y) / 2), ambiguous: true }
  }
  const forward = normalize(y - x)
  const longitude = forward <= 180 ? x + forward / 2 : y + (360 - forward) / 2
  return { longitude: normalize(longitude), ambiguous: false }
}

/**
 * Composite midheaven and ascendant. The midheaven is the midpoint of the two midheavens;
 * the ascendant is the midpoint of the two ascendants, replaced by its opposite point when
 * it does not fall within the 180° that follow the composite midheaven in zodiacal order.
 */
export function compositeAngles(
  ascendants: readonly [number, number],
  midheavens: readonly [number, number],
) {
  const midheaven = midpoint(midheavens[0], midheavens[1])
  const asc = midpoint(ascendants[0], ascendants[1])
  const flipped = normalize(asc.longitude - midheaven.longitude) > 180
  return {
    midheaven,
    ascendant: {
      longitude: flipped ? normalize(asc.longitude + 180) : asc.longitude,
      ambiguous: asc.ambiguous,
    },
  }
}

interface Body {
  readonly name: BodyName
  readonly longitude: number
  /** Daily speed, degrees; `null` for an angle. */
  readonly speed: number | null
}

/** Planets and angles of a chart in {@link BODIES} order. */
function bodiesOf(chart: AstroChart): Body[] {
  return [
    ...chart.planets.map((p) => ({ name: p.name, longitude: p.longitude, speed: p.speed })),
    { name: '上升', longitude: chart.ascendant.longitude, speed: null },
    { name: '中天', longitude: chart.midheaven.longitude, speed: null },
  ]
}

/** Whether the orb of `x`–`y` around `angle` shrinks when both move at their daily speeds. */
function applyingOf(x: Body, y: Body, angle: number, orb: number): boolean | null {
  if (x.speed === null || y.speed === null || x.speed === y.speed) return null
  const step = 1e-3
  const later = Math.abs(
    separation(x.longitude + x.speed * step, y.longitude + y.speed * step) - angle,
  )
  return later < orb
}

/** Every major aspect from a body of `a` to a body of `b`, A's bodies first, then B's. */
export function interAspects(a: AstroChart, b: AstroChart): InterAspect[] {
  const out: InterAspect[] = []
  const bs = bodiesOf(b)
  for (const x of bodiesOf(a)) {
    for (const y of bs) {
      const found = aspectOf(separation(x.longitude, y.longitude))
      if (found === undefined) continue
      out.push({
        a: x.name,
        b: y.name,
        type: found.type,
        angle: found.angle,
        orb: r2(found.orb),
        applying: applyingOf(x, y, found.angle, found.orb),
      })
    }
  }
  return out
}

/** Whole-sign house of each body of `from` counted from the ascendant sign of `into`. */
export function overlays(from: AstroChart, into: AstroChart): Overlay[] {
  const ascSign = signOf(into.ascendant.longitude).index
  return bodiesOf(from).map((body) => ({
    body: body.name,
    house: wholeSignHouse(signOf(body.longitude).index, ascSign),
  }))
}

/** Key-contact theme of an unordered body pair, or `undefined` for other pairs. */
function themeOf(x: BodyName, y: BodyName): ContactTheme | undefined {
  const pair = new Set([x, y])
  if (pair.has('太阳') && pair.has('月亮')) return '日月'
  if (pair.has('金星') && pair.has('火星')) return '金火'
  if ((x === '土星' && PERSONAL.has(y)) || (y === '土星' && PERSONAL.has(x))) return '土星'
  const planet = (n: BodyName) => n !== '上升' && n !== '中天'
  if ((x === '上升' && planet(y)) || (y === '上升' && planet(x))) return '上升'
  return undefined
}

/** Traditional tone of an aspect between the bodies `x` and `y`. */
function toneOf(type: AspectType, x: BodyName, y: BodyName): Contact['tone'] {
  if (type === '拱' || type === '六合') return '和谐'
  if (type === '刑' || type === '冲') return '挑战'
  const pair = new Set([x, y])
  if (pair.has('金星') && pair.has('火星')) return '和谐'
  return pair.has('火星') || pair.has('土星') ? '挑战' : '和谐'
}

const THEME_ORDER: readonly ContactTheme[] = ['日月', '金火', '土星', '上升']

/**
 * Key contacts among `aspects`, grouped by theme in the order 日月, 金火, 土星, 上升 and
 * otherwise kept in input order; each carries its tone and {@link CONTACT_WEIGHTS} weight.
 */
export function keyContacts(aspects: readonly InterAspect[]): Contact[] {
  const found = aspects.flatMap((x) => {
    const theme = themeOf(x.a, x.b)
    if (theme === undefined) return []
    const contact: Contact = {
      a: x.a,
      b: x.b,
      type: x.type,
      orb: x.orb,
      theme,
      tone: toneOf(x.type, x.a, x.b),
      weight: CONTACT_WEIGHTS[theme],
    }
    return [contact]
  })
  return THEME_ORDER.flatMap((theme) => found.filter((c) => c.theme === theme))
}

/** Weighted sums and counts of the harmonious and challenging contacts. */
export function tally(contacts: readonly Contact[]): Tally {
  const out = { harmony: 0, tension: 0, harmonyCount: 0, tensionCount: 0 }
  for (const c of contacts) {
    if (c.tone === '和谐') {
      out.harmony += c.weight
      out.harmonyCount += 1
    } else {
      out.tension += c.weight
      out.tensionCount += 1
    }
  }
  return out
}

/** Midpoint composite of two charts with whole-sign houses from the composite ascendant. */
export function composite(a: AstroChart, b: AstroChart): Composite {
  const angles = compositeAngles(
    [a.ascendant.longitude, b.ascendant.longitude],
    [a.midheaven.longitude, b.midheaven.longitude],
  )
  const ascendant = { ...point(angles.ascendant.longitude), ambiguous: angles.ascendant.ambiguous }
  const ascSign = signOf(ascendant.longitude).index
  const lonOf = (chart: AstroChart, name: PlanetName) =>
    chart.planets.find((p) => p.name === name)!.longitude
  const planets = PLANETS.map((name) => {
    const m = midpoint(lonOf(a, name), lonOf(b, name))
    const p = point(m.longitude)
    return {
      name,
      ...p,
      house: wholeSignHouse(signOf(p.longitude).index, ascSign),
      ambiguous: m.ambiguous,
    }
  })
  const aspects: CompositeAspect[] = []
  for (let i = 0; i < planets.length; i++) {
    for (let j = i + 1; j < planets.length; j++) {
      const x = planets[i]!
      const y = planets[j]!
      const found = aspectOf(separation(x.longitude, y.longitude))
      if (found === undefined) continue
      aspects.push({
        a: x.name,
        b: y.name,
        type: found.type,
        angle: found.angle,
        orb: r2(found.orb),
      })
    }
  }
  return {
    ascendant,
    midheaven: {
      ...point(angles.midheaven.longitude),
      ambiguous: angles.midheaven.ambiguous,
    },
    planets,
    houses: SIGNS.map((_, h) => {
      const sign = (ascSign + h) % 12
      return { house: h + 1, sign: SIGNS[sign]!, ruler: DOMICILE[sign]! }
    }),
    aspects,
  }
}

/** Casts one person's chart, prefixing an input error with the person's field name. */
function castPerson(request: AstroRequest, field: 'a' | 'b'): AstroChart {
  try {
    return castAstro(request)
  } catch (error) {
    if (error instanceof ChartInputError) throw new ChartInputError(`${field}.${error.message}`)
    throw error
  }
}

/**
 * Compares two people: casts both natal charts, then derives inter-aspects, house overlays
 * both ways, key contacts with their tally, and the midpoint composite. Rejects malformed
 * input with {@link ChartInputError} whose message starts with `a.` or `b.` and the field.
 */
export function castSynastry(request: SynastryRequest): AstroSynastry {
  const a = castPerson(request.a, 'a')
  const b = castPerson(request.b, 'b')
  const aspects = interAspects(a, b)
  const contacts = keyContacts(aspects)
  return {
    label: request.label ?? `${a.label} × ${b.label}`,
    a,
    b,
    conventions: CONVENTIONS,
    interAspects: aspects,
    overlays: { aInB: overlays(a, b), bInA: overlays(b, a) },
    contacts,
    tally: tally(contacts),
    composite: composite(a, b),
  }
}
