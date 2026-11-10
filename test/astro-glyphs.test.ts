import type { WebContext } from '@eum-agent/plugin/web'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { castAstro } from '../src/astro/chart.ts'
import { PLANETS } from '../src/astro/zodiac.ts'
import { astroChartView } from '../src/ui/astro.tsx'
import { ASTRO_CATALOGUES } from '../src/ui/astro-copy.ts'
import {
  GLYPH_BOX,
  GLYPH_EXTENT,
  GLYPH_PATHS,
  Glyph,
  PLANET_GLYPHS,
  SIGN_GLYPHS,
  WheelGlyph,
} from '../src/ui/astro-glyphs.ts'

// Server rendering has no external-store snapshot; translate directly instead.
vi.mock('../src/ui/common.tsx', async (load) => ({
  ...(await load<typeof import('../src/ui/common.tsx')>()),
  useT: (c: WebContext) => (key: string, options?: Record<string, unknown>) =>
    c.i18n.t(key, options),
}))

/** Unicode astrology characters and the text presentation selector that both renderers drop. */
const ASTRO_CHARS = /[\u2609\u263D-\u2644\u2648-\u2653\u211E\u2297\u{1F774}]|\uFE0E/u

/** Bounding box of absolute SVG path data, sampling curves (M L H V Q C Z only). */
function bounds(d: string): { x0: number; y0: number; x1: number; y1: number } {
  const tokens = d.match(/[MLHVQCZ]|-?\d*\.?\d+(?:e-?\d+)?/gi)!
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
  const add = (x: number, y: number) => {
    box.x0 = Math.min(box.x0, x)
    box.y0 = Math.min(box.y0, y)
    box.x1 = Math.max(box.x1, x)
    box.y1 = Math.max(box.y1, y)
  }
  let cmd = 'M'
  let x = 0
  let y = 0
  let start = { x: 0, y: 0 }
  let i = 0
  const num = () => Number(tokens[i++])
  while (i < tokens.length) {
    if (/[A-Z]/i.test(tokens[i]!)) cmd = tokens[i++]!
    expect(cmd, `relative or unsupported command in ${cmd}`).toMatch(/^[MLHVQCZ]$/)
    if (cmd === 'Z') {
      x = start.x
      y = start.y
      continue
    }
    if (cmd === 'M' || cmd === 'L') {
      x = num()
      y = num()
      if (cmd === 'M') {
        start = { x, y }
        cmd = 'L'
      }
      add(x, y)
    } else if (cmd === 'H') {
      x = num()
      add(x, y)
    } else if (cmd === 'V') {
      y = num()
      add(x, y)
    } else {
      const pts =
        cmd === 'Q'
          ? [x, y, num(), num(), num(), num()]
          : [x, y, num(), num(), num(), num(), num(), num()]
      for (let k = 0; k <= 16; k++) {
        const t = k / 16
        const n = pts.length / 2 - 1
        let px = 0
        let py = 0
        for (let j = 0; j <= n; j++) {
          const c = (n === 2 ? [1, 2, 1] : [1, 3, 3, 1])[j]! * (1 - t) ** (n - j) * t ** j
          px += c * pts[2 * j]!
          py += c * pts[2 * j + 1]!
        }
        add(px, py)
      }
      x = pts[pts.length - 2]!
      y = pts[pts.length - 1]!
    }
  }
  return box
}

describe('astrology glyphs', () => {
  it('cover the twelve signs, the seven planets, retrograde and the Part of Fortune', () => {
    expect(SIGN_GLYPHS).toHaveLength(12)
    expect(new Set(SIGN_GLYPHS).size).toBe(12)
    expect(PLANETS.map((p) => PLANET_GLYPHS[p])).toEqual([
      'sun',
      'moon',
      'mercury',
      'venus',
      'mars',
      'jupiter',
      'saturn',
    ])
    for (const name of [...SIGN_GLYPHS, ...Object.values(PLANET_GLYPHS), 'retrograde', 'fortune']) {
      expect(GLYPH_PATHS[name as keyof typeof GLYPH_PATHS], name).toMatch(/^M/)
    }
  })

  it('fill the same extent of the em box, centred, so every glyph renders the same size', () => {
    for (const [name, d] of Object.entries(GLYPH_PATHS)) {
      const b = bounds(d)
      const w = b.x1 - b.x0
      const h = b.y1 - b.y0
      expect(Math.max(w, h), name).toBeGreaterThan(GLYPH_EXTENT - 1)
      expect(Math.max(w, h), name).toBeLessThan(GLYPH_EXTENT + 1)
      expect((b.x0 + b.x1) / 2, name).toBeCloseTo(GLYPH_BOX / 2, 0)
      expect((b.y0 + b.y1) / 2, name).toBeCloseTo(GLYPH_BOX / 2, 0)
    }
  })

  it('renders as inline SVG in currentColor for tables and lists', () => {
    const html = renderToStaticMarkup(createElement(Glyph, { name: 'leo' }))
    expect(html).toMatch(/^<svg [^>]*viewBox="0 0 100 100"/)
    expect(html).toContain('width="1em"')
    expect(html).toContain('fill="currentColor"')
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain(`d="${GLYPH_PATHS.leo}"`)
  })

  it('renders inside the wheel centred on a point at the given size', () => {
    const html = renderToStaticMarkup(
      createElement(
        'svg',
        null,
        createElement(WheelGlyph, { name: 'sun', x: 120, y: 80, size: 20, title: '太阳' }),
      ),
    )
    expect(html).toContain('transform="translate(120 80)"')
    expect(html).toContain('<title>太阳</title>')
    expect(html).toContain('transform="scale(0.2) translate(-50 -50)"')
    expect(html).toContain('fill="currentColor"')
  })
})

const zh = ASTRO_CATALOGUES['zh-CN'] as Record<string, string>
const ctx = {
  ui: { Switch: () => null },
  i18n: {
    subscribe: () => () => {},
    language: () => 'zh-CN',
    t: (key: string, options?: Record<string, unknown>) =>
      (zh[key] ?? key).replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
        String(options?.[name] ?? ''),
      ),
  },
} as unknown as WebContext

describe('natal chart renderer', () => {
  const chart = castAstro({ label: '甲', time: '1990-05-06 11:10', city: '北京', utcOffset: 9 })
  const html = renderToStaticMarkup(
    // biome-ignore lint/suspicious/noExplicitAny: the widget instance is reduced to its data
    createElement(astroChartView(ctx), { widget: { title: 't', data: chart } } as any),
  )

  it('draws every astrology symbol as an SVG glyph, never as a Unicode character', () => {
    expect(html).not.toMatch(ASTRO_CHARS)
    for (const p of chart.planets)
      expect(html).toContain(`d="${GLYPH_PATHS[PLANET_GLYPHS[p.name]]}"`)
    for (const s of SIGN_GLYPHS) expect(html).toContain(`d="${GLYPH_PATHS[s]}"`)
    expect(html).toContain(`d="${GLYPH_PATHS.fortune}"`)
  })

  it('keeps the Chinese names beside the glyphs in the planet table', () => {
    for (const p of chart.planets) expect(html).toContain(`<td class="yt-as-name">${p.name}</td>`)
    expect(html).toContain('<td class="yt-as-name">福点</td>')
  })

  it('labels each planet with its degree in sign and marks retrograde planets', () => {
    expect(html.match(/class="yt-as-degree"/g)).toHaveLength(chart.planets.length + 1)
    const rx = chart.planets.filter((p) => p.retrograde).length
    expect(html.match(/class="yt-as-rx"/g)?.length ?? 0).toBe(rx)
  })
})
