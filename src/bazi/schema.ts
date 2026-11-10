/**
 * Saved BaZi results. Keys are English; values keep the Chinese domain terms
 * (干支, 十神, 纳音 …) exactly as the calendar computes them. The same schemas
 * validate the widget snapshot in the backend and in the browser.
 */
import { z } from 'zod'

/** Clock time as `YYYY-MM-DD HH:MM` in the birthplace's civil time. */
export const ClockTimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/, 'expected YYYY-MM-DD HH:MM')

/** How the late Zi hour (23:00–24:00) assigns the day pillar. */
export const LateZiSchema = z.enum(['today', 'tomorrow'])
/** Late Zi convention: `today` keeps the current day pillar, `tomorrow` advances it. */
export type LateZi = z.infer<typeof LateZiSchema>

/** Mean solar time (longitude only) or apparent solar time (adds the equation of time). */
export const SolarTimeSchema = z.enum(['mean', 'apparent'])

/** Ten-god, hidden-stem and growth-phase facts of one pillar relative to the day master. */
export const PillarRelationSchema = z
  .object({
    ganShiShen: z.string(),
    hideGan: z.array(z.string()),
    zhiShiShen: z.array(z.string()),
    diShi: z.string(),
  })
  .strict()

/** One natal pillar with every derived fact the chart shows. */
export const NatalPillarSchema = z
  .object({
    ganZhi: z.string(),
    gan: z.string(),
    zhi: z.string(),
    wuXing: z.string(),
    hideGan: z.array(z.string()),
    ganShiShen: z.string(),
    zhiShiShen: z.array(z.string()),
    diShi: z.string(),
    /** Growth phase of the pillar's own stem in its own branch (自坐). */
    ziZuo: z.string(),
    naYin: z.string(),
    /** Void branches of this pillar's own ten-day decade. */
    xunKong: z.string(),
    /** Whether this branch is void under the day pillar's decade. */
    kongWang: z.boolean(),
    shenSha: z.array(z.string()),
  })
  .strict()
/** One natal pillar. */
export type NatalPillar = z.infer<typeof NatalPillarSchema>

const GanZhiNaYinSchema = z.object({ ganZhi: z.string(), naYin: z.string() }).strict()

/** One ten-year luck period. Ages are nominal (虚岁). */
export const LuckStepSchema = z
  .object({
    ganZhi: z.string(),
    startYear: z.number().int(),
    endYear: z.number().int(),
    startAge: z.number().int(),
    endAge: z.number().int(),
  })
  .extend(PillarRelationSchema.shape)
  .strict()

/** Luck periods, present only when the chart request names a gender. */
export const LuckSchema = z
  .object({
    gender: z.enum(['male', 'female']),
    forward: z.boolean(),
    start: z
      .object({
        years: z.number().int(),
        months: z.number().int(),
        days: z.number().int(),
        date: z.string(),
      })
      .strict(),
    /** Years before the first luck period, read through 小运. */
    preLuck: z
      .object({
        startYear: z.number().int(),
        endYear: z.number().int(),
        startAge: z.number().int(),
        endAge: z.number().int(),
      })
      .strict(),
    steps: z.array(LuckStepSchema),
  })
  .strict()

const TermSchema = z.object({ name: z.string(), time: z.string() }).strict()

/**
 * Calendar data for 100 nominal years from the birth year, enough for the browser to derive
 * every flowing year, month, day and hour pillar without the calendar library.
 */
export const TimelineSchema = z
  .object({
    /** Solar year (from 立春) containing the birth. */
    firstYear: z.number().int(),
    /** One row per solar year: nominal age and the 小运 pillar of that year. */
    years: z.array(
      z.object({ year: z.number().int(), age: z.number().int(), xiaoYun: z.string() }).strict(),
    ),
    /** Start of each solar month, `YYYY-MM-DD HH:MM`, twelve per year from 立春 of `firstYear`. */
    terms: z.array(z.string()),
    /** Lunar months in order: first day `YYYY-MM-DD`, month number (negative when leap), length. */
    lunarMonths: z.array(z.tuple([z.string(), z.number().int(), z.number().int()])),
  })
  .strict()
/** Calendar data behind the flow view. */
export type Timeline = z.infer<typeof TimelineSchema>

/** Flowing pillars in effect when the chart was cast. */
export const NowSchema = z
  .object({
    date: z.string(),
    luck: z.string().optional(),
    year: z.string(),
    month: z.string(),
    day: z.string(),
  })
  .strict()

/** A complete natal BaZi chart. */
export const BaziChartSchema = z
  .object({
    label: z.string(),
    input: z
      .object({
        clockTime: ClockTimeSchema,
        dst: z.boolean(),
        city: z.string().nullable(),
        longitude: z.number(),
        meridian: z.number(),
        solarTime: SolarTimeSchema,
        lateZi: LateZiSchema,
      })
      .strict(),
    trueSolarTime: z.string(),
    /** Solar terms (节) around the birth. */
    birthTerm: z.object({ prev: TermSchema, next: TermSchema }).strict(),
    pillars: z
      .object({
        year: NatalPillarSchema,
        month: NatalPillarSchema,
        day: NatalPillarSchema,
        hour: NatalPillarSchema,
      })
      .strict(),
    palaces: z
      .object({
        taiYuan: GanZhiNaYinSchema,
        taiXi: GanZhiNaYinSchema,
        mingGong: GanZhiNaYinSchema,
        shenGong: GanZhiNaYinSchema,
      })
      .strict(),
    /** Stem and branch relations among the natal pillars. */
    relations: z.object({ gan: z.array(z.string()), zhi: z.array(z.string()) }).strict(),
    /** Seasonal strength of the five elements under the month branch, 旺 to 死. */
    seasons: z.array(z.object({ element: z.string(), state: z.string() }).strict()),
    shenShaRule: z.string(),
    luck: LuckSchema.optional(),
    now: NowSchema,
    /** Present in the widget snapshot only; the model reads the other facts. */
    timeline: TimelineSchema.optional(),
  })
  .strict()
/** A complete natal BaZi chart. */
export type BaziChart = z.infer<typeof BaziChartSchema>

/** One flowing pillar; `detail` is present when the flow is read against a natal chart. */
export const FlowPillarSchema = z
  .object({
    ganZhi: z.string(),
    detail: PillarRelationSchema.extend({ shenSha: z.array(z.string()) })
      .strict()
      .optional(),
  })
  .strict()

/** Flowing pillars for every two-hour period (时辰) in a time range. */
export const BaziFlowSchema = z
  .object({
    label: z.string(),
    range: z.object({ start: z.string(), end: z.string() }).strict(),
    city: z.string().nullable(),
    trueSolar: z.boolean(),
    natal: z.object({ dayMaster: z.string(), pillars: z.string() }).strict().optional(),
    shenShaRule: z.string().optional(),
    entries: z.array(
      z
        .object({
          start: z.string(),
          end: z.string(),
          moment: z.string(),
          pillars: z
            .object({
              year: FlowPillarSchema,
              month: FlowPillarSchema,
              day: FlowPillarSchema,
              hour: FlowPillarSchema,
            })
            .strict(),
        })
        .strict(),
    ),
  })
  .strict()
/** Flowing pillars over a time range. */
export type BaziFlow = z.infer<typeof BaziFlowSchema>
