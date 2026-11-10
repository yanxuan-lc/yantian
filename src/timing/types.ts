/** Types shared by the four timing scorers and the combiner. */
import type { QimenEvent } from '../qimen/schema.ts'

/** A matter to choose a time for (用事); the same nine matters as the Qi Men judgement. */
export type TimingEvent = QimenEvent

/** The selection systems a scan can combine, in display order. */
export const TIMING_SYSTEMS = ['almanac', 'qimen', 'astro', 'bazi'] as const
/** One selection system: 黄历, 奇门, 星盘 or 八字. */
export type TimingSystem = (typeof TIMING_SYSTEMS)[number]

/**
 * One system's verdict on one period. `score` is on that system's own scale and is
 * comparable only with the same system's scores in the same scan; `veto` names the rule that
 * rules the period out; `reasons` lists the scored facts. The 黄历, 星盘 and 八字 scorers list
 * them by contribution, most favourable first; the 奇门 scorer lists the total, then patterns.
 */
export interface SystemScore {
  readonly score: number
  readonly veto?: string
  readonly reasons: string[]
}

/**
 * Accumulates a score and its reasons. {@link Tally.result} lists the reasons by contribution,
 * most favourable first, keeping insertion order among equal contributions; the score is
 * rounded to two decimals.
 */
export class Tally {
  private total = 0
  private readonly items: Array<readonly [number, string]> = []

  /** Adds `weight` to the score and records `reason` with that contribution. */
  add(weight: number, reason: string): void {
    this.total += weight
    this.items.push([weight, reason])
  }

  /** The verdict with `veto` when one applies. */
  result(veto: string | undefined): SystemScore {
    const reasons = [...this.items].sort((a, b) => b[0] - a[0]).map(([, r]) => r)
    const score = Math.round(this.total * 100) / 100
    return { score, ...(veto === undefined ? {} : { veto }), reasons }
  }
}
