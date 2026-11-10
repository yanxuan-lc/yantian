/** Plain-text projections of BaZi results for the model and for widget summaries. */
import { diShi, elementOf, hideGan, shiShen } from './ganzhi.ts'
import { flowRelations } from './relations.ts'
import type { BaziChart, BaziFlow, NatalPillar } from './schema.ts'
import { natalBase, starsFor } from './shensha.ts'

const POSITIONS = [
  ['year', '年柱'],
  ['month', '月柱'],
  ['day', '日柱'],
  ['hour', '时柱'],
] as const

const list = (items: readonly string[]) => (items.length === 0 ? '无' : items.join('、'))

function pillarLine(label: string, p: NatalPillar): string {
  const hidden = p.hideGan.map((g, i) => `${g}(${p.zhiShiShen[i] ?? ''})`).join(' ')
  return `${label} ${p.ganZhi}｜天干十神 ${p.ganShiShen}｜藏干 ${hidden}｜地势 ${p.diShi}｜自坐 ${p.ziZuo}｜纳音 ${p.naYin}｜五行 ${p.wuXing}｜旬空 ${p.xunKong}${p.kongWang ? '｜落日柱空亡' : ''}｜神煞 ${list(p.shenSha)}`
}

/** One-line chart summary: the four pillars and the day master. */
export function natalSummary(chart: BaziChart): string {
  const { year, month, day, hour } = chart.pillars
  return `${year.ganZhi} ${month.ganZhi} ${day.ganZhi} ${hour.ganZhi}，日主${day.gan}${elementOf(day.gan)}`
}

/** Facts of the pillars in effect on the casting date, read against the natal chart. */
function nowLines(chart: BaziChart): string[] {
  const p = chart.pillars
  const natal = [p.year.ganZhi, p.month.ganZhi, p.day.ganZhi, p.hour.ganZhi] as const
  const base = natalBase(natal)
  const columns = [
    ['大运', chart.now.luck],
    ['流年', chart.now.year],
    ['流月', chart.now.month],
    ['流日', chart.now.day],
  ].filter((c): c is [string, string] => c[1] !== undefined)
  const rel = flowRelations(
    natal,
    columns.map(([, gz]) => gz),
  )
  return [
    `当前（${chart.now.date}）：`,
    ...columns.map(
      ([label, gz]) =>
        `  ${label} ${gz}｜${shiShen(base.dayGan, gz.charAt(0))}｜藏干 ${hideGan(gz.charAt(1))
          .map((g) => `${g}(${shiShen(base.dayGan, g)})`)
          .join(
            ' ',
          )}｜地势 ${diShi(base.dayGan, gz.charAt(1))}｜神煞 ${list(starsFor(base, gz, 'flow'))}`,
    ),
    `  天干关系：${list(rel.gan)}`,
    `  地支关系：${list(rel.zhi)}`,
  ]
}

/** Every fact of the natal chart as readable lines, for the model to interpret. */
export function natalText(chart: BaziChart): string {
  const { input } = chart
  const lines = [
    `命盘：${chart.label}`,
    `钟表时间 ${input.clockTime}${input.dst ? '（夏令时，已还原 1 小时）' : ''}；城市 ${input.city ?? '未提供'}，经度 ${input.longitude}°，民用时基准经线 ${input.meridian}°`,
    `真太阳时 ${chart.trueSolarTime}（${input.solarTime === 'apparent' ? '视太阳时，含均时差' : '平太阳时'}）；晚子时口径：${input.lateZi === 'tomorrow' ? '日柱算次日' : '日柱算当日'}`,
    `出生节气：${chart.birthTerm.prev.name}（${chart.birthTerm.prev.time}）之后，下一节 ${chart.birthTerm.next.name}（${chart.birthTerm.next.time}）`,
    ...POSITIONS.map(([key, label]) => pillarLine(label, chart.pillars[key])),
    `天干关系：${list(chart.relations.gan)}｜地支关系：${list(chart.relations.zhi)}`,
    `月令五行：${chart.seasons.map((x) => x.element + x.state).join(' ')}`,
    `胎元 ${chart.palaces.taiYuan.ganZhi}(${chart.palaces.taiYuan.naYin})｜胎息 ${chart.palaces.taiXi.ganZhi}(${chart.palaces.taiXi.naYin})｜命宫 ${chart.palaces.mingGong.ganZhi}(${chart.palaces.mingGong.naYin})｜身宫 ${chart.palaces.shenGong.ganZhi}(${chart.palaces.shenGong.naYin})`,
    `神煞起例：${chart.shenShaRule}`,
  ]
  const luck = chart.luck
  if (luck !== undefined) {
    lines.push(
      `大运：${luck.gender === 'male' ? '男' : '女'}命${luck.forward ? '顺行' : '逆行'}，出生后 ${luck.start.years} 年 ${luck.start.months} 月 ${luck.start.days} 天起运，交运日期 ${luck.start.date}`,
      ...luck.steps.map(
        (s) =>
          `  ${s.ganZhi} ${s.startYear}–${s.endYear}（虚岁 ${s.startAge}–${s.endAge}）｜${s.ganShiShen}｜藏干 ${s.hideGan.map((g, i) => `${g}(${s.zhiShiShen[i] ?? ''})`).join(' ')}｜地势 ${s.diShi}`,
      ),
    )
  } else {
    lines.push('大运：未提供性别，未排大运')
  }
  lines.push(...nowLines(chart))
  return lines.join('\n')
}

/** One-line flow summary: the range, period count and reference chart. */
export function flowSummary(flow: BaziFlow): string {
  return `${flow.range.start} ~ ${flow.range.end} 共 ${flow.entries.length} 个时辰的流盘${flow.natal === undefined ? '' : `，参照命局 ${flow.natal.pillars}（日主${flow.natal.dayMaster}）`}${flow.city === null ? '，按钟表时' : `，按${flow.city}真太阳时`}。`
}

/** Every period of the flow as readable lines, for the model to interpret. */
export function flowText(flow: BaziFlow): string {
  const lines = [flowSummary(flow)]
  if (flow.shenShaRule !== undefined) lines.push(`神煞起例：${flow.shenShaRule}`)
  type Pillar = BaziFlow['entries'][number]['pillars']['year']
  const facts = (p: Pillar) => {
    const d = p.detail
    if (d === undefined) return p.ganZhi
    return `${p.ganZhi}｜${d.ganShiShen}｜藏干 ${d.hideGan.map((g, i) => `${g}(${d.zhiShiShen[i] ?? ''})`).join(' ')}｜地势 ${d.diShi}｜神煞 ${list(d.shenSha)}`
  }
  // Year, month and day pillars change rarely; each is described once, when it begins.
  const shown = { year: '', month: '', day: '' }
  for (const e of flow.entries) {
    for (const [key, label] of [
      ['year', '流年'],
      ['month', '流月'],
      ['day', '流日'],
    ] as const) {
      const p = e.pillars[key]
      if (shown[key] === p.ganZhi) continue
      shown[key] = p.ganZhi
      lines.push(`${label}（自 ${e.start}）${facts(p)}`)
    }
    lines.push(`  ${e.start.slice(5)}–${e.end.slice(11)} 流时 ${facts(e.pillars.hour)}`)
  }
  return lines.join('\n')
}
