/**
 * Saved timing scan (择时). Keys are English; reasons, vetoes and domain values are Chinese.
 * Reason and veto texts live once in `notes` and cells refer to them by index, which keeps a
 * 31-day scan compact. The same schema validates the widget snapshot in the backend and in
 * the browser.
 */
import { z } from 'zod'
import { ClockTimeSchema } from '../bazi/schema.ts'
import { QimenEventSchema } from '../qimen/schema.ts'
import { TIMING_SYSTEMS } from './types.ts'

/** One selection system. */
export const TimingSystemSchema = z.enum(TIMING_SYSTEMS)

/** One system's verdict on one period. */
export const TimingCellScoreSchema = z
  .object({
    /** Raw score on the system's own scale; comparable only within the system and scan. */
    score: z.number(),
    /** Percentile among the periods no system vetoes, 0–100; `null` when the period is vetoed. */
    pct: z.number().min(0).max(100).nullable(),
    /** Index into `notes` of the veto this system raises. */
    veto: z.number().int().min(0).optional(),
    /** Indices into `notes` of the scored facts. */
    reasons: z.array(z.number().int().min(0)),
  })
  .strict()
/** One system's verdict on one period. */
export type TimingCellScore = z.infer<typeof TimingCellScoreSchema>

/** One two-hour period (时辰) of the grid. */
export const TimingCellSchema = z
  .object({
    /**
     * Clock start of the period, `YYYY-MM-DD HH:MM`, rounded to the minute. With a city the
     * period is a true-solar 时辰, so its clock span is shifted by the longitude correction.
     */
    start: ClockTimeSchema,
    /** Clock end of the period, exclusive, rounded to the minute; two hours after `start`. */
    end: ClockTimeSchema,
    /** Row: index into `days`. */
    day: z.number().int().min(0),
    /** Column: branch index of the 时辰, 0 = 子 (23:00–01:00 on the grid's clock) to 11 = 亥. */
    col: z.number().int().min(0).max(11),
    /** Hour pillar of the period's moment. */
    hour: z.string(),
    /** Whether any system vetoes the period. */
    vetoed: z.boolean(),
    /** Mean percentile of the present systems; `null` when vetoed. */
    combined: z.number().min(0).max(100).nullable(),
    /** Number of systems at or above the 70th percentile. */
    consensus: z.number().int().min(0).max(4),
    scores: z
      .object({
        almanac: TimingCellScoreSchema.optional(),
        qimen: TimingCellScoreSchema.optional(),
        astro: TimingCellScoreSchema.optional(),
        bazi: TimingCellScoreSchema.optional(),
      })
      .strict(),
  })
  .strict()
/** One period of the grid. */
export type TimingCell = z.infer<typeof TimingCellSchema>

/** A complete timing scan over a window of at most 31 days. */
export const TimingScanSchema = z
  .object({
    label: z.string(),
    event: QimenEventSchema,
    range: z.object({ start: ClockTimeSchema, end: ClockTimeSchema }).strict(),
    /** Event city; `null` means clock time and, for the astrology chart, 北京. */
    city: z.string().nullable(),
    /** Whether 黄历, 奇门 and 八字 read true solar time at the city. */
    trueSolar: z.boolean(),
    /** Natal person the BaZi system reads; `null` when none was given. */
    natal: z
      .object({
        pillars: z.string(),
        dayMaster: z.string(),
        /** Year branch with its 生肖, as in 午（马）. */
        zodiac: z.string(),
        gender: z.enum(['male', 'female']),
        yong: z.string(),
        xi: z.array(z.string()),
        ji: z.array(z.string()),
      })
      .strict()
      .nullable(),
    /** Systems combined, in display order; 八字 only with a natal person. */
    systems: z.array(TimingSystemSchema).min(1),
    /** Conventions of the scan, stated in Chinese for the reader. */
    conventions: z
      .object({
        grid: z.string(),
        combine: z.string(),
        consensus: z.string(),
        astroPlace: z.string(),
      })
      .strict(),
    /** Grid rows: dates on the grid's clock (true solar with a city) with their day pillar. */
    days: z.array(z.object({ date: z.string(), ganZhi: z.string() }).strict()),
    /** Reason and veto texts referenced by index from the cells. */
    notes: z.array(z.string()),
    cells: z.array(TimingCellSchema),
    /** Indices into `cells` of the top picks, best first. */
    top: z.array(z.number().int().min(0)).max(10),
    /** Number of periods each system vetoes. */
    vetoes: z
      .object({
        almanac: z.number().int().min(0).optional(),
        qimen: z.number().int().min(0).optional(),
        astro: z.number().int().min(0).optional(),
        bazi: z.number().int().min(0).optional(),
      })
      .strict(),
  })
  .strict()
/** A complete timing scan. */
export type TimingScan = z.infer<typeof TimingScanSchema>
