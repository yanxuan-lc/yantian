/**
 * 八字 timing score of one period against a natal chart: the flowing day and hour pillars
 * read by the person's favourable elements, the ten god and shen-sha of the matter, and
 * their relations with the natal day pillar. Pure apart from {@link baziNatalFacts}, which
 * casts the natal pillars.
 */
import { controls, elementOf, shiShen, ZHI, zhiShiShen } from '../bazi/ganzhi.ts'
import { type FourPillars, type NatalRequest, natalPillars } from '../bazi/natal.ts'
import { flowRelations } from '../bazi/relations.ts'
import { natalBase, starsFor } from '../bazi/shensha.ts'
import { analyzeStrength } from '../bazi/strength.ts'
import { type SystemScore, Tally, type TimingEvent } from './types.ts'

/** Natal facts the score reads: pillars, gender and the favourable and unfavourable elements. */
export interface BaziNatalFacts {
  /** Year, month, day and hour pillars. */
  readonly pillars: FourPillars
  /** Decides the spouse star for 婚姻: 财 for a man, 官杀 for a woman. */
  readonly gender: 'male' | 'female'
  /** 用神 element. */
  readonly yong: string
  /** 喜神 elements. */
  readonly xi: readonly string[]
  /** 忌神 elements. */
  readonly ji: readonly string[]
}

/** Natal facts from birth facts: the natal pillars and the 喜用忌 of `bazi/strength.ts`. */
export function baziNatalFacts(
  request: NatalRequest & { gender: 'male' | 'female' },
): BaziNatalFacts {
  const pillars = natalPillars(request)
  const strength = analyzeStrength(pillars)
  return {
    pillars,
    gender: request.gender,
    yong: strength.yong.element,
    xi: strength.xi.map((p) => p.element),
    ji: strength.ji.map((p) => p.element),
  }
}

/**
 * Ten gods and stars of each matter. `favour` ten gods add, `avoid` ten gods subtract; a
 * `stars` hit on a flowing pillar adds. 婚姻 takes its spouse star from `spouse` by gender.
 * 诉讼 favours the ten gods that restrain 官杀 (食神 制杀, 印 化杀) and avoids an unrestrained
 * 七杀; 疾病 favours 印 and avoids 七杀 attacking the day master.
 */
export const BAZI_EVENT_RULES: Readonly<
  Record<
    TimingEvent,
    {
      readonly favour: readonly string[]
      readonly avoid: readonly string[]
      readonly stars: readonly string[]
    }
  >
> = {
  求财: { favour: ['正财', '偏财'], avoid: [], stars: [] },
  求官: { favour: ['正官', '七杀'], avoid: [], stars: [] },
  考试: { favour: ['正印', '偏印'], avoid: [], stars: ['文昌贵人', '学堂'] },
  婚姻: { favour: [], avoid: [], stars: ['红鸾', '天喜'] },
  出行: { favour: [], avoid: [], stars: ['驿马'] },
  谒贵: { favour: [], avoid: [], stars: ['天乙贵人'] },
  疾病: { favour: ['正印', '偏印'], avoid: ['七杀'], stars: [] },
  诉讼: { favour: ['食神', '正印', '偏印'], avoid: ['七杀'], stars: [] },
  谋事: { favour: ['食神', '伤官', '正印', '偏印'], avoid: [], stars: [] },
}

/** Spouse star of 婚姻 by gender. */
const SPOUSE: Readonly<Record<'male' | 'female', readonly string[]>> = {
  male: ['正财', '偏财'],
  female: ['正官', '七杀'],
}

/**
 * Every weight of the BaZi score.
 *
 * - `element`: a character whose element is the 用神, a 喜神 or a 忌神, times `position`.
 * - `position`: hour stem and branch carry the period; the flowing day pillar weighs half.
 * - `tenGod`: a stem's ten god, or a branch's main-qi ten god, in the matter's favour or avoid
 *   list, times `position`.
 * - `star`: a matter star on the flowing day or hour pillar, times `pillar`.
 * - `blessing`: 天德贵人 or 月德贵人 on a flowing pillar, times `pillar`.
 * - `void`: the hour branch in the natal day pillar's void (空亡).
 * - `relation`: a branch relation of the flowing branch with the natal day branch, times
 *   `pillar`.
 * - `stemClash`: a flowing stem clashing the day master (甲庚, 乙辛, 丙壬, 丁癸), times `pillar`.
 */
export const BAZI_WEIGHTS = {
  element: { yong: 3, xi: 1.5, ji: -3 },
  position: { hourStem: 1, hourBranch: 1.15, dayStem: 0.5, dayBranch: 0.575 },
  tenGod: { favour: 1.5, avoid: -1.5 },
  star: 1.5,
  blessing: 0.5,
  void: -0.75,
  pillar: { hour: 1, day: 0.5 },
  relation: { 合: 1, 冲: -2, 刑: -1, 害: -1, 破: -0.5 } as Readonly<Record<string, number>>,
  relationPillar: { hour: 1, day: 0.7 },
  stemClash: -0.5,
} as const

const BLESSINGS = ['天德贵人', '月德贵人'] as const
const clashes = (a: string, b: string) => (ZHI.indexOf(a) - ZHI.indexOf(b) + 12) % 12 === 6

/** Kind of a relation line of `relations.ts`: 合, 冲, 刑, 害 or 破; `undefined` for others. */
function relationKind(line: string): string | undefined {
  if (line.includes('暗合')) return undefined
  if (line.includes('合')) return '合'
  if (line.endsWith('冲')) return '冲'
  if (line.includes('刑')) return '刑'
  if (line.endsWith('相害')) return '害'
  if (line.endsWith('相破')) return '破'
  return undefined
}

/** Whether `flow` 天克地冲 `natal`: one stem controls the other and the branches clash. */
function tianKeDiChong(flow: string, natal: string): boolean {
  const a = elementOf(flow.charAt(0))!
  const b = elementOf(natal.charAt(0))!
  return (controls(a, b) || controls(b, a)) && clashes(flow.charAt(1), natal.charAt(1))
}

/**
 * Scores the flowing `day` and `hour` pillars for `event` against `natal` by
 * {@link BAZI_WEIGHTS} and {@link BAZI_EVENT_RULES}. Vetoes, in this order: the day pillar,
 * then the hour pillar, 天克地冲 the natal day pillar; for 婚姻, the day or the hour branch
 * clashes the natal day branch (the spouse palace).
 */
export function scoreBazi(
  event: TimingEvent,
  natal: BaziNatalFacts,
  day: string,
  hour: string,
): SystemScore {
  const w = BAZI_WEIGHTS
  const base = natalBase(natal.pillars)
  const dayMaster = base.dayGan
  const rules = BAZI_EVENT_RULES[event]
  const favour = event === '婚姻' ? SPOUSE[natal.gender] : rules.favour
  const tally = new Tally()

  const roleOf = (element: string) =>
    element === natal.yong
      ? (['yong', '用神'] as const)
      : natal.xi.includes(element)
        ? (['xi', '喜神'] as const)
        : natal.ji.includes(element)
          ? (['ji', '忌神'] as const)
          : undefined
  const chars = [
    ['时干', hour.charAt(0), w.position.hourStem],
    ['时支', hour.charAt(1), w.position.hourBranch],
    ['流日干', day.charAt(0), w.position.dayStem],
    ['流日支', day.charAt(1), w.position.dayBranch],
  ] as const
  for (const [label, char, factor] of chars) {
    const element = elementOf(char)!
    const role = roleOf(element)
    if (role !== undefined)
      tally.add(w.element[role[0]] * factor, `${label}${char}${element}为${role[1]}`)
    const god = label.endsWith('干') ? shiShen(dayMaster, char) : zhiShiShen(dayMaster, char)
    if (favour.includes(god)) tally.add(w.tenGod.favour * factor, `${label}${god}（合事）`)
    else if (rules.avoid.includes(god)) tally.add(w.tenGod.avoid * factor, `${label}${god}（犯忌）`)
  }

  const pillars = [
    ['时', hour, w.pillar.hour, w.relationPillar.hour, '时支'],
    ['日', day, w.pillar.day, w.relationPillar.day, '流日支'],
  ] as const
  const natalDay = natal.pillars[2]
  for (const [label, ganZhi, factor, relationFactor, branchLabel] of pillars) {
    const stars = starsFor(base, ganZhi, 'flow')
    for (const star of rules.stars.filter((s) => stars.includes(s))) {
      tally.add(w.star * factor, `${label}逢${star}`)
    }
    for (const star of BLESSINGS.filter((s) => stars.includes(s))) {
      tally.add(w.blessing * factor, `${label}逢${star}`)
    }
    if (label === '时' && stars.includes('空亡')) tally.add(w.void, '时支空亡')
    const lines = flowRelations([natalDay], [ganZhi])
    for (const line of lines.zhi) {
      const kind = relationKind(line)
      if (kind === undefined) continue
      tally.add(
        w.relation[kind]! * relationFactor,
        `${branchLabel}${ganZhi.charAt(1)}${kind}日支${natalDay.charAt(1)}`,
      )
    }
    if (lines.gan.some((line) => line.endsWith('冲'))) {
      tally.add(w.stemClash * factor, `${label}干${ganZhi.charAt(0)}冲日主${dayMaster}`)
    }
  }

  return tally.result(baziVeto(event, natalDay, day, hour))
}

/** First veto that applies, or `undefined`; see {@link scoreBazi}. */
function baziVeto(
  event: TimingEvent,
  natalDay: string,
  day: string,
  hour: string,
): string | undefined {
  if (tianKeDiChong(day, natalDay)) return `流日${day}天克地冲日柱${natalDay}`
  if (tianKeDiChong(hour, natalDay)) return `时柱${hour}天克地冲日柱${natalDay}`
  if (event === '婚姻') {
    const palace = natalDay.charAt(1)
    if (clashes(day.charAt(1), palace)) return `流日支${day.charAt(1)}冲日支${palace}（夫妻宫）`
    if (clashes(hour.charAt(1), palace)) return `时支${hour.charAt(1)}冲日支${palace}（夫妻宫）`
  }
  return undefined
}
