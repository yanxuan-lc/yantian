/** Western astrology tool, its widget type and its model guidance. */
import type { PluginContext, ToolGuidanceEntry } from '@eum-agent/plugin'
import { z } from 'zod'
import { failureResult, isFailure, outcomeSchema, textDocument } from '../tool-result.ts'
import { castAstro } from './chart.ts'
import { type AstroChart, AstroChartSchema } from './schema.ts'
import { astroSummary, astroText } from './text.ts'

/** Tool names owned by the astrology module. */
export const ASTRO_TOOLS = { chart: 'astro_chart' } as const

const AstroInput = z
  .object({
    label: z
      .string()
      .min(1)
      .max(100)
      .optional()
      .describe('Chart title, such as the person or the event; defaults to the time and place.'),
    time: z
      .string()
      .describe(
        'Moment to chart (birth or event), civil clock time at the place, formatted YYYY-MM-DD HH:MM (24-hour), years 1800–2199.',
      ),
    city: z
      .string()
      .min(1)
      .max(40)
      .optional()
      .describe(
        'City in Chinese (e.g. 北京, 东京, 纽约) for latitude and longitude. Omit when giving latitude/longitude; with neither, the chart uses 北京.',
      ),
    latitude: z
      .number()
      .optional()
      .describe(
        'Latitude in degrees, north positive; give together with longitude instead of city.',
      ),
    longitude: z
      .number()
      .optional()
      .describe(
        'Longitude in degrees, east positive; give together with latitude instead of city.',
      ),
    utcOffset: z
      .number()
      .optional()
      .describe(
        'Hours east of UTC of the clock time, including daylight saving (e.g. 9 for Tokyo, -4 for New York in summer). Defaults to the standard time of the named city (no daylight saving), otherwise 8; pass it whenever daylight saving applied.',
      ),
  })
  .strict()

const AstroOutput = outcomeSchema(AstroChartSchema)

/** Model guidance for the astrology tool; the plugin adds it to its guide. */
export const ASTRO_GUIDANCE: ToolGuidanceEntry[] = [
  {
    tools: [ASTRO_TOOLS.chart],
    text: 'Use astro_chart for a Western astrology natal chart, a chart of a moment (electional or horary question) or the current planetary hour.',
  },
  {
    tools: [ASTRO_TOOLS.chart],
    text: 'Before astro_chart, collect the date and clock time, the city or latitude/longitude, and the UTC offset in force there (daylight saving included); convert a lunar date to the Gregorian calendar first.',
  },
  {
    tools: [ASTRO_TOOLS.chart],
    text: 'Base every reading on the returned facts, never on positions you computed yourself. Say that the chart uses whole-sign houses, the seven traditional planets with traditional rulers and no outer planets, and positions from astronomy-engine accurate to about an arcminute.',
  },
  {
    tools: [ASTRO_TOOLS.chart],
    text: 'Present readings as traditional interpretation, not prediction.',
  },
  {
    tools: [ASTRO_TOOLS.chart],
    text: 'Place the returned widget reference on its own paragraph in the reply, with the chart title as its label (::widget[<title>]{ref="…"}), then explain the chart in prose.',
  },
]

/** Registers the astrology widget type and the `astro_chart` tool on the plugin context. */
export function registerAstro(ctx: PluginContext): void {
  ctx.widgets.register({
    type: 'astro-chart',
    tools: [ASTRO_TOOLS.chart],
    dataSchema: AstroChartSchema,
  })
  ctx.tools.register({
    preload: false,
    name: ASTRO_TOOLS.chart,
    description:
      'Cast a Western astrology chart for a moment and place: the seven traditional planets with sign, degree, whole-sign house and retrograde flag; ascendant and midheaven; day or night sect; Part of Fortune; major aspects; and the Chaldean planetary hour with sunrise and sunset. Returns the facts and a saved chart widget.',
    inputSchema: AstroInput,
    outputSchema: AstroOutput,
    formatModel: (data, format) =>
      textDocument(isFailure(data) ? data.message : astroText(data as AstroChart), format),
    async execute(input: z.infer<typeof AstroInput>) {
      try {
        const chart = castAstro(input)
        return {
          data: chart,
          execution: { state: 'committed' },
          isError: false,
          widgets: [
            { type: 'astro-chart', title: chart.label, summary: astroSummary(chart), data: chart },
          ],
        }
      } catch (error) {
        return failureResult(error)
      }
    },
  })
}
