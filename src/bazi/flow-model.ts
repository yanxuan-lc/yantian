/**
 * Flowing pillars derived from a saved chart's timeline. Pure and calendar-library free, so
 * the browser derives any year, month, day or hour on demand from the frozen snapshot.
 */
import {
  dayPillar,
  diShi,
  hideGan,
  hourPillars,
  monthPillar,
  shiShen,
  yearPillar,
} from './ganzhi.ts'
import { JIE_NAMES } from './jie.ts'
import type { BaziChart, Timeline } from './schema.ts'
import { type NatalBase, natalBase, starsFor } from './shensha.ts'

/** One solar month of a flowing year. */
export interface FlowMonth {
  readonly index: number
  readonly ganZhi: string
  readonly term: string
  /** Start of the month, `YYYY-MM-DD HH:MM`. */
  readonly start: string
  /** Start of the next month, `YYYY-MM-DD HH:MM`. */
  readonly end: string
}

/** One civil day inside a solar month. */
export interface FlowDay {
  /** `YYYY-MM-DD`. */
  readonly date: string
  readonly ganZhi: string
  /** Lunar day label such as 初一 or 十五. */
  readonly lunarDay: string
  /** Lunar month label such as 十月 or 闰四月. */
  readonly lunarMonth: string
}

/** One two-hour period of a day. */
export interface FlowHour {
  /** Clock time the period starts, 23:00 for 子. */
  readonly start: string
  readonly ganZhi: string
}

/** Facts of one flowing pillar relative to the natal chart. */
export interface FlowColumn {
  readonly ganZhi: string
  readonly ganShiShen: string
  readonly hidden: ReadonlyArray<{ readonly gan: string; readonly shiShen: string }>
  readonly diShi: string
  readonly ziZuo: string
  readonly shenSha: readonly string[]
}

const DAY_MS = 86_400_000
const pad = (n: number) => String(n).padStart(2, '0')
const toDate = (ms: number) => {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}
const toMs = (date: string) =>
  Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)))

const LUNAR_DAYS = [
  '初一',
  '初二',
  '初三',
  '初四',
  '初五',
  '初六',
  '初七',
  '初八',
  '初九',
  '初十',
  '十一',
  '十二',
  '十三',
  '十四',
  '十五',
  '十六',
  '十七',
  '十八',
  '十九',
  '二十',
  '廿一',
  '廿二',
  '廿三',
  '廿四',
  '廿五',
  '廿六',
  '廿七',
  '廿八',
  '廿九',
  '三十',
] as const
const LUNAR_MONTHS = '正二三四五六七八九十冬腊'

/** Natal rule base of a chart. */
export function chartBase(chart: BaziChart): NatalBase {
  const p = chart.pillars
  return natalBase([p.year.ganZhi, p.month.ganZhi, p.day.ganZhi, p.hour.ganZhi])
}

/** Facts of a flowing pillar read against the natal chart. */
export function flowColumn(base: NatalBase, ganZhi: string): FlowColumn {
  const gan = ganZhi.charAt(0)
  const zhi = ganZhi.charAt(1)
  return {
    ganZhi,
    ganShiShen: shiShen(base.dayGan, gan),
    hidden: hideGan(zhi).map((g) => ({ gan: g, shiShen: shiShen(base.dayGan, g) })),
    diShi: diShi(base.dayGan, zhi),
    ziZuo: diShi(gan, zhi),
    shenSha: starsFor(base, ganZhi, 'flow'),
  }
}

/** Year pillar of a solar year. */
export function flowYear(year: number): string {
  return yearPillar(year)
}

/** The twelve solar months of `year`, from 立春; empty outside the timeline. */
export function flowMonths(timeline: Timeline, year: number): FlowMonth[] {
  const offset = (year - timeline.firstYear) * 12
  if (offset < 0 || offset + 12 > timeline.terms.length) return []
  const yearGan = yearPillar(year).charAt(0)
  return JIE_NAMES.map((term, i) => ({
    index: i,
    ganZhi: monthPillar(yearGan, i),
    term,
    start: timeline.terms[offset + i]!,
    end: timeline.terms[offset + i + 1] ?? `${year + 1}-02-04 00:00`,
  }))
}

/** Lunar month entry containing `date`, or `undefined` outside the timeline. */
function lunarMonthOf(
  timeline: Timeline,
  date: string,
): Timeline['lunarMonths'][number] | undefined {
  let lo = 0
  let hi = timeline.lunarMonths.length - 1
  let found: Timeline['lunarMonths'][number] | undefined
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const entry = timeline.lunarMonths[mid]!
    if (entry[0] <= date) {
      found = entry
      lo = mid + 1
    } else hi = mid - 1
  }
  return found
}

/** Civil days of a solar month: from the day its term falls on up to the next term's day. */
export function flowDays(timeline: Timeline, month: FlowMonth): FlowDay[] {
  const out: FlowDay[] = []
  for (let t = toMs(month.start); t < toMs(month.end); t += DAY_MS) {
    const date = toDate(t)
    const lunar = lunarMonthOf(timeline, date)
    const offset = lunar === undefined ? -1 : Math.round((t - toMs(lunar[0])) / DAY_MS)
    const m = lunar?.[1] ?? 0
    out.push({
      date,
      ganZhi: dayPillar(
        Number(date.slice(0, 4)),
        Number(date.slice(5, 7)),
        Number(date.slice(8, 10)),
      ),
      lunarDay: LUNAR_DAYS[offset] ?? '',
      lunarMonth: m === 0 ? '' : `${m < 0 ? '闰' : ''}${LUNAR_MONTHS.charAt(Math.abs(m) - 1)}月`,
    })
  }
  return out
}

/** The twelve two-hour periods of a day pillar, 子 (from 23:00 the evening before) to 亥. */
export function flowHours(dayGanZhi: string): FlowHour[] {
  return hourPillars(dayGanZhi.charAt(0)).map((ganZhi, i) => ({
    start: `${pad((23 + i * 2) % 24)}:00`,
    ganZhi,
  }))
}

/** Index of the month of `months` that contains the civil time `at` (`YYYY-MM-DD HH:MM`). */
export function monthIndexAt(months: readonly FlowMonth[], at: string): number {
  return months.findIndex((m) => m.start <= at && at < m.end)
}

/** Solar year (from 立春) that contains the civil time `at`. */
export function solarYearAt(timeline: Timeline, at: string): number {
  const year = Number(at.slice(0, 4))
  const offset = (year - timeline.firstYear) * 12
  const liChun = timeline.terms[offset]
  return liChun !== undefined && at < liChun ? year - 1 : year
}
