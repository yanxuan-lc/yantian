import { describe, expect, it } from 'vitest'
import { castAstro } from '../src/astro/chart.ts'
import {
  BODIES,
  CONTACT_WEIGHTS,
  castSynastry,
  composite,
  compositeAngles,
  interAspects,
  keyContacts,
  midpoint,
  overlays,
  tally,
} from '../src/astro/synastry.ts'
import { AstroSynastrySchema, type InterAspect } from '../src/astro/synastry-schema.ts'

const chart = castAstro({ label: '甲', time: '2000-01-01 20:00', city: '北京' })
const other = castAstro({ label: '乙', time: '1990-05-01 08:00', city: '上海' })

describe('synastry of a chart with itself', () => {
  it('conjoins every body with its own counterpart at orb 0', () => {
    const aspects = interAspects(chart, chart)
    const own = aspects.filter((x) => x.a === x.b)
    expect(own.map((x) => x.a)).toEqual([...BODIES])
    for (const x of own) expect(x).toMatchObject({ type: '合', angle: 0, orb: 0, applying: null })
  })

  it('repeats every natal planet aspect both ways with the natal applying state', () => {
    const aspects = interAspects(chart, chart)
    for (const n of chart.aspects) {
      for (const [a, b] of [
        [n.a, n.b],
        [n.b, n.a],
      ]) {
        const hit = aspects.find((x) => x.a === a && x.b === b)
        expect(hit, `${a}-${b}`).toMatchObject({ type: n.type, applying: n.applying })
        expect(Math.abs(hit!.orb - n.orb)).toBeLessThan(0.0101)
      }
    }
  })

  it('leaves applying undecided for every pair involving an angle', () => {
    for (const x of interAspects(chart, other)) {
      const angle = [x.a, x.b].some((n) => n === '上升' || n === '中天')
      if (angle) expect(x.applying, `${x.a}-${x.b}`).toBeNull()
      else expect(typeof x.applying).toBe('boolean')
    }
  })

  it('overlays each body into its own natal house, the ascendant into the first', () => {
    const mcHouse = chart.houses.find((h) => h.sign === chart.midheaven.sign)!.house
    expect(overlays(chart, chart)).toEqual([
      ...chart.planets.map((p) => ({ body: p.name, house: p.house })),
      { body: '上升', house: 1 },
      { body: '中天', house: mcHouse },
    ])
  })
})

describe('house overlays between two people', () => {
  it('counts each body of one person from the ascendant sign of the other', () => {
    const signs = [
      '白羊',
      '金牛',
      '双子',
      '巨蟹',
      '狮子',
      '处女',
      '天秤',
      '天蝎',
      '射手',
      '摩羯',
      '水瓶',
      '双鱼',
    ]
    const house = (sign: string, asc: string) =>
      ((signs.indexOf(sign) - signs.indexOf(asc) + 12) % 12) + 1
    const aInB = overlays(chart, other)
    for (const p of chart.planets) {
      expect(aInB.find((o) => o.body === p.name)!.house).toBe(house(p.sign, other.ascendant.sign))
    }
    const bInA = overlays(other, chart)
    expect(bInA.find((o) => o.body === '上升')!.house).toBe(
      house(other.ascendant.sign, chart.ascendant.sign),
    )
  })
})

describe('key contacts', () => {
  const x = (a: string, type: string, b: string): InterAspect =>
    ({ a, b, type, angle: 0, orb: 1, applying: null }) as InterAspect

  it('tags themes in reporting order with their tone and weight and tallies both tones', () => {
    const contacts = keyContacts([
      x('上升', '冲', '上升'),
      x('火星', '合', '上升'),
      x('木星', '合', '上升'),
      x('上升', '合', '土星'),
      x('土星', '合', '太阳'),
      x('土星', '拱', '木星'),
      x('火星', '刑', '金星'),
      x('金星', '合', '火星'),
      x('水星', '六合', '水星'),
      x('太阳', '拱', '月亮'),
    ])
    expect(contacts.map((c) => [c.a, c.type, c.b, c.theme, c.tone, c.weight])).toEqual([
      ['太阳', '拱', '月亮', '日月', '和谐', 3],
      ['火星', '刑', '金星', '金火', '挑战', 2],
      ['金星', '合', '火星', '金火', '和谐', 2],
      ['上升', '合', '土星', '土星', '挑战', 2],
      ['土星', '合', '太阳', '土星', '挑战', 2],
      ['火星', '合', '上升', '上升', '挑战', 2],
      ['木星', '合', '上升', '上升', '和谐', 2],
    ])
    expect(tally(contacts)).toEqual({ harmony: 7, tension: 8, harmonyCount: 3, tensionCount: 4 })
    expect(CONTACT_WEIGHTS).toEqual({ 日月: 3, 金火: 2, 土星: 2, 上升: 2 })
  })

  it('reads sextiles as harmonious and oppositions as challenging whatever the planets', () => {
    const [opposition, sextile] = keyContacts([x('土星', '六合', '月亮'), x('太阳', '冲', '月亮')])
    expect(sextile).toMatchObject({ theme: '土星', tone: '和谐' })
    expect(opposition).toMatchObject({ theme: '日月', tone: '挑战' })
  })
})

describe('midpoints', () => {
  it('takes the shorter arc, wrapping across 0° Aries, in either order', () => {
    expect(midpoint(20, 40)).toEqual({ longitude: 30, ambiguous: false })
    expect(midpoint(350, 10)).toEqual({ longitude: 0, ambiguous: false })
    expect(midpoint(10, 350)).toEqual({ longitude: 0, ambiguous: false })
    expect(midpoint(355, 15)).toEqual({ longitude: 5, ambiguous: false })
    expect(midpoint(300, 100)).toEqual({ longitude: 20, ambiguous: false })
  })

  it('resolves a pair within 0.1° of opposition by the arithmetic mean and flags it', () => {
    expect(midpoint(10, 190)).toEqual({ longitude: 100, ambiguous: true })
    expect(midpoint(190, 10)).toEqual({ longitude: 100, ambiguous: true })
    // The shorter arc would give 79.975 across 0° Aries.
    const near = midpoint(350, 169.95)
    expect(near.ambiguous).toBe(true)
    expect(near.longitude).toBeCloseTo(259.975, 9)
    const outside = midpoint(350, 169.85)
    expect(outside.ambiguous).toBe(false)
    expect(outside.longitude).toBeCloseTo(79.925, 9)
  })

  it('keeps the composite ascendant within the 180° after the composite midheaven', () => {
    // A: MC 280, ASC 10; B: MC 90, ASC 200 → MC midpoint 5, ASC midpoint 285 lies behind it.
    const flipped = compositeAngles([10, 200], [280, 90])
    expect(flipped.midheaven.longitude).toBeCloseTo(5, 9)
    expect(flipped.ascendant.longitude).toBeCloseTo(105, 9)
    const kept = compositeAngles([350, 100], [260, 10])
    expect(kept.midheaven.longitude).toBeCloseTo(315, 9)
    expect(kept.ascendant.longitude).toBeCloseTo(45, 9)
  })
})

describe('composite chart', () => {
  it('of a chart with itself equals the chart', () => {
    const c = composite(chart, chart)
    const strip = <T extends object>(p: T) => ({ ...p, ambiguous: undefined })
    expect(strip(c.ascendant)).toEqual({ ...chart.ascendant, ambiguous: undefined })
    expect(strip(c.midheaven)).toEqual({ ...chart.midheaven, ambiguous: undefined })
    expect(c.planets.map((p) => [p.name, p.longitude, p.sign, p.degree, p.house])).toEqual(
      chart.planets.map((p) => [p.name, p.longitude, p.sign, p.degree, p.house]),
    )
    expect([c.ascendant, c.midheaven, ...c.planets].every((p) => !p.ambiguous)).toBe(true)
    expect(c.houses).toEqual(chart.houses)
    expect(c.aspects.map((a) => [a.a, a.b, a.type, a.angle])).toEqual(
      chart.aspects.map((a) => [a.a, a.b, a.type, a.angle]),
    )
    c.aspects.forEach((a, i) => {
      expect(Math.abs(a.orb - chart.aspects[i]!.orb)).toBeLessThan(0.0101)
    })
  })

  it('counts whole-sign houses from the composite ascendant', () => {
    const c = composite(chart, other)
    expect(c.houses[0]!.sign).toBe(c.ascendant.sign)
    for (const p of c.planets) {
      expect(c.houses[p.house - 1]!.sign, p.name).toBe(p.sign)
    }
  })
})

describe('castSynastry', () => {
  it('casts both people and round-trips through the schema under 64 KiB', () => {
    const s = castSynastry({
      a: { label: '甲', time: '2000-01-01 20:00', city: '北京' },
      b: { label: '乙', time: '1990-05-01 08:00', city: '上海' },
    })
    expect(s.label).toBe('甲 × 乙')
    expect(s.a).toEqual(chart)
    expect(s.b).toEqual(other)
    expect(s.interAspects).toEqual(interAspects(chart, other))
    expect(s.overlays).toEqual({ aInB: overlays(chart, other), bInA: overlays(other, chart) })
    expect(s.tally).toEqual(tally(keyContacts(s.interAspects)))
    const json = JSON.stringify(s)
    expect(AstroSynastrySchema.parse(JSON.parse(json))).toEqual(s)
    expect(new TextEncoder().encode(json).byteLength).toBeLessThan(64 * 1024)
  })

  it('names the person whose input was rejected', () => {
    expect(() =>
      castSynastry({ a: { time: '2026-02-30 10:00' }, b: { time: '2000-01-01 20:00' } }),
    ).toThrow(/^a\.time:/)
    expect(() =>
      castSynastry({
        a: { time: '2000-01-01 20:00' },
        b: { time: '2000-01-01 20:00', city: '火星城' },
      }),
    ).toThrow(/^b\.city:/)
  })
})
