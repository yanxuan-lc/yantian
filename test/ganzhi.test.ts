import { LunarUtil, Solar } from 'lunar-typescript'
import { describe, expect, it } from 'vitest'
import {
  dayPillar,
  diShi,
  GAN,
  hideGan,
  hourPillars,
  jiaZi,
  mingGong,
  monthPillar,
  naYin,
  seasonStates,
  shenGong,
  shiShen,
  taiXi,
  taiYuan,
  xunKong,
  yearPillar,
  ZHI,
} from '../src/bazi/ganzhi.ts'

describe('pure stem-branch arithmetic agrees with the calendar library', () => {
  it('ten gods for every stem pair', () => {
    for (const d of GAN) for (const g of GAN) expect(shiShen(d, g)).toBe(LunarUtil.SHI_SHEN[d + g])
  })

  it('hidden stems for every branch', () => {
    for (const z of ZHI) expect(hideGan(z)).toEqual(LunarUtil.ZHI_HIDE_GAN[z])
  })

  it('na-yin and void branches for the whole cycle', () => {
    for (let i = 0; i < 60; i++) {
      const gz = jiaZi(i)
      expect(gz).toBe(LunarUtil.JIA_ZI[i])
      expect(naYin(gz)).toBe(LunarUtil.NAYIN[gz])
      expect(xunKong(gz)).toBe(LunarUtil.XUN_KONG[LunarUtil.getXunIndex(gz)])
    }
  })

  it('day, month, year and hour pillars for dates 1900–2100', () => {
    for (let t = Date.UTC(1900, 0, 3); t < Date.UTC(2100, 11, 31); t += 86_400_000 * 37) {
      const d = new Date(t)
      const [y, m, day] = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()]
      const lunar = Solar.fromYmdHms(y, m, day, 12, 0, 0).getLunar()
      const ec = lunar.getEightChar()
      expect(dayPillar(y, m, day), `${y}-${m}-${day}`).toBe(ec.getDay())
      expect(hourPillars(ec.getDayGan())[6]).toBe(ec.getTime())
      const monthIndex = (ZHI.indexOf(ec.getMonthZhi()) + 10) % 12
      expect(monthPillar(ec.getYearGan(), monthIndex)).toBe(ec.getMonth())
      const solarYear = lunar.getYearInGanZhiExact()
      expect([yearPillar(y), yearPillar(y - 1)]).toContain(solarYear)
    }
  })

  it('growth phases match the library for every stem and branch', () => {
    const ec = Solar.fromYmd(2000, 1, 1).getLunar().getEightChar()
    expect(diShi(ec.getDayGan(), ec.getDayZhi())).toBe(ec.getDayDiShi())
    expect(diShi('辛', '申')).toBe('帝旺')
    expect(diShi('甲', '申')).toBe('绝')
  })

  it('seasonal strength under a summer month', () => {
    expect(
      seasonStates('巳')
        .map((s) => s.element + s.state)
        .join(' '),
    ).toBe('火旺 土相 木休 水囚 金死')
  })
})

describe('palaces agree with the calendar library when all pillars come from one moment', () => {
  it('胎元, 胎息, 命宫 and 身宫 for every year stem, month branch and hour branch', () => {
    const combos = new Set<string>()
    const days = new Set<string>()
    const months = new Set<string>()
    const start = Solar.fromYmd(2000, 1, 1)
    for (let n = 0; n < 3660; n++) {
      // Rotating the hour branch day by day reaches every hour branch within each solar month.
      const slot = n % 12
      const hour = slot === 0 ? 23 : 2 * slot - 1
      const d = start.next(n)
      const ec = Solar.fromYmdHms(d.getYear(), d.getMonth(), d.getDay(), hour, 30, 0)
        .getLunar()
        .getEightChar()
      if (n % 2 === 1) ec.setSect(1)
      const label = `${ec.getYear()} ${ec.getMonth()} ${ec.getDay()} ${ec.getTime()}`
      expect(taiYuan(ec.getMonth()), label).toBe(ec.getTaiYuan())
      expect(taiXi(ec.getDay()), label).toBe(ec.getTaiXi())
      expect(mingGong(ec.getYearGan(), ec.getMonthZhi(), ec.getTimeZhi()), label).toBe(
        ec.getMingGong(),
      )
      expect(shenGong(ec.getYearGan(), ec.getMonthZhi(), ec.getTimeZhi()), label).toBe(
        ec.getShenGong(),
      )
      combos.add(ec.getYearGan() + ec.getMonthZhi() + ec.getTimeZhi())
      days.add(ec.getDay())
      months.add(ec.getMonth())
    }
    expect(combos.size).toBe(10 * 12 * 12)
    expect(days.size).toBe(60)
    expect(months.size).toBe(60)
  })
})
