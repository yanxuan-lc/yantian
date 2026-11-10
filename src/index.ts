/** Yantian (衍天): divination charts for YaoGuang agents. */
import { fileURLToPath } from 'node:url'
import type { Plugin } from '@eum-agent/plugin'
import { ASTRO_SYNASTRY_GUIDANCE, registerAstroSynastry } from './astro/synastry-tools.ts'
import { ASTRO_GUIDANCE, registerAstro } from './astro/tools.ts'
import { BAZI_COMPAT_GUIDANCE, registerBaziCompat } from './bazi/compat-tools.ts'
import { BAZI_TOOLS, registerBazi } from './bazi/tools.ts'
import { QIMEN_GUIDANCE, registerQimen } from './qimen/tools.ts'
import { registerTiming, TIMING_GUIDANCE } from './timing/tools.ts'

const plugin: Plugin = {
  name: '@yanxuan.lc/yantian',
  dependencies: {},
  apply(ctx) {
    registerBazi(ctx)
    registerQimen(ctx)
    registerAstro(ctx)
    registerBaziCompat(ctx)
    registerAstroSynastry(ctx)
    registerTiming(ctx)
    ctx.tools.guide({
      title: 'Divination charts (衍天)',
      entries: [
        {
          tools: [BAZI_TOOLS.natal],
          text: 'Before bazi_natal, collect the birth date and time, birth city and whether daylight saving applied; ask for gender when luck periods are wanted. Convert a lunar birth date to the Gregorian calendar first and confirm it with the user.',
        },
        {
          tools: [BAZI_TOOLS.natal, BAZI_TOOLS.flow],
          text: 'Base every reading on the facts the tool returned, never on pillars you computed yourself. State the conventions used (true solar time, late Zi hour) when they affect the result, and present readings as traditional interpretation rather than prediction.',
        },
        {
          tools: [BAZI_TOOLS.flow],
          text: 'Use bazi_flow for the flowing pillars of a period; pass natal to read them against the person. Split ranges longer than seven days into several calls.',
        },
        {
          tools: [BAZI_TOOLS.natal, BAZI_TOOLS.flow],
          text: 'Place each returned widget reference on its own paragraph in the reply, with the chart title as its label (::widget[<title>]{ref="…"}), then explain the chart in prose.',
        },
        {
          tools: [BAZI_TOOLS.natal],
          text: 'Copy widget references exactly as the tool result gives them; never write a reference that no result returned. Without one, present the facts as text instead.',
        },
        ...QIMEN_GUIDANCE,
        ...ASTRO_GUIDANCE,
        ...BAZI_COMPAT_GUIDANCE,
        ...ASTRO_SYNASTRY_GUIDANCE,
        ...TIMING_GUIDANCE,
      ],
    })
    ctx.client.registerPackageFiles({
      root: fileURLToPath(new URL('../ui/', import.meta.url)),
      entry: 'ui.js',
    })
  },
}

export default plugin
