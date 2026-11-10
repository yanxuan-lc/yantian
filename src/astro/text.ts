/** Plain-text projections of an astrology chart for the model and for widget summaries. */
import type { AstroChart } from './schema.ts'

const deg = (x: number) => `${x.toFixed(2)}°`

/** One-line summary: ascendant, Sun and Moon signs, sect and the planetary hour ruler. */
export function astroSummary(chart: AstroChart): string {
  const sign = (name: string) => chart.planets.find((p) => p.name === name)?.sign ?? ''
  const h = chart.planetaryHour
  const hour =
    h === null ? '无行星时' : `${h.hourRuler}时（${h.period}第 ${h.index} 时，${h.quality}）`
  return `上升${chart.ascendant.sign}，太阳${sign('太阳')}，月亮${sign('月亮')}，${chart.sect}盘，${hour}`
}

/** Every fact of the chart as readable lines, for the model to interpret. */
export function astroText(chart: AstroChart): string {
  const { input, conventions: c } = chart
  const place =
    input.city === null
      ? `纬度 ${input.latitude}°，经度 ${input.longitude}°`
      : `${input.city}（纬度 ${input.latitude}°，经度 ${input.longitude}°）`
  const lines = [
    `星盘：${chart.label}`,
    `钟表时间 ${input.time}（UTC${input.utcOffset >= 0 ? '+' : ''}${input.utcOffset}），世界时 ${chart.ut}；地点 ${place}`,
    `口径：${c.time}；${c.houses}；${c.planets}；${c.rulers}；相位容许度 ${c.orbs}；${c.sect}`,
    `天文历：${c.ephemeris}`,
    `上升 ${chart.ascendant.sign} ${deg(chart.ascendant.degree)}（黄经 ${chart.ascendant.longitude}°）｜中天 ${chart.midheaven.sign} ${deg(chart.midheaven.degree)}（黄经 ${chart.midheaven.longitude}°）`,
    `${chart.sect}盘（太阳真高度角 ${chart.sunAltitude}°）`,
    '行星：',
    ...chart.planets.map(
      (p) =>
        `  ${p.name} ${p.sign} ${deg(p.degree)} 第${p.house}宫${p.retrograde ? ' 逆行' : ''}｜黄经 ${p.longitude}°｜日速 ${p.speed}°`,
    ),
    `宫位：${chart.houses.map((h) => `第${h.house}宫 ${h.sign}（主星${h.ruler}）`).join('；')}`,
    `福点 ${chart.fortune.sign} ${deg(chart.fortune.degree)} 第${chart.fortune.house}宫（黄经 ${chart.fortune.longitude}°）`,
    `相位：${
      chart.aspects.length === 0
        ? '无'
        : chart.aspects
            .map((a) => `${a.a}${a.type}${a.b}（容许 ${a.orb}°，${a.applying ? '入相' : '出相'}）`)
            .join('；')
    }`,
  ]
  const h = chart.planetaryHour
  if (h === null) {
    lines.push('行星时：当日太阳不升或不落（极昼或极夜），无行星时')
  } else {
    lines.push(
      `行星时：${h.hourRuler}时，${h.period}第 ${h.index} 时（${h.start.slice(11)}–${h.end.slice(11)}），${h.quality}；行星日 ${h.date}，行星日主 ${h.dayRuler}`,
      `  日出 ${h.sunrise}，日落 ${h.sunset}，次日日出 ${h.nextSunrise ?? '无'}；昼时每时 ${h.dayHourMinutes} 分钟，夜时每时 ${h.nightHourMinutes ?? '—'} 分钟`,
    )
  }
  return lines.join('\n')
}
