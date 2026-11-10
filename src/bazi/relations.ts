/**
 * Stem and branch relations (合冲刑害破) between pillars. Pure, shared by the backend
 * summary and the browser flow view.
 */
import { controls, elementOf, isYang } from './ganzhi.ts'

/** Relation lines for stems and for branches, each in display order without duplicates. */
export interface Relations {
  readonly gan: string[]
  readonly zhi: string[]
}

const GAN_HE: ReadonlyArray<readonly [string, string]> = [
  ['甲己', '土'],
  ['乙庚', '金'],
  ['丙辛', '水'],
  ['丁壬', '木'],
  ['戊癸', '火'],
]
const GAN_CHONG = ['甲庚', '乙辛', '丙壬', '丁癸']

const SAN_HUI: ReadonlyArray<readonly [string, string]> = [
  ['寅卯辰', '木'],
  ['巳午未', '火'],
  ['申酉戌', '金'],
  ['亥子丑', '水'],
]
const SAN_HE: ReadonlyArray<readonly [string, string]> = [
  ['申子辰', '水'],
  ['亥卯未', '木'],
  ['寅午戌', '火'],
  ['巳酉丑', '金'],
]
const SAN_XING = ['寅巳申', '丑戌未']
/** Directional punishments; 子卯 punish each other and 辰午酉亥 punish themselves. */
const XING = ['寅巳', '巳申', '申寅', '丑戌', '戌未', '未丑']
const SELF_XING = '辰午酉亥'
const LIU_HE: ReadonlyArray<readonly [string, string]> = [
  ['子丑', '土'],
  ['寅亥', '木'],
  ['卯戌', '火'],
  ['辰酉', '金'],
  ['巳申', '水'],
  ['午未', '火'],
]
const CHONG = ['子午', '丑未', '寅申', '卯酉', '辰戌', '巳亥']
const HAI = ['子未', '丑午', '寅巳', '卯辰', '申亥', '酉戌']
const PO = ['子酉', '午卯', '巳申', '寅亥', '辰丑', '戌未']
const AN_HE = ['寅丑', '卯申', '亥午']

const pairOf = (list: readonly string[], a: string, b: string) =>
  list.find((p) => (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a))

/** Stem relations of `a` with `b` in rank order 合, 冲, 克; pairs use their canonical order. */
function ganPair(a: string, b: string): Array<readonly [number, string]> {
  const out: Array<readonly [number, string]> = []
  const he = GAN_HE.find(([p]) => pairOf([p], a, b))
  if (he) out.push([0, `${he[0]}合化${he[1]}`])
  const chongPair = pairOf(GAN_CHONG, a, b)
  const chong = chongPair !== undefined
  if (chong) out.push([1, `${chongPair}冲`])
  if (!chong && isYang(a) === isYang(b)) {
    if (controls(elementOf(a)!, elementOf(b)!)) out.push([2, `${a}克${b}`])
    else if (controls(elementOf(b)!, elementOf(a)!)) out.push([2, `${b}克${a}`])
  }
  return out
}

/** Branch relations of `a` with `b` in rank order: 刑, 合, 冲, 害, 破, 暗合. */
function zhiPair(a: string, b: string): Array<readonly [number, string]> {
  const out: Array<readonly [number, string]> = []
  if (a === b && SELF_XING.includes(a)) out.push([2, `${a}刑${a}`])
  const xing = pairOf(XING, a, b)
  if (xing) out.push([2, `${xing[0]}刑${xing[1]}`])
  if (pairOf(['子卯'], a, b)) out.push([2, '子卯相刑'])
  const he = LIU_HE.find(([p]) => pairOf([p], a, b))
  if (he) out.push([3, `${he[0]}合化${he[1]}`])
  const chong = pairOf(CHONG, a, b)
  if (chong) out.push([4, `${chong}冲`])
  const hai = pairOf(HAI, a, b)
  if (hai) out.push([5, `${hai}相害`])
  const po = pairOf(PO, a, b)
  if (po) out.push([6, `${po}相破`])
  const anHe = pairOf(AN_HE, a, b)
  if (anHe) out.push([7, `${anHe}暗合`])
  return out
}

/** Three-branch combinations containing `own` whose other members are all in `others`. */
function zhiTriples(own: string, others: readonly string[]): Array<readonly [number, string]> {
  const out: Array<readonly [number, string]> = []
  const complete = (group: string) =>
    group.includes(own) && [...group].every((c) => c === own || others.includes(c))
  for (const [group, element] of SAN_HUI)
    if (complete(group)) out.push([0, `${group}三会${element}`])
  for (const [group, element] of SAN_HE)
    if (complete(group)) out.push([1, `${group}三合${element}`])
  for (const group of SAN_XING) if (complete(group)) out.push([2, `${group}三刑`])
  return out
}

/**
 * Collects relations grouped by each subject column in order; a subject relates to every
 * partner column, sorted by relation rank, and each line appears once.
 */
function collect(
  subjects: readonly string[],
  partnersOf: (index: number) => readonly string[],
  pair: (a: string, b: string) => Array<readonly [number, string]>,
  triples?: (own: string, others: readonly string[]) => Array<readonly [number, string]>,
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  subjects.forEach((own, i) => {
    const partners = partnersOf(i)
    const found = [
      ...(triples?.(own, partners) ?? []),
      ...partners.flatMap((other) => pair(own, other)),
    ].sort((x, y) => x[0] - y[0])
    for (const [, line] of found) {
      if (!seen.has(line)) {
        seen.add(line)
        out.push(line)
      }
    }
  })
  return out
}

/** Relations among the four natal pillars. */
export function natalRelations(natal: readonly string[]): Relations {
  const gans = natal.map((p) => p.charAt(0))
  const zhis = natal.map((p) => p.charAt(1))
  return {
    gan: collect(gans, (i) => gans.slice(i + 1), ganPair),
    zhi: collect(
      zhis,
      (i) => zhis.slice(i + 1),
      zhiPair,
      (own, others) =>
        // A triple is reported once, at its first member column.
        zhiTriples(own, others),
    ),
  }
}

/**
 * Relations that involve at least one flowing pillar: each flowing column relates to every
 * natal column and to the flowing columns after it.
 */
export function flowRelations(natal: readonly string[], flow: readonly string[]): Relations {
  const nGan = natal.map((p) => p.charAt(0))
  const nZhi = natal.map((p) => p.charAt(1))
  const fGan = flow.map((p) => p.charAt(0))
  const fZhi = flow.map((p) => p.charAt(1))
  return {
    gan: collect(fGan, (i) => [...nGan, ...fGan.slice(i + 1)], ganPair),
    zhi: collect(fZhi, (i) => [...nZhi, ...fZhi.slice(i + 1)], zhiPair, zhiTriples),
  }
}
