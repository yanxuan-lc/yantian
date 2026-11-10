/** BaZi tools and their widget types. */
import type { PluginContext } from '@eum-agent/plugin'
import { z } from 'zod'
import { failureResult, isFailure, outcomeSchema, textDocument } from '../tool-result.ts'
import { castFlow } from './flow.ts'
import { castNatal, type NatalRequest } from './natal.ts'
import {
  type BaziChart,
  BaziChartSchema,
  type BaziFlow,
  BaziFlowSchema,
  LateZiSchema,
} from './schema.ts'
import { flowSummary, flowText, natalSummary, natalText } from './text.ts'

/** Tool names owned by the BaZi module. */
export const BAZI_TOOLS = { natal: 'bazi_natal', flow: 'bazi_flow' } as const

const clock = (what: string) =>
  z
    .string()
    .describe(`${what}, civil clock time at the place, formatted YYYY-MM-DD HH:MM (24-hour).`)

const birthFields = {
  birth: clock('Birth time'),
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
}

const NatalInput = z
  .object({
    label: z.string().min(1).max(100).optional().describe('Chart title, such as the person name.'),
    ...birthFields,
    gender: z
      .enum(['male', 'female'])
      .optional()
      .describe('Gender of the person; required for luck periods (大运). Omit to skip them.'),
    luckSteps: z
      .number()
      .int()
      .min(1)
      .max(12)
      .default(10)
      .describe('Number of ten-year luck periods, 1–12. Default 10.'),
  })
  .strict()

const FlowInput = z
  .object({
    label: z.string().min(1).max(100).optional().describe('Title of the flow table.'),
    start: clock('Range start'),
    end: clock('Range end, inclusive; at most seven days after start'),
    city: z
      .string()
      .min(1)
      .max(40)
      .optional()
      .describe('City for true-solar-time correction of each period; omit to use clock time.'),
    apparentSolar: z
      .boolean()
      .default(false)
      .describe('Add the equation of time to the correction.'),
    natal: z
      .object(birthFields)
      .strict()
      .optional()
      .describe(
        'Birth facts of the person; adds ten gods, hidden stems, growth phases and shen-sha of each flowing pillar relative to the day master.',
      ),
  })
  .strict()

const NatalOutput = outcomeSchema(BaziChartSchema)
const FlowOutput = outcomeSchema(BaziFlowSchema)

/** Registers the BaZi widget types and tools on the plugin context. */
export function registerBazi(ctx: PluginContext): void {
  ctx.widgets.register({
    type: 'bazi-chart',
    tools: [BAZI_TOOLS.natal],
    dataSchema: BaziChartSchema,
  })
  ctx.widgets.register({ type: 'bazi-flow', tools: [BAZI_TOOLS.flow], dataSchema: BaziFlowSchema })
  ctx.tools.register({
    preload: false,
    name: BAZI_TOOLS.natal,
    description:
      'Cast a natal BaZi (四柱八字) chart: four pillars with hidden stems, ten gods, growth phases, na-yin, void branches and shen-sha; 胎元/命宫/身宫; and luck periods when gender is given. Applies true-solar-time correction from the birth city. Returns the facts and a saved chart widget.',
    inputSchema: NatalInput,
    outputSchema: NatalOutput,
    formatModel: (data, format) =>
      textDocument(isFailure(data) ? data.message : natalText(data as BaziChart), format),
    async execute(input: z.infer<typeof NatalInput>) {
      try {
        const chart = castNatal(input as NatalRequest)
        // The model reads the facts; only the widget carries the 100-year timeline.
        const { timeline: _timeline, ...facts } = chart
        return {
          data: facts,
          execution: { state: 'committed' },
          isError: false,
          widgets: [
            { type: 'bazi-chart', title: chart.label, summary: natalSummary(chart), data: chart },
          ],
        }
      } catch (error) {
        return failureResult(error)
      }
    },
  })
  ctx.tools.register({
    preload: false,
    name: BAZI_TOOLS.flow,
    description:
      'List the flowing pillars (流年/流月/流日/流时) of every two-hour period (时辰) in a time range of up to seven days, optionally read against a natal chart. Returns the facts and a saved table widget.',
    inputSchema: FlowInput,
    outputSchema: FlowOutput,
    formatModel: (data, format) =>
      textDocument(isFailure(data) ? data.message : flowText(data as BaziFlow), format),
    async execute(input: z.infer<typeof FlowInput>) {
      try {
        const flow = castFlow({
          ...input,
          natal: input.natal === undefined ? undefined : { ...input.natal, luckSteps: 0 },
        })
        return {
          data: flow,
          execution: { state: 'committed' },
          isError: false,
          widgets: [
            { type: 'bazi-flow', title: flow.label, summary: flowSummary(flow), data: flow },
          ],
        }
      } catch (error) {
        return failureResult(error)
      }
    },
  })
}
