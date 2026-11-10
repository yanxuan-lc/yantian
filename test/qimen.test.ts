import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { castQimen } from '../src/qimen/chart.ts'
import { type QimenChart, QimenChartSchema, type QimenEvent } from '../src/qimen/schema.ts'

/**
 * Output of the reference `qimen.py` / `duanju.py` with the traditional-rule corrections of
 * `scripts/golden_qimen.py`, recorded by that script. Every field is compared; the lodged
 * centre stem appears as `天盘寄` on the chart and as `天盘寄`/`克应寄` on 用神 reports, and a
 * 用神 read at 坤 from the centre carries `寄宫`; a 坤 report carries the centre's earth stem
 * as `地盘寄`/`克应地寄`.
 */
interface GoldenCase {
  readonly clock: string
  readonly city?: string
  readonly apparent?: boolean
  /** Moment handed to the reference scripts: the clock time, or the true solar time. */
  readonly moment: string
  // biome-ignore lint/suspicious/noExplicitAny: reference JSON is compared field by field
  readonly chart: any
  // biome-ignore lint/suspicious/noExplicitAny: reference JSON is compared field by field
  readonly judgements: Record<string, any>
}
const golden = JSON.parse(
  readFileSync(new URL('./fixtures/qimen-golden.json', import.meta.url), 'utf8'),
) as { cases: GoldenCase[] }

const cast = (c: GoldenCase, event?: QimenEvent) =>
  castQimen({
    time: c.clock,
    ...(c.city === undefined ? {} : { city: c.city, apparentSolar: c.apparent === true }),
    ...(event === undefined ? {} : { event }),
  })

const byGua = <T>(chart: QimenChart, pick: (p: QimenChart['palaces'][number]) => T | null) =>
  Object.fromEntries(
    chart.palaces.flatMap((p) => {
      const v = pick(p)
      return v === null ? [] : [[p.gua, v]]
    }),
  )

/** The chart in the reference output's shape. */
function referenceChart(chart: QimenChart) {
  return {
    排盘方式: chart.conventions.juMethod,
    钟表时间: chart.chartTime,
    干支: {
      年: chart.pillars.year,
      月: chart.pillars.month,
      日: chart.pillars.day,
      时: chart.pillars.hour,
    },
    节气: chart.solarTerm,
    排局: chart.ju.name,
    阴阳遁: chart.ju.dun,
    旬首: chart.xunShou,
    旬空: { 日空: chart.xunKong.day, 時空: chart.xunKong.hour },
    值符值使: {
      值符天干: [chart.xunShou, chart.zhiFu.yi],
      值符星宮: [chart.zhiFu.star, chart.zhiFu.palace],
      值使門宮: [chart.zhiShi.door, chart.zhiShi.palace],
    },
    地盘: byGua(chart, (p) => p.earth),
    天盘: byGua(chart, (p) => p.sky),
    天盘寄: byGua(chart, (p) => p.skyLodged ?? null),
    门: byGua(chart, (p) => p.door),
    星: byGua(chart, (p) => p.star),
    神: byGua(chart, (p) => p.god),
    九宫: byGua(chart, (p) => ({
      地盘: p.earth,
      天盘: p.sky,
      星: p.star,
      门: p.door,
      门吉凶: p.doorLuck,
      神: p.god,
    })),
  }
}

/** The judgement in the reference output's shape. */
function referenceJudgement(chart: QimenChart) {
  const j = chart.judgement!
  const s = j.score
  return {
    用事: j.event,
    排局: chart.ju.name,
    值使状态: j.zhiShiNote,
    用神: j.yongShen.map((u) => ({
      用神: u.role,
      符号: u.symbol,
      落宫: u.palace,
      宫: u.lodgedAt ?? u.palace,
      ...(u.lodgedAt === undefined ? {} : { 寄宫: u.lodgedAt }),
      ...(u.report === undefined
        ? {}
        : {
            天盘: u.report.sky,
            ...(u.report.skyLodged === undefined
              ? {}
              : { 天盘寄: u.report.skyLodged, 克应寄: u.report.keYingLodged }),
            ...(u.report.earthLodged === undefined
              ? {}
              : { 地盘寄: u.report.earthLodged, 克应地寄: u.report.keYingEarthLodged }),
            地盘: u.report.earth,
            门: u.report.door,
            星: u.report.star,
            神: u.report.god,
            旺相: u.report.starState,
            门旺相: u.report.doorState,
            仪旺相: u.report.stemState,
            克应: u.report.keYing,
            门迫: u.report.doorPressed,
            score: u.report.score,
          }),
      ...(u.void === undefined ? {} : { 空亡: u.void }),
      ...(u.voidRelease === undefined ? {} : { 空亡解: u.voidRelease }),
      ...(u.yiMa === undefined ? {} : { 驿马: u.yiMa }),
    })),
    格局: j.patterns.map((p) => ({
      格局: p.name,
      ...(p.palace === undefined ? {} : { 宫: p.palace }),
      吉凶: p.luck,
      说明: p.note,
    })),
    驿马宫: j.yiMaPalace,
    综合: {
      用神宫分: s.palaces,
      格局分: s.patterns,
      驿马: s.yiMa,
      空亡折损: s.void,
      值使折损: s.zhiShi,
      总分: s.total,
    },
    ...(j.event === '求财'
      ? {
          求财专项:
            j.wealth === undefined
              ? {}
              : {
                  生门宫: j.wealth.shengMenPalace,
                  日干宫: j.wealth.dayPalace,
                  '生门→日干': j.wealth.relation,
                  求财断: j.wealth.verdict,
                  ...(j.wealth.renCai === undefined ? {} : { 任财: j.wealth.renCai }),
                },
        }
      : {}),
  }
}

const title = (c: GoldenCase) =>
  c.city === undefined ? c.clock : `${c.clock} ${c.city}${c.apparent ? ' apparent' : ' mean'}`

describe('qimen chart matches the reference implementation', () => {
  for (const c of golden.cases) {
    it(title(c), () => {
      const chart = cast(c)
      expect(QimenChartSchema.parse(chart)).toEqual(chart)
      expect(referenceChart(chart)).toEqual(c.chart)
      expect(chart.ju).toMatchObject({
        dun: c.chart.排局.slice(0, 2),
        yuan: c.chart.排局.slice(-1),
        number: '一二三四五六七八九'.indexOf(c.chart.排局.charAt(2)) + 1,
      })
      expect(chart.conventions).toEqual({ juMethod: '拆补', lateZi: 'tomorrow' })
      expect(chart.judgement).toBeUndefined()
      if (c.city === undefined) {
        expect(chart.input).toEqual({
          clockTime: c.clock,
          city: null,
          longitude: null,
          meridian: null,
          basis: 'clock',
        })
        expect(chart.trueSolarTime).toBeNull()
      } else {
        expect(chart.input).toMatchObject({
          clockTime: c.clock,
          city: c.city,
          basis: c.apparent ? 'apparent' : 'mean',
        })
        expect(chart.trueSolarTime).toBe(c.moment)
      }
    })
  }
})

describe('qimen judgement matches the reference implementation', () => {
  for (const c of golden.cases) {
    for (const event of Object.keys(c.judgements) as QimenEvent[]) {
      it(`${title(c)} ${event}`, () => {
        const chart = cast(c, event)
        expect(QimenChartSchema.parse(chart)).toEqual(chart)
        expect(referenceJudgement(chart)).toEqual(c.judgements[event])
      })
    }
  }
})

describe('qimen chart snapshot', () => {
  it('stays well under the 64 KiB widget budget', () => {
    const sizes = golden.cases.map((c) => Buffer.byteLength(JSON.stringify(cast(c, '求财'))))
    expect(Math.max(...sizes)).toBeLessThan(16 * 1024)
  })
})
