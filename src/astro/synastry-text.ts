/** Plain-text projections of a synastry result for the model and for widget summaries. */
import type { AstroChart } from './schema.ts'
import type { AstroSynastry, Composite, Tally } from './synastry-schema.ts'

const deg = (x: number) => `${x.toFixed(2)}°`
const offset = (n: number) => `UTC${n >= 0 ? '+' : ''}${n}`

/** `和谐 7（3 项），挑战 8（4 项）`: both weighted sums with their counts. */
function tallyText(t: Tally): string {
  return `和谐 ${t.harmony}（${t.harmonyCount} 项），挑战 ${t.tension}（${t.tensionCount} 项）`
}

/** One-line summary: the tally and the composite ascendant, Sun and Moon signs. */
export function synastrySummary(s: AstroSynastry): string {
  const sign = (name: string) => s.composite.planets.find((p) => p.name === name)?.sign ?? ''
  return `${tallyText(s.tally)}；组合盘上升${s.composite.ascendant.sign}，太阳${sign('太阳')}，月亮${sign('月亮')}`
}

/** One person's birth data, angles and planets on two compact lines. */
function personText(tag: string, chart: AstroChart): string[] {
  const { input } = chart
  const place = input.city ?? `${input.latitude}°, ${input.longitude}°`
  return [
    `${tag}：${chart.label}｜${input.time}（${offset(input.utcOffset)}）${place}｜上升${chart.ascendant.sign}${deg(chart.ascendant.degree)}，中天${chart.midheaven.sign}${deg(chart.midheaven.degree)}，${chart.sect}盘`,
    `  ${chart.planets.map((p) => `${p.name}${p.sign}${deg(p.degree)} ${p.house}宫${p.retrograde ? '℞' : ''}`).join('；')}`,
  ]
}

/** Composite angles, planets, houses and aspects. */
function compositeText(c: Composite): string[] {
  const mark = (p: { ambiguous: boolean }) => (p.ambiguous ? '（近冲中点不确定，按约定取）' : '')
  return [
    `组合盘：上升${c.ascendant.sign}${deg(c.ascendant.degree)}${mark(c.ascendant)}，中天${c.midheaven.sign}${deg(c.midheaven.degree)}${mark(c.midheaven)}`,
    `  ${c.planets.map((p) => `${p.name}${p.sign}${deg(p.degree)} ${p.house}宫${mark(p)}`).join('；')}`,
    `  宫位：${c.houses.map((h) => `${h.house}${h.sign}(${h.ruler})`).join(' ')}`,
    `  相位：${c.aspects.length === 0 ? '无' : c.aspects.map((a) => `${a.a}${a.type}${a.b} ${a.orb}°`).join('；')}`,
  ]
}

/** Every fact of the comparison as compact lines, for the model to interpret. */
export function synastryText(s: AstroSynastry): string {
  const c = s.conventions
  const state = (x: boolean | null) => (x === null ? '' : x ? ' 入' : ' 出')
  return [
    `比较盘：${s.label}（甲为内圈，乙为外圈）`,
    ...personText('甲', s.a),
    ...personText('乙', s.b),
    `口径：整宫制；${c.bodies}；相位容许度${c.orbs}；${c.applying}`,
    `关键接触：${c.contacts}；${c.weights}`,
    `组合盘口径：${c.composite}；${c.angles}；${c.ambiguity}`,
    `比对相位（甲→乙）：${
      s.interAspects.length === 0
        ? '无'
        : s.interAspects
            .map((x) => `${x.a}${x.type}${x.b} ${x.orb}°${state(x.applying)}`)
            .join('；')
    }`,
    `甲落乙宫：${s.overlays.aInB.map((o) => `${o.body}${o.house}`).join(' ')}`,
    `乙落甲宫：${s.overlays.bInA.map((o) => `${o.body}${o.house}`).join(' ')}`,
    `关键接触：${
      s.contacts.length === 0
        ? '无'
        : s.contacts
            .map((x) => `[${x.theme}]甲${x.a}${x.type}乙${x.b} ${x.orb}° ${x.tone}${x.weight}`)
            .join('；')
    }`,
    `合计：${tallyText(s.tally)}（只并列两项，不给总评）`,
    ...compositeText(s.composite),
  ].join('\n')
}
