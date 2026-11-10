import { describe, expect, it } from 'vitest'
import { castQimen } from '../src/qimen/chart.ts'
import type { QimenChart } from '../src/qimen/schema.ts'
import { scoreQimen } from '../src/timing/qimen.ts'

const chart = castQimen({ time: '2026-07-24 18:00', event: '求财' })

/** The sample chart with its judgement patterns or 用神 replaced. */
function variant(change: (j: NonNullable<QimenChart['judgement']>) => void): QimenChart {
  const copy = structuredClone(chart)
  change(copy.judgement!)
  return copy
}

describe('qimen scorer', () => {
  it('takes the judgement total as the score and lists patterns as reasons', () => {
    const s = scoreQimen(chart)
    expect(s.score).toBe(-0.1)
    expect(s.veto).toBeUndefined()
    expect(s.reasons[0]).toBe('总分 -0.1')
    expect(s.reasons.some((r) => r.startsWith('三奇入墓'))).toBe(true)
  })

  it('vetoes 五不遇时', () => {
    const s = scoreQimen(
      variant((j) => {
        j.patterns.push({ name: '五不遇时', luck: '凶', note: '' })
      }),
    )
    expect(s.veto).toBe('五不遇时')
  })

  it('charges 伏吟 and 反吟 two points each instead of vetoing them', () => {
    for (const name of ['伏吟', '反吟']) {
      const s = scoreQimen(
        variant((j) => {
          j.patterns.push({ name, luck: '凶', note: '' })
        }),
      )
      expect(s.veto).toBeUndefined()
      expect(s.score).toBe(-2.1)
      expect(s.reasons).toContain(`${name}扣 2 分`)
    }
  })

  it('vetoes a 用神 in unreleased void, and not a released one', () => {
    const voided = variant((j) => {
      j.yongShen[0]!.void = true
    })
    expect(scoreQimen(voided).veto).toBe('用神生门空亡')
    const released = variant((j) => {
      j.yongShen[0]!.void = false
      j.yongShen[0]!.voidRelease = '逢冲填实'
    })
    expect(scoreQimen(released).veto).toBeUndefined()
  })

  it('rejects a chart cast without a matter', () => {
    expect(() => scoreQimen(castQimen({ time: '2026-07-24 18:00' }))).toThrow(/judgement/)
  })
})
