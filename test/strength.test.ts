import { describe, expect, it } from 'vitest'
import { civil } from '../src/bazi/civil-time.ts'
import { castNatal, type FourPillars } from '../src/bazi/natal.ts'
import { analyzeStrength, type StrengthAnalysis } from '../src/bazi/strength.ts'

/** Elements of the favourable roles: 用神 first, then 喜神 in order. */
const favourable = (s: StrengthAnalysis) => [s.yong.element, ...s.xi.map((x) => x.element)]
const unfavourable = (s: StrengthAnalysis) => s.ji.map((x) => x.element).sort()
const score = (s: StrengthAnalysis, element: string) =>
  s.elements.find((e) => e.element === element)!.score

describe('day-master strength and useful elements', () => {
  it('reads the reference chart (庚午 辛巳 辛未 癸巳) as weak summer metal needing water', () => {
    const chart = castNatal(
      {
        birth: '1990-05-06 11:10',
        city: '北京',
        dst: true,
        apparentSolar: false,
        lateZi: 'today',
        gender: 'male',
        luckSteps: 1,
      },
      civil(2026, 11, 9, 12),
    )
    const p = chart.pillars
    const pillars: FourPillars = [p.year.ganZhi, p.month.ganZhi, p.day.ganZhi, p.hour.ganZhi]
    expect(pillars).toEqual(['庚午', '辛巳', '辛未', '癸巳'])
    const s = analyzeStrength(pillars)
    // 巳 month: fire 旺 ×1.4, earth 相 ×1.2, wood 休 ×1.0, water 囚 ×0.8, metal 死 ×0.6.
    // Metal: 庚1.0 + 辛1.2 + 庚 in 巳 (0.3×3 + 0.3×1) = 3.4 ×0.6 = 2.04.
    // Earth: 己0.3 (午) + 戊0.3 (巳 month) + 己0.9 (未 ×1.5) + 戊0.1 (巳 hour) = 1.6 ×1.2 = 1.92.
    // Fire: 丁0.7 + 丙1.8 + 丁0.45 + 丙0.6 = 3.55 ×1.4 = 4.97.
    // Water: 癸1.0 unrooted ×0.6 = 0.6 ×0.8 = 0.48. Wood: 乙0.15.
    // 同类 (metal + earth) 3.96 of 9.56 = 41.4% < 45% → 身弱.
    expect(score(s, '金')).toBeCloseTo(2.04, 2)
    expect(score(s, '水')).toBeCloseTo(0.48, 2)
    expect(s.tongLei).toBeCloseTo(41.4, 1)
    expect(s.verdict).toBe('身弱')
    expect(s.pattern.name).toBe('普通')
    // Weak, and the heaviest 异类 is fire (官杀), not wealth → 印 (earth) leads 扶抑, metal
    // follows. Summer-born with water at 5% < 20% → 调候 water takes the 用神 place.
    expect(s.tiaoHou?.element).toBe('水')
    expect(favourable(s)).toEqual(['水', '土', '金'])
    expect(unfavourable(s)).toEqual(['木', '火'].sort())
  })

  it('reads spring wood with peers everywhere as strong, using metal to restrain the peers', () => {
    // 寅 month: wood 旺 1.4, fire 相 1.2, water 休 1.0, metal 囚 0.8, earth 死 0.6.
    // Wood: 甲1.0 + 甲1.0 + 甲 in 寅 0.6×(1+3+1.5) = 5.3 ×1.4 = 7.42.
    // Water: 癸 in 子 1.0 = 1.0. Fire: 丙1.2 + 丙 in 寅 0.3×5.5 = 2.85 ×1.2 = 3.42.
    // Earth: 戊 0.1×5.5 = 0.55 ×0.6 = 0.33. 同类 8.42 of 12.17 = 69.2% → 身强.
    // 比劫 (7.42) outweighs 印 (1.0), so 官杀 (metal) restrains them; 食伤 then 财 follow.
    const s = analyzeStrength(['甲寅', '丙寅', '甲寅', '甲子'])
    expect(s.tongLei).toBeCloseTo(69.2, 1)
    expect(s.verdict).toBe('身强')
    expect(s.roots).toEqual(['寅', '寅', '寅'])
    expect(s.tiaoHou).toBeNull()
    expect(favourable(s)).toEqual(['金', '火', '土'])
    expect(unfavourable(s)).toEqual(['木', '水'].sort())
  })

  it('reads autumn wood under heavy metal as weak, using water to relay the officer', () => {
    // 申 month: metal 旺 1.4, water 相 1.2, earth 休 1.0, fire 囚 0.8, wood 死 0.6.
    // Metal: 庚1.0 + 庚 in 申 0.6×6.5 = 4.9 ×1.4 = 6.86. Water: 壬1.0 + 壬 0.3×6.5 = 2.95
    // ×1.2 = 3.54. Earth: 戊 0.1×6.5 ×1.0 = 0.65. Wood: 甲 month 1.2 unrooted ×0.6 ×0.6 =
    // 0.432. 同类 3.97 of 11.48 = 34.6% → 身弱; heaviest 异类 is 官杀, so 印 (water) leads.
    const s = analyzeStrength(['庚申', '甲申', '甲申', '壬申'])
    expect(s.tongLei).toBeCloseTo(34.6, 1)
    expect(s.verdict).toBe('身弱')
    expect(s.roots).toEqual([])
    expect(favourable(s)).toEqual(['水', '木'])
    expect(unfavourable(s)).toEqual(['火', '土', '金'].sort())
  })

  it('reads wood drowned in earth as following wealth (从财)', () => {
    // 未 month: earth 旺 1.4, metal 相 1.2, fire 休 1.0, wood 囚 0.8, water 死 0.6.
    // Earth: 戊1.0 + 己1.2 + 戊1.0 + hidden (辰 0.6×2, 未 己1.8, 戌 0.9) = 7.1 ×1.4 = 9.94.
    // Wood: 乙 0.3×2 + 0.1×3 = 0.9 ×0.8 = 0.72. Water: 癸 0.1×2 ×0.6 = 0.12.
    // Fire: 丁 0.9 + 0.15 = 1.05. Metal: 辛 0.45 ×1.2 = 0.54.
    // 同类 0.84 of 12.37 = 6.8% < 15%, and the month 未 (main 己) and day 戌 (main 戊) hold no
    // wood or water main qi → 从弱; the heaviest 异类 is 财 (earth) → 从财: 财 leads, 食伤
    // (fire) and 官杀 (metal) follow, 比劫 and 印 are 忌. 从格 follows its force, so the
    // summer 调候 is not applied.
    const s = analyzeStrength(['戊辰', '己未', '甲戌', '戊辰'])
    expect(s.tongLei).toBeCloseTo(6.8, 1)
    expect(s.verdict).toBe('身弱')
    expect(s.pattern.name).toBe('从财')
    expect(s.tiaoHou).toBeNull()
    expect(favourable(s)).toEqual(['土', '火', '金'])
    expect(unfavourable(s)).toEqual(['木', '水'].sort())
  })

  it('reads the 1992-09-18 07:30 上海 chart (壬申 己酉 丁酉 甲辰) as 从财', () => {
    const p = castNatal(
      {
        birth: '1992-09-18 07:30',
        city: '上海',
        dst: false,
        apparentSolar: false,
        lateZi: 'today',
        gender: 'female',
        luckSteps: 1,
      },
      civil(2026, 11, 9, 12),
    ).pillars
    const pillars: FourPillars = [p.year.ganZhi, p.month.ganZhi, p.day.ganZhi, p.hour.ganZhi]
    expect(pillars).toEqual(['壬申', '己酉', '丁酉', '甲辰'])
    // 酉 month: metal 1.4, water 1.2, earth 1.0, fire 0.8, wood 0.6. All three stems rooted.
    // Metal: 庚0.6 + 辛3.0 + 辛1.5 = 5.1 ×1.4 = 7.14. Water: 壬1.0 + 0.3 + 0.1 = 1.4 ×1.2 = 1.68.
    // Earth: 己1.2 + 0.1 + 0.6 = 1.9. Wood: 甲1.0 + 乙0.3 = 1.3 ×0.6 = 0.78. Fire 0.
    // 同类 0.78 of 11.5 = 6.8% < 15%; month and day 酉 have main qi 辛 (财) → 从财 (metal):
    // 用 metal, 喜 earth (食伤) then water (官杀), 忌 fire and wood.
    const s = analyzeStrength(pillars)
    expect(s.tongLei).toBeCloseTo(6.8, 1)
    expect(s.pattern.name).toBe('从财')
    expect(favourable(s)).toEqual(['金', '土', '水'])
    expect(unfavourable(s)).toEqual(['火', '木'].sort())
  })

  it('reads wood under metal on every branch as following the officer (从官杀)', () => {
    // 酉 month. Metal: 辛1.0 + 辛 in 酉 1.0×6.5 = 7.5 ×1.4 = 10.5. Fire: 丁1.2
    // unrooted ×0.6 ×0.8 = 0.576. Wood: 乙1.0 unrooted ×0.6 ×0.6 = 0.36. 同类 0.36 of 11.44 =
    // 3.1%; every branch is 酉 (main 辛) → 从弱 with 官杀 heaviest → 从官杀: 用 metal, 喜 财
    // (earth), 忌 食伤 (fire), 比劫 and 印.
    const s = analyzeStrength(['辛酉', '丁酉', '乙酉', '乙酉'])
    expect(s.tongLei).toBeCloseTo(3.1, 1)
    expect(s.pattern.name).toBe('从官杀')
    expect(favourable(s)).toEqual(['金', '土'])
    expect(unfavourable(s)).toEqual(['木', '火', '水'].sort())
  })

  it('reads wood burnt out in fire as following its output (从儿)', () => {
    // 午 month. Fire: 丙1.0 + 丁 0.7×6.5 = 5.55 ×1.4 = 7.77. Earth: 己 1.95 ×1.2 = 2.34.
    // Wood: 甲1.2 unrooted ×0.6 = 0.72. Metal: 庚1.0 unrooted ×0.6 ×0.6 = 0.36.
    // 同类 0.72 of 11.19 = 6.4%; month and day 午 (main 丁) → 从弱 with 食伤 heaviest →
    // 从儿: 用 fire, 喜 财 (earth) then 比劫 (wood), 忌 印 (water) and 官杀 (metal).
    const s = analyzeStrength(['丙午', '甲午', '甲午', '庚午'])
    expect(s.tongLei).toBeCloseTo(6.4, 1)
    expect(s.pattern.name).toBe('从儿')
    expect(s.tiaoHou).toBeNull()
    expect(favourable(s)).toEqual(['火', '土', '木'])
    expect(unfavourable(s)).toEqual(['水', '金'].sort())
  })

  it('reads spring wood fed by water with no metal as following its strength (从强)', () => {
    // 卯 month: wood 1.4, fire 1.2, water 1.0, metal 0.8, earth 0.6. Stems all rooted.
    // Water: 壬1.0 + 癸1.2 + 癸 in 子 1.0 + 壬 in 亥 0.7 = 3.9. Wood: 乙1.0 + 乙3.0 + 甲0.9 +
    // 甲0.3 = 5.2 ×1.4 = 7.28. Fire: 丙0.45 ×1.2 = 0.54. Earth: 戊0.15 ×0.6 = 0.09.
    // 同类 11.18 of 11.81 = 94.7% ≥ 85%, 官杀 (metal) 0% and no metal stem → 从强:
    // 用 比劫 (wood, heavier than 印), 喜 印 (water) then 食伤 (fire), 忌 官杀 and 财.
    const s = analyzeStrength(['壬子', '癸卯', '甲寅', '乙亥'])
    expect(s.tongLei).toBeCloseTo(94.7, 1)
    expect(s.pattern.name).toBe('从强')
    expect(favourable(s)).toEqual(['木', '水', '火'])
    expect(unfavourable(s)).toEqual(['土', '金'].sort())
  })

  it('reads a near-even earth chart as balanced, leaning strong', () => {
    // 辰 month: earth 旺 1.4, metal 相 1.2, fire 休 1.0, wood 囚 0.8, water 死 0.6.
    // Earth: 戊1.2 + 戊 in 辰 0.6 + 1.8 + 戊 in 申 0.1 = 3.7 ×1.4 = 5.18; fire 0.
    // Wood: 甲1.0 (rooted in 辰's 乙) + 乙 0.3 + 0.9 = 2.2 ×0.8 = 1.76.
    // Water: 癸 0.1 + 0.3 + 1.5 + 壬 0.3 = 2.2 ×0.6 = 1.32. Metal: 庚1.0 + 0.6 = 1.6 ×1.2 = 1.92.
    // 同类 5.18 of 10.18 = 50.9% → 中和, at or above 50% so it leans strong: 比劫 outweigh 印
    // (fire 0) → 官杀 (wood) leads, 食伤 (metal) and 财 (water) follow.
    const s = analyzeStrength(['甲辰', '戊辰', '戊子', '庚申'])
    expect(s.tongLei).toBeCloseTo(50.9, 1)
    expect(s.verdict).toBe('中和')
    expect(s.yong.reason).toContain('中和偏强')
    expect(favourable(s)).toEqual(['木', '金', '水'])
    expect(unfavourable(s)).toEqual(['火', '土'].sort())
  })

  it('warms a frozen winter water chart with fire ahead of the 扶抑 choice', () => {
    // 子 month: water 旺 1.4, wood 相 1.2, metal 休 1.0, earth 囚 0.8, fire 死 0.6.
    // Water: 子 1.0 + 3.0 + 1.5 + 壬 in 亥 0.7 = 6.2 ×1.4 = 8.68.
    // Metal: 庚1.0 and 辛1.0 unrooted ×0.6 = 1.2 ×1.0 = 1.2. Earth: 戊1.2 unrooted ×0.6 ×0.8 =
    // 0.576. Wood: 甲 in 亥 0.3 ×1.2 = 0.36. 同类 9.88 of 10.82 = 91.3% → 身强; 比劫 outweigh
    // 印, so 扶抑 picks 官杀 (earth). Fire is 0% in a 子 month → 调候 fire becomes 用神.
    const s = analyzeStrength(['庚子', '戊子', '壬子', '辛亥'])
    expect(s.tongLei).toBeCloseTo(91.3, 1)
    expect(s.verdict).toBe('身强')
    // Not 从强 despite 91.3%: 官杀 earth holds 5.3% (≥ 5%) and 戊 stands on the month stem.
    expect(s.pattern.name).toBe('普通')
    expect(s.tiaoHou?.element).toBe('火')
    expect(s.yong.element).toBe('火')
    expect(favourable(s)).toEqual(['火', '土', '木'])
    expect(unfavourable(s)).toEqual(['水', '金'].sort())
  })

  it('cools a scorching summer fire chart with water, which 扶抑 also picks', () => {
    // 午 month: fire 旺 1.4, earth 相 1.2, wood 休 1.0, water 囚 0.8, metal 死 0.6.
    // Fire: 丙1.0 + 丁 0.7×6.5 = 5.55 ×1.4 = 7.77. Wood: 甲1.2 and 甲1.0 unrooted ×0.6 = 1.32.
    // Earth: 己 0.3×6.5 = 1.95 ×1.2 = 2.34. 同类 9.09 of 11.43 = 79.5% → 身强; 比劫 outweigh 印
    // → 官杀 (water) leads. Water is 0% in a 午 month → 调候 water, the same element.
    const s = analyzeStrength(['丙午', '甲午', '丙午', '甲午'])
    expect(s.tongLei).toBeCloseTo(79.5, 1)
    expect(s.verdict).toBe('身强')
    expect(s.tiaoHou?.element).toBe('水')
    expect(favourable(s)).toEqual(['水', '土', '金'])
    expect(unfavourable(s)).toEqual(['木', '火'].sort())
  })

  it('applies no 调候 to a summer chart that already holds enough water', () => {
    // 午 month with 壬子 day and 壬子 hour: water 0.8 × (1.0 + 1.5 + 1.0 + 壬1.0 rooted) far
    // above 20% of the total, so the summer rule stays silent.
    const s = analyzeStrength(['壬子', '丙午', '壬子', '壬子'])
    expect(s.elements.find((e) => e.element === '水')!.percent).toBeGreaterThan(20)
    expect(s.tiaoHou).toBeNull()
  })
})
