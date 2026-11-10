import { describe, expect, it } from 'vitest'
import { type NatalBase, natalBase, starsFor } from '../src/bazi/shensha.ts'

/** 1990-05-06 11:10 北京 夏令时: 庚午 辛巳 辛未 癸巳 (the reference chart supplied by the user). */
const base: NatalBase = natalBase(['庚午', '辛巳', '辛未', '癸巳'])

describe('shen-sha of the reference chart', () => {
  it('natal pillars', () => {
    expect(starsFor(base, '庚午', 'year')).toEqual(['天乙贵人', '月德贵人', '德秀贵人', '福星贵人'])
    expect(starsFor(base, '辛巳', 'month')).toEqual([
      '天德贵人',
      '驿马',
      '亡神',
      '国印',
      '德秀贵人',
      '福星贵人',
    ])
    expect(starsFor(base, '辛未', 'day')).toEqual(['天德贵人', '德秀贵人', '童子'])
    expect(starsFor(base, '癸巳', 'hour')).toEqual(['驿马', '亡神', '国印', '福星贵人', '童子'])
  })

  it('flowing pillars read against the natal chart', () => {
    expect(starsFor(base, '甲申', 'flow')).toEqual(['驿马', '劫煞', '羊刃', '学堂', '孤辰'])
    expect(starsFor(base, '丙午', 'flow')).toEqual(['天乙贵人', '将星', '天德合', '福星贵人'])
    expect(starsFor(base, '己亥', 'flow')).toEqual(['文昌贵人', '金舆', '劫煞', '太极贵人', '空亡'])
    expect(starsFor(base, '丁亥', 'flow')).toEqual(starsFor(base, '己亥', 'flow'))
  })

  it('day-pillar stars apply to the natal day pillar only', () => {
    const kuiGang = natalBase(['甲子', '丙寅', '庚辰', '丙子'])
    expect(starsFor(kuiGang, '庚辰', 'day')).toContain('魁罡')
    expect(starsFor(kuiGang, '庚辰', 'flow')).not.toContain('魁罡')
  })
})
