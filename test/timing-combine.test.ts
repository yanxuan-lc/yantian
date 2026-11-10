import { describe, expect, it } from 'vitest'
import { percentiles, rankPeriods } from '../src/timing/combine.ts'
import type { SystemScore } from '../src/timing/types.ts'

const s = (score: number, veto?: string): SystemScore => ({
  score,
  reasons: [],
  ...(veto === undefined ? {} : { veto }),
})

describe('percentile ranks', () => {
  it('spreads distinct scores from 0 to 100', () => {
    expect(percentiles([3, 1, 2])).toEqual([100, 0, 50])
  })

  it('gives tied scores their mean rank', () => {
    expect(percentiles([1, 1, 3])).toEqual([25, 25, 100])
  })

  it('puts a single score at 100', () => {
    expect(percentiles([-4])).toEqual([100])
  })
})

describe('combining systems', () => {
  it('ranks each system within the periods no system vetoes', () => {
    const r = rankPeriods(
      [
        { almanac: s(5), qimen: s(1, '伏吟') },
        { almanac: s(1), qimen: s(2) },
        { almanac: s(3), qimen: s(3) },
      ],
      ['almanac', 'qimen'],
      5,
    )
    expect(r.periods[0]).toEqual({ vetoed: true, combined: null, consensus: 0, pct: {} })
    expect(r.periods[1]!.pct).toEqual({ almanac: 0, qimen: 0 })
    expect(r.periods[2]!.pct).toEqual({ almanac: 100, qimen: 100 })
    expect(r.top).toEqual([2, 1])
  })

  it('weights systems equally whatever their raw scale', () => {
    const rows = [
      { almanac: s(1), astro: s(300) },
      { almanac: s(2), astro: s(100) },
      { almanac: s(3), astro: s(200) },
    ]
    const r = rankPeriods(rows, ['almanac', 'astro'], 5)
    expect(r.periods.map((p) => p.combined)).toEqual([50, 25, 75])
    const scaled = rows.map((row) => ({ ...row, astro: s(row.astro.score / 1000) }))
    expect(rankPeriods(scaled, ['almanac', 'astro'], 5).periods).toEqual(r.periods)
  })

  it('averages only the systems that are present', () => {
    const r = rankPeriods(
      [
        { almanac: s(1), qimen: s(9) },
        { almanac: s(2), qimen: s(1) },
      ],
      ['almanac', 'qimen', 'astro'],
      5,
    )
    expect(r.periods.map((p) => p.combined)).toEqual([50, 50])
  })

  it('counts the systems at or above the 70th percentile as consensus', () => {
    const rows = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({
      almanac: s(n),
      qimen: s(n),
      astro: s(10 - n),
    }))
    const r = rankPeriods(rows, ['almanac', 'qimen', 'astro'], 5)
    expect(r.periods[7]!.consensus).toBe(2)
    expect(r.periods[6]!.consensus).toBe(0)
    expect(r.periods[0]!.consensus).toBe(1)
  })

  it('orders the top picks by combined percentile, then consensus, then time', () => {
    const rows = [0, 1, 2, 3, 4].map((n) => ({ almanac: s(n), qimen: s(4 - n) }))
    // Every period combines to 50; only period 2 has no system at or above 70.
    const r = rankPeriods(rows, ['almanac', 'qimen'], 5)
    expect(r.periods.map((p) => p.combined)).toEqual([50, 50, 50, 50, 50])
    expect(r.top).toEqual([0, 1, 3, 4, 2])
  })

  it('caps the top picks at the requested count', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ almanac: s(i) }))
    expect(rankPeriods(rows, ['almanac'], 10).top).toHaveLength(10)
  })
})
