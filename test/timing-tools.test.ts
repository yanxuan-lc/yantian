import type { ModelFormatContext, PluginContext } from '@eum-agent/plugin'
import { describe, expect, it } from 'vitest'
import { registerTiming, TIMING_GUIDANCE, TIMING_TOOLS } from '../src/timing/tools.ts'

// biome-ignore lint/suspicious/noExplicitAny: captured registrations are exercised directly
type Registration = any

/** Registers the timing module against a recording context. */
function register() {
  const tools = new Map<string, Registration>()
  const widgets: Registration[] = []
  const ctx = {
    tools: { register: (r: Registration) => tools.set(r.name, r) },
    widgets: { register: (r: Registration) => widgets.push(r) },
  } as unknown as PluginContext
  registerTiming(ctx)
  return { tool: tools.get(TIMING_TOOLS.scan), widgets }
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

const natal = { birth: '1990-05-17 08:30', city: '上海', gender: 'female' }

describe('timing tool', () => {
  it('registers the timing-scan widget with its producing tool', () => {
    const { widgets } = register()
    expect(widgets.map((w) => [w.type, w.tools])).toEqual([['timing-scan', ['timing_scan']]])
  })

  it('returns the scan as data and as a widget, and a compact text for the model', async () => {
    const { tool } = register()
    const result = await run(tool, {
      label: '签约择时',
      event: '求财',
      start: '2026-11-12 00:00',
      end: '2026-11-18 23:59',
      city: '上海',
      natal,
    })
    expect(result.isError).toBe(false)
    expect(tool.outputSchema.parse(result.data)).toEqual(result.data)
    expect(result.widgets).toHaveLength(1)
    expect(result.widgets[0]).toMatchObject({ type: 'timing-scan', title: '签约择时' })
    expect(result.widgets[0].data).toEqual(result.data)
    expect(result.widgets[0].summary).toMatch(/^求财择时，首选 \d{2}-\d{2} .时/)
    const text = await modelText(tool, result.data)
    expect(new TextEncoder().encode(text).byteLength).toBeLessThan(6 * 1024)
    expect(text).toContain('从不相加')
    expect(text).toMatch(/否决：黄历 \d+、奇门 \d+、星盘 \d+、八字 \d+/)
    const top = result.data.cells[result.data.top[0]]
    expect(text).toContain(`1. ${top.start.slice(5)}`)
    for (const name of ['黄历', '奇门', '星盘', '八字']) expect(text).toContain(`${name} `)
  })

  it('keeps the saved scan of a 31-day window within 200 KiB', async () => {
    const { tool } = register()
    const result = await run(tool, {
      event: '婚姻',
      start: '2026-11-10 00:00',
      end: '2026-12-10 23:59',
      natal,
    })
    expect(result.isError).toBe(false)
    expect(result.data.cells).toHaveLength(373)
    const bytes = new TextEncoder().encode(JSON.stringify(result.widgets[0].data)).byteLength
    expect(bytes).toBeLessThanOrEqual(200 * 1024)
  })

  it('reports a window over 31 days as a retryable input failure without a widget', async () => {
    const { tool } = register()
    const result = await run(tool, {
      event: '出行',
      start: '2026-11-01 00:00',
      end: '2026-12-05 00:00',
    })
    expect(result).toMatchObject({ isError: true, execution: { state: 'not-started' } })
    expect(result.widgets).toBeUndefined()
    expect(await modelText(tool, result.data)).toContain('31 days')
  })

  it('rejects an unsupported matter, a malformed time and a natal person without gender', () => {
    const { tool } = register()
    const ok = { event: '出行', start: '2026-11-01 00:00', end: '2026-11-02 00:00' }
    expect(tool.inputSchema.safeParse(ok).success).toBe(true)
    expect(tool.inputSchema.safeParse({ ...ok, event: '抽卡' }).success).toBe(false)
    expect(tool.inputSchema.safeParse({ ...ok, start: '2026-11-01' }).success).toBe(false)
    expect(
      tool.inputSchema.safeParse({ ...ok, natal: { birth: '1990-05-17 08:30' } }).success,
    ).toBe(false)
  })

  it('names only its own tool in every guidance entry and states how to cite the widget', () => {
    expect(TIMING_GUIDANCE.length).toBeGreaterThan(0)
    for (const entry of TIMING_GUIDANCE) expect(entry.tools).toEqual([TIMING_TOOLS.scan])
    const text = TIMING_GUIDANCE.map((e) => e.text).join('\n')
    expect(text).toContain('::widget[')
    expect(text).toMatch(/veto/i)
    expect(text).not.toMatch(/gacha|抽卡/)
  })
})
