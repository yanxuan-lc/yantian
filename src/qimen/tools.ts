/** Qi Men Dun Jia tool, its widget type and its usage guidance. */
import type { PluginContext, ToolGuidanceEntry } from '@eum-agent/plugin'
import { z } from 'zod'
import { ClockTimeSchema } from '../bazi/schema.ts'
import { failureResult, isFailure, outcomeSchema, textDocument } from '../tool-result.ts'
import { castQimen } from './chart.ts'
import { type QimenChart, QimenChartSchema, QimenEventSchema } from './schema.ts'
import { simplifyDeep } from './simplify.ts'
import { qimenSummary, qimenText } from './text.ts'

/** Tool names owned by the Qi Men module. */
export const QIMEN_TOOLS = { cast: 'qimen_cast' } as const

const CastInput = z
  .object({
    label: z
      .string()
      .min(1)
      .max(100)
      .optional()
      .describe('Chart title, such as the question being asked.'),
    time: ClockTimeSchema.describe(
      'Moment to cast, civil clock time at the place, formatted YYYY-MM-DD HH:MM (24-hour).',
    ),
    event: QimenEventSchema.optional().describe(
      'Matter to judge (用事); adds 用神, patterns and a score. 求财 also adds the wealth report. Omit for the chart alone.',
    ),
    city: z
      .string()
      .min(1)
      .max(40)
      .optional()
      .describe(
        'City in Chinese (e.g. 北京, 乌鲁木齐) to cast on its true solar time. Omit to cast on clock time, the usual convention.',
      ),
    apparentSolar: z
      .boolean()
      .default(false)
      .describe(
        'With a city, add the equation of time (±16 min) to the longitude correction. Ignored without a city.',
      ),
  })
  .strict()

const CastOutput = outcomeSchema(QimenChartSchema)

/** Usage guidance lines for `qimen_cast`. */
export const QIMEN_GUIDANCE: ToolGuidanceEntry[] = [
  {
    tools: [QIMEN_TOOLS.cast],
    text: 'Use qimen_cast to read one moment by 时家奇门: the moment of a question or a planned action. Collect the date and time and the matter (求财, 求官, 谋事, 出行, 婚姻, 疾病, 诉讼, 谒贵, 考试); ask for the city only when the user wants true solar time.',
  },
  {
    tools: [QIMEN_TOOLS.cast],
    text: 'Base every reading on the palaces, patterns and scores the tool returned. State that the chart uses the 拆补 method and that 23:00 starts the next day, and present readings as traditional interpretation rather than prediction.',
  },
  {
    tools: [QIMEN_TOOLS.cast],
    text: 'Place the returned widget reference on its own paragraph in the reply, with the chart title as its label (::widget[<title>]{ref="…"}), then explain the chart in prose.',
  },
]

/** Registers the Qi Men widget type and tool on the plugin context. */
export function registerQimen(ctx: PluginContext): void {
  ctx.widgets.register({
    type: 'qimen-chart',
    tools: [QIMEN_TOOLS.cast],
    dataSchema: QimenChartSchema,
  })
  ctx.tools.register({
    preload: false,
    name: QIMEN_TOOLS.cast,
    description:
      'Cast a 时家奇门遁甲 chart (拆补 method) for one moment: pillars, solar term, ju, 旬首/旬空, 值符/值使 and the nine palaces with earth and heaven stems, stars, doors and spirits. With a matter it also judges the moment: 用神 palaces, patterns (格局) and a score. Returns the facts and a saved chart widget.',
    inputSchema: CastInput,
    outputSchema: CastOutput,
    formatModel: (data, format) =>
      textDocument(isFailure(data) ? data.message : qimenText(data as QimenChart), format),
    async execute(input: z.infer<typeof CastInput>) {
      try {
        const chart = simplifyDeep(castQimen(input))
        return {
          data: chart,
          execution: { state: 'committed' },
          isError: false,
          widgets: [
            { type: 'qimen-chart', title: chart.label, summary: qimenSummary(chart), data: chart },
          ],
        }
      } catch (error) {
        return failureResult(error)
      }
    },
  })
}
