import type { WebContext } from '@eum-agent/plugin/web'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { scanTiming } from '../src/timing/scan.ts'
import type { TimingScan } from '../src/timing/schema.ts'
import { timingView } from '../src/ui/timing.tsx'
import { TIMING_CATALOGUES } from '../src/ui/timing-copy.ts'
import { timingStyles } from '../src/ui/timing-styles.ts'

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
      ((TIMING_CATALOGUES['zh-CN'] as Record<string, string>)[key] ?? key).replace(
        /\{\{(\w+)\}\}/g,
        (_, name: string) => String(options?.[name] ?? ''),
      ),
  },
} as unknown as WebContext

const render = (data: TimingScan) =>
  renderToStaticMarkup(
    // biome-ignore lint/suspicious/noExplicitAny: the widget instance is reduced to its data
    createElement(timingView(ctx), { widget: { title: 't', data } } as any),
  )

const scan = scanTiming({
  event: '求财',
  start: '2026-11-12 00:00',
  end: '2026-11-14 23:59',
  city: '上海',
  natal: {
    birth: '1990-05-17 08:30',
    dst: false,
    apparentSolar: false,
    lateZi: 'today',
    gender: 'female',
    luckSteps: 0,
  },
})

describe('timing renderer', () => {
  it('states the matter and the combination convention in the header', () => {
    const html = render(scan)
    expect(html).toContain('求财')
    expect(html).toContain('原始分从不相加')
    expect(html).toContain('上海')
  })

  it('draws one heat-map row per day with twelve 时辰 columns', () => {
    const html = render(scan)
    const rows = html.match(/class="yt-tm-day"/g) ?? []
    expect(rows).toHaveLength(scan.days.length)
    const cells = html.match(/class="yt-tm-cell[ "]/g) ?? []
    expect(cells).toHaveLength(scan.days.length * 12)
    expect(html.match(/yt-tm-head-col/g)).toHaveLength(12)
  })

  it('colours ranked cells by combined percentile, hatches vetoed ones and dots consensus', () => {
    const html = render(scan)
    const vetoed = scan.cells.filter((c) => c.vetoed).length
    expect(html.match(/yt-tm-veto/g)?.length ?? 0).toBe(vetoed)
    expect(html).toMatch(/yt-tm-q[0-4]/)
    const dots = scan.cells.reduce((n, c) => n + c.consensus, 0)
    expect(html.match(/class="yt-tm-dot"/g)?.length ?? 0).toBe(dots)
  })

  it('lists the top picks and opens the first one with every system score and reason', () => {
    const html = render(scan)
    expect(html.match(/class="yt-tm-pick"/g)).toHaveLength(scan.top.length)
    const first = scan.cells[scan.top[0]!]!
    expect(html).toContain('aria-pressed="true"')
    const detail = html.slice(html.indexOf('yt-tm-detail'))
    for (const name of ['黄历', '奇门', '星盘', '八字']) expect(detail).toContain(name)
    const reason = scan.notes[first.scores.almanac!.reasons[0]!]!
    expect(detail).toContain(reason)
  })

  it('renders without natal and with every period vetoed', () => {
    const plain = scanTiming({ event: '出行', start: '2026-11-12 00:00', end: '2026-11-12 03:00' })
    const all: TimingScan = {
      ...plain,
      top: [],
      cells: plain.cells.map((c) => ({ ...c, vetoed: true, combined: null, consensus: 0 })),
    }
    const html = render(all)
    expect(html).toContain('全部被否决')
    expect(html).not.toContain('八字')
  })

  it('shows the clock span of each cell as its tooltip and in the detail', () => {
    const urumqi = scanTiming({
      event: '出行',
      start: '2026-11-12 00:00',
      end: '2026-11-12 23:59',
      city: '乌鲁木齐',
    })
    const html = render(urumqi)
    expect(html).toMatch(/title="11-12 01:10–03:10 子时/)
    const first = urumqi.cells[urumqi.top[0]!]!
    const detail = html.slice(html.indexOf('yt-tm-detail'))
    expect(detail).toContain(`${first.start.slice(5)}–${first.end.slice(11)}`)
    expect(html).toContain('乌鲁木齐真太阳时')
  })

  it('keeps zh-CN and en-US keys identical and prefixed', () => {
    const zh = Object.keys(TIMING_CATALOGUES['zh-CN']).sort()
    expect(Object.keys(TIMING_CATALOGUES['en-US']).sort()).toEqual(zh)
    for (const key of zh) expect(key.startsWith('timing.')).toBe(true)
  })

  it('scopes styles to yt-tm- classes with container breakpoints down to 200px', () => {
    const classes = [...timingStyles.matchAll(/\.([a-z][\w-]*)/g)].map((m) => m[1]!)
    for (const c of classes) expect(c.startsWith('yt-')).toBe(true)
    expect(classes.some((c) => c.startsWith('yt-tm-'))).toBe(true)
    expect(timingStyles).toMatch(/@container \(max-width: 2\d\dpx\)/)
    expect(timingStyles).not.toMatch(/#[0-9a-f]{3,6}\b/i)
  })
})
