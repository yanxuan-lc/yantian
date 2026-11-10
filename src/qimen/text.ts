/** Plain-text projections of a Qi Men chart for the model and for the widget summary. */
import { GOD_NAME } from './judge.ts'
import type { QimenChart, QimenJudgement, QimenPalace } from './schema.ts'

/** Lo Shu reading order of the palaces: top row 巽 離 坤, middle 震 中 兌, bottom 艮 坎 乾. */
export const LO_SHU_ROWS = [
  [4, 9, 2],
  [3, 5, 7],
  [8, 1, 6],
] as const

/** Key verdict of a judgement: the total, then the 求财 verdict or the 值使 warning. */
function verdict(j: QimenJudgement): string {
  const extra = j.wealth?.verdict ?? j.zhiShiNote
  return `${j.event}总分 ${j.score.total}${extra === null || extra === undefined ? '' : `，${extra}`}`
}

/** One-line summary: ju, 值符 and 值使 placement, and the verdict when judged. */
export function qimenSummary(chart: QimenChart): string {
  const head = `${chart.ju.name}，值符天${chart.zhiFu.star}落${chart.zhiFu.palace}宫，值使${chart.zhiShi.door}门落${chart.zhiShi.palace}宫`
  return chart.judgement === undefined ? head : `${head}；${verdict(chart.judgement)}`
}

/** Palace name as read: the centre is read at 坤 (中宫寄坤) and says so. */
export const palaceLabel = (gua: string) => (gua === '中' ? '中宫（寄坤）' : `${gua}宫`)

function palaceLine(chart: QimenChart, p: QimenPalace): string {
  const marks = [
    p.gua === chart.zhiFu.palace ? '值符' : '',
    p.gua === chart.zhiShi.palace ? '值使' : '',
  ].filter((m) => m !== '')
  const layers = [
    `天盘 ${p.sky ?? '—'}${p.skyLodged === undefined ? '' : `（寄${p.skyLodged}）`}`,
    `地盘 ${p.earth}`,
    `星 ${p.star === null ? '—' : `天${p.star}${p.star === '芮' ? '（天禽寄宫）' : ''}`}`,
    `门 ${p.door === null ? '—' : `${p.door}门(${p.doorLuck})`}`,
    `神 ${p.god === null ? '—' : GOD_NAME[p.god]}`,
  ]
  return `${p.gua}宫(${p.number}·${p.element}) ${layers.join('｜')}${marks.length === 0 ? '' : `｜${marks.join('、')}`}`
}

function judgementLines(j: QimenJudgement): string[] {
  const lines = [`断局：用事 ${j.event}`]
  for (const u of j.yongShen) {
    const head = `  用神 ${u.role}`
    if (u.palace === null || u.report === undefined) {
      lines.push(`${head}（${u.symbol}）不在盘上`)
      continue
    }
    const r = u.report
    const flags = [
      r.keYing === null ? '' : `克应 ${r.keYing}`,
      r.keYingLodged === undefined || r.keYingLodged === null ? '' : `寄干克应 ${r.keYingLodged}`,
      r.keYingEarthLodged === undefined || r.keYingEarthLodged === null
        ? ''
        : `地寄克应 ${r.keYingEarthLodged}`,
      r.doorPressed ? '门迫' : '',
      u.void === true ? '空亡' : '',
      u.voidRelease ?? '',
      u.yiMa === true ? '临驿马' : '',
    ].filter((f) => f !== '')
    lines.push(
      `${head} 落${palaceLabel(u.palace)}（${u.symbol}）｜天盘 ${r.sky}${r.skyLodged === undefined ? '' : `（寄${r.skyLodged}）`} 地盘 ${r.earth}${r.earthLodged === undefined ? '' : `（寄${r.earthLodged}）`}｜${r.door}门 ${r.star} ${r.god}｜旺相 星${r.starState} 门${r.doorState} 仪${r.stemState}｜宫分 ${r.score}${flags.length === 0 ? '' : `｜${flags.join('、')}`}`,
    )
  }
  lines.push(
    j.patterns.length === 0
      ? '  格局：无'
      : `  格局：${j.patterns.map((p) => `${p.name}${p.palace === undefined ? '' : `(${p.palace})`}[${p.luck}] ${p.note}`).join('；')}`,
    `  驿马落${j.yiMaPalace}宫${j.zhiShiNote === null ? '' : `；${j.zhiShiNote}`}`,
  )
  if (j.wealth !== undefined) {
    const w = j.wealth
    lines.push(
      `  求财专项：生门${w.shengMenPalace}宫 → 日干${palaceLabel(w.dayPalace)} ${w.relation}，${w.verdict}${w.renCai === undefined ? '' : `；${w.renCai}`}`,
    )
  }
  const s = j.score
  lines.push(
    `  综合：用神宫分 ${s.palaces}，格局分 ${s.patterns}，驿马 ${s.yiMa}，空亡折损 ${s.void}，值使折损 ${s.zhiShi}${j.event === '求财' ? `，求财调整 ${s.wealth}` : ''}，总分 ${s.total}`,
  )
  return lines
}

/** Every fact of the chart and its judgement as readable lines, for the model to interpret. */
export function qimenText(chart: QimenChart): string {
  const { input } = chart
  const basis =
    input.basis === 'clock'
      ? '按钟表时起局'
      : `按${input.city}（${input.longitude}°E，基准经线 ${input.meridian}°）${input.basis === 'apparent' ? '视太阳时' : '平太阳时'} ${chart.trueSolarTime} 起局`
  const order = LO_SHU_ROWS.flat().map((n) => chart.palaces[n - 1]!)
  const lines = [
    `奇门盘：${chart.label}`,
    `钟表时间 ${input.clockTime}；${basis}；起局时刻 ${chart.chartTime}`,
    '口径：时家奇门拆补法定局（当令节气定局数，日柱符头定上中下元）；23:00 起算次日子时（日柱进位次日）',
    `四柱 ${chart.pillars.year} ${chart.pillars.month} ${chart.pillars.day} ${chart.pillars.hour}｜节气 ${chart.solarTerm}｜${chart.ju.name}`,
    `旬首 ${chart.xunShou}（遁${chart.zhiFu.yi}）｜旬空 日空${chart.xunKong.day} 时空${chart.xunKong.hour}`,
    `值符 天${chart.zhiFu.star}${chart.zhiFu.star === '禽' ? '（寄天芮同行）' : ''} 落${chart.zhiFu.palace}宫｜值使 ${chart.zhiShi.door}门 落${chart.zhiShi.palace}宫`,
    '九宫（洛书方位，自上而下：巽离坤 / 震中兑 / 艮坎乾）：',
    ...order.map((p) => `  ${palaceLine(chart, p)}`),
  ]
  if (chart.judgement !== undefined) lines.push(...judgementLines(chart.judgement))
  return lines.join('\n')
}
