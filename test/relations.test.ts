import { describe, expect, it } from 'vitest'
import { flowRelations, natalRelations } from '../src/bazi/relations.ts'

const NATAL = ['庚午', '辛巳', '辛未', '癸巳']

describe('stem and branch relations of the reference chart', () => {
  it('natal chart', () => {
    expect(natalRelations(NATAL)).toEqual({ gan: [], zhi: ['巳午未三会火', '午未合化火'] })
  })

  it('luck, year, month and day pillars against the natal chart', () => {
    const r = flowRelations(NATAL, ['甲申', '丙午', '己亥', '丁亥'])
    expect(r.gan).toEqual([
      '甲己合化土',
      '甲庚冲',
      '丙辛合化水',
      '丙克庚',
      '己克癸',
      '丁癸冲',
      '丁克辛',
    ])
    expect(r.zhi.slice(0, 8)).toEqual([
      '巳刑申',
      '巳申合化水',
      '申亥相害',
      '巳申相破',
      '巳午未三会火',
      '午刑午',
      '午未合化火',
      '亥午暗合',
    ])
  })
})
