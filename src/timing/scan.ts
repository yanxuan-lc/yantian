/**
 * Event-based timing scan (择时): scores every two-hour period (时辰) of a window by 黄历,
 * 奇门, 星盘 and, with a natal person, 八字, then combines the systems by percentile rank.
 * Raw scores are never added across systems; see `combine.ts`.
 */
import { castAstro } from '../astro/chart.ts'
import { addMinutes, type CivilTime, formatMinute, partsOf } from '../bazi/civil-time.ts'
import { periods } from '../bazi/flow.ts'
import { dayPillar, ZHI } from '../bazi/ganzhi.ts'
import {
  beijingInstant,
  fourPillars,
  type NatalRequest,
  type Place,
  requireCivil,
  resolvePlace,
} from '../bazi/natal.ts'
import { ChartInputError } from '../errors.ts'
import { castQimen } from '../qimen/chart.ts'
import { almanacFacts, scoreAlmanac } from './almanac.ts'
import { scoreAstro } from './astro.ts'
import { type BaziNatalFacts, baziNatalFacts, scoreBazi } from './bazi.ts'
import { CONSENSUS_AT, rankPeriods } from './combine.ts'
import { scoreQimen } from './qimen.ts'
import type { TimingCellScore, TimingScan } from './schema.ts'
import type { SystemScore, TimingEvent, TimingSystem } from './types.ts'

/** Longest window one scan may cover, in days from start to end. */
export const MAX_TIMING_DAYS = 31
/** Default and largest number of top picks. */
export const TOP_PICKS = { default: 5, max: 10 } as const

/** A window to choose a time in for one matter. */
export interface TimingRequest {
  /** Display label; defaults to the matter and the window. */
  readonly label?: string
  readonly event: TimingEvent
  /** Window start, civil clock time `YYYY-MM-DD HH:MM`. */
  readonly start: string
  /** Window end, inclusive, civil clock time; at most {@link MAX_TIMING_DAYS} days after start. */
  readonly end: string
  /** Event city: true solar time for 黄历, 奇门 and 八字, and the astrology chart's place. */
  readonly city?: string
  /** Natal person; adds the 八字 system. */
  readonly natal?: NatalRequest & { readonly gender: 'male' | 'female' }
  /** Number of top picks, 1–10; default 5. */
  readonly top?: number
}

/** Grid convention: clock 时辰 without a city, true-solar 时辰 at the city with one. */
const gridConvention = (city: string | null) =>
  city === null
    ? '按钟表时每两小时一格（时辰），23:00–01:00 为次日子时、列在次日首格；各家均取该时辰中点起盘'
    : `按${city}真太阳时（经度差修正，不加均时差、不计夏令时）每两小时一格（时辰），每格注明对应钟表起止；真太阳时 23:00–01:00 为次日子时、列在次日首格；各家均取该时辰中点起盘`

const CONVENTIONS: Omit<TimingScan['conventions'], 'grid'> = {
  combine:
    '各家原始分量纲不同、从不相加：先在窗口内未被否决的时辰中把每家分数换成百分位名次，再对在场各家等权平均；任一家否决的时辰不参与排名',
  consensus: `共识＝百分位 ≥ ${CONSENSUS_AT} 的家数`,
  astroPlace: '星盘用民用钟表时与城市经纬度起盘（不用真太阳时），未给城市时取北京',
}

const ZODIAC = '鼠牛虎兔龙蛇马羊猴鸡狗猪'

/** Interns strings into a table and returns their indices. */
class Notes {
  readonly list: string[] = []
  private readonly index = new Map<string, number>()
  of(text: string): number {
    let i = this.index.get(text)
    if (i === undefined) {
      i = this.list.length
      this.list.push(text)
      this.index.set(text, i)
    }
    return i
  }
}

/**
 * Minutes that true solar time at `place` runs ahead of its civil clock: four per degree of
 * longitude east of the civil meridian, with neither the equation of time nor daylight saving;
 * 0 without a place, which keeps the grid on clock time.
 */
const solarOffset = (place: Place | undefined) =>
  place === undefined ? 0 : (place.longitude - place.meridian) * 4

/** Rounds a civil time to the nearest minute. */
const roundMinute = (t: CivilTime) => Math.round(t / 60_000_000) * 60_000_000

/**
 * Moments a period starting at true-solar `start` is read at: the true-solar midpoint, the
 * matching clock time rounded to the minute, and its absolute instant in Beijing time.
 */
function moments(start: CivilTime, place: Place | undefined, offset: number) {
  const solar = addMinutes(start, 60)
  const clock = roundMinute(addMinutes(solar, -offset))
  const instant = place === undefined ? clock : beijingInstant(clock, false, place.meridian)
  return { solar, clock, instant }
}

/**
 * Scans the window. With `city` the grid's 时辰 follow true solar time there (see
 * {@link solarOffset}); without one they follow the clock. Every period intersecting the
 * window is read at its midpoint: 黄历 and 八字 at that true-solar moment, 奇门 cast at the
 * matching clock time with `city` (which converts back to the same true solar time), 星盘 on
 * that clock time at the city (北京 without one). Each cell carries its clock span. Throws {@link ChartInputError} for unparseable times, an
 * end before the start, a window above {@link MAX_TIMING_DAYS} days, an unknown city, or a
 * top count outside 1–10.
 */
export function scanTiming(request: TimingRequest): TimingScan {
  const start = requireCivil('start', request.start)
  const end = requireCivil('end', request.end)
  if (end < start) throw new ChartInputError('end: must not be earlier than start')
  if (end - start > MAX_TIMING_DAYS * 86_400_000_000) {
    throw new ChartInputError(
      `end: the window may span at most ${MAX_TIMING_DAYS} days from start; split it into shorter windows`,
    )
  }
  const topN = request.top ?? TOP_PICKS.default
  if (!Number.isInteger(topN) || topN < 1 || topN > TOP_PICKS.max) {
    throw new ChartInputError(`top: expected an integer from 1 to ${TOP_PICKS.max}`)
  }
  const place = request.city === undefined ? undefined : resolvePlace(request.city)
  const natal = request.natal === undefined ? undefined : baziNatalFacts(request.natal)
  const systems: TimingSystem[] = ['almanac', 'qimen', 'astro', ...(natal ? ['bazi' as const] : [])]
  const event = request.event
  const natalYearZhi = natal?.pillars[0].charAt(1)

  const offset = solarOffset(place)
  const raw = periods(addMinutes(start, offset), addMinutes(end, offset)).map((period) => {
    const m = moments(period.start, place, offset)
    const [, , day, hour] = fourPillars(m.instant, m.solar)
    const time = formatMinute(m.clock)
    const scores: Partial<Record<TimingSystem, SystemScore>> = {
      almanac: scoreAlmanac(event, almanacFacts(m.solar), natalYearZhi),
      qimen: scoreQimen(castQimen({ time, event, city: request.city })),
      astro: scoreAstro(event, castAstro({ time, city: request.city })),
      ...(natal === undefined ? {} : { bazi: scoreBazi(event, natal, day, hour) }),
    }
    const row = partsOf(m.solar)
    return {
      start: formatMinute(roundMinute(addMinutes(period.start, -offset))),
      end: formatMinute(roundMinute(addMinutes(period.end, -offset))),
      date: formatMinute(m.solar).slice(0, 10),
      dayGanZhi: dayPillar(row.year, row.month, row.day),
      col: Math.floor(((partsOf(period.start).hour + 1) % 24) / 2),
      hour,
      scores,
    }
  })

  const ranked = rankPeriods(
    raw.map((r) => r.scores),
    systems,
    topN,
  )
  const notes = new Notes()
  const days: TimingScan['days'] = []
  const vetoes: TimingScan['vetoes'] = {}
  const cells = raw.map((r, i) => {
    if (days.at(-1)?.date !== r.date) days.push({ date: r.date, ganZhi: r.dayGanZhi })
    const p = ranked.periods[i]!
    const scores: Record<string, TimingCellScore> = {}
    for (const system of systems) {
      const s = r.scores[system]!
      if (s.veto !== undefined) vetoes[system] = (vetoes[system] ?? 0) + 1
      scores[system] = {
        score: s.score,
        pct: p.pct[system] ?? null,
        ...(s.veto === undefined ? {} : { veto: notes.of(s.veto) }),
        reasons: s.reasons.map((text) => notes.of(text)),
      }
    }
    return {
      start: r.start,
      end: r.end,
      day: days.length - 1,
      col: r.col,
      hour: r.hour,
      vetoed: p.vetoed,
      combined: p.combined,
      consensus: p.consensus,
      scores,
    }
  })

  return {
    label: request.label ?? `${event}择时 ${request.start} ~ ${request.end}`,
    event,
    range: { start: formatMinute(start), end: formatMinute(end) },
    city: place?.name ?? null,
    trueSolar: place !== undefined,
    natal: natal === undefined ? null : natalSummary(natal),
    systems,
    conventions: { grid: gridConvention(place?.name ?? null), ...CONVENTIONS },
    days,
    notes: notes.list,
    cells,
    top: ranked.top,
    vetoes,
  }
}

/** Saved natal facts of the scan. */
function natalSummary(natal: BaziNatalFacts): NonNullable<TimingScan['natal']> {
  const yearZhi = natal.pillars[0].charAt(1)
  return {
    pillars: natal.pillars.join(' '),
    dayMaster: natal.pillars[2].charAt(0),
    zodiac: `${yearZhi}（${ZODIAC.charAt(ZHI.indexOf(yearZhi))}）`,
    gender: natal.gender,
    yong: natal.yong,
    xi: [...natal.xi],
    ji: [...natal.ji],
  }
}
