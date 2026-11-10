/**
 * Saved Qi Men Dun Jia (时家奇门) results. Keys are English; values keep the Chinese domain
 * terms exactly as the reference engine writes them, including its traditional characters
 * (陰遁, 離, 開門, 天沖 …). The same schemas validate the widget snapshot in the backend and
 * in the browser.
 */
import { z } from 'zod'
import { ClockTimeSchema } from '../bazi/schema.ts'

/** Matters a chart can be judged for (用事), each with its own 用神 table. */
export const QIMEN_EVENTS = [
  '求财',
  '求官',
  '谋事',
  '出行',
  '婚姻',
  '疾病',
  '诉讼',
  '谒贵',
  '考试',
] as const

/** One supported matter (用事). */
export const QimenEventSchema = z.enum(QIMEN_EVENTS)
/** One supported matter (用事). */
export type QimenEvent = z.infer<typeof QimenEventSchema>

/** Which clock the chart moment follows: the civil clock, or mean/apparent solar time at the city. */
export const QimenTimeBasisSchema = z.enum(['clock', 'mean', 'apparent'])

/** One of the nine Lo Shu palaces with its four layers; the centre palace has no door or god. */
export const QimenPalaceSchema = z
  .object({
    /** Lo Shu number, 1 (坎) to 9 (離). */
    number: z.number().int().min(1).max(9),
    /** Trigram name of the palace (坎 坤 震 巽 中 乾 兌 艮 離). */
    gua: z.string(),
    /** Element of the palace. */
    element: z.string(),
    /** Earth-plate stem (地盘干). */
    earth: z.string(),
    /** Heaven-plate stem (天盘干); the centre palace carries one only in some layouts. */
    sky: z.string().nullable(),
    /**
     * Second heaven stem lodged here (中五寄坤): the centre's earth stem, which rides with
     * 天芮; present only in the palace where 天芮 lands.
     */
    skyLodged: z.string().optional(),
    /** Star (九星) without the 天 prefix; `null` in the centre. */
    star: z.string().nullable(),
    /** Door (八门) without the 门 suffix; `null` in the centre. */
    door: z.string().nullable(),
    /** Door quality 吉 / 平 / 凶; `null` in the centre. */
    doorLuck: z.string().nullable(),
    /** Spirit (八神) abbreviation such as 符 or 蛇; `null` in the centre. */
    god: z.string().nullable(),
  })
  .strict()
/** One palace of the chart. */
export type QimenPalace = z.infer<typeof QimenPalaceSchema>

/** Evaluation of the palace a 用神 falls in. Seasonal states are 旺 相 休 囚 死. */
export const QimenPalaceReportSchema = z
  .object({
    sky: z.string(),
    /** Lodged centre stem (中五寄坤), present in the palace where 天芮 lands. */
    skyLodged: z.string().optional(),
    earth: z.string(),
    /** Centre earth stem lodged at 坤 (中宫寄坤), present in the 坤 palace. */
    earthLodged: z.string().optional(),
    door: z.string(),
    /** Star with the 天 prefix, as in 天任. */
    star: z.string(),
    /** Full spirit name, as in 白虎. */
    god: z.string(),
    /** Seasonal state of the star. */
    starState: z.string(),
    /** Seasonal state of the door. */
    doorState: z.string(),
    /** Seasonal state of the heaven-plate stem. */
    stemState: z.string(),
    /** Name of the 十干克应 of the heaven stem over the earth stem, when one is defined. */
    keYing: z.string().nullable(),
    /** 十干克应 of the lodged stem over the earth stem; present with `skyLodged`. */
    keYingLodged: z.string().nullable().optional(),
    /** 十干克应 of the heaven stem over the lodged earth stem; present with `earthLodged`. */
    keYingEarthLodged: z.string().nullable().optional(),
    /** Whether the door element controls the palace element (门迫). */
    doorPressed: z.boolean(),
    /**
     * Palace score: door, star and spirit quality, seasonal strength, the 克应 of every heaven
     * stem over every earth stem of the palace, and 门迫.
     */
    score: z.number(),
  })
  .strict()
/** Evaluation of one 用神 palace. */
export type QimenPalaceReport = z.infer<typeof QimenPalaceReportSchema>

/** One 用神 of the judged matter and where it falls. */
export const QimenYongShenSchema = z
  .object({
    /** Role in the matter, as in 生门 or 求测人(日干). */
    role: z.string(),
    /** Symbol located on the chart, as in 生门, 天心 or 甲(甲寄值符). */
    symbol: z.string(),
    /** Palace the symbol falls in; `null` when the symbol is not on the chart. */
    palace: z.string().nullable(),
    /** 坤, present when the symbol falls in the centre, which is read at 坤 (中宫寄坤). */
    lodgedAt: z.literal('坤').optional(),
    /** Evaluation of the palace the symbol is read at; present when it is on the chart. */
    report: QimenPalaceReportSchema.optional(),
    /** Whether the palace read is void (空亡) after releases; present with `report`. */
    void: z.boolean().optional(),
    /** Why a void palace is released: 旺相不空 or 逢冲填实. */
    voidRelease: z.string().optional(),
    /** Present and true when the 驿马 falls in the palace read. */
    yiMa: z.literal(true).optional(),
  })
  .strict()
/** One located 用神. */
export type QimenYongShen = z.infer<typeof QimenYongShenSchema>

/** One detected pattern (格局). Chart-wide patterns have no palace. */
export const QimenPatternSchema = z
  .object({
    name: z.string(),
    palace: z.string().optional(),
    /** 大吉, 吉, 平 or 凶. */
    luck: z.string(),
    note: z.string(),
  })
  .strict()
/** One detected pattern. */
export type QimenPattern = z.infer<typeof QimenPatternSchema>

/** Components of the overall score; `total` is their sum rounded to two decimals. */
export const QimenScoreSchema = z
  .object({
    /** Sum of the distinct outer 用神 palace scores. */
    palaces: z.number(),
    /** Pattern score: chart-wide patterns in full, palace patterns halved away from 用神. */
    patterns: z.number(),
    /** +0.5 when the 驿马 falls in a 用神 palace. */
    yiMa: z.number(),
    /** −1 for every void 用神. */
    void: z.number(),
    /** −0.5 when the 值使 door falls in the centre palace or in an unreleased void. */
    zhiShi: z.number(),
    /** 求财 adjustment from the 生门 palace and the day stem; 0 for other matters. */
    wealth: z.number(),
    total: z.number(),
  })
  .strict()

/** 求财 report: the 生门 palace stem against the day stem. */
export const QimenWealthSchema = z
  .object({
    shengMenPalace: z.string(),
    dayPalace: z.string(),
    /** Relation of the wealth element to the day stem: 生 同 泄 克 受克. */
    relation: z.string(),
    verdict: z.string(),
    /** Whether the day stem can bear the wealth, present for 生 and 受克. */
    renCai: z.string().optional(),
  })
  .strict()

/** Judgement of the chart for one matter. */
export const QimenJudgementSchema = z
  .object({
    event: QimenEventSchema,
    yongShen: z.array(QimenYongShenSchema),
    patterns: z.array(QimenPatternSchema),
    /** Palace of the 驿马 taken from the hour branch. */
    yiMaPalace: z.string(),
    /** 值使 warning, as in 值使入中·门户不通; `null` when the 值使 is unaffected. */
    zhiShiNote: z.string().nullable(),
    score: QimenScoreSchema,
    /** Present for 求财 when the 生门 and the day stem are on the chart. */
    wealth: QimenWealthSchema.optional(),
  })
  .strict()
/** Judgement of the chart for one matter. */
export type QimenJudgement = z.infer<typeof QimenJudgementSchema>

/** A complete 时家奇门 chart with its optional judgement. */
export const QimenChartSchema = z
  .object({
    label: z.string(),
    input: z
      .object({
        clockTime: ClockTimeSchema,
        city: z.string().nullable(),
        /** Degrees east; `null` without a city. */
        longitude: z.number().nullable(),
        /** Civil reference meridian; `null` without a city. */
        meridian: z.number().nullable(),
        basis: QimenTimeBasisSchema,
      })
      .strict(),
    /** Moment the chart is cast for, `YYYY-MM-DD HH:MM`; seconds are dropped. */
    chartTime: ClockTimeSchema,
    /** True solar time with seconds, `YYYY-MM-DD HH:MM:SS`, when a city is given. */
    trueSolarTime: z.string().nullable(),
    conventions: z
      .object({
        /** Ju method: 拆补 (current solar term and the day's 符头). */
        juMethod: z.literal('拆补'),
        /** 23:00–24:00 belongs to the next day's 子 hour. */
        lateZi: z.literal('tomorrow'),
      })
      .strict(),
    pillars: z
      .object({ year: z.string(), month: z.string(), day: z.string(), hour: z.string() })
      .strict(),
    /** Latest solar term begun at the chart moment. */
    solarTerm: z.string(),
    ju: z
      .object({
        /** Full name, as in 陰遁一局中. */
        name: z.string(),
        /** 陽遁 or 陰遁. */
        dun: z.string(),
        number: z.number().int().min(1).max(9),
        /** 上, 中 or 下 元. */
        yuan: z.string(),
      })
      .strict(),
    /** Head of the hour's ten-day decade (旬首), as in 甲子. */
    xunShou: z.string(),
    /** Void branches of the day's and the hour's decades. */
    xunKong: z.object({ day: z.string(), hour: z.string() }).strict(),
    zhiFu: z
      .object({
        /** Stem the 旬首 hides under (旬首仪). */
        yi: z.string(),
        /** 值符 star at its home palace; a 禽 值符 travels with 天芮, where 天禽 lodges. */
        star: z.string(),
        palace: z.string(),
      })
      .strict(),
    zhiShi: z.object({ door: z.string(), palace: z.string() }).strict(),
    /** The nine palaces in Lo Shu order 1–9. */
    palaces: z.array(QimenPalaceSchema).length(9),
    judgement: QimenJudgementSchema.optional(),
  })
  .strict()
/** A complete 时家奇门 chart. */
export type QimenChart = z.infer<typeof QimenChartSchema>
