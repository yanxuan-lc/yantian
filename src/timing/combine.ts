/**
 * Combination of the per-system timing scores. Raw scores are never added across systems:
 * each system's scores are first turned into percentile ranks within the window, and only
 * those ranks are averaged, so every system weighs the same whatever its scale.
 */
import type { SystemScore, TimingSystem } from './types.ts'

/** Percentile at or above which a system counts towards a period's consensus. */
export const CONSENSUS_AT = 70

/**
 * Percentile rank, 0–100, of each score among `scores`: the share of the other scores it
 * beats, with ties counted half (mid-rank), so the highest distinct score is 100 and the
 * lowest 0. A single score ranks 100.
 */
export function percentiles(scores: readonly number[]): number[] {
  const n = scores.length
  if (n === 1) return [100]
  return scores.map((x) => {
    let below = 0
    let equal = 0
    for (const y of scores) {
      if (y < x) below++
      else if (y === x) equal++
    }
    return (100 * (below + (equal - 1) / 2)) / (n - 1)
  })
}

/** One period after combination. */
export interface RankedPeriod {
  /** Whether any system vetoes the period; a vetoed period has no ranks. */
  readonly vetoed: boolean
  /** Mean percentile over the present systems, one decimal; `null` when vetoed. */
  readonly combined: number | null
  /** Number of systems whose percentile is at least {@link CONSENSUS_AT}. */
  readonly consensus: number
  /** Percentile of each present system, one decimal; empty when vetoed. */
  readonly pct: Partial<Record<TimingSystem, number>>
}

const round1 = (x: number) => Math.round(x * 10) / 10

/**
 * Ranks the periods of one window. `rows[i]` holds the scores of period `i` for the systems
 * that scored it. A period that any system vetoes is excluded; every system is ranked by
 * {@link percentiles} within the remaining periods; a period's combined value is the mean of
 * its present systems' percentiles. `top` lists up to `topN` period indices by combined value,
 * then consensus, both descending, then time.
 */
export function rankPeriods(
  rows: ReadonlyArray<Partial<Record<TimingSystem, SystemScore>>>,
  systems: readonly TimingSystem[],
  topN: number,
): { periods: RankedPeriod[]; top: number[] } {
  const eligible = rows.flatMap((row, i) =>
    systems.some((k) => row[k]?.veto !== undefined) ? [] : [i],
  )
  const raw = new Map<number, Partial<Record<TimingSystem, number>>>(eligible.map((i) => [i, {}]))
  for (const system of systems) {
    const scored = eligible.filter((i) => rows[i]![system] !== undefined)
    const ranks = percentiles(scored.map((i) => rows[i]![system]!.score))
    scored.forEach((i, k) => {
      raw.get(i)![system] = ranks[k]!
    })
  }
  const periods = rows.map((_, i): RankedPeriod => {
    const pct = raw.get(i)
    if (pct === undefined) return { vetoed: true, combined: null, consensus: 0, pct: {} }
    const values = Object.values(pct)
    const mean = values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length
    return {
      vetoed: false,
      combined: round1(mean),
      consensus: values.filter((v) => v >= CONSENSUS_AT).length,
      pct: Object.fromEntries(Object.entries(pct).map(([k, v]) => [k, round1(v)])),
    }
  })
  const top = [...eligible]
    .sort((a, b) => {
      const pa = periods[a]!
      const pb = periods[b]!
      return pb.combined! - pa.combined! || pb.consensus - pa.consensus || a - b
    })
    .slice(0, topN)
  return { periods, top }
}
