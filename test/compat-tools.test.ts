import type { ModelFormatContext, PluginContext } from '@eum-agent/plugin'
import { describe, expect, it } from 'vitest'
import {
  BAZI_COMPAT_GUIDANCE,
  BAZI_COMPAT_TOOLS,
  registerBaziCompat,
} from '../src/bazi/compat-tools.ts'

// biome-ignore lint/suspicious/noExplicitAny: captured registrations are exercised directly
type Registration = any

/** Registers the compatibility module against a recording context. */
function register() {
  const tools = new Map<string, Registration>()
  const widgets: Registration[] = []
  const ctx = {
    tools: { register: (r: Registration) => tools.set(r.name, r) },
    widgets: { register: (r: Registration) => widgets.push(r) },
  } as unknown as PluginContext
  registerBaziCompat(ctx)
  return { tool: tools.get('bazi_compat'), widgets }
}

const format = { signal: new AbortController().signal } as unknown as ModelFormatContext

const persons = [
  { label: '男方', birth: '1990-05-06 11:10', city: '北京', dst: true, gender: 'male' },
  { label: '女方', birth: '1991-10-03 08:30', city: '上海', gender: 'female' },
]

const run = (tool: Registration, input: unknown) => tool.execute(tool.inputSchema.parse(input), {})

describe('bazi_compat tool', () => {
  it('registers the bazi-compat widget type with its producing tool', () => {
    const { widgets } = register()
    expect(widgets.map((w) => [w.type, w.tools])).toEqual([['bazi-compat', ['bazi_compat']]])
    expect(BAZI_COMPAT_TOOLS.compat).toBe('bazi_compat')
  })

  it('returns the reading as data and as a widget whose summary states pillars and score', async () => {
    const { tool } = register()
    const result = await run(tool, { persons })
    expect(result.isError).toBe(false)
    expect(tool.outputSchema.parse(result.data)).toEqual(result.data)
    expect(result.data.score).toBe(88)
    const [widget] = result.widgets
    expect(widget.type).toBe('bazi-compat')
    expect(widget.title).toBe('男方 × 女方 合盘')
    expect(widget.summary).toBe(
      '男方 庚午 辛巳 辛未 癸巳 × 女方 辛未 丁酉 丙午 壬辰，合盘 88 分（上佳）',
    )
    expect(widget.data).toBe(result.data)
  })

  it('formats compact text with both strengths, the score and every fact', async () => {
    const { tool } = register()
    const { data } = await run(tool, { persons })
    const doc = await tool.formatModel(data, format)
    const text: string = doc.nodes[0].text
    expect(text).toContain('男方（男）')
    expect(text).toContain('身弱（同类 41.4%')
    expect(text).toContain('用神 水')
    expect(text).toContain('总分 88（上佳）')
    expect(text).toContain('[配偶宫] 吉 +8 日干 丙辛合化水')
    expect(text).toContain('[神煞] 吉 +3 女方日柱午为男方天乙贵人')
    expect(text.split('\n').length).toBeLessThan(40)
  })

  it('requires a label and gender for each of exactly two persons', () => {
    const { tool } = register()
    const parse = (input: unknown) => tool.inputSchema.safeParse(input).success
    expect(parse({ persons })).toBe(true)
    expect(parse({ persons: [persons[0]] })).toBe(false)
    expect(parse({ persons: [persons[0], { ...persons[1], gender: undefined }] })).toBe(false)
    expect(parse({ persons: [persons[0], { ...persons[1], label: undefined }] })).toBe(false)
  })

  it('reports an unknown city as a retryable input failure', async () => {
    const { tool } = register()
    const result = await run(tool, { persons: [persons[0], { ...persons[1], city: '亚特兰蒂斯' }] })
    expect(result.isError).toBe(true)
    expect(result.error.code).toBe('invalid_chart_input')
    expect(result.data.message).toContain('亚特兰蒂斯')
    const doc = await tool.formatModel(result.data, format)
    expect(doc.nodes[0].text).toContain('亚特兰蒂斯')
  })

  it('guides the model on bazi_compat only', () => {
    expect(BAZI_COMPAT_GUIDANCE.length).toBeGreaterThan(0)
    for (const entry of BAZI_COMPAT_GUIDANCE) expect(entry.tools).toEqual(['bazi_compat'])
    expect(BAZI_COMPAT_GUIDANCE.map((e) => e.text).join(' ')).toMatch(/traditional interpretation/)
  })
})
