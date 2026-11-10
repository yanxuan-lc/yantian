/**
 * Traditional shen-sha (神煞) rules. Pure: the browser module applies the same rules to
 * any flowing pillar it derives, so natal and flow columns always agree.
 */
import { elementOf, naYin, xunKong, ZHI } from './ganzhi.ts'

/** States which pillar each star is counted from; shown with every chart. */
export const SHENSHA_RULE =
  '贵人、禄刃、文昌等以日干（部分兼年干）起；驿马、桃花等以年支与日支三合起，不取本柱自身；天德、月德、德秀以月令起；学堂、童子兼看年柱纳音；魁罡、阴差阳错等只看日柱；空亡以日柱旬空。'

/** Natal facts every rule is counted from. */
export interface NatalBase {
  readonly yearGan: string
  readonly yearZhi: string
  readonly monthZhi: string
  readonly dayGan: string
  readonly dayZhi: string
  readonly dayPillar: string
  /** Element of the year pillar's na-yin. */
  readonly yearNaYinElement: string
}

/** Builds the rule base from the natal year, month, day and hour pillars. */
export function natalBase(pillars: readonly [string, string, string, string]): NatalBase {
  const [year, month, day] = pillars
  return {
    yearGan: year.charAt(0),
    yearZhi: year.charAt(1),
    monthZhi: month.charAt(1),
    dayGan: day.charAt(0),
    dayZhi: day.charAt(1),
    dayPillar: day,
    yearNaYinElement: naYin(year).charAt(2),
  }
}

/** Where a pillar sits: one of the four natal pillars, or any flowing pillar. */
export type PillarPosition = 'year' | 'month' | 'day' | 'hour' | 'flow'

type Table = Readonly<Record<string, string>>
const table = (keys: string, values: readonly string[]): Table =>
  Object.fromEntries([...keys].map((k, i) => [k, values[i]!]))

const TIANYI = table('甲乙丙丁戊己庚辛壬癸', [
  '丑未',
  '子申',
  '亥酉',
  '亥酉',
  '丑未',
  '子申',
  '丑未',
  '午寅',
  '卯巳',
  '卯巳',
])
const WENCHANG = table('甲乙丙丁戊己庚辛壬癸', [...'巳午申酉申酉亥子寅卯'])
const HONGYAN = table('甲乙丙丁戊己庚辛壬癸', [...'午午寅未辰辰戌酉子申'])
const JINYU = table('甲乙丙丁戊己庚辛壬癸', [...'辰巳未申未申戌亥丑寅'])
const LU = table('甲乙丙丁戊己庚辛壬癸', [...'寅卯巳午巳午申酉亥子'])
/** 羊刃 at the stem's 帝旺 branch; yin stems count backward. */
const YANGREN = table('甲乙丙丁戊己庚辛壬癸', [...'卯寅午巳午巳酉申子亥'])
const GUOYIN = table('甲乙丙丁戊己庚辛壬癸', [...'戌亥丑寅丑寅辰巳未申'])
const TAIJI = table('甲乙丙丁戊己庚辛壬癸', [
  '子午',
  '子午',
  '卯酉',
  '卯酉',
  '辰戌丑未',
  '辰戌丑未',
  '寅亥',
  '寅亥',
  '巳申',
  '巳申',
])
const FUXING = table('甲乙丙丁戊己庚辛壬癸', [
  '寅子',
  '卯丑',
  '寅子',
  '亥',
  '申',
  '未',
  '午',
  '巳',
  '辰',
  '卯丑',
])
/** 天德 by month branch; it may fall on a stem or a branch. */
const TIANDE = table(ZHI, [...'巳庚丁申壬辛亥甲癸寅丙乙'])
/** 月德 by month branch; it falls on a stem. */
const YUEDE = table(ZHI, [...'壬庚丙甲壬庚丙甲壬庚丙甲'])
/** 学堂 at the 长生 branch of the year na-yin element. */
const XUETANG: Table = { 金: '巳', 木: '亥', 水: '申', 土: '申', 火: '寅' }
const HONGLUAN = table(ZHI, [...'卯寅丑子亥戌酉申未午巳辰'])
const TIANXI = table(ZHI, [...'酉申未午巳辰卯寅丑子亥戌'])
const GUCHEN = table(ZHI, [...'寅寅巳巳巳申申申亥亥亥寅'])
const GUASU = table(ZHI, [...'戌戌丑丑丑辰辰辰未未未戌'])
/** Stars counted from the 三合 group of the year or day branch. */
const SANHE: ReadonlyArray<readonly [string, Table]> = [
  [
    '申子辰',
    { 驿马: '寅', 桃花: '酉', 将星: '子', 华盖: '辰', 劫煞: '巳', 灾煞: '午', 亡神: '亥' },
  ],
  [
    '寅午戌',
    { 驿马: '申', 桃花: '卯', 将星: '午', 华盖: '戌', 劫煞: '亥', 灾煞: '子', 亡神: '巳' },
  ],
  [
    '巳酉丑',
    { 驿马: '亥', 桃花: '午', 将星: '酉', 华盖: '丑', 劫煞: '寅', 灾煞: '卯', 亡神: '申' },
  ],
  [
    '亥卯未',
    { 驿马: '巳', 桃花: '子', 将星: '卯', 华盖: '未', 劫煞: '申', 灾煞: '酉', 亡神: '寅' },
  ],
]
/** 德秀 by the 三合 group of the month branch: stems of 德 then 秀. */
const DEXIU: ReadonlyArray<readonly [string, string]> = [
  ['寅午戌', '丙丁戊癸'],
  ['申子辰', '壬癸戊己丙辛甲'],
  ['巳酉丑', '庚辛乙'],
  ['亥卯未', '甲乙丁壬'],
]
const GAN_HE = table('甲乙丙丁戊己庚辛壬癸', [...'己庚辛壬癸甲乙丙丁戊'])
const ZHI_HE = table(ZHI, [...'丑子亥戌酉申未午巳辰卯寅'])
const KUIGANG = ['庚辰', '庚戌', '壬辰', '戊戌']
const YINCHA = [
  '丙子',
  '丁丑',
  '戊寅',
  '辛卯',
  '壬辰',
  '癸巳',
  '丙午',
  '丁未',
  '戊申',
  '辛酉',
  '壬戌',
  '癸亥',
]
const SHIE = ['甲辰', '乙巳', '壬申', '丙申', '丁亥', '庚辰', '戊戌', '癸亥', '辛巳', '己丑']
const GULUAN = ['乙巳', '丁巳', '辛亥', '戊申', '甲寅', '壬子', '丙午', '戊午']

/** Display order of every star. */
const ORDER = [
  '天乙贵人',
  '天德贵人',
  '月德贵人',
  '文昌贵人',
  '驿马',
  '桃花',
  '红艳',
  '将星',
  '华盖',
  '金舆',
  '禄神',
  '劫煞',
  '灾煞',
  '亡神',
  '羊刃',
  '天德合',
  '月德合',
  '天赦',
  '国印',
  '太极贵人',
  '学堂',
  '天医',
  '德秀贵人',
  '福星贵人',
  '红鸾',
  '天喜',
  '孤辰',
  '寡宿',
  '童子',
  '魁罡',
  '阴差阳错',
  '十恶大败',
  '孤鸾',
  '空亡',
] as const

/** Partner of a stem under 五合 or of a branch under 六合. */
function partner(char: string): string {
  return GAN_HE[char] ?? ZHI_HE[char] ?? ''
}

/** 童子 branches: by season of the month branch, then by the year na-yin element. */
function tongZi(base: NatalBase): string {
  const season = '寅卯辰申酉戌'.includes(base.monthZhi) ? '寅子' : '卯未辰'
  const byElement: Table = { 金: '午卯', 木: '午卯', 水: '酉戌', 火: '酉戌', 土: '辰巳' }
  return season + (byElement[base.yearNaYinElement] ?? '')
}

/** 天赦 day pillar by the season of the month branch. */
function tianShe(monthZhi: string): string {
  if ('寅卯辰'.includes(monthZhi)) return '戊寅'
  if ('巳午未'.includes(monthZhi)) return '甲午'
  if ('申酉戌'.includes(monthZhi)) return '戊申'
  return '甲子'
}

/**
 * Stars of the pillar `ganZhi` at `position`, in display order. Branch-group stars skip the
 * pillar that is their own base (the year pillar for year-branch groups, the day pillar for
 * day-branch groups). 童子 applies to the natal day and hour pillars; 天赦, 魁罡, 阴差阳错,
 * 十恶大败 and 孤鸾 apply to the natal day pillar only.
 */
export function starsFor(base: NatalBase, ganZhi: string, position: PillarPosition): string[] {
  const gan = ganZhi.charAt(0)
  const zhi = ganZhi.charAt(1)
  const hit = new Set<string>()
  const add = (name: string, ok: boolean) => {
    if (ok) hit.add(name)
  }
  const both = (t: Table) => (t[base.dayGan] ?? '') + (t[base.yearGan] ?? '')
  add('天乙贵人', (TIANYI[base.dayGan] ?? '').includes(zhi))
  const tianDe = TIANDE[base.monthZhi]!
  add('天德贵人', gan === tianDe || zhi === tianDe)
  add('月德贵人', gan === YUEDE[base.monthZhi])
  add('天德合', [gan, zhi].includes(partner(tianDe)))
  add('月德合', gan === partner(YUEDE[base.monthZhi]!))
  add('文昌贵人', both(WENCHANG).includes(zhi))
  add('红艳', HONGYAN[base.dayGan] === zhi)
  add('金舆', JINYU[base.dayGan] === zhi)
  add('禄神', LU[base.dayGan] === zhi)
  add('羊刃', YANGREN[base.dayGan] === zhi)
  add('国印', both(GUOYIN).includes(zhi))
  add('太极贵人', both(TAIJI).includes(zhi))
  add('福星贵人', both(FUXING).includes(zhi))
  add('学堂', XUETANG[base.yearNaYinElement] === zhi)
  add('天医', ZHI.charAt((ZHI.indexOf(base.monthZhi) + 11) % 12) === zhi)
  add('德秀贵人', DEXIU.find(([g]) => g.includes(base.monthZhi))![1].includes(gan))
  add('红鸾', HONGLUAN[base.yearZhi] === zhi)
  add('天喜', TIANXI[base.yearZhi] === zhi)
  add('孤辰', GUCHEN[base.yearZhi] === zhi)
  add('寡宿', GUASU[base.yearZhi] === zhi)
  for (const [own, branch] of [
    ['year', base.yearZhi],
    ['day', base.dayZhi],
  ] as const) {
    if (position === own) continue
    const stars = SANHE.find(([group]) => group.includes(branch))![1]
    for (const [name, target] of Object.entries(stars)) add(name, target === zhi)
  }
  add('童子', (position === 'day' || position === 'hour') && tongZi(base).includes(zhi))
  if (position === 'day') {
    add('天赦', ganZhi === tianShe(base.monthZhi))
    add('魁罡', KUIGANG.includes(ganZhi))
    add('阴差阳错', YINCHA.includes(ganZhi))
    add('十恶大败', SHIE.includes(ganZhi))
    add('孤鸾', GULUAN.includes(ganZhi))
  }
  add('空亡', xunKong(base.dayPillar).includes(zhi))
  return ORDER.filter((name) => hit.has(name))
}

/** Short star name for dense columns: drops the 贵人 suffix. */
export function shortStar(name: string): string {
  return name.endsWith('贵人') ? name.slice(0, -2) : name
}

/** Element of a na-yin name (its last character). */
export function naYinElement(name: string): string {
  return elementOf(name.charAt(2)) ?? name.charAt(2)
}
