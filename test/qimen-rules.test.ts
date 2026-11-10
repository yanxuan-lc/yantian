import { describe, expect, it } from 'vitest'
import { castQimen, type QimenRequest } from '../src/qimen/chart.ts'
import type { QimenChart } from '../src/qimen/schema.ts'
import { qimenText } from '../src/qimen/text.ts'

/** Targeted traditional-rule checks on concrete moments, beside the golden parity suite. */

const palace = (chart: QimenChart, gua: string) => chart.palaces.find((p) => p.gua === gua)!
const cast = (time: string, extra: Omit<QimenRequest, 'time'> = {}) => castQimen({ time, ...extra })

/** Clockwise ring of the outer palaces, starting at 坎. */
const CLOCKWISE = [...'坎艮震巽離坤兌乾']

/** Whether `values` read round the ring is a rotation of `ring`. */
function isRotation(values: readonly (string | null)[], ring: string): boolean {
  const text = values.join('')
  return text.length === ring.length && (ring + ring).includes(text)
}

describe('陰遁 ring order', () => {
  it('2024-08-10 10:00 陰遁八局 lays stars, doors and spirits counter-clockwise', () => {
    const chart = cast('2024-08-10 10:00')
    expect(chart.ju.name.slice(0, 4)).toBe('陰遁八局')
    expect([palace(chart, '坎').star, palace(chart, '艮').star]).toEqual(['芮', '柱'])
    expect([palace(chart, '坎').door, palace(chart, '艮').door]).toEqual(['休', '生'])
    expect([palace(chart, '艮').god, palace(chart, '坎').god]).toEqual(['蛇', '陰'])
  })

  it('keeps star and door adjacency rigid and runs the spirits per 遁 over every slot of 2024', () => {
    const failures: string[] = []
    for (let day = 0; day < 366; day++) {
      const date = new Date(Date.UTC(2024, 0, 1 + day)).toISOString().slice(0, 10)
      for (let hour = 0; hour < 24; hour += 2) {
        const time = `${date} ${String(hour).padStart(2, '0')}:30`
        const chart = cast(time)
        const at = (pick: (p: QimenChart['palaces'][number]) => string | null) =>
          CLOCKWISE.map((g) => pick(palace(chart, g)))
        const yin = chart.ju.dun === '陰遁'
        const gods = at((p) => p.god)
        const godRing = yin ? [...'符蛇陰合虎玄地天'].reverse().join('') : '符蛇陰合勾雀地天'
        if (
          !isRotation(
            at((p) => p.star),
            '蓬任沖輔英芮柱心',
          ) ||
          !isRotation(
            at((p) => p.door),
            '休生傷杜景死驚開',
          ) ||
          !isRotation(gods, godRing)
        ) {
          failures.push(`${time} ${chart.ju.name}`)
        }
      }
    }
    expect(failures.slice(0, 5)).toEqual([])
  })
})

describe('solar term at the absolute instant', () => {
  it('2024-02-04 17:00 at 乌鲁木齐 is past 立春 Beijing time while pillars stay on solar time', () => {
    const chart = cast('2024-02-04 17:00', { city: '乌鲁木齐' })
    expect(chart.solarTerm).toBe('立春')
    expect(chart.ju.name.slice(0, 4)).toBe('陽遁八局')
    expect(chart.chartTime).toBe('2024-02-04 14:50')
    expect(chart.pillars.hour.charAt(1)).toBe('未')
  })
})

describe('hour stem in the centre with the 旬首仪 at 坤', () => {
  it('2024-01-02 11:30 陽遁一局上 keeps the heaven plate on the earth plate (伏吟)', () => {
    const chart = cast('2024-01-02 11:30')
    expect(chart.ju.name).toBe('陽遁一局上')
    expect(chart.zhiFu.palace).toBe('中')
    expect(palace(chart, '坤').earth).toBe(chart.zhiFu.yi)
    const outer = chart.palaces.filter((p) => p.gua !== '中')
    expect(outer.map((p) => p.sky)).toEqual(outer.map((p) => p.earth))
  })
})

describe('中五寄坤: the centre stem rides with 天芮', () => {
  const ruiPalace = (chart: QimenChart) => chart.palaces.find((p) => p.star === '芮')!

  it('2024-01-04 09:30 puts the centre stem 壬 beside the heaven stem where 天芮 lands', () => {
    const chart = cast('2024-01-04 09:30')
    expect(palace(chart, '中').earth).toBe('壬')
    expect(ruiPalace(chart).skyLodged).toBe('壬')
    expect(chart.palaces.filter((p) => p.skyLodged !== undefined)).toHaveLength(1)
  })

  it('2024-01-04 09:30 keeps the 旬首仪 of a 禽 值符 on the heaven plate at the 值符 palace', () => {
    const chart = cast('2024-01-04 09:30')
    expect(chart.zhiFu.star).toBe('禽')
    expect(palace(chart, chart.zhiFu.palace).skyLodged).toBe(chart.zhiFu.yi)
  })

  it('2024-01-15 09:30 求财 reads the day stem 戊 where 天芮 lands, with its 克应', () => {
    const chart = cast('2024-01-15 09:30', { event: '求财' })
    const day = chart.judgement!.yongShen[1]!
    expect(chart.pillars.day.charAt(0)).toBe('戊')
    expect(day.palace).toBe(ruiPalace(chart).gua)
    expect(day.note).toBeUndefined()
    expect(day.report).toMatchObject({ skyLodged: '戊', keYingLodged: expect.any(String) })
  })

  it('states the lodged stem in the model text', () => {
    const chart = cast('2024-01-15 09:30', { event: '求财' })
    const gua = ruiPalace(chart).gua
    const text = qimenText(chart)
    expect(text).toMatch(new RegExp(`${gua}宫\\(.*天盘 \\S+（寄戊）`))
    expect(text).toMatch(new RegExp(`用神 求测人\\(日干\\) 落${gua}宫.*寄戊`))
  })

  const patterns = (time: string) =>
    cast(time, { event: '谋事' }).judgement!.patterns.map((p) => `${p.name}${p.palace ?? ''}`)

  it('detects 青龙返首 from a lodged 戊 over 丙 (2024-01-12 11:30)', () => {
    expect(patterns('2024-01-12 11:30')).toContain('青龙返首震')
  })

  it('detects 飞鸟跌穴 from a lodged 丙 over 戊 (2024-01-06 01:30)', () => {
    expect(patterns('2024-01-06 01:30')).toContain('飞鸟跌穴兌')
  })

  it('detects 日格 from a lodged 庚 over the day stem (2024-02-01 05:30)', () => {
    expect(patterns('2024-02-01 05:30')).toContain('日格坤')
  })

  it('detects 时格 from a lodged 庚 over the hour stem (2024-02-01 19:30)', () => {
    expect(patterns('2024-02-01 19:30')).toContain('时格坎')
  })
})

describe('六仪击刑 on the heaven plate', () => {
  it('2024-03-31 陽遁三局 flags 戊落震宫 only in hours whose heaven stem at 震 is 戊', () => {
    const rows = Array.from({ length: 12 }, (_, i) => {
      const chart = cast(`2024-03-31 ${String(i * 2).padStart(2, '0')}:30`, { event: '谋事' })
      expect(chart.ju.name.slice(0, 4)).toBe('陽遁三局')
      const flagged = chart.judgement!.patterns.some(
        (p) => p.name === '六仪击刑' && p.note.startsWith('戊落震宫'),
      )
      return [flagged, palace(chart, '震').sky === '戊']
    })
    expect(rows.filter(([flagged]) => flagged).length).toBeLessThan(12)
    for (const [flagged, skyWu] of rows) expect(flagged).toBe(skyWu)
  })
})

describe('门迫: the door controls its palace', () => {
  const yong = (time: string, symbol: string) =>
    cast(time, { event: '出行' }).judgement!.yongShen.find((u) => u.symbol === symbol)!

  it('2024-03-20 13:30: 生门 (土) at 巽 (木) is controlled by its palace, not 门迫', () => {
    expect(yong('2024-03-20 13:30', '生门')).toMatchObject({
      palace: '巽',
      report: { doorPressed: false },
    })
  })

  it('2024-03-20 15:30: 开门 (金) at 巽 (木) controls its palace, 门迫', () => {
    expect(yong('2024-03-20 15:30', '開门')).toMatchObject({
      palace: '巽',
      report: { doorPressed: true },
    })
  })
})

describe('十干克应 table', () => {
  const report = (time: string, role: string) =>
    cast(time, { event: '谋事' }).judgement!.yongShen.find((u) => u.role === role)!.report!

  it('2024-01-01 09:30: 己 over 庚 is 刑格返名 and costs 1', () => {
    expect(report('2024-01-01 09:30', '所谋(时干)')).toMatchObject({
      sky: '己',
      earth: '庚',
      keYing: '刑格返名',
      score: -3.3,
    })
  })

  it('2024-01-03 23:30: 丁 over 己 is 火入勾陈', () => {
    expect(report('2024-01-03 23:30', '求测人(日干)')).toMatchObject({
      sky: '丁',
      earth: '己',
      keYing: '火入勾陈',
      // Includes +1 for 丁 over the centre's 壬 lodged at 坤 (奇合有喜).
      score: 2.2,
    })
  })
})

describe('伏吟 charts score the self-pair 克应 once, as the 伏吟 pattern', () => {
  const judged = (time: string) => cast(time, { event: '谋事' }).judgement!

  it('2024-01-01 07:30: 戊 over 戊 keeps its name and adds nothing to the palace', () => {
    const j = judged('2024-01-01 07:30')
    expect(j.patterns.map((p) => p.name)).toContain('伏吟')
    expect(j.yongShen[0]!.report).toMatchObject({
      sky: '戊',
      earth: '戊',
      keYing: '伏吟',
      score: 2.1,
    })
  })

  it('2024-01-01 19:30: 己 over 己 keeps its name and adds nothing to the palace', () => {
    const j = judged('2024-01-01 19:30')
    expect(j.patterns.map((p) => p.name)).toContain('伏吟')
    expect(j.yongShen[0]!.report).toMatchObject({
      sky: '己',
      earth: '己',
      keYing: '地户逢鬼',
      // The self pair adds nothing; −1 comes from 己 over the centre's 壬 lodged at 坤.
      score: -4.8,
    })
  })
})

describe('中宫寄坤: a 用神 in the centre is read at 坤', () => {
  it('2026-07-24 18:00 求财 reads the centred 值符 (财之总) at 坤', () => {
    const chart = cast('2026-07-24 18:00', { event: '求财' })
    const kun = palace(chart, '坤')
    const zhiFu = chart.judgement!.yongShen[2]!
    expect(chart.zhiFu.palace).toBe('中')
    expect(zhiFu).toMatchObject({
      role: '财之总(值符)',
      palace: '中',
      lodgedAt: '坤',
      report: {
        sky: kun.sky,
        earth: kun.earth,
        door: kun.door,
        star: `天${kun.star}`,
        god: expect.any(String),
      },
    })
    expect(zhiFu.note).toBeUndefined()
    expect(zhiFu.void).toEqual(expect.any(Boolean))
    const read = new Map(
      chart.judgement!.yongShen.map((u) => [u.lodgedAt ?? u.palace, u.report!.score]),
    )
    const sum = [...read.values()].reduce((a, b) => a + b, 0)
    expect(chart.judgement!.score.palaces).toBeCloseTo(sum, 2)
  })

  it('labels the centred 用神 truthfully in the model text', () => {
    const text = qimenText(cast('2026-07-24 18:00', { event: '求财' }))
    expect(text).toContain('用神 财之总(值符) 落中宫（寄坤）（值符）｜天盘')
  })
})

describe('lodged stems in every placement pattern', () => {
  const found = (time: string) =>
    cast(time, { event: '谋事' }).judgement!.patterns.map((p) => `${p.name}${p.palace ?? ''}`)
  const notes = (time: string) =>
    cast(time, { event: '谋事' }).judgement!.patterns.map((p) => p.note)

  it('三奇临吉门 from a lodged 丁 with 休门 at 離 (2024-01-06 11:30)', () => {
    expect(notes('2024-01-06 11:30')).toContain('丁奇临休门')
    expect(found('2024-01-06 11:30')).toContain('三奇临吉门離')
  })

  it('三奇入墓 from a lodged 丁 at 乾 (2024-01-06 21:30)', () => {
    expect(found('2024-01-06 21:30')).toContain('三奇入墓乾')
  })

  it('六仪击刑 from a lodged 壬 at 巽 (2024-01-01 05:30)', () => {
    expect(notes('2024-01-01 05:30')).toContain('壬落巽宫击刑，主受阻')
  })

  it('青龙返首 with the earth 丙 of the centre counted at 坤 (2024-01-06 03:30)', () => {
    expect(found('2024-01-06 03:30')).toContain('青龙返首坤')
  })

  it('飞鸟跌穴 with the earth 戊 of the centre counted at 坤 (2024-01-11 17:30)', () => {
    expect(found('2024-01-11 17:30')).toContain('飞鸟跌穴坤')
  })

  it('日格 with the day stem in the centre counted at 坤 (2024-01-15 13:30)', () => {
    expect(found('2024-01-15 13:30')).toContain('日格坤')
  })

  it('时格 with the hour stem in the centre counted at 坤 (2024-01-03 07:30)', () => {
    expect(found('2024-01-03 07:30')).toContain('时格坤')
  })
})

describe('a centred 值符 carries no extra penalty', () => {
  it('2026-07-24 18:00 求财 totals the parts without a 值符入中 charge', () => {
    const s = cast('2026-07-24 18:00', { event: '求财' }).judgement!.score
    expect(s).not.toHaveProperty('zhiFuCentre')
    expect(s.total).toBeCloseTo(s.palaces + s.patterns + s.yiMa + s.void + s.zhiShi + s.wealth, 2)
    expect(s.total).toBe(-0.1)
  })
})

describe('克应 over the centre earth stem lodged at 坤', () => {
  it('2026-07-24 18:00 求财: 坤 戊 over the centre 癸 is 青龙华盖', () => {
    const report = cast('2026-07-24 18:00', { event: '求财' }).judgement!.yongShen[2]!.report!
    expect(report).toMatchObject({
      sky: '戊',
      earth: '乙',
      earthLodged: '癸',
      keYingEarthLodged: '青龙华盖',
    })
  })

  it('2024-01-03 21:30 谋事: 坤 辛 over the centre 壬 is 凶蛇入狱 and costs 1', () => {
    const j = cast('2024-01-03 21:30', { event: '谋事' }).judgement!
    const report = j.yongShen.find((u) => u.palace === '坤')!.report!
    expect(report).toMatchObject({
      sky: '辛',
      earthLodged: '壬',
      keYingEarthLodged: '凶蛇入狱',
      score: 2.3,
    })
  })

  it('states the lodged earth stem and its 克应 in the model text', () => {
    const text = qimenText(cast('2024-01-03 21:30', { event: '谋事' }))
    expect(text).toMatch(/落坤宫.*地盘 己（寄壬）.*地寄克应 凶蛇入狱/)
  })
})
