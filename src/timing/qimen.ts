/**
 * 奇门 timing score of one period: the chart cast at the period's moment and judged for the
 * matter. The score starts from the judgement total of `qimen/judge.ts`, whose palace,
 * pattern, 驿马, void and 值使 weights are documented there; this module adds the timing
 * penalties of {@link QIMEN_PENALTIES} and the vetoes.
 */
import type { QimenChart } from '../qimen/schema.ts'
import { simplify } from '../qimen/simplify.ts'
import type { SystemScore } from './types.ts'

/** Chart-wide patterns that rule a period out. */
const VETO_PATTERNS = ['五不遇时'] as const

/**
 * Points subtracted from the judgement total for chart-wide patterns that slow a matter down
 * without ruling the period out: 伏吟 (stagnation) and 反吟 (reversal), 2 points each. They
 * come on top of the −2 the judgement already gives every 凶 pattern, and apply before the
 * percentile ranking.
 */
export const QIMEN_PENALTIES: Readonly<Record<string, number>> = { 伏吟: 2, 反吟: 2 }

const round2 = (x: number) => Math.round(x * 100) / 100

/**
 * Scores a chart cast with a matter. Vetoes, in this order: the 五不遇时 pattern; a 用神 read in
 * a void palace that no release (旺相不空, 逢冲填实) frees. Reasons are the judgement total, then
 * each pattern with its luck and palace, then each penalty, then the 求财 verdict or 值使 note
 * when present. Throws when the chart carries no judgement.
 */
export function scoreQimen(chart: QimenChart): SystemScore {
  const j = chart.judgement
  if (j === undefined) throw new Error('scoreQimen: the chart has no judgement; cast it with event')
  const reasons = [`总分 ${j.score.total}`]
  let score = j.score.total
  for (const p of j.patterns) {
    reasons.push(simplify(`${p.name}${p.palace === undefined ? '' : `·${p.palace}`}（${p.luck}）`))
  }
  for (const p of j.patterns) {
    const penalty = QIMEN_PENALTIES[p.name]
    if (penalty === undefined) continue
    score -= penalty
    reasons.push(`${p.name}扣 ${penalty} 分`)
  }
  const note = j.wealth?.verdict ?? j.zhiShiNote
  if (note !== undefined && note !== null) reasons.push(simplify(note))
  const pattern = VETO_PATTERNS.find((name) => j.patterns.some((p) => p.name === name))
  const empty = j.yongShen.find((u) => u.void === true)
  const veto = pattern ?? (empty === undefined ? undefined : simplify(`用神${empty.role}空亡`))
  return { score: round2(score), ...(veto === undefined ? {} : { veto }), reasons }
}
