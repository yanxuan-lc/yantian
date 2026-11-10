/**
 * Day-master strength (身强/身弱), follow patterns (从格) and useful elements (喜用忌) by a
 * quantified 扶抑 method with a simplified 调候 override. Pure: reads four pillars, no
 * calendar access.
 */
import { ELEMENTS, elementOf, hideGan, seasonStates } from './ganzhi.ts'
import type { FourPillars } from './natal.ts'

/**
 * Every weight the analysis uses.
 *
 * - `stem`: points of the year, month and hour stems; the day stem is the day master and is
 *   not scored.
 * - `branch`: points of the year, month, day and hour branches. The month branch (月令)
 *   carries about a third of the chart; the day branch (坐下) counts half again.
 * - `hidden`: how a branch's points split over its hidden stems (main, middle, residual qi),
 *   by the number of hidden stems.
 * - `season`: multiplier on every character of an element by its 旺相休囚死 state under the
 *   month branch.
 * - `unrooted`: multiplier on a stem whose element appears in no hidden stem of the four
 *   branches (不通根, a floating stem).
 * - `strongAt` / `weakBelow`: 同类 share, in percent, at or above which the day master is
 *   身强 and below which it is 身弱; between them it is 中和.
 * - `tiaoHouBelow`: share, in percent, below which the 调候 element counts as missing.
 * - `congRuoBelow`: 同类 share, in percent, below which a day master with no 比劫 or 印 main
 *   qi in the month or day branch follows the heaviest 异类 family (从弱).
 * - `congQiangAt` / `congQiangGuanShaBelow`: 同类 share at or above which, with 官杀 under
 *   the second share and no 官杀 stem on the year, month or hour, the chart follows its own
 *   strength (从强).
 */
export const STRENGTH_WEIGHTS = {
  stem: { year: 1.0, month: 1.2, hour: 1.0 },
  branch: { year: 1.0, month: 3.0, day: 1.5, hour: 1.0 },
  hidden: { 1: [1.0], 2: [0.7, 0.3], 3: [0.6, 0.3, 0.1] } as Readonly<
    Record<number, readonly number[]>
  >,
  season: { 旺: 1.4, 相: 1.2, 休: 1.0, 囚: 0.8, 死: 0.6 } as Readonly<Record<string, number>>,
  unrooted: 0.6,
  strongAt: 55,
  weakBelow: 45,
  tiaoHouBelow: 20,
  congRuoBelow: 15,
  congQiangAt: 85,
  congQiangGuanShaBelow: 5,
} as const

/** Method label stated with every analysis. */
export const STRENGTH_METHOD =
  '量化扶抑：天干与藏干按位置计分（月令约占三成），乘月令旺相休囚死系数，天干不通根者打折；同类（比劫+印）占比 ≥55% 为身强、<45% 为身弱，其间为中和。调候（穷通宝鉴简化）：生于巳午未月而水不足 20% 取水，生于亥子丑月而火不足 20% 取火，调候为急，列为用神。从格：同类 <15% 且月支、日支本气非比劫印者从弱，按最重异类定从财、从官杀、从儿；同类 ≥85% 且官杀 <5%、天干不透官杀者从强；从格顺其势取喜忌，不再调候。'

/** Ten-god family of an element relative to the day master, by generating-cycle step. */
const ROLES = ['比劫', '食伤', '财', '官杀', '印'] as const
/** Ten-god family of an element relative to the day master. */
export type ElementRole = (typeof ROLES)[number]

/** One element's ten-god family, weighted score and share of the chart. */
export interface ElementScore {
  readonly element: string
  readonly role: ElementRole
  /** Weighted points, rounded to two decimals. */
  readonly score: number
  /** Share of all points in percent, rounded to one decimal. */
  readonly percent: number
}

/** Chart pattern: ordinary 扶抑, or one of the follow patterns. */
export type PatternName = '普通' | '从财' | '从官杀' | '从儿' | '从强'

/** The chart's pattern and why it was assigned. */
export interface Pattern {
  readonly name: PatternName
  readonly reason: string
}

/** An element picked for a role, with the reason it was picked. */
export interface ElementPick {
  readonly element: string
  readonly reason: string
}

/** Strength verdict and useful elements of one chart. */
export interface StrengthAnalysis {
  /** Day stem. */
  readonly dayMaster: string
  /** Element of the day stem. */
  readonly dayElement: string
  /** Branches holding a hidden stem of the day master's element (通根), in pillar order. */
  readonly roots: string[]
  /** The five elements in 木火土金水 order. */
  readonly elements: ElementScore[]
  /** Share in percent of 同类 (比劫 + 印), rounded to one decimal. */
  readonly tongLei: number
  /** Share in percent of 异类 (食伤 + 财 + 官杀), rounded to one decimal. */
  readonly yiLei: number
  readonly verdict: '身强' | '身弱' | '中和'
  /** Follow pattern (从格) when one qualifies, else 普通. */
  readonly pattern: Pattern
  /**
   * 用神: for a follow pattern the element of the force followed; otherwise the 调候 element
   * when one applies, else the leading 扶抑 element.
   */
  readonly yong: ElementPick
  /** 喜神, most helpful first. */
  readonly xi: ElementPick[]
  /** 忌神, in 木火土金水 order. */
  readonly ji: ElementPick[]
  /** 调候 element of an extreme season applied to an ordinary chart, or `null`. */
  readonly tiaoHou: ElementPick | null
  /** How the result was computed; see {@link STRENGTH_METHOD}. */
  readonly method: string
}

const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits

/** Element at `step` places along the generating cycle from `element`. */
const stepFrom = (element: string, step: number) =>
  ELEMENTS.charAt((ELEMENTS.indexOf(element) + step) % 5)

/** Raw points per element before seasonal and rooting factors, and the day master's roots. */
function rawPoints(pillars: FourPillars): { points: Map<string, number>; roots: string[] } {
  const w = STRENGTH_WEIGHTS
  const points = new Map<string, number>([...ELEMENTS].map((e) => [e, 0]))
  const add = (element: string, n: number) => {
    points.set(element, points.get(element)! + n)
  }
  const branches = pillars.map((p) => p.charAt(1))
  const rootElements = new Set(branches.flatMap((z) => hideGan(z).map((g) => elementOf(g)!)))
  const stems = [
    [pillars[0].charAt(0), w.stem.year],
    [pillars[1].charAt(0), w.stem.month],
    [pillars[3].charAt(0), w.stem.hour],
  ] as const
  for (const [gan, weight] of stems) {
    const element = elementOf(gan)!
    add(element, rootElements.has(element) ? weight : weight * w.unrooted)
  }
  const branchWeights = [w.branch.year, w.branch.month, w.branch.day, w.branch.hour]
  branches.forEach((zhi, i) => {
    const hidden = hideGan(zhi)
    const split = w.hidden[hidden.length]!
    hidden.forEach((g, k) => {
      add(elementOf(g)!, branchWeights[i]! * split[k]!)
    })
  })
  const dayElement = elementOf(pillars[2].charAt(0))!
  const roots = branches.filter((z) => hideGan(z).some((g) => elementOf(g) === dayElement))
  return { points, roots }
}

/**
 * 调候 element of an extreme season: water for a 巳午未 month when water is under
 * {@link STRENGTH_WEIGHTS.tiaoHouBelow} percent, fire for a 亥子丑 month likewise; else `null`.
 */
function tiaoHouOf(monthZhi: string, percentOf: (e: string) => number): ElementPick | null {
  const below = STRENGTH_WEIGHTS.tiaoHouBelow
  if ('巳午未'.includes(monthZhi) && percentOf('水') < below) {
    return { element: '水', reason: `生于${monthZhi}月炎热，水仅 ${percentOf('水')}%，取水调候` }
  }
  if ('亥子丑'.includes(monthZhi) && percentOf('火') < below) {
    return { element: '火', reason: `生于${monthZhi}月寒冻，火仅 ${percentOf('火')}%，取火调候` }
  }
  return null
}

/** Favourable (most helpful first) and unfavourable elements of one 扶抑 direction. */
interface FuYi {
  readonly fuYi: ElementPick[]
  readonly against: ElementPick[]
}

type PointsOf = (role: ElementRole) => number
type ElementOfRole = (role: ElementRole) => string

const OTHER_ROLES = ['食伤', '财', '官杀'] as const

/**
 * Weak (or balanced, leaning weak) day master: 印 leads and 比劫 follows; when 财 is the heaviest 异类 the seal is broken
 * (财破印), so 比劫 leads instead. 食伤, 财 and 官杀 are unfavourable.
 */
function supportWeak(pointsOf: PointsOf, el: ElementOfRole, label: string): FuYi {
  const heaviest = OTHER_ROLES.reduce((a, b) => (pointsOf(b) > pointsOf(a) ? b : a))
  const fuYi =
    heaviest === '财'
      ? [
          { element: el('比劫'), reason: `${label}财多，印逢财破，取比劫帮身` },
          { element: el('印'), reason: '印生身为辅' },
        ]
      : [
          { element: el('印'), reason: `${label}，${heaviest}偏重，取印生身` },
          { element: el('比劫'), reason: '比劫帮身为辅' },
        ]
  const against = OTHER_ROLES.map((role) => ({
    element: el(role),
    reason: `${label}忌${role}耗泄克身`,
  }))
  return { fuYi, against }
}

/**
 * Strong (or balanced, leaning strong) day master: 官杀 leads when 比劫 outweighs 印, else 财 leads to break the seal;
 * 食伤 follows, then the remaining one of 财 and 官杀. 比劫 and 印 are unfavourable.
 */
function drainStrong(pointsOf: PointsOf, el: ElementOfRole, label: string): FuYi {
  const lead = pointsOf('比劫') >= pointsOf('印') ? '官杀' : '财'
  const fuYi = [
    {
      element: el(lead),
      reason: lead === '官杀' ? `${label}比劫重，取官杀制身` : `${label}印重，取财破印`,
    },
    { element: el('食伤'), reason: '食伤泄秀为辅' },
    {
      element: el(lead === '官杀' ? '财' : '官杀'),
      reason: lead === '官杀' ? '财耗身为辅' : '官杀制身为辅',
    },
  ]
  const against = (['比劫', '印'] as const).map((role) => ({
    element: el(role),
    reason: `${label}忌${role}再扶`,
  }))
  return { fuYi, against }
}

/** A follow pattern with its favourable and unfavourable elements. */
interface Follow extends FuYi {
  readonly pattern: Pattern
}

const FOLLOW_WEAK: Readonly<
  Record<'财' | '官杀' | '食伤', { name: PatternName; xi: ElementRole[]; ji: ElementRole[] }>
> = {
  财: { name: '从财', xi: ['食伤', '官杀'], ji: ['比劫', '印'] },
  官杀: { name: '从官杀', xi: ['财'], ji: ['食伤', '比劫', '印'] },
  食伤: { name: '从儿', xi: ['财', '比劫'], ji: ['印', '官杀'] },
}

/**
 * Follow pattern of a chart, or `null` for an ordinary one.
 *
 * 从弱: 同类 below {@link STRENGTH_WEIGHTS.congRuoBelow} percent and neither the month nor the
 * day branch has 比劫 or 印 main qi; the heaviest of 食伤, 财 and 官杀 is followed (从儿,
 * 从财, 从官杀) and leads, with its supporters as 喜. 从强: 同类 at or above
 * {@link STRENGTH_WEIGHTS.congQiangAt} percent, 官杀 below
 * {@link STRENGTH_WEIGHTS.congQiangGuanShaBelow} percent and no 官杀 on the year, month or
 * hour stem; the heavier of 比劫 and 印 leads, the other and 食伤 are 喜, 官杀 and 财 are 忌.
 */
function followPattern(
  pillars: FourPillars,
  tongLei: number,
  pointsOf: PointsOf,
  percentOfRole: (role: ElementRole) => number,
  el: ElementOfRole,
): Follow | null {
  const w = STRENGTH_WEIGHTS
  const pick = (role: ElementRole, reason: string) => ({ element: el(role), reason })
  const supportive = new Set([el('比劫'), el('印')])
  const mainRooted = [pillars[1], pillars[2]].some((gz) =>
    supportive.has(elementOf(hideGan(gz.charAt(1))[0]!)!),
  )
  if (tongLei < w.congRuoBelow && !mainRooted) {
    const force = OTHER_ROLES.reduce((a, b) => (pointsOf(b) > pointsOf(a) ? b : a))
    const rule = FOLLOW_WEAK[force]
    return {
      pattern: {
        name: rule.name,
        reason: `同类仅 ${tongLei}%，月支日支本气无比劫印，${force}最旺，${rule.name}`,
      },
      fuYi: [
        pick(force, `${rule.name}，顺从${force}之势`),
        ...rule.xi.map((role) => pick(role, `${rule.name}，${role}助${force}为喜`)),
      ],
      against: rule.ji.map((role) => pick(role, `${rule.name}，忌${role}逆势`)),
    }
  }
  const officerStem = [pillars[0], pillars[1], pillars[3]].some(
    (gz) => elementOf(gz.charAt(0)) === el('官杀'),
  )
  if (tongLei >= w.congQiangAt && percentOfRole('官杀') < w.congQiangGuanShaBelow && !officerStem) {
    const lead = pointsOf('比劫') >= pointsOf('印') ? '比劫' : '印'
    const other = lead === '比劫' ? '印' : '比劫'
    return {
      pattern: {
        name: '从强',
        reason: `同类达 ${tongLei}%，官杀仅 ${percentOfRole('官杀')}% 且天干不透，从强`,
      },
      fuYi: [
        pick(lead, `从强，${lead}当令为用`),
        pick(other, `从强，${other}顺势为喜`),
        pick('食伤', '从强，食伤泄秀为喜'),
      ],
      against: [pick('官杀', '从强，忌官杀逆势'), pick('财', '从强，忌财激比劫')],
    }
  }
  return null
}

/**
 * Scores the eight characters of `pillars` (year, month, day, hour) and derives the
 * strength verdict, follow pattern, 喜用忌 elements and 调候 by the rules of
 * {@link STRENGTH_WEIGHTS}. A follow pattern replaces the 扶抑 choice and suppresses 调候.
 */
export function analyzeStrength(pillars: FourPillars): StrengthAnalysis {
  const dayMaster = pillars[2].charAt(0)
  const dayElement = elementOf(dayMaster)!
  const monthZhi = pillars[1].charAt(1)
  const { points, roots } = rawPoints(pillars)
  const season = new Map(seasonStates(monthZhi).map((s) => [s.element, s.state]))
  const weighted = new Map(
    [...points].map(([e, n]) => [e, n * STRENGTH_WEIGHTS.season[season.get(e)!]!]),
  )
  const total = [...weighted.values()].reduce((a, b) => a + b, 0)
  const roleOf = (e: string) => ROLES[(ELEMENTS.indexOf(e) - ELEMENTS.indexOf(dayElement) + 5) % 5]!
  const elements: ElementScore[] = [...ELEMENTS].map((element) => ({
    element,
    role: roleOf(element),
    score: round(weighted.get(element)!, 2),
    percent: round((weighted.get(element)! / total) * 100, 1),
  }))
  const percentOf = (e: string) => elements.find((x) => x.element === e)!.percent
  const pointsOf = (role: ElementRole) => weighted.get(stepFrom(dayElement, ROLES.indexOf(role)))!
  const same = pointsOf('比劫') + pointsOf('印')
  const tongLei = round((same / total) * 100, 1)
  const verdict =
    tongLei >= STRENGTH_WEIGHTS.strongAt
      ? '身强'
      : tongLei < STRENGTH_WEIGHTS.weakBelow
        ? '身弱'
        : '中和'
  const el = (role: ElementRole) => stepFrom(dayElement, ROLES.indexOf(role))
  // A balanced chart leans by which side of 50% its 同类 share falls on.
  const leansWeak = verdict === '身弱' || (verdict === '中和' && tongLei < 50)
  const label = verdict === '中和' ? (leansWeak ? '中和偏弱' : '中和偏强') : verdict
  const percentOfRole = (role: ElementRole) => percentOf(el(role))
  const follow = followPattern(pillars, tongLei, pointsOf, percentOfRole, el)
  const { fuYi, against } =
    follow ?? (leansWeak ? supportWeak(pointsOf, el, label) : drainStrong(pointsOf, el, label))
  const tiaoHou = follow === null ? tiaoHouOf(monthZhi, percentOf) : null
  const favourable =
    tiaoHou === null ? fuYi : [tiaoHou, ...fuYi.filter((p) => p.element !== tiaoHou.element)]
  const ji = against
    .filter((p) => tiaoHou === null || p.element !== tiaoHou.element)
    .sort((a, b) => ELEMENTS.indexOf(a.element) - ELEMENTS.indexOf(b.element))
  return {
    dayMaster,
    dayElement,
    roots,
    elements,
    tongLei,
    yiLei: round(100 - tongLei, 1),
    verdict,
    pattern: follow?.pattern ?? { name: '普通', reason: `${label}，按扶抑取用` },
    yong: favourable[0]!,
    xi: favourable.slice(1),
    ji,
    tiaoHou,
    method: STRENGTH_METHOD,
  }
}
