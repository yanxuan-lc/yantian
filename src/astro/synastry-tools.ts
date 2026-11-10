/** Two-person astrology tool, its widget type and its model guidance. */
import type { PluginContext, ToolGuidanceEntry } from '@eum-agent/plugin'
import { z } from 'zod'
import { failureResult, isFailure, outcomeSchema, textDocument } from '../tool-result.ts'
import { castSynastry } from './synastry.ts'
import { type AstroSynastry, AstroSynastrySchema } from './synastry-schema.ts'
import { synastrySummary, synastryText } from './synastry-text.ts'

/** Tool names owned by the synastry module. */
export const ASTRO_SYNASTRY_TOOLS = { synastry: 'astro_synastry' } as const

/** Widget type of the saved comparison. */
export const ASTRO_SYNASTRY_WIDGET = 'astro-synastry'

/** Birth facts of one person; `who` names the person in every field description. */
function personInput(who: string) {
  return z
    .object({
      label: z
        .string()
        .min(1)
        .max(40)
        .optional()
        .describe(`Name or nickname of ${who}; defaults to the birth time and place.`),
      time: z
        .string()
        .describe(
          `Birth moment of ${who}, civil clock time at the birthplace, formatted YYYY-MM-DD HH:MM (24-hour), years 1800–2199.`,
        ),
      city: z
        .string()
        .min(1)
        .max(40)
        .optional()
        .describe(
          `Birth city of ${who} in Chinese (e.g. 北京, 东京, 纽约). Omit when giving latitude/longitude; with neither, 北京 is used.`,
        ),
      latitude: z
        .number()
        .optional()
        .describe(
          `Birthplace latitude of ${who} in degrees, north positive; give together with longitude instead of city.`,
        ),
      longitude: z
        .number()
        .optional()
        .describe(
          `Birthplace longitude of ${who} in degrees, east positive; give together with latitude instead of city.`,
        ),
      utcOffset: z
        .number()
        .optional()
        .describe(
          `Hours east of UTC of ${who}'s birth clock time, including daylight saving. Defaults to the named city's standard time, otherwise 8; pass it whenever daylight saving applied.`,
        ),
    })
    .strict()
}

const SynastryInput = z
  .object({
    label: z
      .string()
      .min(1)
      .max(100)
      .optional()
      .describe('Title of the comparison; defaults to "<A label> × <B label>".'),
    a: personInput('person A').describe(
      'Person A; A forms the inner ring of the bi-wheel and the reference side of every inter-aspect.',
    ),
    b: personInput('person B').describe('Person B; B forms the outer ring of the bi-wheel.'),
  })
  .strict()

const SynastryOutput = outcomeSchema(AstroSynastrySchema)

const only = [ASTRO_SYNASTRY_TOOLS.synastry]

/** Model guidance for the synastry tool; the plugin adds it to its guide. */
export const ASTRO_SYNASTRY_GUIDANCE: ToolGuidanceEntry[] = [
  {
    tools: only,
    text: 'Use astro_synastry to compare two people in Western astrology: inter-aspects, house overlays both ways, key contacts with a harmony/tension tally, and the midpoint composite chart.',
  },
  {
    tools: only,
    text: 'Before astro_synastry, collect for each person the birth date and clock time, the city or latitude/longitude, and the UTC offset in force there (daylight saving included); convert lunar dates to the Gregorian calendar first.',
  },
  {
    tools: only,
    text: 'Base every reading on the returned facts, never on positions you computed yourself. State the conventions: whole-sign houses, the seven traditional planets plus ascendant and midheaven, natal orbs, and shorter-arc midpoints for the composite.',
  },
  {
    tools: only,
    text: 'Report the harmony and tension tallies side by side as traditional weightings; never merge them into a single verdict, score, percentage or match rating.',
  },
  {
    tools: only,
    text: 'Present readings as traditional interpretation of tendencies; never state that the relationship will succeed or fail, or that the two people are or are not meant for each other.',
  },
  {
    tools: only,
    text: 'When a composite point is flagged ambiguous, say that its midpoint was fixed by convention and the opposite point is equally defensible.',
  },
  {
    tools: only,
    text: 'Place the returned widget reference on its own paragraph in the reply, with the comparison title as its label (::widget[<title>]{ref="…"}), then explain it in prose.',
  },
]

/** Registers the synastry widget type and the `astro_synastry` tool on the plugin context. */
export function registerAstroSynastry(ctx: PluginContext): void {
  ctx.widgets.register({
    type: ASTRO_SYNASTRY_WIDGET,
    tools: [ASTRO_SYNASTRY_TOOLS.synastry],
    dataSchema: AstroSynastrySchema,
  })
  ctx.tools.register({
    preload: false,
    name: ASTRO_SYNASTRY_TOOLS.synastry,
    description:
      'Compare the Western natal charts of two people. Casts both charts, then returns inter-aspects between their seven traditional planets, ascendants and midheavens with orbs; whole-sign house overlays both ways; key contacts (Sun–Moon, Venus–Mars, Saturn, ascendant) tagged harmonious or challenging with a weighted tally; and the midpoint composite chart with whole-sign houses and aspects. Returns the facts and a saved comparison widget.',
    inputSchema: SynastryInput,
    outputSchema: SynastryOutput,
    formatModel: (data, format) =>
      textDocument(isFailure(data) ? data.message : synastryText(data as AstroSynastry), format),
    async execute(input: z.infer<typeof SynastryInput>) {
      try {
        const result = castSynastry(input)
        return {
          data: result,
          execution: { state: 'committed' },
          isError: false,
          widgets: [
            {
              type: ASTRO_SYNASTRY_WIDGET,
              title: result.label,
              summary: synastrySummary(result),
              data: result,
            },
          ],
        }
      } catch (error) {
        return failureResult(error)
      }
    },
  })
}
