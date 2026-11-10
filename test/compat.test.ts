import { describe, expect, it } from 'vitest'
import { civil } from '../src/bazi/civil-time.ts'
import {
  type CompatRequest,
  type CompatSubject,
  castCompat,
  compareCharts,
} from '../src/bazi/compat.ts'
import {
  BaziCompatSchema,
  type CompatCategory,
  type CompatFact,
} from '../src/bazi/compat-schema.ts'
import type { FourPillars } from '../src/bazi/natal.ts'
import { analyzeStrength } from '../src/bazi/strength.ts'

/** Reference man 庚午 辛巳 辛未 癸巳 and a woman 辛未 丁酉 丙午 壬辰. */
const request: CompatRequest = {
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
}
const reading = castCompat(request, civil(2026, 11, 9, 12))

const subject = (
  label: string,
  gender: 'male' | 'female',
  pillars: FourPillars,
): CompatSubject => ({
  label,
  gender,
  pillars,
  strength: analyzeStrength(pillars),
})

const of = (facts: readonly CompatFact[], category: CompatCategory) =>
  facts.filter((f) => f.category === category)
const brief = (f: CompatFact) => [f.tone, f.title, f.points]

describe('bazi compatibility', () => {
  it('charts both persons and reads the spouse palaces (day pillars)', () => {
    expect(BaziCompatSchema.parse(reading)).toEqual(reading)
    expect(reading.persons.map((p) => p.label)).toEqual(['男方', '女方'])
    const pillars = reading.persons.map((p) =>
      [p.pillars.year, p.pillars.month, p.pillars.day, p.pillars.hour]
        .map((x) => x.ganZhi)
        .join(' '),
    )
    expect(pillars).toEqual(['庚午 辛巳 辛未 癸巳', '辛未 丁酉 丙午 壬辰'])
    expect(reading.persons.map((p) => p.strength.verdict)).toEqual(['身弱', '身弱'])
    // 辛 and 丙 combine (丙辛合化水, +8); 未 and 午 form a six-combination (+10).
    const spouse = of(reading.facts, 'spousePalace')
    expect(spouse.map(brief)).toEqual([
      ['吉', '日干 丙辛合化水', 8],
      ['吉', '日支 午未合化火', 10],
    ])
    expect(spouse[0]!.pillars).toEqual([
      { person: 0, pillar: 'day' },
      { person: 1, pillar: 'day' },
    ])
  })

  it('marks clashing and punishing day pillars as inauspicious', () => {
    // 辛 against 乙 is 乙辛冲 (−6); 未 against 丑 is both 未刑丑 (−6) and 丑未冲 (−10).
    const { facts } = compareCharts(
      subject('甲', 'male', ['庚午', '辛巳', '辛未', '癸巳']),
      subject('乙', 'female', ['甲子', '丙子', '乙丑', '丙子']),
    )
    expect(of(facts, 'spousePalace').map(brief)).toEqual([
      ['凶', '日干 乙辛冲', -6],
      ['凶', '日支 未刑丑', -6],
      ['凶', '日支 丑未冲', -10],
    ])
  })

  it('states a neutral spouse-palace fact when the day pillars do not interact', () => {
    // 甲 and 丁 neither combine nor clash; 子 and 亥 have no pair relation or 三合 group.
    const { facts } = compareCharts(
      subject('甲', 'male', ['甲子', '丙子', '甲子', '甲子']),
      subject('乙', 'female', ['甲子', '丙寅', '丁亥', '丙午']),
    )
    expect(of(facts, 'spousePalace').map((f) => f.tone)).toEqual(['平'])
  })

  it('reads the zodiac (year branches) by 六合, 三合, 冲, 害 and 刑', () => {
    // 午 and 未 form a six-combination (+8).
    expect(of(reading.facts, 'zodiac').map(brief)).toEqual([['吉', '年支 午未合化火', 8]])
    expect(of(reading.facts, 'zodiac')[0]!.pillars).toEqual([
      { person: 0, pillar: 'year' },
      { person: 1, pillar: 'year' },
    ])
    const pair = (y1: string, y2: string) =>
      of(
        compareCharts(
          subject('甲', 'male', [y1, '丙寅', '甲子', '甲子']),
          subject('乙', 'female', [y2, '丙寅', '丁亥', '丙午']),
        ).facts,
        'zodiac',
      ).map(brief)
    // 寅 and 午 are two of 寅午戌 (+6); 子 and 午 clash (−8); 子 and 未 harm (−5); 子 and 卯
    // punish (−4); 子 and 亥 have no relation (neutral).
    expect(pair('甲寅', '丙午')).toEqual([['吉', '年支 寅午半合（寅午戌）', 6]])
    expect(pair('甲子', '丙午')).toEqual([['凶', '年支 子午冲', -8]])
    expect(pair('甲子', '丁未')).toEqual([['凶', '年支 子未相害', -5]])
    expect(pair('甲子', '丁卯')).toEqual([['凶', '年支 子卯相刑', -4]])
    expect(pair('甲子', '丁亥').map(([tone]) => tone)).toEqual(['平'])
  })

  it('reads the day masters as generating, controlling or alike', () => {
    // Her 丙 fire controls his 辛 metal (−3).
    expect(of(reading.facts, 'dayMaster').map(brief)).toEqual([['凶', '日主 丙火克辛金', -3]])
    const pair = (d1: string, d2: string) =>
      of(
        compareCharts(
          subject('甲', 'male', ['甲子', '丙寅', d1, '甲子']),
          subject('乙', 'female', ['甲子', '丙寅', d2, '丙午']),
        ).facts,
        'dayMaster',
      ).map(brief)
    expect(pair('甲子', '丙寅')).toEqual([['吉', '日主 甲木生丙火', 5]])
    expect(pair('甲子', '乙丑')).toEqual([['平', '日主 甲乙同属木', 2]])
  })

  it("finds 红鸾, 天喜, 桃花 and 天乙 of one person on the other's pillars", () => {
    // From his year 午: 红鸾 酉, 天喜 卯; 桃花 卯 (寅午戌) and 子 (his day 未, 亥卯未); 天乙 of
    // 辛: 午寅. Her branches 未酉午辰: 红鸾 on her month 酉, 天乙 on her day 午 (+3 each).
    // From her year 未: 红鸾 申, 天喜 寅; 桃花 子 and 卯; 天乙 of 丙: 亥酉 — none in 午巳未巳.
    const stars = of(reading.facts, 'shenSha')
    expect(stars.map(brief)).toEqual([
      ['吉', '女方月柱酉为男方红鸾', 3],
      ['吉', '女方日柱午为男方天乙贵人', 3],
    ])
    expect(stars[0]!.pillars).toEqual([
      { person: 1, pillar: 'month' },
      { person: 0, pillar: 'year' },
    ])
    expect(stars[1]!.pillars).toEqual([
      { person: 1, pillar: 'day' },
      { person: 0, pillar: 'day' },
    ])
  })

  it('totals the base and every contribution into a banded score', () => {
    // 50 + 日柱 (8 + 10) + 生肖 8 + 日主 −3 + 用神 8 + 夫妻星 (−3 + 4) + 神煞 (3 + 3) = 88.
    expect(reading.facts.reduce((n, f) => n + f.points, 50)).toBe(88)
    expect(reading.score).toBe(88)
    expect(reading.verdict).toBe('上佳')
    expect(reading.scoreRule).toContain('传统命理参考')
  })

  describe('strength-based facts', () => {
    // Winter water man: 水80.3 金11.1 土5.3 木3.3 火0, 用神 火 (调候), 忌 水金.
    // Summer fire woman: 火68 土20.5 木11.5 水0 金0, 用神 水 (调候), 忌 木火.
    const winter = subject('冬', 'male', ['庚子', '戊子', '壬子', '辛亥'])
    const summer = subject('夏', 'female', ['丙午', '甲午', '丙午', '甲午'])
    const { facts } = compareCharts(winter, summer)

    it('finds elements one lacks (<10%) that the other holds in abundance (≥25%)', () => {
      // His fire 0% meets her fire 68%; her water 0% meets his water 80.3%: +4 each.
      expect(of(facts, 'elements').map(brief)).toEqual([
        ['吉', '冬缺火，夏火旺', 4],
        ['吉', '夏缺水，冬水旺', 4],
      ])
      // The highlight is where the abundant side holds the element: all of her pillars.
      expect(of(facts, 'elements')[0]!.pillars).toEqual([
        { person: 1, pillar: 'year' },
        { person: 1, pillar: 'month' },
        { person: 1, pillar: 'day' },
        { person: 1, pillar: 'hour' },
      ])
      // Reference pair: his scarce water/wood and her scarce wood meet nothing abundant.
      expect(of(reading.facts, 'elements').map((f) => f.tone)).toEqual(['平'])
    })

    it('counts only scarce elements that are favourable, so a 从格 chart is not fed what it avoids', () => {
      // 从财 man (戊辰 己未 甲戌 戊辰): 土80.4 火8.5 木5.8 金4.4 水1.0, 喜用 土火金, 忌 木水.
      // His scarce water meets her abundant water, but water is his 忌神: no fact. Her
      // scarce earth (5.3%, favourable to her) meets his earth 80.4%: +4.
      const cong = subject('从', 'male', ['戊辰', '己未', '甲戌', '戊辰'])
      const cold = subject('冬', 'female', ['庚子', '戊子', '壬子', '辛亥'])
      const { facts: f } = compareCharts(cong, cold)
      expect(of(f, 'elements').map(brief)).toEqual([['吉', '冬缺土，从土旺', 4]])
      // Her strongest element water is his 忌神 under 从财.
      expect(of(f, 'useful').map(brief)).toEqual([['凶', '冬水最旺，正为从忌神', -4]])
    })

    it("finds each person's 用神 strong (≥20%) in the other", () => {
      expect(of(facts, 'useful').map(brief)).toEqual([
        ['吉', '冬用神火，夏火旺', 8],
        ['吉', '夏用神水，冬水旺', 8],
      ])
      // Reference pair: his 用神 water is 12.2% in her (below 20%); her 用神 fire is 52% in him.
      expect(of(reading.facts, 'useful').map(brief)).toEqual([['吉', '女方用神火，男方火旺', 8]])
    })

    it("penalises a partner whose strongest element is one's 忌神", () => {
      // Her strongest element fire is his 忌神 when he is 庚午 辛巳 辛未 癸巳 (忌 木火).
      const { facts: f } = compareCharts(
        subject('甲', 'male', ['庚午', '辛巳', '辛未', '癸巳']),
        summer,
      )
      expect(of(f, 'useful').map(brief)).toContainEqual(['凶', '夏火最旺，正为甲忌神', -4])
    })

    it('reads the spouse star: 财 for a man, 官 for a woman', () => {
      // His 财 (fire) is 0% (−3), but her day master 丙 is fire (+6); her 官 (water) is 0%
      // (−3), but his day master 壬 is water (+6).
      expect(of(facts, 'spouseStar').map(brief)).toEqual([
        ['凶', '冬财星火偏弱', -3],
        ['吉', '夏日主丙火正为冬财星', 6],
        ['凶', '夏官星水偏弱', -3],
        ['吉', '冬日主壬水正为夏官星', 6],
      ])
      // Reference pair: his 财 wood 1.6% (−3); her 官 water 12.2% (+4).
      expect(of(reading.facts, 'spouseStar').map(brief)).toEqual([
        ['凶', '男方财星木偏弱', -3],
        ['吉', '女方官星水有力', 4],
      ])
    })
  })
})
