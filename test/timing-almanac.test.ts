import { describe, expect, it } from 'vitest'
import { parseCivil } from '../src/bazi/civil-time.ts'
import { type AlmanacFacts, almanacFacts, scoreAlmanac } from '../src/timing/almanac.ts'

/** A neutral day: no matching terms, a 黄道 day god and a 黄道 hour god. */
const base: AlmanacFacts = {
  dayGanZhi: '庚寅',
  dayYi: ['祭祀'],
  dayJi: ['安葬'],
  hourYi: [],
  hourJi: [],
  jianChu: '平',
  dayGod: '青龙',
  dayGodType: '黄道',
  hourGod: '明堂',
  hourGodType: '黄道',
  hourZhi: '巳',
}

describe('almanac scorer', () => {
  it('adds every documented weight for the matter', () => {
    const facts: AlmanacFacts = {
      ...base,
      dayYi: ['纳财', '祭祀'],
      hourYi: ['求财'],
      jianChu: '开',
      hourGod: '天刑',
      hourGodType: '黑道',
    }
    // 日宜 +2, 时宜 +1, 开日 +1 (除危定执成开) +0.5 (求财宜开), 黄道日 +1.5, 黑道时 −1.
    const s = scoreAlmanac('求财', facts)
    expect(s.score).toBe(5)
    expect(s.veto).toBeUndefined()
    expect(s.reasons).toEqual(
      expect.arrayContaining([
        '日宜纳财',
        '时宜求财',
        '开日',
        '日神青龙（黄道）',
        '时神天刑（黑道）',
      ]),
    )
  })

  it('scores a day without the matter in its 宜 below one that has it', () => {
    expect(scoreAlmanac('出行', base).score).toBeLessThan(
      scoreAlmanac('出行', { ...base, dayYi: ['出行'] }).score,
    )
  })

  it('vetoes a day whose 忌 names the matter', () => {
    const s = scoreAlmanac('婚姻', { ...base, dayJi: ['嫁娶'] })
    expect(s.veto).toBe('日忌嫁娶')
  })

  it('vetoes 词讼 in the day 忌 for a lawsuit', () => {
    expect(scoreAlmanac('诉讼', { ...base, dayJi: ['词讼'] }).veto).toBe('日忌词讼')
  })

  it('vetoes a 破日 for marriage, wealth and office only', () => {
    const po = { ...base, jianChu: '破' }
    for (const e of ['婚姻', '求财', '求官'] as const) expect(scoreAlmanac(e, po).veto).toBe('破日')
    expect(scoreAlmanac('出行', po).veto).toBeUndefined()
  })

  it('vetoes a day that clashes the natal year branch', () => {
    const s = scoreAlmanac('谋事', { ...base, dayGanZhi: '庚午' }, '子')
    expect(s.veto).toBe('日支午冲生肖鼠')
    expect(scoreAlmanac('谋事', { ...base, dayGanZhi: '庚午' }).veto).toBeUndefined()
  })

  it('charges an hour that clashes the natal year branch', () => {
    const clash = scoreAlmanac('谋事', { ...base, hourZhi: '午' }, '子')
    expect(scoreAlmanac('谋事', base, '子').score - clash.score).toBe(1)
    expect(clash.reasons).toContain('时冲生肖鼠')
  })

  it('vetoes a day marked 诸事不宜', () => {
    expect(scoreAlmanac('考试', { ...base, dayJi: ['诸事不宜'] }).veto).toBe('诸事不宜')
  })

  it('reads the day and hour facts from the calendar', () => {
    const f = almanacFacts(parseCivil('2026-11-12 10:30')!)
    expect(f).toMatchObject({
      dayGanZhi: '庚寅',
      jianChu: '平',
      dayGod: '天牢',
      dayGodType: '黑道',
      hourGod: '天德',
      hourGodType: '黄道',
      hourZhi: '巳',
    })
    expect(f.dayYi).toContain('开市')
    expect(f.hourYi).toContain('求财')
  })
})
