import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { castFlow, type FlowRequest } from '../src/bazi/flow.ts'
import { castNatal, type NatalRequest } from '../src/bazi/natal.ts'
import { BaziChartSchema, BaziFlowSchema } from '../src/bazi/schema.ts'

/** Output of the reference Python `bazi.py`, recorded by `scripts/golden_bazi.py`. */
interface GoldenCase {
  readonly name: string
  readonly args: readonly string[]
  // biome-ignore lint/suspicious/noExplicitAny: reference JSON is checked field by field below
  readonly output: any
}
const golden = JSON.parse(
  readFileSync(new URL('./fixtures/bazi-golden.json', import.meta.url), 'utf8'),
) as { natal: GoldenCase[]; flow: GoldenCase[] }

/** Reads `--flag value` pairs and bare switches from a reference command line. */
function flags(args: readonly string[]): Map<string, string | true> {
  const out = new Map<string, string | true>()
  for (let i = 0; i < args.length; i++) {
    const key = args[i]?.slice(2)
    const next = args[i + 1]
    if (next === undefined || next.startsWith('--')) out.set(key, true)
    else {
      out.set(key, next)
      i++
    }
  }
  return out
}

const num = (f: Map<string, string | true>, key: string, fallback?: number): number => {
  const value = f.get(key)
  if (typeof value === 'string') return Number(value)
  if (fallback === undefined) throw new Error(`missing --${key}`)
  return fallback
}
const pad = (n: number) => String(n).padStart(2, '0')

function natalRequest(args: readonly string[]): NatalRequest {
  const f = flags(args)
  const gender = f.get('gender')
  return {
    birth: `${num(f, 'year')}-${pad(num(f, 'month'))}-${pad(num(f, 'day'))} ${pad(num(f, 'hour'))}:${pad(num(f, 'minute', 0))}`,
    dst: f.has('dst'),
    city: typeof f.get('city') === 'string' ? (f.get('city') as string) : undefined,
    apparentSolar: f.has('apparent-solar'),
    lateZi: f.get('zi-mode') === 'tomorrow' ? 'tomorrow' : 'today',
    gender: gender === 'male' || gender === 'female' ? gender : undefined,
    luckSteps: num(f, 'dayun-count', 10),
  }
}

const POSITIONS = [
  ['year', '年'],
  ['month', '月'],
  ['day', '日'],
  ['hour', '时'],
] as const

/**
 * Cases whose luck start differs from the reference by rule. The start of luck counts from the
 * absolute birth instant to the neighbouring 节, both in Beijing time; the reference counts
 * from true solar time, which here lies in a different two-hour branch or minutes earlier.
 */
const LUCK_START_BY_INSTANT = new Set(['urumqi-west', 'new-york', 'old-1949'])

describe('bazi natal chart matches the reference implementation', () => {
  for (const c of golden.natal) {
    it(c.name, () => {
      const chart = castNatal(natalRequest(c.args))
      expect(BaziChartSchema.parse(chart)).toEqual(chart)
      const ref = c.output
      expect(chart.input).toEqual({
        clockTime: ref.input.钟表时间,
        dst: ref.input.夏令时,
        city: ref.input.城市,
        longitude: ref.input.经度,
        meridian: ref.input.民用时基准经线,
        solarTime: ref.input.真太阳时口径 === '平太阳时' ? 'mean' : 'apparent',
        lateZi: ref.input.夜子时口径 === '晚子时日柱算次日' ? 'tomorrow' : 'today',
      })
      expect(chart.trueSolarTime).toBe(ref.真太阳时)
      const bz = ref.八字
      for (const [key, zh] of POSITIONS) {
        // Shen-sha follow the reference-app rules checked in shensha.test.ts, not bazi.py.
        const { shenSha: _stars, ziZuo: _ziZuo, xunKong: _xunKong, ...facts } = chart.pillars[key]
        expect(facts, `${c.name} ${key}`).toEqual({
          ganZhi: bz[`${zh}柱`],
          gan: bz.干支[`${zh}干`],
          zhi: bz.干支[`${zh}支`],
          wuXing: bz.五行[zh],
          hideGan: bz.藏干[zh],
          ganShiShen: bz.天干十神[zh],
          zhiShiShen: bz.藏干十神[zh],
          diShi: bz.地势[zh],
          naYin: bz.纳音[zh],
          kongWang: bz.空亡[zh],
        })
      }
      const gw = ref.宫位
      expect(chart.palaces).toEqual({
        taiYuan: { ganZhi: gw.胎元, naYin: gw.胎元纳音 },
        taiXi: { ganZhi: gw.胎息, naYin: gw.胎息纳音 },
        mingGong: { ganZhi: gw.命宫, naYin: gw.命宫纳音 },
        shenGong: { ganZhi: gw.身宫, naYin: gw.身宫纳音 },
      })
      const dy = ref.大运
      if (dy === undefined) {
        expect(chart.luck).toBeUndefined()
        return
      }
      expect(chart.luck).toMatchObject({
        gender: dy.性别 === '男' ? 'male' : 'female',
        forward: dy.顺逆 === '顺行',
        ...(LUCK_START_BY_INSTANT.has(c.name)
          ? {}
          : {
              start: {
                years: dy.起运.年数,
                months: dy.起运.月数,
                days: dy.起运.天数,
                date: dy.起运.交运日期,
              },
            }),
        steps: dy.大运.map(
          // biome-ignore lint/suspicious/noExplicitAny: reference JSON row
          (s: any) => ({
            ganZhi: s.干支,
            startYear: s.起始年,
            endYear: s.结束年,
            startAge: s.起始虚岁,
            endAge: s.结束虚岁,
            ganShiShen: s.天干十神,
            hideGan: s.藏干,
            zhiShiShen: s.藏干十神,
            diShi: s.地势,
          }),
        ),
      })
    })
  }
})

function flowRequest(args: readonly string[]): FlowRequest {
  const f = flags(args)
  const birth = f.has('birth-year')
    ? natalRequest([
        '--year',
        String(num(f, 'birth-year')),
        '--month',
        String(num(f, 'birth-month')),
        '--day',
        String(num(f, 'birth-day')),
        '--hour',
        String(num(f, 'birth-hour')),
        '--minute',
        String(num(f, 'birth-minute', 0)),
        ...(f.has('birth-dst') ? ['--dst'] : []),
        ...(typeof f.get('birth-city') === 'string'
          ? ['--city', f.get('birth-city') as string]
          : []),
      ])
    : undefined
  return {
    start: f.get('start') as string,
    end: f.get('end') as string,
    city: typeof f.get('city') === 'string' ? (f.get('city') as string) : undefined,
    apparentSolar: f.has('apparent-solar'),
    natal: birth,
  }
}

const FLOW_LABELS = [
  ['year', '流年'],
  ['month', '流月'],
  ['day', '流日'],
  ['hour', '流时'],
] as const

describe('bazi flow matches the reference implementation', () => {
  for (const c of golden.flow) {
    it(c.name, () => {
      const flow = castFlow(flowRequest(c.args))
      expect(BaziFlowSchema.parse(flow)).toEqual(flow)
      const ref = c.output
      expect(flow.city).toBe(ref.city)
      expect(flow.trueSolar).toBe(ref.真太阳时修正)
      expect(flow.entries).toHaveLength(ref.count)
      ref.entries.forEach(
        // biome-ignore lint/suspicious/noExplicitAny: reference JSON row
        (e: any, i: number) => {
          const got = flow.entries[i]!
          expect(`${got.start} ~ ${got.end.slice(11)}`).toBe(e.时辰区间)
          expect(got.moment).toBe(e.代表时刻)
          for (const [key, zh] of FLOW_LABELS) {
            expect(got.pillars[key].ganZhi).toBe(e[zh])
            if (e.详情 === undefined) {
              expect(got.pillars[key].detail).toBeUndefined()
              continue
            }
            const d = e.详情[zh]
            const { shenSha: _flowStars, ...detail } = got.pillars[key].detail!
            expect(detail, `${c.name} #${i} ${key}`).toEqual({
              ganShiShen: d.天干十神,
              hideGan: d.藏干,
              zhiShiShen: d.藏干十神,
              diShi: d.地势,
            })
          }
        },
      )
      if (ref.参照命主 === undefined) expect(flow.natal).toBeUndefined()
      else
        expect(flow.natal).toEqual({
          dayMaster: ref.参照命主.日主,
          pillars: ref.参照命主.命局四柱,
        })
    })
  }
})
