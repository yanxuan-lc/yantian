/**
 * Saved Western astrology results. Keys are English; values keep the Chinese names of
 * signs, planets, aspects and sect used by the traditional chart. The same schema validates
 * the widget snapshot in the backend and in the browser.
 */
import { z } from 'zod'
import { ClockTimeSchema } from '../bazi/schema.ts'

/** Zodiac signs from 白羊 (Aries) to 双鱼 (Pisces). */
export const SignSchema = z.enum([
  '白羊',
  '金牛',
  '双子',
  '巨蟹',
  '狮子',
  '处女',
  '天秤',
  '天蝎',
  '射手',
  '摩羯',
  '水瓶',
  '双鱼',
])
/** A zodiac sign. */
export type Sign = z.infer<typeof SignSchema>

/** The seven traditional planets. */
export const PlanetNameSchema = z.enum(['太阳', '月亮', '水星', '金星', '火星', '木星', '土星'])
/** A traditional planet. */
export type PlanetName = z.infer<typeof PlanetNameSchema>

/** Major aspects: conjunction, sextile, square, trine, opposition. */
export const AspectTypeSchema = z.enum(['合', '六合', '刑', '拱', '冲'])
/** A major aspect. */
export type AspectType = z.infer<typeof AspectTypeSchema>

/** Day (昼) or night (夜). */
export const SectSchema = z.enum(['昼', '夜'])

/** A point on the ecliptic: longitude in [0, 360), its sign and degree within the sign in [0, 30). */
const PointSchema = z
  .object({
    longitude: z.number().min(0).lt(360),
    sign: SignSchema,
    degree: z.number().min(0).lt(30),
  })
  .strict()

/** One planet of the chart. */
export const PlanetSchema = PointSchema.extend({
  name: PlanetNameSchema,
  /** Whole-sign house, 1–12. */
  house: z.number().int().min(1).max(12),
  retrograde: z.boolean(),
  /** Apparent ecliptic longitude speed, degrees per day; negative when retrograde. */
  speed: z.number(),
}).strict()
/** One planet of the chart. */
export type Planet = z.infer<typeof PlanetSchema>

/** One major aspect between two planets. */
export const AspectSchema = z
  .object({
    a: PlanetNameSchema,
    b: PlanetNameSchema,
    type: AspectTypeSchema,
    /** Exact aspect angle in degrees. */
    angle: z.number(),
    /** Distance from the exact angle, degrees. */
    orb: z.number().min(0),
    /** Whether the orb is closing at the chart moment, judged from the two speeds. */
    applying: z.boolean(),
  })
  .strict()
/** One major aspect. */
export type Aspect = z.infer<typeof AspectSchema>

/** Planetary hour in effect at the chart moment; times are local `YYYY-MM-DD HH:MM`. */
export const PlanetaryHourSchema = z
  .object({
    /** Civil date whose sunrise starts the planetary day. */
    date: z.string(),
    /** Ruler of the weekday of `date`, which rules its first daytime hour. */
    dayRuler: PlanetNameSchema,
    hourRuler: PlanetNameSchema,
    period: SectSchema,
    /** Hour within the daytime or night-time period, 1–12. */
    index: z.number().int().min(1).max(12),
    /** 吉时 under Jupiter or Venus, 凶时 under Saturn or Mars, otherwise 平. */
    quality: z.enum(['吉时', '凶时', '平']),
    start: z.string(),
    end: z.string(),
    sunrise: z.string(),
    sunset: z.string(),
    /** Sunrise ending the night; `null` only when it does not occur (polar transition). */
    nextSunrise: z.string().nullable(),
    /** Length of one daytime hour, minutes. */
    dayHourMinutes: z.number(),
    /** Length of one night-time hour, minutes. */
    nightHourMinutes: z.number().nullable(),
  })
  .strict()
/** Planetary hour facts. */
export type PlanetaryHour = z.infer<typeof PlanetaryHourSchema>

/** A whole-sign moment or natal chart with its planetary hour. */
export const AstroChartSchema = z
  .object({
    label: z.string(),
    input: z
      .object({
        time: ClockTimeSchema,
        /** Hours east of UTC used to turn the civil time into UT. */
        utcOffset: z.number(),
        city: z.string().nullable(),
        latitude: z.number(),
        longitude: z.number(),
      })
      .strict(),
    /** Universal time of the chart, `YYYY-MM-DD HH:MM`. */
    ut: z.string(),
    /** Fixed conventions of the chart, stated in Chinese for the reader. */
    conventions: z
      .object({
        time: z.string(),
        houses: z.string(),
        planets: z.string(),
        rulers: z.string(),
        orbs: z.string(),
        sect: z.string(),
        ephemeris: z.string(),
      })
      .strict(),
    ascendant: PointSchema,
    midheaven: PointSchema,
    sect: SectSchema,
    /** True (unrefracted) altitude of the Sun's centre, degrees. */
    sunAltitude: z.number(),
    planets: z.array(PlanetSchema),
    /** The twelve whole-sign houses with their traditional rulers. */
    houses: z.array(
      z
        .object({
          house: z.number().int().min(1).max(12),
          sign: SignSchema,
          ruler: PlanetNameSchema,
        })
        .strict(),
    ),
    /** Part of Fortune: by day ASC + Moon − Sun, by night ASC + Sun − Moon. */
    fortune: PointSchema.extend({ house: z.number().int().min(1).max(12) }).strict(),
    aspects: z.array(AspectSchema),
    /** `null` when the Sun does not rise or set that day (polar day or night). */
    planetaryHour: PlanetaryHourSchema.nullable(),
  })
  .strict()
/** A whole-sign astrology chart. */
export type AstroChart = z.infer<typeof AstroChartSchema>
