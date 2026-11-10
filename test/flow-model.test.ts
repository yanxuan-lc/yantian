import { Solar } from 'lunar-typescript'
import { describe, expect, it } from 'vitest'
import { civil } from '../src/bazi/civil-time.ts'
import {
  chartBase,
  flowColumn,
  flowDays,
  flowHours,
  flowMonths,
  flowYear,
  monthIndexAt,
  solarYearAt,
} from '../src/bazi/flow-model.ts'
import { castNatal } from '../src/bazi/natal.ts'

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
const timeline = chart.timeline!

describe('flow view model of the reference chart', () => {
  it('months of 2026 start at 立春 and run 庚寅 … 辛丑', () => {
    const months = flowMonths(timeline, 2026)
    expect(months.map((m) => m.ganZhi).join(' ')).toBe(
      '庚寅 辛卯 壬辰 癸巳 甲午 乙未 丙申 丁酉 戊戌 己亥 庚子 辛丑',
    )
    expect(months[9]).toMatchObject({ term: '立冬', start: '2026-11-07 17:52' })
    expect(monthIndexAt(months, '2026-11-09 12:00')).toBe(9)
    expect(solarYearAt(timeline, '2026-01-20 10:00')).toBe(2025)
  })

  it('days of the 立冬 month carry day pillars and lunar labels', () => {
    const days = flowDays(timeline, flowMonths(timeline, 2026)[9]!)
    expect(days[0]).toMatchObject({ date: '2026-11-07', ganZhi: '乙酉', lunarDay: '廿九' })
    expect(days[2]).toEqual({
      date: '2026-11-09',
      ganZhi: '丁亥',
      lunarDay: '初一',
      lunarMonth: '十月',
    })
    expect(days.at(-1)!.date).toBe('2026-12-06')
  })

  it('every day of a decade agrees with the calendar library', () => {
    for (let year = 2020; year < 2030; year++) {
      for (const month of flowMonths(timeline, year)) {
        for (const day of flowDays(timeline, month)) {
          const [y, m, d] = day.date.split('-').map(Number) as [number, number, number]
          const lunar = Solar.fromYmd(y, m, d).getLunar()
          expect(day.ganZhi).toBe(lunar.getDayInGanZhi())
          expect(day.lunarDay).toBe(lunar.getDayInChinese())
        }
      }
    }
  })

  it('hours of a 丁 day start with 庚子 at 23:00', () => {
    const hours = flowHours('丁亥')
    expect(hours[0]).toEqual({ start: '23:00', ganZhi: '庚子' })
    expect(hours[11]).toEqual({ start: '21:00', ganZhi: '辛亥' })
  })

  it('columns of the luck, year, month and day pillars', () => {
    const base = chartBase(chart)
    expect(flowYear(2026)).toBe('丙午')
    const luck = flowColumn(base, '甲申')
    expect(luck).toMatchObject({ ganShiShen: '正财', diShi: '帝旺', ziZuo: '绝' })
    expect(luck.hidden.map((h) => `${h.gan}·${h.shiShen}`)).toEqual([
      '庚·劫财',
      '壬·伤官',
      '戊·正印',
    ])
    expect(flowColumn(base, '己亥').shenSha).toEqual([
      '文昌贵人',
      '金舆',
      '劫煞',
      '太极贵人',
      '空亡',
    ])
  })
})
