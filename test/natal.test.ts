import { describe, expect, it } from 'vitest'
import { civil } from '../src/bazi/civil-time.ts'
import { castFlow } from '../src/bazi/flow.ts'
import { castNatal, type NatalRequest } from '../src/bazi/natal.ts'
import { BaziChartSchema } from '../src/bazi/schema.ts'

const chart = castNatal(
  {
    birth: '1990-05-06 11:10',
    city: '北京',
    dst: true,
    apparentSolar: false,
    lateZi: 'today',
    gender: 'male',
    luckSteps: 10,
  },
  civil(2026, 11, 9, 12),
)

describe('natal chart facts beyond the reference script', () => {
  it('birth solar term', () => {
    expect(chart.birthTerm.prev).toEqual({ name: '立夏', time: '1990-05-06 02:35' })
    expect(chart.birthTerm.next.name).toBe('芒种')
  })

  it('per-pillar void branches and self-seated growth phases', () => {
    const p = chart.pillars
    expect([p.year, p.month, p.day, p.hour].map((x) => x.xunKong)).toEqual([
      '戌亥',
      '申酉',
      '戌亥',
      '午未',
    ])
    expect([p.year, p.month, p.day, p.hour].map((x) => x.ziZuo)).toEqual(['沐浴', '死', '衰', '胎'])
  })

  it('relations and seasonal strength', () => {
    expect(chart.relations.zhi).toEqual(['巳午未三会火', '午未合化火'])
    expect(chart.seasons.map((s) => s.element + s.state)).toEqual([
      '火旺',
      '土相',
      '木休',
      '水囚',
      '金死',
    ])
  })

  it('pillars in effect on the casting date', () => {
    expect(chart.now).toEqual({
      date: '2026-11-09',
      luck: '甲申',
      year: '丙午',
      month: '己亥',
      day: '丁亥',
    })
  })

  it('timeline covers 100 nominal years and fits one widget', () => {
    const t = chart.timeline!
    expect(t.firstYear).toBe(1990)
    expect(t.years).toHaveLength(100)
    expect(t.years[36]).toEqual({ year: 2026, age: 37, xiaoYun: '庚午' })
    expect(t.terms).toHaveLength(1200)
    expect(t.terms[0]!.startsWith('1990-02-04')).toBe(true)
    expect(t.terms[36 * 12 + 9]).toBe('2026-11-07 17:52')
    expect(t.lunarMonths.length).toBeGreaterThan(1230)
    expect(chart.luck?.preLuck).toEqual({ startYear: 1990, endYear: 1999, startAge: 1, endAge: 10 })
    expect(BaziChartSchema.parse(chart)).toEqual(chart)
    const bytes = Buffer.byteLength(JSON.stringify(chart))
    expect(bytes).toBeLessThan(200 * 1024)
  })
})

/** A male birth on 2024-02-04, the day of 立春 (16:27 Beijing time). */
const liChunBirth = (birth: string, city: string): NatalRequest => ({
  birth,
  city,
  dst: false,
  apparentSolar: false,
  lateZi: 'today',
  gender: 'male',
  luckSteps: 3,
})

describe('year and month pillars follow the absolute instant of the solar term', () => {
  it('Urumqi 18:00 is after 立春 although its true solar time is 15:50', () => {
    const c = castNatal(liChunBirth('2024-02-04 18:00', '乌鲁木齐'), civil(2026, 11, 9, 12))
    expect(c.trueSolarTime.slice(0, 16)).toBe('2024-02-04 15:50')
    expect(c.pillars.year.ganZhi).toBe('甲辰')
    expect(c.pillars.month.ganZhi).toBe('丙寅')
    expect(c.birthTerm.prev.name).toBe('立春')
    expect(c.birthTerm.next.name).toBe('惊蛰')
  })

  it('Urumqi keeps day and hour pillars on true solar time and reads the rest against them', () => {
    const c = castNatal(liChunBirth('2024-02-04 18:00', '乌鲁木齐'), civil(2026, 11, 9, 12))
    const { day, hour, month, year } = c.pillars
    expect(day.ganZhi).toBe('戊戌')
    expect(hour.ganZhi).toBe('庚申')
    expect(month.ganShiShen).toBe('偏印')
    expect(month.zhiShiShen).toEqual(['七杀', '偏印', '比肩'])
    expect(month.diShi).toBe('长生')
    expect(month.naYin).toBe('炉中火')
    expect(month.wuXing).toBe('火木')
    expect(year.ganShiShen).toBe('七杀')
    expect(year.naYin).toBe('覆灯火')
    expect(day.ganShiShen).toBe('日主')
    expect(c.palaces.taiYuan).toEqual({ ganZhi: '丁巳', naYin: '沙中土' })
    expect(c.seasons[0]).toEqual({ element: '木', state: '旺' })
  })

  it('Urumqi luck runs forward from the 寅 month for a yang-year male', () => {
    const c = castNatal(liChunBirth('2024-02-04 18:00', '乌鲁木齐'), civil(2026, 11, 9, 12))
    expect(c.luck?.forward).toBe(true)
    expect(c.luck?.steps.map((s) => s.ganZhi)).toEqual(['丁卯', '戊辰', '己巳'])
    expect(c.luck?.steps[0]?.ganShiShen).toBe('正印')
  })

  it('New York 05:00 EST is 18:00 Beijing time, after 立春', () => {
    const c = castNatal(liChunBirth('2024-02-04 05:00', '纽约'), civil(2026, 11, 9, 12))
    expect(c.pillars.year.ganZhi).toBe('甲辰')
    expect(c.pillars.month.ganZhi).toBe('丙寅')
    expect(c.pillars.hour.zhi).toBe('卯')
    expect(c.birthTerm.prev.name).toBe('立春')
  })

  it('Beijing 18:00 is unchanged', () => {
    const c = castNatal(liChunBirth('2024-02-04 18:00', '北京'), civil(2026, 11, 9, 12))
    expect(c.pillars.year.ganZhi).toBe('甲辰')
    expect(c.pillars.month.ganZhi).toBe('丙寅')
  })

  it('flow periods in Urumqi take month and year by instant, day and hour by solar time', () => {
    const flow = castFlow({
      start: '2024-02-04 17:00',
      end: '2024-02-04 18:30',
      city: '乌鲁木齐',
      apparentSolar: false,
    })
    const e = flow.entries.find((x) => x.moment === '2024-02-04 18:00')!
    expect(e.pillars.year.ganZhi).toBe('甲辰')
    expect(e.pillars.month.ganZhi).toBe('丙寅')
    expect(e.pillars.day.ganZhi).toBe('戊戌')
    expect(e.pillars.hour.ganZhi).toBe('庚申')
  })

  it('flow against an Urumqi natal chart reads the corrected natal pillars', () => {
    const flow = castFlow({
      start: '2024-02-05 12:00',
      end: '2024-02-05 12:30',
      apparentSolar: false,
      natal: liChunBirth('2024-02-04 18:00', '乌鲁木齐'),
    })
    expect(flow.natal).toEqual({ dayMaster: '戊', pillars: '甲辰 丙寅 戊戌 庚申' })
  })
})
