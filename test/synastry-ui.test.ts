import type { WebContext } from '@eum-agent/plugin/web'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { castSynastry } from '../src/astro/synastry.ts'
import type { InterAspect } from '../src/astro/synastry-schema.ts'
import { GLYPH_PATHS, PLANET_GLYPHS, SIGN_GLYPHS } from '../src/ui/astro-glyphs.ts'
import { astroSynastryView, touches } from '../src/ui/astro-synastry.tsx'
import { ASTRO_SYNASTRY_CATALOGUES } from '../src/ui/astro-synastry-copy.ts'
import { astroSynastryStyles } from '../src/ui/astro-synastry-styles.ts'

/** Unicode astrology characters and the text presentation selector the renderer drops. */
const ASTRO_CHARS = /[\u2609\u263D-\u2644\u2648-\u2653\u211E\u2297\u{1F774}]|\uFE0E/u

// Server rendering has no external-store snapshot; translate directly instead.
vi.mock('../src/ui/common.tsx', async (load) => ({
  ...(await load<typeof import('../src/ui/common.tsx')>()),
  useT: (c: WebContext) => (key: string, options?: Record<string, unknown>) =>
    c.i18n.t(key, options),
}))

type Props = { children?: ReactNode; value?: string }
/** Host tab stand-ins that render every panel, marked with its value. */
const ui = {
  Tabs: ({ children }: Props) => createElement('div', { 'data-tabs': '' }, children),
  TabsList: ({ children }: Props) => createElement('div', { role: 'tablist' }, children),
  TabsTrigger: ({ children, value }: Props) =>
    createElement('button', { type: 'button', role: 'tab', 'data-value': value }, children),
  TabsContent: ({ children, value }: Props) =>
    createElement('div', { role: 'tabpanel', 'data-panel': value }, children),
}

const zh = ASTRO_SYNASTRY_CATALOGUES['zh-CN'] as Record<string, string>
const ctx = {
  ui,
  i18n: {
    subscribe: () => () => {},
    language: () => 'zh-CN',
    t: (key: string, options?: Record<string, unknown>) =>
      (zh[key] ?? key).replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
        String(options?.[name] ?? ''),
      ),
  },
} as unknown as WebContext

const data = castSynastry({
  a: { label: '甲', time: '2000-01-01 20:00', city: '北京' },
  b: { label: '乙', time: '1990-05-01 08:00', city: '上海' },
})

const render = (d: unknown) =>
  renderToStaticMarkup(
    // biome-ignore lint/suspicious/noExplicitAny: the widget instance is reduced to its data
    createElement(astroSynastryView(ctx), { widget: { title: 't', data: d } } as any),
  )

/** Markup of one tab panel. */
const panel = (html: string, value: string) =>
  html.split('role="tabpanel"').find((p) => p.startsWith(` data-panel="${value}"`)) ?? ''

const count = (html: string, re: RegExp) => html.match(re)?.length ?? 0

describe('synastry renderer', () => {
  it('offers the 比较盘 and 组合盘 tabs through the host tabs', () => {
    const html = render(data)
    expect([...html.matchAll(/role="tab" data-value="(\w+)">([^<]+)</g)].map((m) => m[2])).toEqual([
      '比较盘',
      '组合盘',
    ])
  })

  it('draws a bi-wheel with A inside, B outside and A’s ascendant at 9 o’clock', () => {
    const html = panel(render(data), 'synastry')
    expect(count(html, /class="yt-sy-body yt-sy-a"/g)).toBe(7)
    // B shows its seven planets plus its ascendant and midheaven markers.
    expect(count(html, /class="yt-sy-body yt-sy-b"/g)).toBe(9)
    const asc = html.match(
      /<line class="yt-sy-axis" data-axis="AC" x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"/,
    )
    expect(asc).not.toBeNull()
    const [, x1, y1, x2, y2] = asc!.map(Number)
    expect(y1).toBeCloseTo(200, 1)
    expect(y2).toBeCloseTo(200, 1)
    expect(x2!).toBeLessThan(x1!)
    expect(x1!).toBeLessThan(200)
  })

  it('draws one line per non-conjunction inter-aspect and lists every inter-aspect', () => {
    const html = panel(render(data), 'synastry')
    const lines = data.interAspects.filter((x) => x.type !== '合').length
    expect(count(html, /class="yt-sy-line /g)).toBe(lines)
    expect(count(html, /<li class="yt-sy-x/g)).toBe(data.interAspects.length)
  })

  it('tabulates the house overlays both ways with the key contacts and both tallies', () => {
    const html = panel(render(data), 'synastry')
    const tables = html.split('<table class="yt-sy-table"').slice(1)
    expect(tables).toHaveLength(2)
    for (const [table, rows] of [
      [tables[0]!, data.overlays.aInB],
      [tables[1]!, data.overlays.bInA],
    ] as const) {
      const houses = [...table.matchAll(/<td class="yt-sy-house">(\d+)</g)].map((m) => Number(m[1]))
      expect(houses).toEqual(rows.map((o) => o.house))
    }
    expect(count(html, /class="yt-sy-contact /g)).toBe(data.contacts.length)
    expect(html).toContain(`和谐 ${data.tally.harmony}（${data.tally.harmonyCount} 项）`)
    expect(html).toContain(`挑战 ${data.tally.tension}（${data.tally.tensionCount} 项）`)
  })

  it('draws the composite as a single wheel with its aspect list', () => {
    const html = panel(render(data), 'composite')
    expect(count(html, /class="yt-sy-body yt-sy-c"/g)).toBe(7)
    expect(count(html, /<li class="yt-sy-x/g)).toBe(data.composite.aspects.length)
    expect(html).toContain('data-axis="AC"')
  })

  it('draws every astrology symbol of both tabs as an SVG glyph, keeping names beside them', () => {
    const html = render(data)
    expect(html).not.toMatch(ASTRO_CHARS)
    for (const s of SIGN_GLYPHS) expect(html).toContain(`d="${GLYPH_PATHS[s]}"`)
    for (const g of Object.values(PLANET_GLYPHS)) expect(html).toContain(`d="${GLYPH_PATHS[g]}"`)
    const rx = [...data.a.planets, ...data.b.planets].filter((p) => p.retrograde).length
    const synastry = panel(html, 'synastry')
    expect(count(synastry, /class="yt-sy-rx"/g)).toBe(rx)
    expect(count(synastry, /class="yt-sy-degree"/g)).toBe(7 + 9)
    expect(synastry).toContain('<td class="yt-sy-name">太阳</td>')
  })

  it('marks an ambiguous composite point', () => {
    const copy = structuredClone(data)
    copy.composite.planets[2]!.ambiguous = true
    expect(count(panel(render(copy), 'composite'), /yt-sy-ambiguous/g)).toBeGreaterThan(0)
    expect(count(panel(render(data), 'composite'), /yt-sy-ambiguous/g)).toBe(0)
  })

  it('highlights only the aspects of the selected side and body', () => {
    const x = { a: '太阳', b: '月亮' } as InterAspect
    expect(touches(null, x)).toBe(true)
    expect(touches({ side: 'a', body: '太阳' }, x)).toBe(true)
    expect(touches({ side: 'b', body: '月亮' }, x)).toBe(true)
    expect(touches({ side: 'b', body: '太阳' }, x)).toBe(false)
    expect(touches({ side: 'a', body: '月亮' }, x)).toBe(false)
  })

  it('keeps the copy keys prefixed and matched across languages, and styles scoped', () => {
    const zhKeys = Object.keys(ASTRO_SYNASTRY_CATALOGUES['zh-CN']).sort()
    expect(zhKeys.length).toBeGreaterThan(0)
    expect(Object.keys(ASTRO_SYNASTRY_CATALOGUES['en-US']).sort()).toEqual(zhKeys)
    for (const k of zhKeys) expect(k.startsWith('synastry.')).toBe(true)
    const selectors = astroSynastryStyles
      .replace(/@container[^{]+\{/g, '')
      .match(/^[^{}@]+(?=\{)/gm)!
      .flatMap((s) => s.split(','))
      .map((s) => s.trim())
      .filter(Boolean)
    expect(selectors.length).toBeGreaterThan(0)
    for (const s of selectors) expect(s, s).toMatch(/^\.yt-sy/)
    expect(astroSynastryStyles).toContain('@container')
    expect(astroSynastryStyles).not.toMatch(/#[0-9a-f]{3,6}\b/i)
  })
})
