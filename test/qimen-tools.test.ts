import type { ModelFormatContext, PluginContext } from '@eum-agent/plugin'
import { describe, expect, it } from 'vitest'
import { QIMEN_GUIDANCE, QIMEN_TOOLS, registerQimen } from '../src/qimen/tools.ts'

// biome-ignore lint/suspicious/noExplicitAny: captured registrations are exercised directly
type Registration = any

/** Registers the Qi Men module against a recording context. */
function register() {
  const tools = new Map<string, Registration>()
  const widgets: Registration[] = []
  const ctx = {
    tools: { register: (r: Registration) => tools.set(r.name, r) },
    widgets: { register: (r: Registration) => widgets.push(r) },
  } as unknown as PluginContext
  registerQimen(ctx)
  return { tool: tools.get(QIMEN_TOOLS.cast), widgets }
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

/** Model text of a result, inline or from the derived body. */
async function modelText(tool: Registration, data: unknown): Promise<string> {
  const { ctx, text } = formatContext()
  const doc = await tool.formatModel(data, ctx)
  return doc.nodes[0].kind === 'literal' ? doc.nodes[0].text : text()
}

describe('qimen tool', () => {
  it('registers the qimen-chart widget with its producing tool', () => {
    const { widgets } = register()
    expect(widgets.map((w) => [w.type, w.tools])).toEqual([['qimen-chart', ['qimen_cast']]])
  })

  it('returns the chart as data and as a widget whose summary states ju, 值符 and 值使', async () => {
    const { tool } = register()
    const result = await run(tool, { label: '样例', time: '2026-07-24 18:00' })
    expect(result.isError).toBe(false)
    expect(tool.outputSchema.parse(result.data)).toEqual(result.data)
    expect(result.widgets).toHaveLength(1)
    expect(result.widgets[0]).toMatchObject({ type: 'qimen-chart', title: '样例' })
    expect(result.widgets[0].data).toEqual(result.data)
    expect(result.widgets[0].summary).toBe('阴遁一局中，值符天蓬落中宫，值使休门落坎宫')
    const text = await modelText(tool, result.data)
    expect(text).toContain('拆补')
    expect(text).toContain('23:00')
    for (const gua of ['坎', '坤', '震', '巽', '中', '乾', '兑', '艮', '离']) {
      expect(text).toContain(`${gua}宫`)
    }
  })

  it('judges the requested matter and puts the verdict in the summary and the text', async () => {
    const { tool } = register()
    const result = await run(tool, { time: '2026-07-24 18:00', event: '求财' })
    expect(result.data.judgement.score.total).toBe(-0.1)
    expect(result.widgets[0].summary).toBe(
      '阴遁一局中，值符天蓬落中宫，值使休门落坎宫；求财总分 -0.1，比和，平',
    )
    const text = await modelText(tool, result.data)
    expect(text).toContain('用神 生门 落艮宫')
    expect(text).toContain('三奇入墓')
    expect(text).toContain('总分 -0.1')
  })

  it('applies true solar time when a city is given', async () => {
    const { tool } = register()
    const result = await run(tool, { time: '2026-07-24 00:00', city: '北京' })
    expect(result.data.chartTime).toBe('2026-07-23 23:45')
    expect(result.data.pillars.day).toBe('己亥')
    expect(await modelText(tool, result.data)).toContain('北京')
  })

  it('reports an unknown city as a retryable input failure without a widget', async () => {
    const { tool } = register()
    const result = await run(tool, { time: '2026-07-24 18:00', city: '火星' })
    expect(result).toMatchObject({ isError: true, execution: { state: 'not-started' } })
    expect(result.widgets).toBeUndefined()
    expect(await modelText(tool, result.data)).toContain('city: unknown city "火星"')
  })

  it('rejects a malformed time and an unsupported matter at the input schema', () => {
    const { tool } = register()
    expect(tool.inputSchema.safeParse({ time: '2026-07-24' }).success).toBe(false)
    expect(tool.inputSchema.safeParse({ time: '2026-07-24 18:00', event: '抽卡' }).success).toBe(
      false,
    )
  })

  it('names only its own tool in every guidance entry', () => {
    expect(QIMEN_GUIDANCE.length).toBeGreaterThan(0)
    for (const entry of QIMEN_GUIDANCE) expect(entry.tools).toEqual([QIMEN_TOOLS.cast])
    expect(QIMEN_GUIDANCE.map((e) => e.text).join('\n')).toContain('拆补')
  })
})
