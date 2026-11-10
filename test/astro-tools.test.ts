import type { ModelFormatContext, PluginContext } from '@eum-agent/plugin'
import { describe, expect, it } from 'vitest'
import { ASTRO_GUIDANCE, ASTRO_TOOLS, registerAstro } from '../src/astro/tools.ts'

// biome-ignore lint/suspicious/noExplicitAny: captured registrations are exercised directly
type Registration = any

/** Registers the astrology module against a recording context. */
function register() {
  const tools = new Map<string, Registration>()
  const widgets: Registration[] = []
  const ctx = {
    tools: { register: (r: Registration) => tools.set(r.name, r) },
    widgets: { register: (r: Registration) => widgets.push(r) },
  } as unknown as PluginContext
  registerAstro(ctx)
  return { tool: tools.get(ASTRO_TOOLS.chart), tools, widgets }
}

const formatContext = {
  signal: new AbortController().signal,
  openBody() {
    throw new Error('chart text must fit inline')
  },
} as unknown as ModelFormatContext

const run = (input: unknown) => {
  const { tool } = register()
  return tool.execute(tool.inputSchema.parse(input), {})
}

/** Model text of a tool result. */
async function modelText(data: unknown): Promise<string> {
  const doc = await register().tool.formatModel(data, formatContext)
  return doc.nodes.map((n: { text: string }) => n.text).join('')
}

describe('astro_chart tool', () => {
  it('registers the astro-chart widget type with its producing tool', () => {
    const { widgets, tools } = register()
    expect(widgets.map((w) => [w.type, w.tools])).toEqual([['astro-chart', ['astro_chart']]])
    expect([...tools.keys()]).toEqual(['astro_chart'])
  })

  it('describes every input field for the model', () => {
    const shape = register().tool.inputSchema.shape
    expect(Object.keys(shape).sort()).toEqual(
      ['city', 'label', 'latitude', 'longitude', 'time', 'utcOffset'].sort(),
    )
    for (const [key, field] of Object.entries(shape)) {
      expect((field as { description?: string }).description, key).toBeTruthy()
    }
  })

  it('returns the chart as data and as a widget titled by the label with a one-line summary', async () => {
    const result = await run({ label: '样例', time: '2000-01-01 20:00', city: '北京' })
    expect(result.isError).toBe(false)
    expect(register().tool.outputSchema.parse(result.data)).toEqual(result.data)
    expect(result.widgets).toEqual([
      { type: 'astro-chart', title: '样例', summary: expect.any(String), data: result.data },
    ])
    const summary: string = result.widgets[0].summary
    expect(summary).not.toContain('\n')
    for (const fact of ['上升狮子', '太阳摩羯', '月亮天蝎', '夜盘', '土星时']) {
      expect(summary).toContain(fact)
    }
  })

  it('defaults to Beijing at UTC+8 and resolves cities and explicit coordinates', async () => {
    const plain = (await run({ time: '2026-07-24 18:00' })).data
    expect(plain.input).toEqual({
      time: '2026-07-24 18:00',
      utcOffset: 8,
      city: '北京',
      latitude: 39.9,
      longitude: 116.41,
    })
    expect(plain.label).toBe('2026-07-24 18:00 北京')
    const york = (await run({ time: '2026-07-24 18:00', city: '纽约', utcOffset: -4 })).data
    expect(york.input).toMatchObject({ city: '纽约', latitude: 40.71, longitude: -74.01 })
    expect(york.ut).toBe('2026-07-24 22:00')
    const sydney = (
      await run({ time: '2026-07-24 18:00', latitude: -33.87, longitude: 151.21, utcOffset: 10 })
    ).data
    expect(sydney.input).toMatchObject({ city: null, latitude: -33.87, longitude: 151.21 })
  })

  it('rejects malformed input with a retryable failure naming the field', async () => {
    const cases: [unknown, string][] = [
      [{ time: '2026-02-30 10:00' }, 'time:'],
      [{ time: '1700-01-01 10:00' }, 'time:'],
      [{ time: '2026-07-24 18:00', city: '火星城' }, 'city:'],
      [{ time: '2026-07-24 18:00', city: '北京', latitude: 40, longitude: 116 }, 'city:'],
      [{ time: '2026-07-24 18:00', latitude: 40 }, 'latitude/longitude:'],
      [{ time: '2026-07-24 18:00', latitude: 95, longitude: 0 }, 'latitude:'],
      [{ time: '2026-07-24 18:00', utcOffset: 15 }, 'utcOffset:'],
    ]
    for (const [input, prefix] of cases) {
      const result = await run(input)
      expect(result.isError, JSON.stringify(input)).toBe(true)
      expect(result.error).toEqual({ code: 'invalid_chart_input', retryable: true })
      expect(result.data.message.startsWith(prefix), result.data.message).toBe(true)
      expect(await modelText(result.data)).toBe(result.data.message)
    }
  })

  it('gives the model every planet, house, aspect, the Fortune and the planetary hour', async () => {
    const { data } = await run({ label: '样例', time: '2000-01-01 20:00', city: '北京' })
    const text = await modelText(data)
    for (const fact of [
      '整宫制',
      '传统七政',
      'astronomy-engine',
      '上升 狮子',
      '中天 金牛',
      '夜盘',
      '福点',
      '行星时',
      '行星日主 土星',
      '第 3 时',
    ]) {
      expect(text).toContain(fact)
    }
    for (const p of data.planets) expect(text).toContain(`${p.name} ${p.sign}`)
    for (let h = 1; h <= 12; h++) expect(text).toContain(`第${h}宫`)
    for (const a of data.aspects) expect(text).toContain(`${a.a}${a.type}${a.b}`)
    expect(text).toContain('土星 金牛 10.40° 第10宫 逆行')
  })

  it('states that no planetary hour exists in polar day', async () => {
    const { data } = await run({
      time: '2025-06-21 12:00',
      latitude: 78.22,
      longitude: 15.65,
      utcOffset: 1,
    })
    expect(data.planetaryHour).toBeNull()
    expect(await modelText(data)).toContain('无行星时')
  })

  it('keeps the saved chart small and plain JSON', async () => {
    const { data } = await run({ time: '2026-07-24 18:00' })
    const json = JSON.stringify(data)
    expect(JSON.parse(json)).toEqual(data)
    expect(new TextEncoder().encode(json).byteLength).toBeLessThan(8 * 1024)
  })

  it('guides the model only about the tools it registers', () => {
    expect(ASTRO_GUIDANCE.length).toBeGreaterThan(0)
    for (const entry of ASTRO_GUIDANCE) {
      expect(entry.tools).toEqual([ASTRO_TOOLS.chart])
      expect(entry.text.trim()).not.toBe('')
    }
    expect(ASTRO_GUIDANCE.some((e) => e.text.includes('::widget['))).toBe(true)
  })
})
