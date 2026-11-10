import type { WebContext } from '@eum-agent/plugin/web'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { civil } from '../src/bazi/civil-time.ts'
import { castCompat } from '../src/bazi/compat.ts'
import { baziCompatView, CompatBody } from '../src/ui/bazi-compat.tsx'
import { BAZI_COMPAT_CATALOGUES } from '../src/ui/bazi-compat-copy.ts'
import { baziCompatStyles } from '../src/ui/bazi-compat-styles.ts'

// Server rendering has no external-store snapshot; translate directly instead.
vi.mock('../src/ui/common.tsx', async (load) => ({
  ...(await load<typeof import('../src/ui/common.tsx')>()),
  useT: (c: WebContext) => (key: string, options?: Record<string, unknown>) =>
    c.i18n.t(key, options),
}))

const zh = BAZI_COMPAT_CATALOGUES['zh-CN'] as Record<string, string>
const t = (key: string, options?: Record<string, unknown>) =>
  (zh[key] ?? key).replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(options?.[name] ?? ''))
const ctx = {
  i18n: { subscribe: () => () => {}, language: () => 'zh-CN', t },
} as unknown as WebContext

const reading = castCompat(
  {
    persons: [
      {
        label: '男方',
        birth: '1990-05-06 11:10',
        city: '北京',
        dst: true,
        apparentSolar: false,
        lateZi: 'today',
        gender: 'male',
      },
      {
        label: '女方',
        birth: '1991-10-03 08:30',
        city: '上海',
        dst: false,
        apparentSolar: false,
        lateZi: 'today',
        gender: 'female',
      },
    ],
  },
  civil(2026, 11, 9, 12),
)

const renderView = () =>
  renderToStaticMarkup(
    // biome-ignore lint/suspicious/noExplicitAny: the widget instance is reduced to its data
    createElement(baziCompatView(ctx), { widget: { title: 't', data: reading } } as any),
  )
const renderBody = (selected: number | null) =>
  renderToStaticMarkup(createElement(CompatBody, { reading, t, selected, onSelect: () => {} }))

/** Highlighted pillar columns as `person:pillar`. */
const hits = (html: string) =>
  [...html.matchAll(/yt-bc-col yt-bc-hit" data-person="(\d)" data-pillar="(\w+)"/g)].map(
    (m) => `${m[1]}:${m[2]}`,
  )

describe('bazi compatibility renderer', () => {
  it('shows the score header and both persons with pillars, strength bar and 喜用', () => {
    const html = renderView()
    expect(html).toMatch(/yt-bc-num">88</)
    expect(html).toContain('上佳')
    expect(html.match(/class="yt-bc-person"/g)).toHaveLength(2)
    expect(html.match(/class="yt-bc-col( yt-bc-hit)?"/g)).toHaveLength(8)
    // Each column shows its stem over its branch; read the first person's day column.
    expect(html).toMatch(/data-person="0" data-pillar="day">.*?>辛<.*?>未</)
    expect(html).toContain('width:41.4%')
    expect(html).toContain('身弱')
    expect(html).toMatch(/yt-bc-use-yong.*?>水</)
  })

  it('lists facts by category with 吉, 平 and 凶 chips', () => {
    const html = renderView()
    const headings = [...html.matchAll(/<h4[^>]*>([^<]+)<\/h4>/g)].map((m) => m[1])
    expect(headings).toEqual(['配偶宫', '生肖', '日主', '五行互补', '用神互补', '夫妻星', '神煞'])
    expect(html.match(/yt-bc-chip yt-bc-good/g)).toHaveLength(7)
    expect(html.match(/yt-bc-chip yt-bc-bad/g)).toHaveLength(2)
    expect(html.match(/yt-bc-chip yt-bc-even/g)).toHaveLength(1)
    expect(hits(html)).toEqual([])
  })

  it('highlights the pillars of the selected fact', () => {
    const index = reading.facts.findIndex((f) => f.title === '女方月柱酉为男方红鸾')
    const html = renderBody(index)
    expect(hits(html).sort()).toEqual(['0:year', '1:month'])
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1)
  })

  it('scopes styles under yt-bc- with a container breakpoint for narrow cards', () => {
    const selectors = baziCompatStyles.match(/\.[a-z][\w-]*/g) ?? []
    for (const s of selectors) expect(s.startsWith('.yt-')).toBe(true)
    expect(selectors.some((s) => s.startsWith('.yt-bc-'))).toBe(true)
    expect(baziCompatStyles).toMatch(/@container \(max-width: \d+px\)/)
  })

  it('keeps zh-CN and en-US keys identical and prefixed', () => {
    const keys = Object.keys(BAZI_COMPAT_CATALOGUES['zh-CN']).sort()
    expect(Object.keys(BAZI_COMPAT_CATALOGUES['en-US']).sort()).toEqual(keys)
    for (const key of keys) expect(key.startsWith('compat.')).toBe(true)
  })
})
