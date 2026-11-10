import type { ModelFormatContext, PluginContext } from '@eum-agent/plugin'
import { describe, expect, it } from 'vitest'
import { registerBazi } from '../src/bazi/tools.ts'

// biome-ignore lint/suspicious/noExplicitAny: captured registrations are exercised directly
type Registration = any

/** Registers the BaZi module against a recording context. */
function register() {
  const tools = new Map<string, Registration>()
  const widgets: Registration[] = []
  const ctx = {
    tools: { register: (r: Registration) => tools.set(r.name, r) },
    widgets: { register: (r: Registration) => widgets.push(r) },
  } as unknown as PluginContext
  registerBazi(ctx)
  return { tools, widgets }
}

/** A format context whose bodies are kept in memory. */
function formatContext() {
  const written: Uint8Array[] = []
  const ctx = {
    signal: new AbortController().signal,
    async openBody() {
      return {
        async write(_offset: number, bytes: Uint8Array) {
          written.push(bytes.slice())
        },
        async seal() {
          const byteLength = written.reduce((n, b) => n + b.byteLength, 0)
          return { body: { bodyId: 'b', codec: 'utf8-text', byteLength } }
        },
        async abort() {},
      }
    },
  } as unknown as ModelFormatContext
  return { ctx, text: () => Buffer.concat(written).toString('utf8') }
}

const run = (tool: Registration, input: unknown) => tool.execute(tool.inputSchema.parse(input), {})

describe('bazi tools', () => {
  it('registers each widget type with its producing tool', () => {
    const { widgets } = register()
    expect(widgets.map((w) => [w.type, w.tools])).toEqual([
      ['bazi-chart', ['bazi_natal']],
      ['bazi-flow', ['bazi_flow']],
    ])
  })

  it('returns the chart as data and as a widget whose summary states the pillars', async () => {
    const tool = register().tools.get('bazi_natal')
    const result = await run(tool, {
      label: '样例',
      birth: '1990-05-06 11:10',
      city: '北京',
      dst: true,
      gender: 'male',
    })
    expect(result.isError).toBe(false)
    expect(tool.outputSchema.parse(result.data)).toEqual(result.data)
    expect(result.widgets).toHaveLength(1)
    expect(result.widgets[0].type).toBe('bazi-chart')
    expect(result.widgets[0].summary).toContain('庚午 辛巳 辛未 癸巳')
    expect(result.data.timeline).toBeUndefined()
    expect(result.widgets[0].data.timeline.years).toHaveLength(100)
    const { timeline: _t, ...facts } = result.widgets[0].data
    expect(facts).toEqual(result.data)
  })

  it('reports an unknown city as a retryable input failure without a widget', async () => {
    const tool = register().tools.get('bazi_natal')
    const result = await run(tool, { birth: '1990-05-06 11:10', city: '火星' })
    expect(result).toMatchObject({ isError: true, execution: { state: 'not-started' } })
    expect(result.widgets).toBeUndefined()
    const { ctx } = formatContext()
    const doc = await tool.formatModel(result.data, ctx)
    expect(doc.nodes[0].text).toContain('city: unknown city "火星"')
  })

  it('moves long model text into a derived body', async () => {
    const tool = register().tools.get('bazi_flow')
    const result = await run(tool, {
      start: '2026-11-09 00:00',
      end: '2026-11-11 23:00',
      natal: { birth: '1990-05-06 11:10', city: '北京', dst: true },
    })
    expect(result.isError).toBe(false)
    const { ctx, text } = formatContext()
    const doc = await tool.formatModel(result.data, ctx)
    expect(doc.nodes).toHaveLength(1)
    expect(doc.nodes[0].kind).toBe('text-range')
    expect(text()).toContain('参照命局 庚午 辛巳 辛未 癸巳')
    expect(doc.nodes[0].endByte).toBe(Buffer.byteLength(text()))
  })

  it('rejects a flow longer than seven days with the accepted maximum', async () => {
    const tool = register().tools.get('bazi_flow')
    const result = await run(tool, { start: '2026-11-01 00:00', end: '2026-11-20 00:00' })
    expect(result.isError).toBe(true)
    expect(result.data.message).toContain('at most seven days')
  })

  it('accepts a whole week starting at midnight', async () => {
    const tool = register().tools.get('bazi_flow')
    const result = await run(tool, { start: '2026-11-09 00:00', end: '2026-11-15 23:59' })
    expect(result.isError).toBe(false)
    expect(result.data.entries).toHaveLength(85)
  })

  it('describes each flowing day once and each period in one line', async () => {
    const tool = register().tools.get('bazi_flow')
    const result = await run(tool, {
      start: '2026-11-09 00:00',
      end: '2026-11-10 23:59',
      natal: { birth: '1990-05-06 11:10', city: '北京', dst: true },
    })
    const { ctx, text } = formatContext()
    const doc = await tool.formatModel(result.data, ctx)
    const body = doc.nodes[0].kind === 'literal' ? doc.nodes[0].text : text()
    expect(body.match(/^流日/gm)).toHaveLength(3)
    expect(body.match(/^ {2}\d{2}-\d{2} \d{2}:\d{2}–\d{2}:\d{2} 流时 /gm)).toHaveLength(25)
    expect(Buffer.byteLength(body)).toBeLessThan(6000)
  })
})
