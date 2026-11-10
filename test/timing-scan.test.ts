import { describe, expect, it } from 'vitest'
import { ChartInputError } from '../src/errors.ts'
import { scanTiming } from '../src/timing/scan.ts'
import { TimingScanSchema } from '../src/timing/schema.ts'

const natal = {
  birth: '1990-05-17 08:30',
  dst: false,
  apparentSolar: false,
  lateZi: 'today' as const,
  gender: 'female' as const,
  luckSteps: 0,
}

describe('timing scan', () => {
  it('scores every two-hour period of a day by the three systems that need no natal chart', () => {
    const scan = scanTiming({ event: '求财', start: '2026-11-12 00:00', end: '2026-11-12 22:59' })
    expect(TimingScanSchema.parse(scan)).toEqual(scan)
    expect(scan.systems).toEqual(['almanac', 'qimen', 'astro'])
    expect(scan.natal).toBeNull()
    // 23:00 of the 11th opens the 子 period of the 12th.
    expect(scan.cells.map((c) => c.col)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    expect(scan.days.map((d) => d.date)).toEqual(['2026-11-12'])
    expect(scan.cells[0]!.start).toBe('2026-11-11 23:00')
    for (const c of scan.cells) {
      expect(Object.keys(c.scores).sort()).toEqual(['almanac', 'astro', 'qimen'])
    }
  })

  it('keeps vetoed periods with their reason and leaves them out of the ranking', () => {
    const scan = scanTiming({ event: '婚姻', start: '2026-11-12 00:00', end: '2026-11-18 23:59' })
    const vetoed = scan.cells.filter((c) => c.vetoed)
    expect(vetoed.length).toBeGreaterThan(0)
    for (const c of vetoed) {
      expect(c.combined).toBeNull()
      const notes = Object.values(c.scores).flatMap((s) => (s.veto === undefined ? [] : [s.veto]))
      expect(notes.length).toBeGreaterThan(0)
      expect(scan.notes[notes[0]!]).toBeTruthy()
    }
    const ranked = scan.top.map((i) => scan.cells[i]!)
    expect(ranked.length).toBe(5)
    expect(ranked.every((c) => !c.vetoed)).toBe(true)
    const combined = ranked.map((c) => c.combined!)
    expect([...combined].sort((a, b) => b - a)).toEqual(combined)
  })

  it('adds the BaZi system when a natal person is given', () => {
    const scan = scanTiming({
      event: '考试',
      start: '2026-11-12 08:00',
      end: '2026-11-12 12:00',
      natal,
      top: 2,
    })
    expect(scan.systems).toEqual(['almanac', 'qimen', 'astro', 'bazi'])
    expect(scan.natal).toMatchObject({ gender: 'female' })
    expect(scan.top).toHaveLength(Math.min(2, scan.cells.filter((c) => !c.vetoed).length))
    for (const c of scan.cells) expect(c.scores.bazi).toBeDefined()
  })

  it('ranks periods whose 奇门 chart is 伏吟 now that it is a penalty', () => {
    const scan = scanTiming({ event: '求财', start: '2026-11-12 00:00', end: '2026-11-18 23:59' })
    const fuYin = scan.notes.indexOf('伏吟扣 2 分')
    expect(fuYin).toBeGreaterThanOrEqual(0)
    const ranked = scan.cells.filter((c) => !c.vetoed && c.scores.qimen!.reasons.includes(fuYin))
    expect(ranked.length).toBeGreaterThan(0)
    expect(ranked.every((c) => c.combined !== null)).toBe(true)
  })

  it('cuts the grid at true-solar 时辰 in 乌鲁木齐 and labels each cell with its clock span', () => {
    const scan = scanTiming({
      event: '出行',
      start: '2026-11-12 00:00',
      end: '2026-11-12 23:59',
      city: '乌鲁木齐',
    })
    expect(scan.days.map((d) => d.date)).toEqual(['2026-11-11', '2026-11-12'])
    const zi = scan.cells.find((c) => c.day === 1 && c.col === 0)!
    expect([zi.start, zi.end]).toEqual(['2026-11-12 01:10', '2026-11-12 03:10'])
    for (const c of scan.cells) expect(c.hour.charAt(1)).toBe('子丑寅卯辰巳午未申酉戌亥'[c.col])
  })

  it('shifts the 北京 grid by its longitude only', () => {
    const scan = scanTiming({
      event: '出行',
      start: '2026-11-12 00:00',
      end: '2026-11-12 23:59',
      city: '北京',
    })
    const zi = scan.cells.find((c) => c.col === 0 && c.end.startsWith('2026-11-12'))!
    expect([zi.start, zi.end]).toEqual(['2026-11-11 23:14', '2026-11-12 01:14'])
    for (const c of scan.cells) expect(c.hour.charAt(1)).toBe('子丑寅卯辰巳午未申酉戌亥'[c.col])
  })

  it('keeps clock-time 时辰 without a city', () => {
    const scan = scanTiming({ event: '出行', start: '2026-11-12 00:00', end: '2026-11-12 22:59' })
    expect(scan.cells.map((c) => c.start.slice(11))).toEqual(
      ['23', '01', '03', '05', '07', '09', '11', '13', '15', '17', '19', '21'].map(
        (h) => `${h}:00`,
      ),
    )
    expect(scan.cells[0]!.end).toBe('2026-11-12 01:00')
  })

  it('rejects a range longer than 31 days and an end before the start', () => {
    expect(() =>
      scanTiming({ event: '出行', start: '2026-11-01 00:00', end: '2026-12-02 00:01' }),
    ).toThrow(ChartInputError)
    expect(() =>
      scanTiming({ event: '出行', start: '2026-11-02 00:00', end: '2026-11-01 00:00' }),
    ).toThrow(ChartInputError)
  })
})
