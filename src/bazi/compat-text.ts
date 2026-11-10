/** Plain-text projections of a compatibility reading for the model and for widget summaries. */
import { type BaziCompat, type CompatPerson, PILLAR_KEYS } from './compat-schema.ts'
import { elementOf } from './ganzhi.ts'

/** Chinese category labels in the model text, keyed by fact category. */
export const CATEGORY_LABEL: Readonly<Record<BaziCompat['facts'][number]['category'], string>> = {
  spousePalace: '配偶宫',
  zodiac: '生肖',
  dayMaster: '日主',
  elements: '五行互补',
  useful: '用神互补',
  spouseStar: '夫妻星',
  shenSha: '神煞',
}

const pillarsOf = (p: CompatPerson) => PILLAR_KEYS.map((k) => p.pillars[k].ganZhi).join(' ')
const signed = (n: number) => (n > 0 ? `+${n}` : String(n))
const list = (items: readonly string[]) => (items.length === 0 ? '无' : items.join('、'))

/** One-line summary: both labels with pillars, the score and the verdict. */
export function compatSummary(r: BaziCompat): string {
  const [a, b] = r.persons as [CompatPerson, CompatPerson]
  return `${a.label} ${pillarsOf(a)} × ${b.label} ${pillarsOf(b)}，合盘 ${r.score} 分（${r.verdict}）`
}

/** Birth facts, pillars, strength and useful elements of one person on two lines. */
function personLines(p: CompatPerson): string[] {
  const s = p.strength
  const gan = p.pillars.day.gan
  return [
    `${p.label}（${p.gender === 'male' ? '男' : '女'}）：${p.clockTime}，${p.city ?? '未提供城市'}，真太阳时 ${p.trueSolarTime}｜四柱 ${pillarsOf(p)}｜日主 ${gan}${elementOf(gan)}`,
    `  ${s.verdict}${s.pattern.name === '普通' ? '' : `·${s.pattern.name}`}（同类 ${s.tongLei}%／异类 ${s.yiLei}%）｜五行 ${s.elements.map((e) => `${e.element}${e.percent}%`).join(' ')}｜用神 ${s.yong.element}（${s.yong.reason}）｜喜 ${list(s.xi.map((x) => x.element))}｜忌 ${list(s.ji.map((x) => x.element))}`,
  ]
}

/** Every fact of the reading as compact lines, for the model to interpret. */
export function compatText(r: BaziCompat): string {
  const [a, b] = r.persons as [CompatPerson, CompatPerson]
  return [
    `合盘：${a.label} × ${b.label}`,
    ...personLines(a),
    ...personLines(b),
    `总分 ${r.score}（${r.verdict}）`,
    ...r.facts.map(
      (f) =>
        `[${CATEGORY_LABEL[f.category]}] ${f.tone} ${signed(f.points)} ${f.title}：${f.reason}`,
    ),
    `计分：${r.scoreRule}`,
    `强弱：${a.strength.method}`,
  ].join('\n')
}
