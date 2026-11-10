import { describe, expect, it } from 'vitest'
import { castAstro } from '../src/astro/chart.ts'
import { castSynastry } from '../src/astro/synastry.ts'
import {
  BIWHEEL_LAYOUT,
  type BodyBand,
  GLYPH_FILL,
  layoutLabel,
  NATAL_LAYOUT,
  placeBodies,
  polar,
  spread,
  WHEEL_VIEW,
  type WheelLayout,
  wheelAngle,
  zodiacTicks,
} from '../src/astro/wheel.ts'

const gap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

describe('chart wheel geometry', () => {
  it('puts the ascendant at 9 o’clock and runs the zodiac counter-clockwise', () => {
    expect(wheelAngle(100, 100)).toBe(180)
    expect(wheelAngle(190, 100)).toBe(270)
    expect(wheelAngle(10, 100)).toBe(90)
    const left = polar(200, 200, 100, wheelAngle(100, 100))
    const bottom = polar(200, 200, 100, wheelAngle(190, 100))
    expect(left.x).toBeCloseTo(100)
    expect(left.y).toBeCloseTo(200)
    expect(bottom.x).toBeCloseTo(200)
    expect(bottom.y).toBeCloseTo(300)
  })

  it('leaves well separated glyphs at their longitudes', () => {
    expect(spread([10, 100, 200], 8)).toEqual([10, 100, 200])
  })

  it('spreads crowded glyphs to the minimum gap around their centre, keeping order', () => {
    const out = spread([50, 51, 52], 8)
    expect(out[0]! < out[1]! && out[1]! < out[2]!).toBe(true)
    expect(gap(out[0]!, out[1]!)).toBeGreaterThanOrEqual(7.99)
    expect(gap(out[1]!, out[2]!)).toBeGreaterThanOrEqual(7.99)
    expect((out[0]! + out[2]!) / 2).toBeCloseTo(51, 0)
  })

  it('spreads a cluster that straddles 0° Aries', () => {
    const out = spread([359, 1, 180], 8)
    expect(gap(out[0]!, out[1]!)).toBeGreaterThanOrEqual(7.99)
    expect(out[2]).toBe(180)
  })

  it('separates all seven planets in a stellium', () => {
    const out = spread([10, 10, 11, 12, 12, 13, 14], 8)
    const sorted = [...out].sort((a, b) => a - b)
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i]! - sorted[i - 1]!).toBeGreaterThanOrEqual(7.99)
    }
  })
})

const { centre: C, radius: R } = WHEEL_VIEW
/** Distance from the wheel centre as a fraction of the rim radius. */
const rOf = (p: { x: number; y: number }) => Math.hypot(p.x - C, p.y - C) / R
/** Screen angle of a point around the wheel centre, degrees. */
const aOf = (p: { x: number; y: number }) =>
  ((((Math.atan2(C - p.y, p.x - C) * 180) / Math.PI) % 360) + 360) % 360

function expectOrdered(layout: WheelLayout) {
  const { zodiac, bands, houseNumber, aspect } = layout
  expect(zodiac.inner).toBeLessThan(zodiac.outer)
  expect(zodiac.outer).toBe(1)
  expect(bands[0]!.outer).toBeLessThanOrEqual(zodiac.inner)
  for (const b of bands) {
    expect(b.inner).toBeLessThan(b.label - b.labelSize / 2)
    expect(b.label + b.labelSize / 2).toBeLessThanOrEqual(b.glyph - b.glyphSize / 2)
    expect(b.glyph + b.glyphSize / 2).toBeLessThanOrEqual(b.tick)
    expect(b.tick).toBeLessThan(b.outer)
  }
  for (let i = 1; i < bands.length; i++) {
    expect(bands[i]!.outer, `band ${i} overlaps band ${i - 1}`).toBeLessThanOrEqual(
      bands[i - 1]!.inner,
    )
  }
  const innermost = bands[bands.length - 1]!
  expect(houseNumber + layout.houseNumberSize / 2).toBeLessThanOrEqual(innermost.inner)
  expect(houseNumber - layout.houseNumberSize / 2).toBeGreaterThanOrEqual(aspect)
}

describe('chart wheel layout', () => {
  it('orders the natal rings from the zodiac band in to a wide aspect circle', () => {
    expectOrdered(NATAL_LAYOUT)
    expect(NATAL_LAYOUT.zodiac.inner).toBeCloseTo(0.9)
    expect(NATAL_LAYOUT.bands).toHaveLength(1)
    expect(NATAL_LAYOUT.bands[0]!.glyph).toBeCloseTo(0.78)
    expect(NATAL_LAYOUT.aspect).toBeGreaterThanOrEqual(0.55)
  })

  it('stacks the two bi-wheel bands without overlap, outer person outside', () => {
    expectOrdered(BIWHEEL_LAYOUT)
    expect(BIWHEEL_LAYOUT.bands).toHaveLength(2)
    expect(BIWHEEL_LAYOUT.separators).toEqual([BIWHEEL_LAYOUT.bands[1]!.outer])
    expect(BIWHEEL_LAYOUT.aspect).toBeGreaterThanOrEqual(0.55)
  })

  it('draws 1°, 5° and 10° ticks inward from the zodiac band', () => {
    const d = zodiacTicks(NATAL_LAYOUT, 0, WHEEL_VIEW)
    const segs = [...d.matchAll(/M ([\d.-]+) ([\d.-]+) L ([\d.-]+) ([\d.-]+)/g)].map((m) => ({
      from: { x: Number(m[1]), y: Number(m[2]) },
      to: { x: Number(m[3]), y: Number(m[4]) },
    }))
    expect(segs).toHaveLength(360)
    const lengths = segs.map((s) => Number((rOf(s.from) - rOf(s.to)).toFixed(3)))
    for (const s of segs) expect(rOf(s.from)).toBeCloseTo(NATAL_LAYOUT.zodiac.inner, 3)
    expect(new Set(lengths)).toEqual(
      new Set([NATAL_LAYOUT.ticks[1], NATAL_LAYOUT.ticks[5], NATAL_LAYOUT.ticks[10]]),
    )
    expect(lengths.filter((l) => l === NATAL_LAYOUT.ticks[10])).toHaveLength(36)
  })
})

describe('body placement', () => {
  const band: BodyBand = NATAL_LAYOUT.bands[0]!
  const stellium = [40, 41, 41.5, 42, 43, 44, 44.5, 200]

  it('runs a leader from the exact-degree tick to the edge of the displaced glyph', () => {
    const asc = 100
    const placed = placeBodies(stellium, asc, band, WHEEL_VIEW)
    placed.forEach((p, i) => {
      const exact = wheelAngle(stellium[i]!, asc)
      expect(rOf(p.tick[0])).toBeCloseTo(band.outer, 6)
      expect(rOf(p.tick[1])).toBeCloseTo(band.tick, 6)
      expect(aOf(p.tick[1])).toBeCloseTo(exact, 6)
      expect(p.leader[0]).toEqual(p.tick[1])
      expect(rOf(p.leader[1])).toBeCloseTo(band.glyph + band.glyphSize / 2, 6)
      expect(aOf(p.leader[1])).toBeCloseTo(aOf(p.glyph), 6)
    })
  })

  it('spreads a stellium along the band without leaving it', () => {
    for (const layout of [NATAL_LAYOUT, BIWHEEL_LAYOUT]) {
      for (const b of layout.bands) {
        const placed = placeBodies(stellium, 0, b, WHEEL_VIEW)
        const angles = placed.map((p) => aOf(p.glyph)).sort((x, y) => x - y)
        for (let i = 1; i < angles.length; i++) {
          expect(angles[i]! - angles[i - 1]!).toBeGreaterThanOrEqual(b.minGap - 1e-6)
        }
        for (const p of placed) {
          expect(rOf(p.glyph) - b.glyphSize / 2).toBeGreaterThanOrEqual(b.inner)
          expect(rOf(p.glyph) + b.glyphSize / 2).toBeLessThanOrEqual(b.outer)
          expect(rOf(p.label) - b.labelSize / 2).toBeGreaterThanOrEqual(b.inner)
          expect(aOf(p.label)).toBeCloseTo(aOf(p.glyph), 6)
        }
      }
    }
  })

  it('keeps the arc between neighbouring glyphs wider than a glyph', () => {
    for (const layout of [NATAL_LAYOUT, BIWHEEL_LAYOUT]) {
      for (const b of layout.bands) {
        const arc = (b.minGap * Math.PI * b.glyph) / 180
        expect(arc).toBeGreaterThan(b.glyphSize)
      }
    }
  })
})

/** Whether the axis segment from the aspect circle to the rim passes through a box. */
function crossesBox(
  axisAngle: number,
  from: number,
  box: { x: number; y: number; w: number; h: number },
): boolean {
  for (let k = 0; k <= 400; k++) {
    const p = polar(C, C, (from + ((1 - from) * k) / 400) * R, axisAngle)
    if (Math.abs(p.x - box.x) < box.w / 2 && Math.abs(p.y - box.y) < box.h / 2) return true
  }
  return false
}

type Box = { x: number; y: number; w: number; h: number }
const overlaps = (p: Box, q: Box) =>
  Math.abs(p.x - q.x) < (p.w + q.w) / 2 && Math.abs(p.y - q.y) < (p.h + q.h) / 2

/**
 * Expects every glyph box and degree-label box of a band to stay off the four axes and off
 * each other.
 */
function expectClearOfAxes(
  bodies: readonly { longitude: number; retrograde?: boolean }[],
  angles: { asc: number; mc: number },
  band: BodyBand,
  aspect: number,
) {
  const axes = [angles.asc, angles.asc + 180, angles.mc, angles.mc + 180]
  const placed = placeBodies(
    bodies.map((b) => b.longitude),
    angles.asc,
    band,
    WHEEL_VIEW,
    axes,
  )
  const glyphs = placed.map((p) => {
    const side = band.glyphSize * GLYPH_FILL * R
    return { x: p.glyph.x, y: p.glyph.y, w: side, h: side }
  })
  const labels = placed.map((p, i) => {
    const text = `${Math.floor(bodies[i]!.longitude % 30)}°`
    return layoutLabel(p, text, bodies[i]!.retrograde === true, band, WHEEL_VIEW).box
  })
  placed.forEach((p, i) => {
    for (const axis of axes) {
      const a = wheelAngle(axis, angles.asc)
      expect(crossesBox(a, aspect, glyphs[i]!), `glyph ${i} on axis ${axis}`).toBe(false)
      expect(crossesBox(a, aspect, labels[i]!), `label ${i} on axis ${axis}`).toBe(false)
      expect(gap(p.shownAngle, a)).toBeGreaterThanOrEqual(band.axisClearance - 1e-6)
    }
    for (let j = 0; j < placed.length; j++) {
      expect(overlaps(labels[i]!, glyphs[j]!), `label ${i} on glyph ${j}`).toBe(false)
    }
  })
}

describe('degree labels', () => {
  const band = NATAL_LAYOUT.bands[0]!
  const at = (longitude: number) => placeBodies([longitude], 0, band, WHEEL_VIEW)[0]!

  it('sets the retrograde mark after the degree on vertical stretches of the band', () => {
    const l = layoutLabel(at(90), '25°', true, band, WHEEL_VIEW)
    expect(l.flag).not.toBeNull()
    expect(l.flag!.y).toBeCloseTo(l.text.y, 6)
    expect(l.flag!.x).toBeGreaterThan(l.text.x)
  })

  it('stacks the retrograde mark under the degree beside a horizontal stretch', () => {
    const l = layoutLabel(at(180), '25°', true, band, WHEEL_VIEW)
    expect(l.flag!.y).toBeGreaterThan(l.text.y)
    expect(l.box.h).toBeGreaterThan(l.fontSize * 1.5)
  })

  it('keeps every label off its own glyph at every angle', () => {
    for (const layout of [NATAL_LAYOUT, BIWHEEL_LAYOUT]) {
      for (const b of layout.bands) {
        const side = b.glyphSize * GLYPH_FILL * R
        for (let lon = 0; lon < 360; lon += 1) {
          const p = placeBodies([lon], 0, b, WHEEL_VIEW)[0]!
          for (const flagged of [false, true]) {
            const { box } = layoutLabel(p, '25°', flagged, b, WHEEL_VIEW)
            const glyph = { x: p.glyph.x, y: p.glyph.y, w: side, h: side }
            expect(overlaps(box, glyph), `${lon}° ${flagged}`).toBe(false)
          }
        }
      }
    }
  })

  it('keeps every label inside its band', () => {
    for (const layout of [NATAL_LAYOUT, BIWHEEL_LAYOUT]) {
      for (const b of layout.bands) {
        for (let lon = 0; lon < 360; lon += 1) {
          const p = placeBodies([lon], 0, b, WHEEL_VIEW)[0]!
          const { box } = layoutLabel(p, '25°', true, b, WHEEL_VIEW)
          const near = Math.hypot(
            Math.max(Math.abs(box.x - C) - box.w / 2, 0),
            Math.max(Math.abs(box.y - C) - box.h / 2, 0),
          )
          expect(near / R, `${lon}°`).toBeGreaterThanOrEqual(b.inner - 1e-6)
        }
      }
    }
  })
})

describe('axis clearance', () => {
  const a = { label: '甲', time: '1990-05-06 11:10', city: '北京', utcOffset: 9 }
  const b = { label: '乙', time: '1992-09-18 07:30', city: '上海', utcOffset: 8 }

  it('keeps natal planets and the Part of Fortune off the AC/DC/MC/IC axes', () => {
    const chart = castAstro(a)
    const angles = { asc: chart.ascendant.longitude, mc: chart.midheaven.longitude }
    // Saturn sits on the descendant in this chart.
    const sat = chart.planets.find((p) => p.name === '土星')!
    expect(gap(sat.longitude, angles.asc + 180)).toBeLessThan(4)
    expectClearOfAxes(
      [...chart.planets, chart.fortune],
      angles,
      NATAL_LAYOUT.bands[0]!,
      NATAL_LAYOUT.aspect,
    )
  })

  it('keeps both bi-wheel rings and the composite off the axes', () => {
    const data = castSynastry({ a, b })
    const angles = { asc: data.a.ascendant.longitude, mc: data.a.midheaven.longitude }
    const [outer, inner] = BIWHEEL_LAYOUT.bands as [BodyBand, BodyBand]
    expectClearOfAxes(data.a.planets, angles, inner, BIWHEEL_LAYOUT.aspect)
    expectClearOfAxes(
      [...data.b.planets, data.b.ascendant, data.b.midheaven],
      angles,
      outer,
      BIWHEEL_LAYOUT.aspect,
    )
    const c = data.composite
    expectClearOfAxes(
      c.planets,
      { asc: c.ascendant.longitude, mc: c.midheaven.longitude },
      NATAL_LAYOUT.bands[0]!,
      NATAL_LAYOUT.aspect,
    )
  })

  it('moves an isolated body off an axis to the nearer edge of the clearance', () => {
    expect(spread([92, 200], 8, [90], 6)[0]).toBeCloseTo(96, 6)
    expect(spread([89, 200], 8, [90], 6)[0]).toBeCloseTo(84, 6)
    expect(spread([1, 200], 8, [359], 6)[0]).toBeCloseTo(5, 6)
  })

  it('pushes bodies sitting on an axis out of the clearance and keeps neighbours apart', () => {
    const band = NATAL_LAYOUT.bands[0]!
    const shown = spread([90, 91, 200], band.minGap, [90], band.axisClearance)
    for (const l of shown.slice(0, 2)) {
      expect(gap(l, 90)).toBeGreaterThanOrEqual(band.axisClearance - 1e-6)
    }
    // The pair fans out across the axis zone and stays next to it.
    expect(Math.min(gap(shown[0]!, 90), gap(shown[1]!, 90))).toBeLessThanOrEqual(
      band.axisClearance + band.minGap / 2 + 1e-6,
    )
    expect(gap(shown[0]!, shown[1]!)).toBeGreaterThanOrEqual(band.minGap - 1e-6)
    expect(shown[2]).toBe(200)
  })
})
