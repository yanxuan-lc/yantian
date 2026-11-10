/** Natal BaZi chart: four pillars, palaces, relations, shen-sha, luck and the flow timeline. */
import { type EightChar, LunarYear, Solar } from 'lunar-typescript'
import { ChartInputError } from '../errors.ts'
import { DEFAULT_MERIDIAN, lookupCity } from './cities.ts'
import {
  addMinutes,
  type CivilTime,
  formatMinute,
  formatSecond,
  parseCivil,
  partsOf,
  trueSolarTime,
} from './civil-time.ts'
import {
  elementOf,
  diShi as growthPhase,
  hideGan,
  jiaZi,
  jiaZiIndex,
  mingGong,
  naYin,
  seasonStates,
  shenGong,
  shiShen,
  taiXi,
  taiYuan,
  xunKong,
  yearPillar,
} from './ganzhi.ts'
import { JIE_NAMES } from './jie.ts'
import { natalRelations } from './relations.ts'
import type { BaziChart, LateZi, NatalPillar, Timeline } from './schema.ts'
import { natalBase, SHENSHA_RULE, starsFor } from './shensha.ts'

/** Birth facts for a natal chart. */
export interface NatalRequest {
  /** Display label; defaults to the clock time. */
  readonly label?: string
  /** Civil clock time of birth, `YYYY-MM-DD HH:MM`. */
  readonly birth: string
  /** Whether daylight saving time was in effect at birth. */
  readonly dst: boolean
  /** Birth city for true-solar-time correction; omitted means no longitude correction. */
  readonly city?: string
  /** Adds the equation of time to the longitude correction. */
  readonly apparentSolar: boolean
  /** Day pillar convention for births between 23:00 and 24:00. */
  readonly lateZi: LateZi
  /** Gender of the chart subject; luck periods are computed only when present. */
  readonly gender?: 'male' | 'female'
  /** Number of luck periods after the start of luck. */
  readonly luckSteps: number
}

/** Nominal years covered by the flow timeline. */
export const TIMELINE_YEARS = 100

/** Ten-god, hidden-stem and growth-phase facts of `ganZhi` relative to `dayGan`. */
export function relation(dayGan: string, ganZhi: string) {
  const stems = hideGan(ganZhi.charAt(1))
  return {
    ganShiShen: shiShen(dayGan, ganZhi.charAt(0)),
    hideGan: stems,
    zhiShiShen: stems.map((h) => shiShen(dayGan, h)),
    diShi: growthPhase(dayGan, ganZhi.charAt(1)),
  }
}

/** Display name, coordinates in degrees and civil reference meridian of a place. */
export interface Place {
  readonly name: string | null
  readonly longitude: number
  readonly meridian: number
  readonly latitude?: number
}

/** Resolves an optional city; no city means the 120° meridian with no correction. */
export function resolvePlace(city: string | undefined): Place {
  if (city === undefined) return { name: null, longitude: 120, meridian: DEFAULT_MERIDIAN }
  const hit = lookupCity(city)
  if (hit === undefined) {
    throw new ChartInputError(
      `city: unknown city "${city}"; use a common Chinese city name such as 北京 or 上海`,
    )
  }
  return {
    name: hit.name,
    longitude: hit.longitude,
    meridian: hit.meridian,
    latitude: hit.latitude,
  }
}

/** Parses a clock time, or throws a {@link ChartInputError} naming `field`. */
export function requireCivil(field: string, text: string): CivilTime {
  const t = parseCivil(text)
  if (t === undefined) {
    throw new ChartInputError(`${field}: expected YYYY-MM-DD HH:MM, got "${text}"`)
  }
  return t
}

/**
 * Builds the calendar's eight characters at a civil time. The library times solar terms in
 * Beijing time, so year and month pillars are meaningful at a Beijing-time instant and day
 * and hour pillars at true solar time. `lateZi: 'tomorrow'` advances the day pillar for
 * 23:00–24:00; the default keeps it on the current day.
 */
export function eightChar(t: CivilTime, lateZi: LateZi = 'today'): EightChar {
  const p = partsOf(t)
  const ec = Solar.fromYmdHms(p.year, p.month, p.day, p.hour, p.minute, p.second)
    .getLunar()
    .getEightChar()
  if (lateZi === 'tomorrow') ec.setSect(1)
  return ec
}

/**
 * Absolute instant of a civil clock time expressed as Beijing (UTC+8) civil time, the clock
 * on which the calendar library times solar terms: removes one hour when daylight saving
 * applied, then four minutes per degree that the civil `meridian` lies east of 120°.
 */
export function beijingInstant(clock: CivilTime, dst: boolean, meridian: number): CivilTime {
  return addMinutes(dst ? addMinutes(clock, -60) : clock, -(meridian - DEFAULT_MERIDIAN) * 4)
}

/** Year, month, day and hour pillars in that order. */
export type FourPillars = readonly [string, string, string, string]

/**
 * Four pillars of a moment: year and month from `term`, built at the absolute instant so the
 * solar terms (节) decide them; day and hour from `local`, built at true solar time.
 */
function pillarsOf(term: EightChar, local: EightChar): FourPillars {
  return [term.getYear(), term.getMonth(), local.getDay(), local.getTime()]
}

/**
 * Four pillars of a moment given its absolute instant in Beijing time and its true solar
 * time; `lateZi` applies to the day pillar.
 */
export function fourPillars(
  instant: CivilTime,
  solar: CivilTime,
  lateZi: LateZi = 'today',
): FourPillars {
  return pillarsOf(eightChar(instant), eightChar(solar, lateZi))
}

/** Clock time, absolute instant in Beijing time, true solar time and place of a birth. */
function birthTimes(request: NatalRequest): {
  clock: CivilTime
  instant: CivilTime
  solar: CivilTime
  place: Place
} {
  const clock = requireCivil('birth', request.birth)
  const place = resolvePlace(request.city)
  const solar = trueSolarTime(
    clock,
    place.longitude,
    request.dst,
    place.meridian,
    request.apparentSolar,
  )
  return { clock, instant: beijingInstant(clock, request.dst, place.meridian), solar, place }
}

/** Natal four pillars of a birth request; see {@link castNatal} for the rule. */
export function natalPillars(request: NatalRequest): FourPillars {
  const { instant, solar } = birthTimes(request)
  return fourPillars(instant, solar, request.lateZi)
}

const minute = (s: Solar) => s.toYmdHms().slice(0, 16)

/** Twelve 节 start times of each solar year from `firstYear`, for `years` years. */
function solarTerms(firstYear: number, years: number): string[] {
  const tables = new Map<number, Record<string, Solar>>()
  const table = (y: number) => {
    let t = tables.get(y)
    if (t === undefined) {
      t = Solar.fromYmd(y, 6, 1).getLunar().getJieQiTable()
      tables.set(y, t)
    }
    return t
  }
  const out: string[] = []
  for (let y = firstYear; y < firstYear + years; y++) {
    for (const name of JIE_NAMES.slice(0, 11)) out.push(minute(table(y)[name]!))
    out.push(minute(table(y + 1).小寒!))
  }
  return out
}

/** Lunar months whose first day falls inside the timeline, in date order. */
function lunarMonths(firstYear: number, years: number): Timeline['lunarMonths'] {
  const from = `${firstYear}-01-01`
  const to = `${firstYear + years + 1}-03-01`
  const byDay = new Map<string, [string, number, number]>()
  for (let y = firstYear - 1; y <= firstYear + years + 1; y++) {
    for (const m of LunarYear.fromYear(y).getMonths()) {
      const start = Solar.fromJulianDay(m.getFirstJulianDay()).toYmd()
      if (start >= from && start < to) byDay.set(start, [start, m.getMonth(), m.getDayCount()])
    }
  }
  return [...byDay.values()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
}

/** A luck period: stem-branch pair, calendar years and nominal ages, inclusive. */
interface LuckPeriod {
  readonly ganZhi: string
  readonly startYear: number
  readonly endYear: number
  readonly startAge: number
  readonly endAge: number
}

/**
 * Luck periods counted from the birth `solar` time. `start` is the delay until the first
 * luck period; period 0 is the pre-luck span from birth, and period `i` ≥ 1 is ten years
 * long and steps `i` places from `monthPillar` in the luck direction. Each period lists the
 * 小运 of its years, stepping from `hourPillar` one place per nominal year.
 */
function luckPeriods(
  solar: CivilTime,
  start: { years: number; months: number; days: number },
  forward: boolean,
  monthPillar: string,
  hourPillar: string,
  count: number,
): { startDate: Solar; periods: LuckPeriod[]; xiaoYun: Map<number, string> } {
  const p = partsOf(solar)
  const startDate = Solar.fromYmdHms(p.year, p.month, p.day, p.hour, p.minute, p.second)
    .nextYear(start.years)
    .nextMonth(start.months)
    .next(start.days)
  const sign = forward ? 1 : -1
  const birthYear = p.year
  const firstYear = startDate.getYear()
  const periods: LuckPeriod[] = []
  const xiaoYun = new Map<number, string>()
  for (let i = 0; i < count; i++) {
    const startYear = i === 0 ? birthYear : firstYear + (i - 1) * 10
    const endYear = i === 0 ? firstYear - 1 : startYear + 9
    const startAge = startYear - birthYear + 1
    periods.push({
      ganZhi: i === 0 ? '' : jiaZi(jiaZiIndex(monthPillar) + sign * i),
      startYear,
      endYear,
      startAge,
      endAge: endYear - birthYear + 1,
    })
    for (let year = startYear; year <= endYear; year++) {
      xiaoYun.set(year, jiaZi(jiaZiIndex(hourPillar) + sign * (year - birthYear + 1)))
    }
  }
  return { startDate, periods, xiaoYun }
}

/**
 * Casts a natal chart as of `now` (civil time; defaults to the current local time). Year and
 * month pillars, the birth solar terms and the luck direction and start follow the absolute
 * birth instant against solar terms timed in Beijing time; day and hour pillars follow true
 * solar time. Every per-pillar fact is read against the resulting pillars and day master.
 * Throws {@link ChartInputError} for an unparseable birth time or an unknown city.
 */
export function castNatal(request: NatalRequest, now: CivilTime = localNow()): BaziChart {
  const { clock, instant, solar, place } = birthTimes(request)
  const term = eightChar(instant)
  const values = pillarsOf(term, eightChar(solar, request.lateZi))
  const base = natalBase(values)
  const kong = xunKong(values[2])
  const positions = ['year', 'month', 'day', 'hour'] as const
  const pillar = (i: number): NatalPillar => {
    const ganZhi = values[i]!
    const gan = ganZhi.charAt(0)
    const zhi = ganZhi.charAt(1)
    const facts = relation(base.dayGan, ganZhi)
    return {
      ganZhi,
      gan,
      zhi,
      wuXing: elementOf(gan)! + elementOf(zhi)!,
      hideGan: facts.hideGan,
      ganShiShen: positions[i] === 'day' ? '日主' : facts.ganShiShen,
      zhiShiShen: facts.zhiShiShen,
      diShi: facts.diShi,
      ziZuo: growthPhase(gan, zhi),
      naYin: naYin(ganZhi),
      xunKong: xunKong(ganZhi),
      kongWang: kong.includes(zhi),
      shenSha: starsFor(base, ganZhi, positions[i]!),
    }
  }
  const palace = (ganZhi: string) => ({ ganZhi, naYin: naYin(ganZhi) })
  const [yearGan, monthZhi, hourZhi] = [base.yearGan, base.monthZhi, values[3].charAt(1)]
  const lunar = term.getLunar()
  const prev = lunar.getPrevJie()
  const next = lunar.getNextJie()
  const firstYear =
    values[0] === yearPillar(partsOf(solar).year) ? partsOf(solar).year : partsOf(solar).year - 1
  const nowEc = eightChar(now)
  const nowYear = partsOf(now).year
  const chart: BaziChart = {
    label: request.label ?? formatMinute(clock),
    input: {
      clockTime: formatMinute(clock),
      dst: request.dst,
      city: place.name,
      longitude: place.longitude,
      meridian: place.meridian,
      solarTime: request.apparentSolar ? 'apparent' : 'mean',
      lateZi: request.lateZi,
    },
    trueSolarTime: formatSecond(solar),
    birthTerm: {
      prev: { name: prev.getName(), time: minute(prev.getSolar()) },
      next: { name: next.getName(), time: minute(next.getSolar()) },
    },
    pillars: { year: pillar(0), month: pillar(1), day: pillar(2), hour: pillar(3) },
    palaces: {
      taiYuan: palace(taiYuan(values[1])),
      taiXi: palace(taiXi(values[2])),
      mingGong: palace(mingGong(yearGan, monthZhi, hourZhi)),
      shenGong: palace(shenGong(yearGan, monthZhi, hourZhi)),
    },
    relations: natalRelations(values),
    seasons: seasonStates(base.monthZhi),
    shenShaRule: SHENSHA_RULE,
    now: {
      date: formatMinute(now).slice(0, 10),
      year: nowEc.getYear(),
      month: nowEc.getMonth(),
      day: nowEc.getDay(),
    },
  }
  let xiaoYun = new Map<number, string>()
  if (request.gender !== undefined) {
    const yun = term.getYun(request.gender === 'male' ? 1 : 0)
    const start = {
      years: yun.getStartYear(),
      months: yun.getStartMonth(),
      days: yun.getStartDay(),
    }
    const luck = luckPeriods(
      solar,
      start,
      yun.isForward(),
      values[1],
      values[3],
      Math.max(request.luckSteps, 11) + 1,
    )
    xiaoYun = luck.xiaoYun
    const pre = luck.periods[0]!
    const steps = luck.periods.slice(1, request.luckSteps + 1).map((d) => ({
      ...d,
      ...relation(base.dayGan, d.ganZhi),
    }))
    chart.luck = {
      gender: request.gender,
      forward: yun.isForward(),
      start: { ...start, date: luck.startDate.toYmd() },
      preLuck: {
        startYear: pre.startYear,
        endYear: pre.endYear,
        startAge: pre.startAge,
        endAge: pre.endAge,
      },
      steps,
    }
    const current = steps.find((s) => s.startYear <= nowYear && nowYear <= s.endYear)
    if (current !== undefined) chart.now = { ...chart.now, luck: current.ganZhi }
  }
  chart.timeline = {
    firstYear,
    years: Array.from({ length: TIMELINE_YEARS }, (_, i) => ({
      year: firstYear + i,
      age: i + 1,
      xiaoYun: xiaoYun.get(firstYear + i) ?? '',
    })),
    terms: solarTerms(firstYear, TIMELINE_YEARS),
    lunarMonths: lunarMonths(firstYear, TIMELINE_YEARS),
  }
  return chart
}

/** Current local wall-clock time as a civil time. */
function localNow(): CivilTime {
  const d = new Date()
  return (
    (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()) || 0) * 1000
  )
}
