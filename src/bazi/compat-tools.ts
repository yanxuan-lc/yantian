/** BaZi compatibility (八字合盘) tool, its widget type and its usage guidance. */
import type { PluginContext, ToolGuidanceEntry } from '@eum-agent/plugin'
import { z } from 'zod'
import { failureResult, isFailure, outcomeSchema, textDocument } from '../tool-result.ts'
import { type CompatRequest, castCompat } from './compat.ts'
import { type BaziCompat, BaziCompatSchema } from './compat-schema.ts'
import { compatSummary, compatText } from './compat-text.ts'
import { LateZiSchema } from './schema.ts'

/** Tool names owned by the compatibility module. */
export const BAZI_COMPAT_TOOLS = { compat: 'bazi_compat' } as const

/** Widget type of a saved compatibility reading. */
export const BAZI_COMPAT_WIDGET = 'bazi-compat'

const PersonInput = z
  .object({
    label: z
      .string()
      .min(1)
      .max(40)
      .describe(
        'Name or role of the person, shown on the chart and in every fact (e.g. 男方, 小王).',
      ),
    birth: z
      .string()
      .describe('Birth time, civil clock time at the place, formatted YYYY-MM-DD HH:MM (24-hour).'),
    gender: z
      .enum(['male', 'female'])
      .describe('Gender of the person; decides the spouse star (财 for a man, 官 for a woman).'),
    city: z
      .string()
      .min(1)
      .max(40)
      .optional()
      .describe(
        'Birth city in Chinese (e.g. 北京, 乌鲁木齐, 东京) for true-solar-time correction. Omit when unknown; the chart then uses clock time.',
      ),
    dst: z
      .boolean()
      .default(false)
      .describe(
        'Whether daylight saving time applied at birth (China observed it 1986–1991). Ask when unsure.',
      ),
    apparentSolar: z
      .boolean()
      .default(false)
      .describe(
        'Add the equation of time (±16 min) to the longitude correction; use for births near an hour boundary.',
      ),
    lateZi: LateZiSchema.default('today').describe(
      'Day pillar for births 23:00–24:00: today keeps the current day, tomorrow advances it. Schools disagree; follow the user.',
    ),
  })
  .strict()

const CompatInput = z
  .object({
    persons: z
      .array(PersonInput)
      .length(2)
      .describe('Exactly two persons, in the order the user named them.'),
  })
  .strict()

const CompatOutput = outcomeSchema(BaziCompatSchema)

/** Usage guidance lines for `bazi_compat`. */
export const BAZI_COMPAT_GUIDANCE: ToolGuidanceEntry[] = [
  {
    tools: [BAZI_COMPAT_TOOLS.compat],
    text: 'Use bazi_compat to compare two people (八字合盘). Collect for each person a name or role, birth date and time, gender, birth city and whether daylight saving applied; convert lunar dates to the Gregorian calendar first and confirm them.',
  },
  {
    tools: [BAZI_COMPAT_TOOLS.compat],
    text: 'Base the reading on the returned facts, strengths and score; quote the score with its verdict band and name the strongest 吉 and 凶 facts.',
  },
  {
    tools: [BAZI_COMPAT_TOOLS.compat],
    text: 'Present the reading as traditional interpretation: describe tendencies and points of friction, and leave decisions about the relationship to the people involved; never predict breakups, marriage outcomes or fidelity.',
  },
  {
    tools: [BAZI_COMPAT_TOOLS.compat],
    text: 'Place the returned widget reference on its own paragraph in the reply, with the chart title as its label (::widget[<title>]{ref="…"}), then explain the reading in prose.',
  },
]

/** Registers the `bazi-compat` widget type and the `bazi_compat` tool on the plugin context. */
export function registerBaziCompat(ctx: PluginContext): void {
  ctx.widgets.register({
    type: BAZI_COMPAT_WIDGET,
    tools: [BAZI_COMPAT_TOOLS.compat],
    dataSchema: BaziCompatSchema,
  })
  ctx.tools.register({
    preload: false,
    name: BAZI_COMPAT_TOOLS.compat,
    description:
      'Compare the BaZi charts of two people (八字合盘): casts both natal charts with true-solar-time correction, rates each day master (身强/身弱, 喜用忌, 调候), then reads the day pillars (spouse palace), zodiac, day-master relation, element and useful-element complement, spouse stars and cross shen-sha into tagged facts and a 0–100 score. Returns the facts and a saved chart widget.',
    inputSchema: CompatInput,
    outputSchema: CompatOutput,
    formatModel: (data, format) =>
      textDocument(isFailure(data) ? data.message : compatText(data as BaziCompat), format),
    async execute(input: z.infer<typeof CompatInput>) {
      try {
        const reading = castCompat(input as unknown as CompatRequest)
        const [a, b] = reading.persons
        return {
          data: reading,
          execution: { state: 'committed' },
          isError: false,
          widgets: [
            {
              type: BAZI_COMPAT_WIDGET,
              title: `${a!.label} × ${b!.label} 合盘`,
              summary: compatSummary(reading),
              data: reading,
            },
          ],
        }
      } catch (error) {
        return failureResult(error)
      }
    },
  })
}
