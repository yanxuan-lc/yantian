/** Flowing pillars (流年/流月/流日/流时) for every two-hour period in a time range. */

import { ChartInputError } from '../errors.ts'
import {
  addMinutes,
  type CivilTime,
  civil,
  formatMinute,
  partsOf,
  trueSolarTime,
} from './civil-time.ts'
import {
  beijingInstant,
  fourPillars,
  type NatalRequest,
  natalPillars,
  relation,
  requireCivil,
  resolvePlace,
} from './natal.ts'
import type { BaziFlow } from './schema.ts'
import { natalBase, SHENSHA_RULE, starsFor } from './shensha.ts'

/** Longest span one flow may cover, in days, from start to end. */
export const MAX_FLOW_DAYS = 7

/** A time range to read, optionally against a natal chart. */
export interface FlowRequest {
  /** Display label; defaults to the range. */
  readonly label?: string
  /** Range start, civil clock time `YYYY-MM-DD HH:MM`. */
  readonly start: string
  /** Range end, inclusive, civil clock time `YYYY-MM-DD HH:MM`. */
  readonly end: string
  /** City for true-solar-time correction of each period; omitted means clock time. */
  readonly city?: string
  /** Adds the equation of time to the correction. */
  readonly apparentSolar: boolean
  /** Natal chart the flowing pillars are read against; adds ten gods and shen-sha. */
  readonly natal?: NatalRequest
}

/** One two-hour period: start, exclusive end and the representative moment. */
interface Period {
  readonly start: CivilTime
  readonly end: CivilTime
  readonly moment: CivilTime
}

/**
 * Two-hour periods intersecting `[start, end]`. Periods begin at odd hours and at 23:00.
 * The representative moment is the midpoint, except 23:30 for the Zi period so that the
 * moment stays on the current day.
 */
export function periods(start: CivilTime, end: CivilTime): Period[] {
  const p = partsOf(start)
  let cur: CivilTime
  if (p.hour === 23 || p.hour === 0) {
    cur = civil(p.year, p.month, p.day, 23)
    if (p.hour === 0) cur = addMinutes(cur, -24 * 60)
  } else {
    cur = civil(p.year, p.month, p.day, p.hour % 2 === 1 ? p.hour : p.hour - 1)
  }
  const out: Period[] = []
  while (cur <= end) {
    const next = addMinutes(cur, 120)
    const moment = addMinutes(cur, partsOf(cur).hour === 23 ? 30 : 60)
    if (next > start) out.push({ start: cur, end: next, moment })
    cur = next
  }
  return out
}

const KEYS = ['year', 'month', 'day', 'hour'] as const

/**
 * Computes the flow. Periods use clock time unless `city` is set; correction assumes no
 * daylight saving. With a city, each moment's year and month pillars follow its absolute
 * instant against solar terms timed in Beijing time, and its day and hour pillars follow true
 * solar time; a natal chart follows the same rule through {@link natalPillars}. Throws {@link ChartInputError} for unparseable times, an end before the
 * start, a span above {@link MAX_FLOW_DAYS} days, or an unknown city.
 */
export function castFlow(request: FlowRequest): BaziFlow {
  const start = requireCivil('start', request.start)
  const end = requireCivil('end', request.end)
  if (end < start) throw new ChartInputError('end: must not be earlier than start')
  const place = request.city === undefined ? undefined : resolvePlace(request.city)
  if (end - start > MAX_FLOW_DAYS * 86_400_000_000) {
    throw new ChartInputError(
      `end: the range may span at most seven days (${MAX_FLOW_DAYS} × 24 h) from start; split it into shorter ranges`,
    )
  }
  const list = periods(start, end)
  const natal = request.natal === undefined ? undefined : natalPillars(request.natal)
  const base = natal === undefined ? undefined : natalBase(natal)
  const dayGan = base?.dayGan
  const entries = list.map(({ start: s, end: e, moment }) => {
    const values =
      place === undefined
        ? fourPillars(moment, moment)
        : fourPillars(
            beijingInstant(moment, false, place.meridian),
            trueSolarTime(moment, place.longitude, false, place.meridian, request.apparentSolar),
          )
    const pillars = Object.fromEntries(
      KEYS.map((key, i) => {
        const ganZhi = values[i]!
        if (base === undefined || dayGan === undefined) return [key, { ganZhi }]
        return [
          key,
          {
            ganZhi,
            detail: {
              ...relation(dayGan, ganZhi),
              shenSha: starsFor(base, ganZhi, 'flow'),
            },
          },
        ]
      }),
    ) as BaziFlow['entries'][number]['pillars']
    return { start: formatMinute(s), end: formatMinute(e), moment: formatMinute(moment), pillars }
  })
  return {
    label: request.label ?? `${request.start} ~ ${request.end}`,
    range: { start: request.start, end: request.end },
    city: place?.name ?? null,
    trueSolar: place !== undefined,
    ...(natal === undefined
      ? {}
      : {
          natal: { dayMaster: natal[2].charAt(0), pillars: natal.join(' ') },
          shenShaRule: SHENSHA_RULE,
        }),
    entries,
  }
}
