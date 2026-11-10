/**
 * Saved two-person astrology results: synastry (比较盘) and the midpoint composite chart
 * (组合中点盘). Keys are English; values keep the Chinese names of the traditional chart.
 * The same schema validates the widget snapshot in the backend and in the browser.
 */
import { z } from 'zod'
import { AspectTypeSchema, AstroChartSchema, PlanetNameSchema, SignSchema } from './schema.ts'

/** The seven traditional planets plus the ascendant (上升) and midheaven (中天). */
export const BodyNameSchema = z.enum([
  '太阳',
  '月亮',
  '水星',
  '金星',
  '火星',
  '木星',
  '土星',
  '上升',
  '中天',
])
/** A planet or an angle compared between two charts. */
export type BodyName = z.infer<typeof BodyNameSchema>

/** A point on the ecliptic: longitude in [0, 360), its sign and degree within the sign. */
const PointSchema = z
  .object({
    longitude: z.number().min(0).lt(360),
    sign: SignSchema,
    degree: z.number().min(0).lt(30),
  })
  .strict()

const House = z.number().int().min(1).max(12)

/** One major aspect from a body of person A (`a`) to a body of person B (`b`). */
export const InterAspectSchema = z
  .object({
    a: BodyNameSchema,
    b: BodyNameSchema,
    type: AspectTypeSchema,
    /** Exact aspect angle in degrees. */
    angle: z.number(),
    /** Distance from the exact angle, degrees. */
    orb: z.number().min(0),
    /**
     * Whether the orb closes when both planets move at their natal daily speeds; `null` when
     * either body is an angle or both speeds are equal.
     */
    applying: z.boolean().nullable(),
  })
  .strict()
/** One inter-chart aspect. */
export type InterAspect = z.infer<typeof InterAspectSchema>

/** A body of one person placed in the other person's whole-sign house. */
export const OverlaySchema = z.object({ body: BodyNameSchema, house: House }).strict()
/** One house overlay. */
export type Overlay = z.infer<typeof OverlaySchema>

/** Themes of the key contacts, in reporting order. */
export const ContactThemeSchema = z.enum(['日月', '金火', '土星', '上升'])
/** A key-contact theme. */
export type ContactTheme = z.infer<typeof ContactThemeSchema>

/** One key inter-aspect with its traditional tone and weight. */
export const ContactSchema = z
  .object({
    a: BodyNameSchema,
    b: BodyNameSchema,
    type: AspectTypeSchema,
    orb: z.number().min(0),
    theme: ContactThemeSchema,
    tone: z.enum(['和谐', '挑战']),
    /** Weight added to the tally of its tone. */
    weight: z.number().positive(),
  })
  .strict()
/** One key contact. */
export type Contact = z.infer<typeof ContactSchema>

/** Weighted sums and counts of harmonious and challenging key contacts. */
export const TallySchema = z
  .object({
    harmony: z.number().min(0),
    tension: z.number().min(0),
    harmonyCount: z.number().int().min(0),
    tensionCount: z.number().int().min(0),
  })
  .strict()
/** The harmony/tension tally. */
export type Tally = z.infer<typeof TallySchema>

/** A composite point; `ambiguous` marks a near-opposite pair resolved by the tie rule. */
const CompositePointSchema = PointSchema.extend({ ambiguous: z.boolean() }).strict()

/** One planet of the composite chart. */
export const CompositePlanetSchema = CompositePointSchema.extend({
  name: PlanetNameSchema,
  /** Whole-sign house counted from the composite ascendant, 1–12. */
  house: House,
}).strict()
/** One composite planet. */
export type CompositePlanet = z.infer<typeof CompositePlanetSchema>

/** One major aspect between two composite planets; composite points have no motion. */
export const CompositeAspectSchema = z
  .object({
    a: PlanetNameSchema,
    b: PlanetNameSchema,
    type: AspectTypeSchema,
    angle: z.number(),
    orb: z.number().min(0),
  })
  .strict()
/** One composite aspect. */
export type CompositeAspect = z.infer<typeof CompositeAspectSchema>

/** Midpoint composite chart with whole-sign houses from its ascendant. */
export const CompositeSchema = z
  .object({
    ascendant: CompositePointSchema,
    midheaven: CompositePointSchema,
    planets: z.array(CompositePlanetSchema),
    houses: z.array(z.object({ house: House, sign: SignSchema, ruler: PlanetNameSchema }).strict()),
    aspects: z.array(CompositeAspectSchema),
  })
  .strict()
/** A midpoint composite chart. */
export type Composite = z.infer<typeof CompositeSchema>

/** Synastry and composite of two natal charts. */
export const AstroSynastrySchema = z
  .object({
    label: z.string(),
    /** Person A's natal chart; its ascendant orients the inner ring of the bi-wheel. */
    a: AstroChartSchema,
    /** Person B's natal chart. */
    b: AstroChartSchema,
    /** Fixed conventions of the comparison, stated in Chinese for the reader. */
    conventions: z
      .object({
        bodies: z.string(),
        orbs: z.string(),
        applying: z.string(),
        overlays: z.string(),
        contacts: z.string(),
        weights: z.string(),
        composite: z.string(),
        angles: z.string(),
        ambiguity: z.string(),
      })
      .strict(),
    /** Every A body × B body pair within orb, A bodies in chart order, then B bodies. */
    interAspects: z.array(InterAspectSchema),
    overlays: z
      .object({
        /** A's bodies in B's whole-sign houses. */
        aInB: z.array(OverlaySchema),
        /** B's bodies in A's whole-sign houses. */
        bInA: z.array(OverlaySchema),
      })
      .strict(),
    contacts: z.array(ContactSchema),
    tally: TallySchema,
    composite: CompositeSchema,
  })
  .strict()
/** Synastry and composite result. */
export type AstroSynastry = z.infer<typeof AstroSynastrySchema>
