import { describe, expect, it } from 'vitest'
import { type BaziNatalFacts, baziNatalFacts, scoreBazi } from '../src/timing/bazi.ts'

/** 戊午 day master 戊 (earth); favourable elements chosen for the test, not by strength. */
const natal: BaziNatalFacts = {
  pillars: ['甲子', '丙寅', '戊午', '庚申'],
  gender: 'male',
  yong: '火',
  xi: ['土'],
  ji: ['木', '水'],
}

describe('bazi scorer', () => {
  it('scores the hour stem by favourable and unfavourable elements', () => {
    const good = scoreBazi('出行', natal, '己卯', '丙辰')
    const bad = scoreBazi('出行', natal, '己卯', '壬辰')
    expect(good.score).toBeGreaterThan(bad.score)
    expect(good.reasons).toContain('时干丙火为用神')
    expect(bad.reasons).toContain('时干壬水为忌神')
  })

  it('rewards the ten god of the matter in the hour pillar', () => {
    const s = scoreBazi('求财', natal, '己卯', '壬辰')
    expect(s.reasons).toContain('时干偏财（合事）')
    const other = scoreBazi('考试', natal, '己卯', '壬辰')
    expect(s.score).toBeGreaterThan(other.score)
  })

  it('counts the matter star from the shen-sha rules', () => {
    // 天乙 of a 戊 day master falls on 丑 and 未.
    expect(scoreBazi('谒贵', natal, '己卯', '己未').reasons).toContain('时逢天乙贵人')
  })

  it('reads the branch relations of the hour with the natal day branch', () => {
    const he = scoreBazi('谋事', natal, '己卯', '己未')
    expect(he.reasons).toContain('时支未合日支午')
    const chong = scoreBazi('谋事', natal, '己卯', '戊子')
    expect(chong.reasons).toContain('时支子冲日支午')
  })

  it('vetoes a day or hour pillar that 天克地冲 the natal day pillar', () => {
    expect(scoreBazi('谋事', natal, '甲子', '丙寅').veto).toBe('流日甲子天克地冲日柱戊午')
    expect(scoreBazi('谋事', natal, '己卯', '壬子').veto).toBe('时柱壬子天克地冲日柱戊午')
  })

  it('vetoes a clash of the spouse palace for marriage only', () => {
    expect(scoreBazi('婚姻', natal, '己卯', '戊子').veto).toBe('时支子冲日支午（夫妻宫）')
    expect(scoreBazi('谋事', natal, '己卯', '戊子').veto).toBeUndefined()
  })

  it('reads the spouse star by gender for marriage', () => {
    // 壬 is 偏财 of 戊 (a man's spouse star); 乙 is 正官 (a woman's).
    expect(scoreBazi('婚姻', natal, '己卯', '壬辰').reasons).toContain('时干偏财（合事）')
    const woman = { ...natal, gender: 'female' as const }
    expect(scoreBazi('婚姻', woman, '己卯', '乙卯').reasons).toContain('时干正官（合事）')
  })

  it('lists reasons by contribution, most favourable first', () => {
    const s = scoreBazi('求财', natal, '己卯', '壬辰')
    // 壬 is 偏财 (+1.5) and water a 忌神 (−3); the ten god leads, the element trails.
    expect(s.reasons.indexOf('时干偏财（合事）')).toBeLessThan(s.reasons.indexOf('时干壬水为忌神'))
    expect(s.reasons.at(-1)).toBe('时干壬水为忌神')
  })

  it('builds the natal facts from birth facts and the strength analysis', () => {
    const facts = baziNatalFacts({
      birth: '1990-05-17 08:30',
      dst: false,
      apparentSolar: false,
      lateZi: 'today',
      gender: 'female',
      luckSteps: 0,
    })
    expect(facts.pillars).toHaveLength(4)
    expect(facts.gender).toBe('female')
    expect('木火土金水').toContain(facts.yong)
  })
})
