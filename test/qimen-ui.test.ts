import type { WebContext } from '@eum-agent/plugin/web'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { castQimen } from '../src/qimen/chart.ts'
import { qimenChartView } from '../src/ui/qimen.tsx'
import { QIMEN_CATALOGUES } from '../src/ui/qimen-copy.ts'

// Server rendering has no external-store snapshot; translate directly instead.
vi.mock('../src/ui/common.tsx', async (load) => ({
  ...(await load<typeof import('../src/ui/common.tsx')>()),
  useT: (c: WebContext) => (key: string, options?: Record<string, unknown>) =>
    c.i18n.t(key, options),
}))

/** A browser context whose translator reads the zh-CN catalogue. */
const ctx = {
  i18n: {
    subscribe: () => () => {},
    language: () => 'zh-CN',
    t: (key: string, options?: Record<string, unknown>) =>
      ((QIMEN_CATALOGUES['zh-CN'] as Record<string, string>)[key] ?? key).replace(
        /\{\{(\w+)\}\}/g,
        (_, name: string) => String(options?.[name] ?? ''),
      ),
  },
} as unknown as WebContext

const render = (data: unknown) =>
  renderToStaticMarkup(
    // biome-ignore lint/suspicious/noExplicitAny: the widget instance is reduced to its data
    createElement(qimenChartView(ctx), { widget: { title: 't', data } } as any),
  )

describe('qimen renderer', () => {
  it('lays out the palaces in Lo Shu order with stems, doors and markers', () => {
    const html = render(castQimen({ time: '2026-07-24 18:00', event: '求财' }))
    const order = [...html.matchAll(/yt-qm-name">(.)\d宫/g)].map((m) => m[1]).join('')
    expect(order).toBe('巽離坤震中兌艮坎乾')
    expect(html).toContain('yt-qm-mark-zhiShi')
    expect(html).toContain('yt-qm-yong')
    expect(html).toContain('三奇入墓')
    expect(html).toContain('总分')
    expect(html).toContain('拆补法定局')
  })

  it('shows the lodged centre stem under the heaven stem where 天芮 lands, with its 克应', () => {
    const chart = castQimen({ time: '2024-01-15 09:30', event: '求财' })
    const gua = chart.palaces.find((p) => p.star === '芮')!.gua
    const html = render(chart)
    const cell = html.split('yt-qm-cell').find((c) => c.includes(`yt-qm-name">${gua}`))!
    expect(cell).toMatch(/yt-qm-sky[ "].*yt-qm-sky-lodged[^>]*>戊<.*yt-qm-earth/)
    expect(html.match(/yt-qm-sky-lodged/g)).toHaveLength(1)
    const keYing = chart.judgement!.yongShen[1]!.report!.keYingLodged!
    expect(html).toContain(`寄${keYing}`)
  })

  it('omits the judgement without a matter', () => {
    const html = render(castQimen({ time: '2026-07-24 18:00' }))
    expect(html).not.toContain('yt-qm-judge')
  })

  it('keeps zh-CN and en-US keys identical and prefixed', () => {
    const zh = Object.keys(QIMEN_CATALOGUES['zh-CN']).sort()
    expect(Object.keys(QIMEN_CATALOGUES['en-US']).sort()).toEqual(zh)
    for (const key of zh) expect(key.startsWith('qimen.')).toBe(true)
  })
})
