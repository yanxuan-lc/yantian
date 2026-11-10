/** Timing selection (择时) tool, its widget type and its usage guidance. */
import type { PluginContext, ToolGuidanceEntry } from '@eum-agent/plugin'
import { z } from 'zod'
import { ClockTimeSchema, LateZiSchema } from '../bazi/schema.ts'
import { QimenEventSchema } from '../qimen/schema.ts'
import { failureResult, isFailure, outcomeSchema, textDocument } from '../tool-result.ts'
import { scanTiming, TOP_PICKS } from './scan.ts'
import { type TimingScan, TimingScanSchema } from './schema.ts'
import { timingSummary, timingText } from './text.ts'

/** Tool names owned by the timing module. */
export const TIMING_TOOLS = { scan: 'timing_scan' } as const

const clock = (what: string) =>
  ClockTimeSchema.describe(
    `${what}, civil clock time at the event city, formatted YYYY-MM-DD HH:MM (24-hour).`,
  )

const NatalInput = z
  .object({
    birth: ClockTimeSchema.describe(
      'Birth time, civil clock time at the birth place, formatted YYYY-MM-DD HH:MM (24-hour).',
    ),
    city: z
      .string()
      .min(1)
      .max(40)
      .optional()
      .describe('Birth city in Chinese for true-solar-time correction; omit when unknown.'),
    dst: z
      .boolean()
      .default(false)
      .describe('Whether daylight saving time applied at birth (China observed it 1986–1991).'),
    apparentSolar: z
      .boolean()
      .default(false)
      .describe('Add the equation of time (±16 min) to the birth longitude correction.'),
    lateZi: LateZiSchema.default('today').describe(
      'Day pillar for births 23:00–24:00: today keeps the current day, tomorrow advances it.',
    ),
    gender: z
      .enum(['male', 'female'])
      .describe('Gender of the person; decides the spouse star when the matter is 婚姻.'),
  })
  .strict()

const ScanInput = z
  .object({
    label: z
      .string()
      .min(1)
      .max(100)
      .optional()
      .describe('Title of the scan, such as the planned action.'),
    event: QimenEventSchema.describe(
      'Matter to choose a time for: 求财 money, 求官 career/office, 谋事 plans, 出行 travel, 婚姻 marriage, 疾病 medical treatment, 诉讼 lawsuit, 谒贵 meeting an important person, 考试 exam.',
    ),
    start: clock('Window start'),
    end: clock('Window end, inclusive; at most 31 days after start'),
    city: z
      .string()
      .min(1)
      .max(40)
      .optional()
      .describe(
        'City in Chinese where the action takes place (e.g. 北京, 乌鲁木齐). Gives true solar time for 黄历, 奇门 and 八字 and the place of the astrology chart; omit to use clock time and 北京.',
      ),
    natal: NatalInput.optional().describe(
      'Birth facts of the person acting; adds the 八字 system and 冲煞 against their 生肖. Omit to choose by 黄历, 奇门 and 星盘 alone.',
    ),
    top: z
      .number()
      .int()
      .min(1)
      .max(TOP_PICKS.max)
      .default(TOP_PICKS.default)
      .describe('Number of top picks to return, 1–10. Default 5.'),
  })
  .strict()

const ScanOutput = outcomeSchema(TimingScanSchema)

/** Usage guidance lines for `timing_scan`. */
export const TIMING_GUIDANCE: ToolGuidanceEntry[] = [
  {
    tools: [TIMING_TOOLS.scan],
    text: 'Use timing_scan to choose a time for a planned action within a window of up to 31 days. Collect the matter (求财, 求官, 谋事, 出行, 婚姻, 疾病, 诉讼, 谒贵, 考试), the window start and end, and the city where the action happens. Collect birth time, birth city and gender only when the user wants the choice read against their own chart.',
  },
  {
    tools: [TIMING_TOOLS.scan],
    text: 'Split a window longer than 31 days into several calls.',
  },
  {
    tools: [TIMING_TOOLS.scan],
    text: 'Base the answer on the top picks, percentiles and reasons the tool returned. Present them as traditional selection (择吉) rather than prediction, say that the systems are combined by percentile rank with equal weight and raw scores are never added, and list the vetoes the tool reported with their main reasons.',
  },
  {
    tools: [TIMING_TOOLS.scan],
    text: 'Place the returned widget reference on its own paragraph in the reply, with the scan title as its label (::widget[<title>]{ref="…"}), then explain the picks in prose. Copy widget references exactly as the tool result gives them; never write a reference that no result returned.',
  },
]

/** Registers the timing widget type and tool on the plugin context. */
export function registerTiming(ctx: PluginContext): void {
  ctx.widgets.register({
    type: 'timing-scan',
    tools: [TIMING_TOOLS.scan],
    dataSchema: TimingScanSchema,
  })
  ctx.tools.register({
    preload: false,
    name: TIMING_TOOLS.scan,
    description:
      'Choose a time for one matter (择时) within a window of up to 31 days: every two-hour period (时辰) is scored by 黄历 (day 宜忌, 建除, 黄道 gods), 时家奇门 (judgement and patterns), electional astrology (houses, rulers, Moon, planetary hour) and, with a natal person, 八字 (favourable elements, ten gods, shen-sha, clashes). Each system can veto a period; the rest are ranked per system by percentile and averaged with equal weight. Returns the top picks, the veto counts and a saved heat-map widget.',
    inputSchema: ScanInput,
    outputSchema: ScanOutput,
    formatModel: (data, format) =>
      textDocument(isFailure(data) ? data.message : timingText(data as TimingScan), format),
    async execute(input: z.infer<typeof ScanInput>) {
      try {
        const scan = scanTiming({
          ...input,
          natal: input.natal === undefined ? undefined : { ...input.natal, luckSteps: 0 },
        })
        return {
          data: scan,
          execution: { state: 'committed' },
          isError: false,
          widgets: [
            { type: 'timing-scan', title: scan.label, summary: timingSummary(scan), data: scan },
          ],
        }
      } catch (error) {
        return failureResult(error)
      }
    },
  })
}
