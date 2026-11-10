import type { ModelFormatContext, PluginContext } from '@eum-agent/plugin'
import { describe, expect, it } from 'vitest'
import {
  ASTRO_SYNASTRY_GUIDANCE,
  ASTRO_SYNASTRY_TOOLS,
  registerAstroSynastry,
} from '../src/astro/synastry-tools.ts'

// biome-ignore lint/suspicious/noExplicitAny: captured registrations are exercised directly
type Registration = any

/** Registers the synastry module against a recording context. */
function register() {
  const tools = new Map<string, Registration>()
  const widgets: Registration[] = []
  const ctx = {
    tools: { register: (r: Registration) => tools.set(r.name, r) },
    widgets: { register: (r: Registration) => widgets.push(r) },
  } as unknown as PluginContext
  registerAstroSynastry(ctx)
  return { tool: tools.get(ASTRO_SYNASTRY_TOOLS.synastry), tools, widgets }
}

/** A format context whose derived body collects the written bytes. */
function formatContext() {
  const chunks: Uint8Array[] = []
  const ctx = {
    signal: new AbortController().signal,
    async openBody() {
      return {
        async write(_offset: number, bytes: Uint8Array) {
          chunks.push(bytes.slice())
        },
        async seal() {
          const byteLength = chunks.reduce((n, c) => n + c.byteLength, 0)
          return { body: { byteLength } }
        },
        async abort() {},
      }
    },
  } as unknown as ModelFormatContext
  return { ctx, chunks }
}

const run = (input: unknown) => {
  const { tool } = register()
  return tool.execute(tool.inputSchema.parse(input), {})
}

/** Model text of a tool result, inline or from its derived body. */
async function modelText(data: unknown): Promise<string> {
  const { ctx, chunks } = formatContext()
  const doc = await register().tool.formatModel(data, ctx)
  const node = doc.nodes[0]
  if (node.kind === 'literal') return node.text
  return new TextDecoder().decode(Buffer.concat(chunks))
}

const PAIR = {
  label: '样例合盘',
  a: { label: '甲', time: '2000-01-01 20:00', city: '北京' },
  b: { label: '乙', time: '1990-05-01 08:00', city: '上海' },
}

describe('astro_synastry tool', () => {
  it('registers the astro-synastry widget type with its producing tool', () => {
    const { widgets, tools } = register()
    expect(widgets.map((w) => [w.type, w.tools])).toEqual([['astro-synastry', ['astro_synastry']]])
    expect([...tools.keys()]).toEqual(['astro_synastry'])
  })

  it('describes every input field for the model, including each person’s fields', () => {
    const shape = register().tool.inputSchema.shape
    expect(Object.keys(shape).sort()).toEqual(['a', 'b', 'label'])
    for (const [key, field] of Object.entries(shape)) {
      expect((field as { description?: string }).description, key).toBeTruthy()
    }
    for (const side of ['a', 'b']) {
      const person = shape[side].shape
      expect(Object.keys(person).sort()).toEqual(
        ['city', 'label', 'latitude', 'longitude', 'time', 'utcOffset'].sort(),
      )
      for (const [key, field] of Object.entries(person)) {
        expect((field as { description?: string }).description, `${side}.${key}`).toBeTruthy()
      }
    }
  })

  it('returns the comparison as data and as a widget titled by the label with a one-line summary', async () => {
    const result = await run(PAIR)
    expect(result.isError).toBe(false)
    expect(register().tool.outputSchema.parse(result.data)).toEqual(result.data)
    expect(result.widgets).toEqual([
      { type: 'astro-synastry', title: '样例合盘', summary: expect.any(String), data: result.data },
    ])
    const summary: string = result.widgets[0].summary
    expect(summary).not.toContain('\n')
    const { tally, composite } = result.data
    expect(summary).toContain(`和谐 ${tally.harmony}（${tally.harmonyCount} 项）`)
    expect(summary).toContain(`挑战 ${tally.tension}（${tally.tensionCount} 项）`)
    expect(summary).toContain(`组合盘上升${composite.ascendant.sign}`)
  })

  it('rejects malformed input with a retryable failure naming the person and field', async () => {
    const cases: [unknown, string][] = [
      [{ ...PAIR, a: { time: '2026-02-30 10:00' } }, 'a.time:'],
      [{ ...PAIR, b: { time: '2026-07-24 18:00', city: '火星城' } }, 'b.city:'],
      [{ ...PAIR, b: { time: '2026-07-24 18:00', utcOffset: 15 } }, 'b.utcOffset:'],
    ]
    for (const [input, prefix] of cases) {
      const result = await run(input)
      expect(result.isError, JSON.stringify(input)).toBe(true)
      expect(result.error).toEqual({ code: 'invalid_chart_input', retryable: true })
      expect(result.data.message.startsWith(prefix), result.data.message).toBe(true)
      expect(await modelText(result.data)).toBe(result.data.message)
    }
  })

  it('gives the model both charts, every inter-aspect, overlay, contact, the tally and the composite', async () => {
    const { data } = await run(PAIR)
    const text = await modelText(data)
    for (const fact of ['整宫制', '短弧中点', '权重', '不给总评', '甲', '乙', '组合盘']) {
      expect(text).toContain(fact)
    }
    for (const p of data.a.planets) expect(text).toContain(`${p.name}${p.sign}`)
    for (const x of data.interAspects) expect(text).toContain(`${x.a}${x.type}${x.b} ${x.orb}°`)
    for (const c of data.contacts) {
      expect(text).toContain(`甲${c.a}${c.type}乙${c.b} ${c.orb}° ${c.tone}`)
    }
    const aInB = data.overlays.aInB.map(
      (o: { body: string; house: number }) => `${o.body}${o.house}`,
    )
    expect(text).toContain(`甲落乙宫：${aInB.join(' ')}`)
    expect(text).toContain(
      `合计：和谐 ${data.tally.harmony}（${data.tally.harmonyCount} 项），挑战 ${data.tally.tension}（${data.tally.tensionCount} 项）`,
    )
    for (const p of data.composite.planets) {
      expect(text).toContain(`${p.name}${p.sign}${p.degree.toFixed(2)}° ${p.house}宫`)
    }
    for (const a of data.composite.aspects)
      expect(text).toContain(`${a.a}${a.type}${a.b} ${a.orb}°`)
    expect(new TextEncoder().encode(text).byteLength).toBeLessThan(8 * 1024)
  })

  it('marks ambiguous composite midpoints in the model text', async () => {
    const { data } = await run(PAIR)
    data.composite.planets[0].ambiguous = true
    expect(await modelText(data)).toContain(
      `${data.composite.planets[0].name}${data.composite.planets[0].sign}`,
    )
    expect(await modelText(data)).toContain('近冲中点不确定')
  })

  it('guides the model only about the tool it registers, without a single verdict', () => {
    expect(ASTRO_SYNASTRY_GUIDANCE.length).toBeGreaterThan(0)
    for (const entry of ASTRO_SYNASTRY_GUIDANCE) {
      expect(entry.tools).toEqual([ASTRO_SYNASTRY_TOOLS.synastry])
      expect(entry.text.trim()).not.toBe('')
    }
    const all = ASTRO_SYNASTRY_GUIDANCE.map((e) => e.text).join('\n')
    expect(all).toContain('::widget[')
    expect(all).toMatch(/verdict|score/)
  })
})
