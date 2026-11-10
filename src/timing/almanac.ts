/**
 * 黄历 (almanac) timing score of one period: the day's 宜/忌 matched to the matter, 建除十二神,
 * the 黄道/黑道 day and hour gods, the hour's 宜/忌, and 冲煞 against the natal year branch.
 * Calendar facts come from lunar-typescript; scoring is a pure function of those facts.
 */
import { Solar } from 'lunar-typescript'
import { type CivilTime, partsOf } from '../bazi/civil-time.ts'
import { ZHI } from '../bazi/ganzhi.ts'
import { type SystemScore, Tally, type TimingEvent } from './types.ts'

/** Calendar facts of one moment that the almanac score reads. */
export interface AlmanacFacts {
  /** Day pillar, as in 庚寅. */
  readonly dayGanZhi: string
  /** Day 宜 terms as the calendar writes them (纳财, 嫁娶 …). */
  readonly dayYi: readonly string[]
  /** Day 忌 terms. */
  readonly dayJi: readonly string[]
  /** Hour 宜 terms (求财, 见贵 …). */
  readonly hourYi: readonly string[]
  /** Hour 忌 terms. */
  readonly hourJi: readonly string[]
  /** 建除十二神 of the day: 建 除 满 平 定 执 破 危 成 收 开 闭. */
  readonly jianChu: string
  /** Day god (天神) of the twelve, as in 青龙. */
  readonly dayGod: string
  /** 黄道 or 黑道 of the day god. */
  readonly dayGodType: string
  /** Hour god of the twelve. */
  readonly hourGod: string
  /** 黄道 or 黑道 of the hour god. */
  readonly hourGodType: string
  /** Branch of the hour. */
  readonly hourZhi: string
}

/**
 * Calendar terms of each matter. `day` terms are matched against the day's 宜 (bonus) and 忌
 * (veto); `hour` terms against the hour's 宜 (bonus) and 忌 (penalty). The calendar writes
 * 上官赴任 as 赴任 and has no 拜访, so 谒贵 reads 会亲友 by day and 见贵 by hour; 词讼 only
 * ever appears in a day's 忌, so a lawsuit is ruled by that avoidance alone.
 */
export const ALMANAC_TERMS: Readonly<
  Record<TimingEvent, { readonly day: readonly string[]; readonly hour: readonly string[] }>
> = {
  求财: { day: ['纳财', '开市', '交易', '立券'], hour: ['求财', '开市', '交易'] },
  求官: { day: ['赴任'], hour: ['赴任', '见贵'] },
  谋事: { day: ['祈福', '立券', '会亲友'], hour: ['祈福'] },
  出行: { day: ['出行'], hour: ['出行'] },
  婚姻: { day: ['嫁娶', '纳采', '订盟'], hour: ['嫁娶', '订婚'] },
  疾病: { day: ['求医', '治病'], hour: [] },
  诉讼: { day: ['词讼'], hour: ['词讼'] },
  谒贵: { day: ['会亲友'], hour: ['见贵'] },
  考试: { day: ['入学'], hour: [] },
}

/**
 * Every weight of the almanac score.
 *
 * - `dayYi` / `hourYi`: a matter term in the day's or the hour's 宜 (counted once each).
 * - `hourJi`: a matter term in the hour's 忌.
 * - `jianChu`: 建除 by the rhyme 建满平收黑，除危定执黄，成开皆可用，闭破不相当.
 * - `eventJianChu`: matter-specific 建除 additions (开/收 for wealth, 除 for illness, 成/定
 *   for marriage, 开 for office, 危 against travel).
 * - `dayGod` / `hourGod`: 黄道 and 黑道 day and hour gods.
 * - `hourClash`: the hour branch clashes the natal year branch.
 */
export const ALMANAC_WEIGHTS = {
  dayYi: 2,
  hourYi: 1,
  hourJi: -1,
  jianChu: {
    除: 1,
    危: 1,
    定: 1,
    执: 1,
    成: 1,
    开: 1,
    建: -0.5,
    满: -0.5,
    平: -0.5,
    收: -0.5,
    破: -1.5,
    闭: -1.5,
  } as Readonly<Record<string, number>>,
  eventJianChu: {
    求财: { 开: 0.5, 收: 0.5 },
    求官: { 开: 0.5 },
    疾病: { 除: 1 },
    婚姻: { 成: 0.5, 定: 0.5 },
    出行: { 危: -0.5 },
  } as Readonly<Partial<Record<TimingEvent, Readonly<Record<string, number>>>>>,
  dayGod: { 黄道: 1.5, 黑道: -1.5 } as Readonly<Record<string, number>>,
  hourGod: { 黄道: 1, 黑道: -1 } as Readonly<Record<string, number>>,
  hourClash: -1,
} as const

/** Matters for which a 破日 is a veto. */
const PO_VETO: ReadonlySet<TimingEvent> = new Set(['婚姻', '求财', '求官'])
/** Calendar marker that a day suits nothing. */
const NOTHING = '诸事不宜'
const ZODIAC = '鼠牛虎兔龙蛇马羊猴鸡狗猪'

const clashes = (a: string, b: string) => (ZHI.indexOf(a) - ZHI.indexOf(b) + 12) % 12 === 6

/** Calendar facts of the civil moment `moment` (read as given; apply true solar time before). */
export function almanacFacts(moment: CivilTime): AlmanacFacts {
  const p = partsOf(moment)
  const l = Solar.fromYmdHms(p.year, p.month, p.day, p.hour, p.minute, p.second).getLunar()
  return {
    dayGanZhi: l.getDayInGanZhi(),
    dayYi: l.getDayYi(),
    dayJi: l.getDayJi(),
    hourYi: l.getTimeYi(),
    hourJi: l.getTimeJi(),
    jianChu: l.getZhiXing(),
    dayGod: l.getDayTianShen(),
    dayGodType: l.getDayTianShenType(),
    hourGod: l.getTimeTianShen(),
    hourGodType: l.getTimeTianShenType(),
    hourZhi: l.getTimeZhi(),
  }
}

/**
 * Scores one period for `event` by {@link ALMANAC_WEIGHTS} and {@link ALMANAC_TERMS}. Vetoes,
 * checked in this order: the day is marked 诸事不宜; a matter term in the day's 忌; a 破日 for
 * 婚姻, 求财 or 求官; the day branch clashes `natalYearZhi` (the person's 生肖) when given.
 */
export function scoreAlmanac(
  event: TimingEvent,
  facts: AlmanacFacts,
  natalYearZhi?: string,
): SystemScore {
  const w = ALMANAC_WEIGHTS
  const terms = ALMANAC_TERMS[event]
  const tally = new Tally()
  const dayYi = terms.day.find((t) => facts.dayYi.includes(t))
  if (dayYi !== undefined) tally.add(w.dayYi, `日宜${dayYi}`)
  const hourYi = terms.hour.find((t) => facts.hourYi.includes(t))
  if (hourYi !== undefined) tally.add(w.hourYi, `时宜${hourYi}`)
  const hourJi = terms.hour.find((t) => facts.hourJi.includes(t))
  if (hourJi !== undefined) tally.add(w.hourJi, `时忌${hourJi}`)
  tally.add(
    (w.jianChu[facts.jianChu] ?? 0) + (w.eventJianChu[event]?.[facts.jianChu] ?? 0),
    `${facts.jianChu}日`,
  )
  tally.add(w.dayGod[facts.dayGodType] ?? 0, `日神${facts.dayGod}（${facts.dayGodType}）`)
  tally.add(w.hourGod[facts.hourGodType] ?? 0, `时神${facts.hourGod}（${facts.hourGodType}）`)
  if (natalYearZhi !== undefined && clashes(facts.hourZhi, natalYearZhi)) {
    tally.add(w.hourClash, `时冲生肖${ZODIAC.charAt(ZHI.indexOf(natalYearZhi))}`)
  }
  return tally.result(almanacVeto(event, facts, natalYearZhi))
}

/** First veto that applies, or `undefined`; see {@link scoreAlmanac}. */
function almanacVeto(
  event: TimingEvent,
  facts: AlmanacFacts,
  natalYearZhi: string | undefined,
): string | undefined {
  if (facts.dayJi.includes(NOTHING) || facts.dayYi.includes(NOTHING)) return NOTHING
  const ji = ALMANAC_TERMS[event].day.find((t) => facts.dayJi.includes(t))
  if (ji !== undefined) return `日忌${ji}`
  if (facts.jianChu === '破' && PO_VETO.has(event)) return '破日'
  const dayZhi = facts.dayGanZhi.charAt(1)
  if (natalYearZhi !== undefined && clashes(dayZhi, natalYearZhi)) {
    return `日支${dayZhi}冲生肖${ZODIAC.charAt(ZHI.indexOf(natalYearZhi))}`
  }
  return undefined
}
