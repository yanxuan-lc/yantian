/**
 * Saved two-person compatibility (八字合盘) results. Keys are English; values keep the Chinese
 * domain terms. The same schemas validate the widget snapshot in the backend and the browser.
 */
import { z } from 'zod'
import { ClockTimeSchema, NatalPillarSchema } from './schema.ts'

const ElementPickSchema = z.object({ element: z.string(), reason: z.string() }).strict()

/** Day-master strength and useful elements of one chart; see `analyzeStrength`. */
export const StrengthSchema = z
  .object({
    dayMaster: z.string(),
    dayElement: z.string(),
    roots: z.array(z.string()),
    elements: z.array(
      z
        .object({
          element: z.string(),
          role: z.enum(['比劫', '食伤', '财', '官杀', '印']),
          score: z.number(),
          percent: z.number(),
        })
        .strict(),
    ),
    tongLei: z.number(),
    yiLei: z.number(),
    verdict: z.enum(['身强', '身弱', '中和']),
    pattern: z
      .object({ name: z.enum(['普通', '从财', '从官杀', '从儿', '从强']), reason: z.string() })
      .strict(),
    yong: ElementPickSchema,
    xi: z.array(ElementPickSchema),
    ji: z.array(ElementPickSchema),
    tiaoHou: ElementPickSchema.nullable(),
    method: z.string(),
  })
  .strict()

/** Pillar positions in chart order. */
export const PILLAR_KEYS = ['year', 'month', 'day', 'hour'] as const
/** One pillar position. */
export type PillarKey = (typeof PILLAR_KEYS)[number]

/** A pillar of one person that a fact involves; `person` is 0 or 1 in input order. */
export const PillarRefSchema = z
  .object({ person: z.number().int().min(0).max(1), pillar: z.enum(PILLAR_KEYS) })
  .strict()
/** A pillar of one person. */
export type PillarRef = z.infer<typeof PillarRefSchema>

/** Fact categories in display order. */
export const COMPAT_CATEGORIES = [
  'spousePalace',
  'zodiac',
  'dayMaster',
  'elements',
  'useful',
  'spouseStar',
  'shenSha',
] as const
/** One fact category. */
export type CompatCategory = (typeof COMPAT_CATEGORIES)[number]

/** One compatibility fact with its tone, reason and score contribution. */
export const CompatFactSchema = z
  .object({
    category: z.enum(COMPAT_CATEGORIES),
    tone: z.enum(['吉', '平', '凶']),
    title: z.string(),
    reason: z.string(),
    /** Points added to (or taken from) the base score. */
    points: z.number(),
    pillars: z.array(PillarRefSchema),
  })
  .strict()
/** One compatibility fact. */
export type CompatFact = z.infer<typeof CompatFactSchema>

/** One person of the pair: birth facts as charted, the four pillars and the strength. */
export const CompatPersonSchema = z
  .object({
    label: z.string(),
    gender: z.enum(['male', 'female']),
    clockTime: ClockTimeSchema,
    city: z.string().nullable(),
    trueSolarTime: z.string(),
    pillars: z
      .object({
        year: NatalPillarSchema,
        month: NatalPillarSchema,
        day: NatalPillarSchema,
        hour: NatalPillarSchema,
      })
      .strict(),
    strength: StrengthSchema,
  })
  .strict()
/** One person of the pair. */
export type CompatPerson = z.infer<typeof CompatPersonSchema>

/** A complete compatibility reading of two charts. */
export const BaziCompatSchema = z
  .object({
    persons: z.array(CompatPersonSchema).length(2),
    /** Base score plus every fact's points, clamped to 0–100. */
    score: z.number().int().min(0).max(100),
    verdict: z.string(),
    facts: z.array(CompatFactSchema),
    /** How the score is formed, stated with every reading. */
    scoreRule: z.string(),
  })
  .strict()
/** A complete compatibility reading. */
export type BaziCompat = z.infer<typeof BaziCompatSchema>
