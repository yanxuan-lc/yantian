/** Plain-text projections of a timing scan for the model and for the widget summary. */
import { ZHI } from '../bazi/ganzhi.ts'
import type { TimingCell, TimingScan } from './schema.ts'
import { TIMING_SYSTEMS, type TimingSystem } from './types.ts'

const SYSTEM_NAME: Readonly<Record<TimingSystem, string>> = {
  almanac: '黄历',
  qimen: '奇门',
  astro: '星盘',
  bazi: '八字',
}
/** Most frequent veto reasons listed per system. */
const VETO_REASONS_SHOWN = 3

/** `MM-DD HH:MM–HH:MM 巳时（丁巳）` of a cell: its clock span, 时辰 and hour pillar. */
function cellLabel(cell: TimingCell): string {
  return `${cell.start.slice(5)}–${cell.end.slice(11)} ${ZHI.charAt(cell.col)}时（${cell.hour}）`
}

/** Leading reason of one system's verdict; the 奇门 total is skipped when facts follow it. */
function leadReason(scan: TimingScan, system: TimingSystem, reasons: readonly number[]): string {
  const texts = reasons.map((i) => scan.notes[i]!)
  const facts = system === 'qimen' ? texts.filter((t) => !t.startsWith('总分')) : texts
  return facts[0] ?? texts[0] ?? '—'
}

/** Veto counts per system and the most frequent reasons; distances are folded together. */
function vetoLines(scan: TimingScan): string[] {
  const systems = scan.systems.filter((s) => TIMING_SYSTEMS.includes(s))
  const counts = systems.map((s) => `${SYSTEM_NAME[s]} ${scan.vetoes[s] ?? 0}`)
  const lines = [`否决：${counts.join('、')}`]
  for (const system of systems) {
    const tally = new Map<string, number>()
    for (const cell of scan.cells) {
      const veto = cell.scores[system]?.veto
      if (veto === undefined) continue
      const key = scan.notes[veto]!.replace(/（距日 \d+°）$/, '')
      tally.set(key, (tally.get(key) ?? 0) + 1)
    }
    if (tally.size === 0) continue
    const top = [...tally]
      .sort((a, b) => b[1] - a[1])
      .slice(0, VETO_REASONS_SHOWN)
      .map(([k, n]) => `${k}×${n}`)
    lines.push(`  ${SYSTEM_NAME[system]}：${top.join('、')}`)
  }
  return lines
}

/** One-line summary: the matter and the first pick, or that every period is vetoed. */
export function timingSummary(scan: TimingScan): string {
  const first = scan.top[0] === undefined ? undefined : scan.cells[scan.top[0]]
  if (first === undefined) return `${scan.event}择时，窗口内所有时辰均被否决`
  return `${scan.event}择时，首选 ${first.start.slice(5, 10)} ${ZHI.charAt(first.col)}时（综合 ${first.combined}，共识 ${first.consensus}/${scan.systems.length}）`
}

/**
 * Model text: window, natal facts, conventions, veto counts with their main reasons, and each
 * top pick with every system's percentile and leading reason. Stays a few kilobytes for a
 * week; the full grid is in the widget only.
 */
export function timingText(scan: TimingScan): string {
  const lines = [
    scan.label,
    `择时 ${scan.event} · ${scan.range.start} ~ ${scan.range.end} · ${scan.city === null ? '钟表时' : `${scan.city}（真太阳时）`}`,
  ]
  if (scan.natal !== null) {
    const n = scan.natal
    lines.push(
      `命主 ${n.pillars}，日主${n.dayMaster}，生肖${n.zodiac}；用神${n.yong}，喜${n.xi.join('') || '—'}，忌${n.ji.join('') || '—'}`,
    )
  }
  const c = scan.conventions
  lines.push(`口径：${c.grid}；${c.combine}；${c.consensus}；${c.astroPlace}`)
  const eligible = scan.cells.filter((cell) => !cell.vetoed).length
  lines.push(`时辰 ${scan.cells.length} 个，可排名 ${eligible} 个`)
  lines.push(...vetoLines(scan))
  if (scan.top.length === 0) {
    lines.push('首选：无（全部被否决）')
    return lines.join('\n')
  }
  lines.push('首选（按综合百分位，再按共识）：')
  scan.top.forEach((index, rank) => {
    const cell = scan.cells[index]!
    lines.push(
      `${rank + 1}. ${cellLabel(cell)} 综合 ${cell.combined} · 共识 ${cell.consensus}/${scan.systems.length}`,
    )
    const parts = scan.systems.map((system) => {
      const s = cell.scores[system]!
      return `${SYSTEM_NAME[system]} ${s.pct}（${leadReason(scan, system, s.reasons)}）`
    })
    lines.push(`   ${parts.join('；')}`)
  })
  return lines.join('\n')
}
