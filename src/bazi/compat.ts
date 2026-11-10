/**
 * Two-person BaZi compatibility (八字合盘): both charts are cast, then read against each other
 * by the rules and weights of {@link COMPAT_WEIGHTS}. Readings are traditional interpretation.
 */
import type { CivilTime } from './civil-time.ts'
import {
  type BaziCompat,
  type CompatFact,
  type CompatPerson,
  PILLAR_KEYS,
  type PillarKey,
  type PillarRef,
} from './compat-schema.ts'
import { controls, ELEMENTS, elementOf } from './ganzhi.ts'
import { castNatal, type FourPillars, type NatalRequest } from './natal.ts'
import { flowRelations } from './relations.ts'
import { natalBase, starsFor } from './shensha.ts'
import { analyzeStrength, type StrengthAnalysis } from './strength.ts'

/** Birth facts of one person, as for `bazi_natal`; label and gender are required. */
export type CompatPersonRequest = Omit<NatalRequest, 'luckSteps' | 'gender' | 'label'> & {
  readonly label: string
  readonly gender: 'male' | 'female'
}

/** Two persons to compare, in display order. */
export interface CompatRequest {
  readonly persons: readonly [CompatPersonRequest, CompatPersonRequest]
}

/** One charted person as the rules read it. */
export interface CompatSubject {
  readonly label: string
  readonly gender: 'male' | 'female'
  readonly pillars: FourPillars
  readonly strength: StrengthAnalysis
}

/**
 * Every score weight, in points added to {@link COMPAT_WEIGHTS.base}; the total is clamped
 * to 0–100.
 *
 * - `spousePalace`: day stems (日干) and day branches (日支, the spouse palace) of the pair.
 *   `banHe` is two branches of one 三合 group.
 * - `zodiac`: year branches (生肖) of the pair.
 * - `dayMaster`: elements of the two day stems; `sheng` when one generates the other, `ke`
 *   when one controls the other, `same` when they share an element.
 * - `elements`: `each` per element favourable to one person (用神 or 喜神, after any
 *   follow pattern) that the person holds below `scarceBelow` percent and the other at or
 *   above `abundantAt` percent, at most `max` in all.
 * - `useful`: `yong` when a person's 用神 reaches `strongAt` percent in the other;
 *   `jiHeaviest` when the other's strongest element is one of the person's 忌神.
 * - `spouseStar`: a man's 财 element or a woman's 官 element; `present` at or above
 *   `presentAt` percent, else `scant`; `partnerIs` when the partner's day master has it.
 * - `shenSha`: per star of one person (counted from that person's natal rule base) found
 *   on a pillar of the other, at most `max` in all.
 */
export const COMPAT_WEIGHTS = {
  base: 50,
  spousePalace: {
    ganHe: 8,
    ganChong: -6,
    liuHe: 10,
    banHe: 6,
    anHe: 4,
    chong: -10,
    xing: -6,
    hai: -6,
    po: -4,
  },
  zodiac: { liuHe: 8, banHe: 6, chong: -8, hai: -5, xing: -4 },
  dayMaster: { sheng: 5, same: 2, ke: -3 },
  elements: { each: 4, max: 12, scarceBelow: 10, abundantAt: 25 },
  useful: { yong: 8, jiHeaviest: -4, strongAt: 20 },
  spouseStar: { present: 4, scant: -3, presentAt: 10, partnerIs: 6 },
  shenSha: { 天乙贵人: 3, 红鸾: 3, 天喜: 3, 桃花: 2, max: 12 },
} as const

/** Cross stars in reading order, with the own pillar each is counted from. */
const CROSS_STARS: ReadonlyArray<readonly [keyof typeof COMPAT_WEIGHTS.shenSha, PillarKey[]]> = [
  ['天乙贵人', ['day']],
  ['红鸾', ['year']],
  ['天喜', ['year']],
  ['桃花', ['year', 'day']],
]
const PILLAR_NAME: Readonly<Record<PillarKey, string>> = {
  year: '年柱',
  month: '月柱',
  day: '日柱',
  hour: '时柱',
}

/** Verdict bands: the first band whose floor the score reaches. */
export const COMPAT_BANDS: ReadonlyArray<readonly [number, string]> = [
  [80, '上佳'],
  [65, '良好'],
  [50, '中平'],
  [35, '需磨合'],
  [0, '挑战较多'],
]

/** How the score is formed; stated with every reading. */
export const COMPAT_SCORE_RULE =
  '基础 50 分，逐项加减（配偶宫日柱合冲刑害破、生肖合冲害刑、日主生克比和、五行互补、用神互补、夫妻星、互见神煞），总分限定 0–100；80 以上上佳，65 良好，50 中平，35 需磨合，其下挑战较多。此为传统命理参考，不作定论。'

const SAN_HE = ['申子辰', '亥卯未', '寅午戌', '巳酉丑']

const ref = (person: 0 | 1, pillar: PillarRef['pillar']): PillarRef => ({ person, pillar })
const both = (pillar: PillarRef['pillar']) => [ref(0, pillar), ref(1, pillar)]

/** Weighted kind of a branch relation line from `flowRelations`, or `undefined`. */
function branchKind(line: string): keyof typeof COMPAT_WEIGHTS.spousePalace | undefined {
  if (line.includes('暗合')) return 'anHe'
  if (line.includes('合化')) return 'liuHe'
  if (line.endsWith('冲')) return 'chong'
  if (line.includes('刑')) return 'xing'
  if (line.endsWith('相害')) return 'hai'
  if (line.endsWith('相破')) return 'po'
  return undefined
}

const toneOf = (points: number): CompatFact['tone'] =>
  points > 0 ? '吉' : points < 0 ? '凶' : '平'

/** Pair relation lines of branches `a` and `b`, plus their 半合 when they share a 三合 group. */
function branchLines(a: string, b: string): string[] {
  const lines = flowRelations([`甲${a}`], [`甲${b}`]).zhi
  const group = a !== b ? SAN_HE.find((g) => g.includes(a) && g.includes(b)) : undefined
  if (group !== undefined) lines.push(`${a}${b}半合（${group}）`)
  return lines
}

/** 日干 合/冲 and 日支 合/冲/刑/害/破 of the pair. */
function spousePalace(a: CompatSubject, b: CompatSubject): CompatFact[] {
  const w = COMPAT_WEIGHTS.spousePalace
  const [ga, za] = [a.pillars[2].charAt(0), a.pillars[2].charAt(1)]
  const [gb, zb] = [b.pillars[2].charAt(0), b.pillars[2].charAt(1)]
  const facts: CompatFact[] = []
  const add = (title: string, points: number, reason: string) =>
    facts.push({
      category: 'spousePalace',
      tone: toneOf(points),
      title,
      reason,
      points,
      pillars: both('day'),
    })
  for (const line of flowRelations([`${ga}子`], [`${gb}子`]).gan) {
    if (line.includes('合化')) add(`日干 ${line}`, w.ganHe, '日主相合，彼此有情')
    else if (line.endsWith('冲')) add(`日干 ${line}`, w.ganChong, '日主相冲，性情易起摩擦')
  }
  for (const line of branchLines(za, zb)) {
    const kind = line.includes('半合') ? 'banHe' : branchKind(line)
    if (kind === undefined) continue
    const reason = w[kind] > 0 ? '配偶宫相合，夫妻宫和顺' : '配偶宫受冲刑害破，相处多磨合'
    add(`日支 ${line}`, w[kind], reason)
  }
  if (facts.length === 0) {
    facts.push({
      category: 'spousePalace',
      tone: '平',
      title: `日柱 ${a.pillars[2]}·${b.pillars[2]} 无合冲`,
      reason: '配偶宫平稳，无明显合冲刑害',
      points: 0,
      pillars: both('day'),
    })
  }
  return facts
}

/** 生肖 六合/三合/冲/害/刑 of the year branches; 破 and 暗合 are not read for the zodiac. */
function zodiac(a: CompatSubject, b: CompatSubject): CompatFact[] {
  const w = COMPAT_WEIGHTS.zodiac
  const [za, zb] = [a.pillars[0].charAt(1), b.pillars[0].charAt(1)]
  const facts: CompatFact[] = []
  for (const line of branchLines(za, zb)) {
    const kind = line.includes('半合') ? 'banHe' : branchKind(line)
    if (kind === undefined || !(kind in w)) continue
    const points = w[kind as keyof typeof w]
    facts.push({
      category: 'zodiac',
      tone: toneOf(points),
      title: `年支 ${line}`,
      reason: points > 0 ? '生肖相合，家世与观念易相投' : '生肖相冲害刑，宜多包容',
      points,
      pillars: both('year'),
    })
  }
  if (facts.length === 0) {
    facts.push({
      category: 'zodiac',
      tone: '平',
      title: `年支 ${za}${zb} 无合冲`,
      reason: '生肖之间无明显合冲',
      points: 0,
      pillars: both('year'),
    })
  }
  return facts
}

/** Generating (生), controlling (克) or shared element (比和) of the two day stems. */
function dayMaster(a: CompatSubject, b: CompatSubject): CompatFact[] {
  const w = COMPAT_WEIGHTS.dayMaster
  const [ga, gb] = [a.pillars[2].charAt(0), b.pillars[2].charAt(0)]
  const [ea, eb] = [elementOf(ga)!, elementOf(gb)!]
  const generates = (x: string, y: string) =>
    (ELEMENTS.indexOf(y) - ELEMENTS.indexOf(x) + 5) % 5 === 1
  const fact = (tone: CompatFact['tone'], title: string, points: number, reason: string) => ({
    category: 'dayMaster' as const,
    tone,
    title: `日主 ${title}`,
    reason,
    points,
    pillars: both('day'),
  })
  if (ea === eb) return [fact('平', `${ga}${gb}同属${ea}`, w.same, '日主比和，性情相近')]
  for (const [x, ex, y, ey] of [
    [ga, ea, gb, eb],
    [gb, eb, ga, ea],
  ] as const) {
    if (generates(ex, ey))
      return [fact('吉', `${x}${ex}生${y}${ey}`, w.sheng, '日主相生，一方滋养另一方')]
    if (controls(ex, ey))
      return [fact('凶', `${x}${ex}克${y}${ey}`, w.ke, '日主相克，一方易压制另一方')]
  }
  return []
}

/** The pair in both reading directions: subject, partner and their pillar-reference indexes. */
const DIRECTIONS = [
  [0, 1],
  [1, 0],
] as const

/** Share in percent of `element` in a subject's strength scores. */
const percentOf = (s: CompatSubject, element: string) =>
  s.strength.elements.find((e) => e.element === element)!.percent

/** Pillars of subject `person` whose stem or branch has `element`. */
function pillarsWith(s: CompatSubject, person: 0 | 1, element: string): PillarRef[] {
  return PILLAR_KEYS.filter((_, i) => [...s.pillars[i]!].some((c) => elementOf(c) === element)).map(
    (k) => ref(person, k),
  )
}

/** 五行互补: favourable elements one person lacks that the other holds in abundance. */
function elements(pair: readonly [CompatSubject, CompatSubject]): CompatFact[] {
  const w = COMPAT_WEIGHTS.elements
  const facts: CompatFact[] = []
  let budget = w.max
  for (const [i, j] of DIRECTIONS) {
    const [own, other] = [pair[i], pair[j]]
    const wanted = new Set([own.strength.yong, ...own.strength.xi].map((p) => p.element))
    for (const element of ELEMENTS) {
      const [mine, theirs] = [percentOf(own, element), percentOf(other, element)]
      if (!wanted.has(element) || mine >= w.scarceBelow || theirs < w.abundantAt) continue
      if (budget <= 0) continue
      const points = Math.min(w.each, budget)
      budget -= points
      facts.push({
        category: 'elements',
        tone: '吉',
        title: `${own.label}缺${element}，${other.label}${element}旺`,
        reason: `${element}为${own.label}所喜：${own.label} ${mine}%，${other.label} ${theirs}%，可互补`,
        points,
        pillars: pillarsWith(other, j, element),
      })
    }
  }
  if (facts.length === 0) {
    facts.push({
      category: 'elements',
      tone: '平',
      title: '五行无明显互补',
      reason: `一方所喜而不足 ${w.scarceBelow}% 的五行，另一方均未达 ${w.abundantAt}%`,
      points: 0,
      pillars: [],
    })
  }
  return facts
}

/** 用神互补: each person's 用神 strong in the other, and the other's strongest as 忌神. */
function useful(pair: readonly [CompatSubject, CompatSubject]): CompatFact[] {
  const w = COMPAT_WEIGHTS.useful
  const facts: CompatFact[] = []
  for (const [i, j] of DIRECTIONS) {
    const [own, other] = [pair[i], pair[j]]
    const yong = own.strength.yong.element
    const share = percentOf(other, yong)
    if (share >= w.strongAt) {
      facts.push({
        category: 'useful',
        tone: '吉',
        title: `${own.label}用神${yong}，${other.label}${yong}旺`,
        reason: `${other.label}${yong}占 ${share}%，可补${own.label}所需`,
        points: w.yong,
        pillars: pillarsWith(other, j, yong),
      })
    }
    const heaviest = other.strength.elements.reduce((x, y) => (y.score > x.score ? y : x))
    if (own.strength.ji.some((p) => p.element === heaviest.element)) {
      facts.push({
        category: 'useful',
        tone: '凶',
        title: `${other.label}${heaviest.element}最旺，正为${own.label}忌神`,
        reason: `${other.label}${heaviest.element}占 ${heaviest.percent}%，易加重${own.label}所忌`,
        points: w.jiHeaviest,
        pillars: pillarsWith(other, j, heaviest.element),
      })
    }
  }
  if (facts.length === 0) {
    facts.push({
      category: 'useful',
      tone: '平',
      title: '用神互不相补',
      reason: `双方用神在对方均不足 ${w.strongAt}%，亦无忌神过旺`,
      points: 0,
      pillars: [],
    })
  }
  return facts
}

/** 夫妻星: a man's 财 and a woman's 官 element, its strength, and the partner's day master. */
function spouseStar(pair: readonly [CompatSubject, CompatSubject]): CompatFact[] {
  const w = COMPAT_WEIGHTS.spouseStar
  const facts: CompatFact[] = []
  for (const [i, j] of DIRECTIONS) {
    const [own, other] = [pair[i], pair[j]]
    const role = own.gender === 'male' ? '财' : '官杀'
    const star = own.gender === 'male' ? '财' : '官'
    const element = own.strength.elements.find((e) => e.role === role)!
    const present = element.percent >= w.presentAt
    facts.push({
      category: 'spouseStar',
      tone: present ? '吉' : '凶',
      title: `${own.label}${star}星${element.element}${present ? '有力' : '偏弱'}`,
      reason: `${star}星${element.element}占 ${element.percent}%${present ? '，夫妻星得位' : '，夫妻星不显'}`,
      points: present ? w.present : w.scant,
      pillars: pillarsWith(own, i, element.element),
    })
    const partnerGan = other.pillars[2].charAt(0)
    if (elementOf(partnerGan) === element.element) {
      facts.push({
        category: 'spouseStar',
        tone: '吉',
        title: `${other.label}日主${partnerGan}${element.element}正为${own.label}${star}星`,
        reason: '对方日主即己之夫妻星，彼此相吸',
        points: w.partnerIs,
        pillars: [ref(j, 'day')],
      })
    }
  }
  return facts
}

/** 互见神煞: 天乙, 红鸾, 天喜 and 桃花 of one person landing on the other's pillars. */
function shenSha(pair: readonly [CompatSubject, CompatSubject]): CompatFact[] {
  const w = COMPAT_WEIGHTS.shenSha
  const facts: CompatFact[] = []
  let budget = w.max
  for (const [i, j] of DIRECTIONS) {
    const [own, other] = [pair[i], pair[j]]
    const base = natalBase(own.pillars)
    other.pillars.forEach((ganZhi, k) => {
      const hits = starsFor(base, ganZhi, 'flow')
      for (const [star, from] of CROSS_STARS) {
        if (!hits.includes(star) || budget <= 0) continue
        const points = Math.min(w[star], budget)
        budget -= points
        const at = PILLAR_KEYS[k]!
        facts.push({
          category: 'shenSha',
          tone: '吉',
          title: `${other.label}${PILLAR_NAME[at]}${ganZhi.charAt(1)}为${own.label}${star}`,
          reason: star === '天乙贵人' ? '对方为己之贵人，相助有缘' : '姻缘星互见，彼此相吸',
          points,
          pillars: [ref(j, at), ...from.map((p) => ref(i, p))],
        })
      }
    })
  }
  return facts
}

/** Verdict band of a score. */
function verdictOf(score: number): string {
  return COMPAT_BANDS.find(([floor]) => score >= floor)![1]
}

/**
 * Reads subject `a` against subject `b`: every fact of {@link COMPAT_WEIGHTS} in category
 * order, the clamped total score and its verdict band. Pillar references use 0 for `a` and
 * 1 for `b`.
 */
export function compareCharts(
  a: CompatSubject,
  b: CompatSubject,
): { facts: CompatFact[]; score: number; verdict: string } {
  const pair = [a, b] as const
  const facts = [
    ...spousePalace(a, b),
    ...zodiac(a, b),
    ...dayMaster(a, b),
    ...elements(pair),
    ...useful(pair),
    ...spouseStar(pair),
    ...shenSha(pair),
  ]
  const total = facts.reduce<number>((n, f) => n + f.points, COMPAT_WEIGHTS.base)
  const score = Math.max(0, Math.min(100, Math.round(total)))
  return { facts, score, verdict: verdictOf(score) }
}

/** Charts one person, keeping the saved person and the subject the rules read. */
function chartPerson(
  request: CompatPersonRequest,
  now: CivilTime | undefined,
): { person: CompatPerson; subject: CompatSubject } {
  const chart = castNatal({ ...request, luckSteps: 0 }, now)
  const p = chart.pillars
  const pillars: FourPillars = [p.year.ganZhi, p.month.ganZhi, p.day.ganZhi, p.hour.ganZhi]
  const strength = analyzeStrength(pillars)
  const { label, gender } = request
  return {
    person: {
      label,
      gender,
      clockTime: chart.input.clockTime,
      city: chart.input.city,
      trueSolarTime: chart.trueSolarTime,
      pillars: p,
      strength,
    },
    subject: { label, gender, pillars, strength },
  }
}

/**
 * Casts both persons' natal charts (as `castNatal`; timeline and luck periods are left out)
 * and compares them with {@link compareCharts}. `now` only sets the charts' casting date.
 * Throws `ChartInputError` for an unparseable birth time or unknown city of either person.
 */
export function castCompat(request: CompatRequest, now?: CivilTime): BaziCompat {
  const [a, b] = request.persons.map((r) => chartPerson(r, now)) as [
    ReturnType<typeof chartPerson>,
    ReturnType<typeof chartPerson>,
  ]
  const { facts, score, verdict } = compareCharts(a.subject, b.subject)
  return {
    persons: [a.person, b.person],
    score,
    verdict,
    facts,
    scoreRule: COMPAT_SCORE_RULE,
  }
}
