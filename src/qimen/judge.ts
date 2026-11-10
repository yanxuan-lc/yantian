/**
 * Single-moment judgement of a 时家奇门 chart for one matter (断局), ported from the
 * reference `duanju.py` (`interpret`, plus the 求财专项 of its single-moment path). Scores
 * rank moments against each other; their absolute values carry no meaning. Traditional rules
 * take precedence over the reference: a 用神 in the centre is read at 坤 (中宫寄坤), the lodged
 * centre stem counts as a heaven stem and the centre's earth stem as at 坤,
 * 六仪击刑 reads the heaven plate, 门迫 is the door controlling its palace, and the 克应 table
 * names 己+庚 刑格返名 and 丁+己 火入勾陈.
 */
import { controls, ELEMENTS, elementOf, seasonStates } from '../bazi/ganzhi.ts'
import type { Board, Layer } from './board.ts'
import type {
  QimenEvent,
  QimenJudgement,
  QimenPalaceReport,
  QimenPattern,
  QimenYongShen,
} from './schema.ts'

/** Element of each palace. */
export const PALACE_ELEMENT: Readonly<Record<string, string>> = {
  坎: '水',
  離: '火',
  震: '木',
  巽: '木',
  乾: '金',
  兌: '金',
  坤: '土',
  艮: '土',
  中: '土',
}

const DOOR_ELEMENT: Readonly<Record<string, string>> = {
  休: '水',
  生: '土',
  傷: '木',
  杜: '木',
  景: '火',
  死: '土',
  驚: '金',
  開: '金',
}
const STAR_ELEMENT: Readonly<Record<string, string>> = {
  蓬: '水',
  任: '土',
  沖: '木',
  輔: '木',
  英: '火',
  禽: '土',
  柱: '金',
  心: '金',
  芮: '土',
}
const DOOR_SCORE: Readonly<Record<string, number>> = {
  開: 2,
  休: 2,
  生: 2,
  杜: 0,
  景: 0,
  死: -2,
  驚: -2,
  傷: -2,
}
const STAR_SCORE: Readonly<Record<string, number>> = {
  輔: 2,
  心: 2,
  任: 2,
  禽: 1,
  沖: 1,
  英: 0,
  蓬: -1,
  柱: -1,
  芮: -2,
}
const GOD_SCORE: Readonly<Record<string, number>> = {
  符: 2,
  合: 1,
  陰: 1,
  地: 1,
  天: 1,
  蛇: -1,
  勾: -1,
  雀: -1,
  虎: -2,
  玄: -1,
}
/** Full names of the eight spirits. */
export const GOD_NAME: Readonly<Record<string, string>> = {
  符: '值符',
  蛇: '螣蛇',
  陰: '太阴',
  合: '六合',
  勾: '勾陈',
  雀: '朱雀',
  虎: '白虎',
  玄: '玄武',
  地: '九地',
  天: '九天',
}

/** Branches of each outer palace, for void (空亡) and 驿马. */
export const PALACE_ZHI: Readonly<Record<string, readonly string[]>> = {
  坎: ['子'],
  艮: ['丑', '寅'],
  震: ['卯'],
  巽: ['辰', '巳'],
  離: ['午'],
  坤: ['未', '申'],
  兌: ['酉'],
  乾: ['戌', '亥'],
}
const ZHI_PALACE: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(PALACE_ZHI).flatMap(([gua, zhis]) => zhis.map((z) => [z, gua])),
)
/** 驿马 branch by the hour branch's three-harmony group. */
const MA_BY_ZHI: Readonly<Record<string, string>> = {
  申: '寅',
  子: '寅',
  辰: '寅',
  寅: '申',
  午: '申',
  戌: '申',
  巳: '亥',
  酉: '亥',
  丑: '亥',
  亥: '巳',
  卯: '巳',
  未: '巳',
}
const ZHI_CLASH: Readonly<Record<string, string>> = {
  子: '午',
  午: '子',
  丑: '未',
  未: '丑',
  寅: '申',
  申: '寅',
  卯: '酉',
  酉: '卯',
  辰: '戌',
  戌: '辰',
  巳: '亥',
  亥: '巳',
}
/** Tomb branch of each element; fire and earth share 戌. */
const TOMB_ZHI: Readonly<Record<string, string>> = {
  木: '未',
  火: '戌',
  土: '戌',
  金: '丑',
  水: '辰',
}
/** Tomb palace of the three wonders (三奇) only. */
const WONDER_TOMB: Readonly<Record<string, string>> = { 乙: '坤', 丙: '乾', 丁: '乾' }
/** Palace where each 仪 on the heaven plate suffers punishment (击刑), in check order. */
const PUNISHMENT: ReadonlyArray<readonly [string, string]> = [
  ['戊', '震'],
  ['己', '坤'],
  ['庚', '艮'],
  ['辛', '離'],
  ['壬', '巽'],
  ['癸', '巽'],
]
const OPPOSITE: Readonly<Record<string, string>> = {
  坎: '離',
  離: '坎',
  震: '兌',
  兌: '震',
  巽: '乾',
  乾: '巽',
  艮: '坤',
  坤: '艮',
}

/**
 * 十干克应: heaven stem → earth stem → [name, −1 / 0 / +1]. Pairs scored as patterns of their
 * own keep their name at 0: 戊 over 丙 (青龙返首), 丙 over 戊 (飞鸟跌穴), and a stem over
 * itself, which occurs only in a 伏吟 chart and is scored by the 伏吟 pattern.
 */
const KE_YING: Readonly<Record<string, Readonly<Record<string, readonly [string, number]>>>> = {
  戊: {
    戊: ['伏吟', 0],
    乙: ['青龙和会', 0],
    丙: ['青龙返首', 0],
    丁: ['青龙耀明', 1],
    己: ['贵人入狱', -1],
    庚: ['值符飞宫', -1],
    辛: ['青龙折足', 0],
    壬: ['青龙破狱', -1],
    癸: ['青龙华盖', 0],
  },
  己: {
    己: ['地户逢鬼', 0],
    戊: ['犬遇青龙', 1],
    乙: ['墓神不明', -1],
    丙: ['火孛地户', -1],
    丁: ['朱雀入墓', -1],
    庚: ['刑格返名', -1],
    辛: ['游魂入墓', -1],
    壬: ['地网高张', -1],
    癸: ['华盖地户', 0],
  },
  乙: {
    乙: ['日奇伏吟', 0],
    丙: ['奇仪顺遂', 1],
    丁: ['奇仪相佐', 1],
    戊: ['青龙合灵', 0],
    己: ['日奇入墓', -1],
    庚: ['日奇被刑', -1],
    辛: ['青龙逃走', -1],
    壬: ['日奇入地', 0],
    癸: ['华盖逢星', 0],
  },
  丙: {
    丙: ['月奇悖师', 0],
    乙: ['帘幕贵人', 1],
    丁: ['星随月转', 1],
    戊: ['飞鸟跌穴', 0],
    己: ['火悖地户', -1],
    庚: ['荧入太白', -1],
    辛: ['日月相会', 0],
    壬: ['冲天奔地', -1],
    癸: ['华盖悖师', -1],
  },
  丁: {
    丁: ['星奇伏吟', 0],
    戊: ['青龙转光', 1],
    乙: ['玉女奇生', 1],
    丙: ['星随月转', 1],
    己: ['火入勾陈', -1],
    庚: ['火炼真金', 1],
    辛: ['朱雀入狱', 0],
    壬: ['奇合有喜', 1],
    癸: ['朱雀投江', -1],
  },
  庚: {
    庚: ['太白同宫(战格)', 0],
    戊: ['天乙伏宫', -1],
    乙: ['太白逢星', -1],
    丙: ['太白入荧', -1],
    丁: ['亭亭之格', 0],
    己: ['官符刑格', -1],
    辛: ['白虎干格', -1],
    壬: ['小格移荡', -1],
    癸: ['大格', -1],
  },
  辛: {
    辛: ['伏吟天庭', 0],
    戊: ['困龙被伤', -1],
    乙: ['白虎猖狂', -1],
    丙: ['干合悖师', 0],
    丁: ['狱神得奇', 1],
    己: ['入狱自刑', -1],
    庚: ['白虎出力', -1],
    壬: ['凶蛇入狱', -1],
    癸: ['天牢华盖', -1],
  },
  壬: {
    壬: ['蛇入地罗', 0],
    戊: ['小蛇化龙', 1],
    乙: ['小蛇得势', 0],
    丙: ['水蛇入火', 0],
    丁: ['干合有喜', 1],
    己: ['凶蛇入狱', -1],
    庚: ['太白擒蛇', 1],
    辛: ['腾蛇相缠', -1],
    癸: ['幼女奸淫', -1],
  },
  癸: {
    癸: ['天网四张', 0],
    戊: ['天乙会合', 1],
    乙: ['华盖逢星', 0],
    丙: ['华盖悖师', -1],
    丁: ['螣蛇夭矫', -1],
    己: ['华盖地户', 0],
    庚: ['太白入网', -1],
    辛: ['网盖天牢', -1],
    壬: ['复见腾蛇', -1],
  },
}

type Locator =
  | { readonly kind: 'door' | 'star' | 'god'; readonly key: string }
  | { readonly kind: 'day' | 'hour' | 'zhiFu' }

const DAY: Locator = { kind: 'day' }
const HOUR: Locator = { kind: 'hour' }
const ZHI_FU: Locator = { kind: 'zhiFu' }
const door = (key: string): Locator => ({ kind: 'door', key })
const star = (key: string): Locator => ({ kind: 'star', key })

/** 用神 of each matter: role label and how to locate it. */
const YONG_SHEN: Readonly<Record<QimenEvent, ReadonlyArray<readonly [string, Locator]>>> = {
  求财: [
    ['生门', door('生')],
    ['求测人(日干)', DAY],
    ['财之总(值符)', ZHI_FU],
  ],
  求官: [
    ['开门', door('開')],
    ['求测人(日干)', DAY],
    ['值符', ZHI_FU],
  ],
  谋事: [
    ['求测人(日干)', DAY],
    ['所谋(时干)', HOUR],
    ['值符', ZHI_FU],
  ],
  出行: [
    ['求测人(日干)', DAY],
    ['开门', door('開')],
    ['生门', door('生')],
  ],
  婚姻: [
    ['求测人(日干)', DAY],
    ['对方(时干)', HOUR],
    ['六合(媒)', { kind: 'god', key: '合' }],
  ],
  疾病: [
    ['病人(日干)', DAY],
    ['病(天芮)', star('芮')],
    ['医(天心)', star('心')],
  ],
  诉讼: [
    ['求测人(日干)', DAY],
    ['对方(时干)', HOUR],
    ['官方(值符)', ZHI_FU],
  ],
  谒贵: [
    ['求测人(日干)', DAY],
    ['贵人(值符)', ZHI_FU],
    ['开门', door('開')],
  ],
  考试: [
    ['求测人(日干)', DAY],
    ['文书(景门)', door('景')],
    ['文星(天辅)', star('輔')],
  ],
}

/** Rounds to two decimals; inputs are sums of hundredths, so no exact ties arise. */
const round2 = (x: number) => Math.round(x * 100) / 100

/** Relation of element `a` to element `b`: 同, 生 (a feeds b), 泄 (b feeds a), 克, 受克. */
export function elementRelation(a: string, b: string): string {
  const step = (ELEMENTS.indexOf(b) - ELEMENTS.indexOf(a) + 5) % 5
  return ['同', '生', '克', '受克', '泄'][step]!
}

/** Seasonal state (旺 相 休 囚 死) of an element under a month branch. */
const seasonOf = (element: string, monthZhi: string) =>
  seasonStates(monthZhi).find((s) => s.element === element)!.state

const SEASON_SCORE: Readonly<Record<string, number>> = {
  旺: 1.0,
  相: 0.6,
  休: 0.0,
  囚: -0.4,
  死: -0.6,
}

/** First palace of `layer` holding `value`. */
function find(layer: Layer, value: string): string | undefined {
  for (const [gua, v] of layer) if (v === value) return gua
  return undefined
}

interface Context {
  readonly board: Board
  readonly dayGan: string
  readonly hourGan: string
  readonly hourZhi: string
  readonly monthZhi: string
  readonly voidZhi: string
}

/**
 * Outer heaven-plate stems as `[palace, stem]` in layout order, then the lodged centre stem
 * (中五寄坤) at the palace where 天芮 lands. The centre entry of the heaven layer repeats the
 * earth plate and is left out.
 */
function heavenStems(b: Board): Array<readonly [string, string]> {
  const outer = [...b.sky].filter(([gua]) => gua !== '中')
  return [...outer, [b.skyLodged.palace, b.skyLodged.stem]]
}

/** Palace of a stem on the heaven plate, the lodged centre stem included. */
const heavenOf = (b: Board, gan: string) => heavenStems(b).find(([, g]) => g === gan)?.[0]

/** Palace of a stem on the heaven plate, else the earth plate; 甲 is on neither. */
const locateGan = (b: Board, gan: string) => heavenOf(b, gan) ?? find(b.earth, gan)

/** Palace and display symbol of a 用神. */
function locate(c: Context, loc: Locator): [string | null, string] {
  const b = c.board
  switch (loc.kind) {
    case 'door':
      return [find(b.door, loc.key) ?? null, `${loc.key}门`]
    case 'star':
      return [find(b.star, loc.key) ?? null, `天${loc.key}`]
    case 'god':
      return [find(b.god, loc.key) ?? null, GOD_NAME[loc.key]!]
    case 'zhiFu':
      return [b.zhiFu[1], '值符']
    default: {
      const gan = loc.kind === 'day' ? c.dayGan : c.hourGan
      const gua = locateGan(b, gan)
      // 甲 hides under the 值符 and is read at the 值符 palace.
      return gua === undefined ? [b.zhiFu[1], `${gan}(甲寄值符)`] : [gua, gan]
    }
  }
}

/**
 * 十干克应 of a heaven stem over an earth stem: its name, `null` when none is defined, and its
 * score. 庚 over the day or hour stem is scored as 日格/时格, so its 克应 scores 0.
 */
function keYingOf(c: Context, sky: string, earth: string): [string | null, number] {
  const k = KE_YING[sky]?.[earth]
  if (k === undefined) return [null, 0]
  const geGe = sky === '庚' && (earth === c.dayGan || earth === c.hourGan)
  return [k[0], geGe ? 0 : k[1]]
}

/** Palace a 用神 is read at: its own, or 坤 for the centre (中宫寄坤); `null` off the chart. */
const readPalace = (u: QimenYongShen) => u.lodgedAt ?? u.palace

/** Evaluation of an outer palace. */
function palaceReport(c: Context, gua: string): QimenPalaceReport {
  const b = c.board
  const sky = b.sky.get(gua)!
  const earth = b.earth.get(gua)!
  const men = b.door.get(gua)!
  const xing = b.star.get(gua)!
  const shen = b.god.get(gua)!
  const starState = seasonOf(STAR_ELEMENT[xing]!, c.monthZhi)
  const doorState = seasonOf(DOOR_ELEMENT[men]!, c.monthZhi)
  const stemState = seasonOf(elementOf(sky)!, c.monthZhi)
  // The star's season counts in full; the door's and the heaven stem's at half weight.
  const seasonScore =
    SEASON_SCORE[starState]! + 0.5 * SEASON_SCORE[doorState]! + 0.5 * SEASON_SCORE[stemState]!
  let score = DOOR_SCORE[men]! + STAR_SCORE[xing]! + GOD_SCORE[shen]! + seasonScore
  const lodged = b.skyLodged.palace === gua ? b.skyLodged.stem : undefined
  const [keYing, keYingScore] = keYingOf(c, sky, earth)
  score += keYingScore
  const [keYingLodged, lodgedScore] =
    lodged === undefined ? [undefined, 0] : keYingOf(c, lodged, earth)
  score += lodgedScore
  // 中宫寄坤: 坤 holds the centre's earth stem as a second earth stem under its heaven stem.
  // A lodged heaven stem at 坤 occurs only in a 伏吟 chart, where it sits over itself.
  const earthLodged = gua === '坤' ? b.earth.get('中')! : undefined
  const [keYingEarthLodged, earthLodgedScore] =
    earthLodged === undefined ? [undefined, 0] : keYingOf(c, sky, earthLodged)
  score += earthLodgedScore
  // 门迫: the door's element controls the palace's; a palace controlling its door costs nothing.
  const doorPressed = controls(DOOR_ELEMENT[men]!, PALACE_ELEMENT[gua]!)
  if (doorPressed) score -= 0.5
  return {
    sky,
    ...(lodged === undefined ? {} : { skyLodged: lodged }),
    earth,
    ...(earthLodged === undefined ? {} : { earthLodged }),
    door: men,
    star: `天${xing}`,
    god: GOD_NAME[shen]!,
    starState,
    doorState,
    stemState,
    keYing,
    ...(keYingLodged === undefined ? {} : { keYingLodged }),
    ...(keYingEarthLodged === undefined ? {} : { keYingEarthLodged }),
    doorPressed,
    score: round2(score),
  }
}

/**
 * Whether an outer palace is truly void under the hour decade's void branches: a star in
 * 旺 or 相 and a void branch clashed by the hour branch both release it. Returns the release
 * reason when one applies.
 */
function voidState(c: Context, gua: string, starState: string): [boolean, string | undefined] {
  const zhis = PALACE_ZHI[gua] ?? []
  if (!zhis.some((z) => c.voidZhi.includes(z))) return [false, undefined]
  if (starState === '旺' || starState === '相') return [false, '旺相不空']
  if (zhis.some((z) => ZHI_CLASH[z] === c.hourZhi)) return [false, '逢冲填实']
  return [true, undefined]
}

const YANG_GAN = '甲丙戊庚壬'

/**
 * Patterns of the chart in the reference's detection order. Placement patterns read the
 * lodged centre stem as a heaven stem where 天芮 lands and the centre's earth stem at 坤
 * (中宫寄坤).
 */
function detectPatterns(c: Context): QimenPattern[] {
  const { board: b, dayGan, hourGan } = c
  const out: QimenPattern[] = []
  // A tomb clashed by the hour branch opens; the pattern is then shown as neutral.
  const tombOpen = (gan: string) => ZHI_CLASH[TOMB_ZHI[elementOf(gan)!]!] === c.hourZhi

  if (
    controls(elementOf(hourGan)!, elementOf(dayGan)!) &&
    YANG_GAN.includes(hourGan) === YANG_GAN.includes(dayGan)
  ) {
    out.push({ name: '五不遇时', luck: '凶', note: `时干${hourGan}克日干${dayGan}，用事减力` })
  }

  const skyOf = (gan: string) => heavenOf(b, gan)
  // 中宫寄坤: the centre's earth stem counts at 坤.
  const earthOf = (gan: string) => {
    const gua = find(b.earth, gan)
    return gua === '中' ? '坤' : gua
  }
  if (skyOf('戊') !== undefined && skyOf('戊') === earthOf('丙')) {
    out.push({
      name: '青龙返首',
      palace: skyOf('戊')!,
      luck: '大吉',
      note: '天盘戊加地盘丙，利求财谋事',
    })
  }
  if (skyOf('丙') !== undefined && skyOf('丙') === earthOf('戊')) {
    out.push({
      name: '飞鸟跌穴',
      palace: skyOf('丙')!,
      luck: '吉',
      note: '天盘丙加地盘戊，谋望得力',
    })
  }

  for (const [gua, g] of heavenStems(b)) {
    const men = b.door.get(gua)
    if ('乙丙丁'.includes(g) && (men === '開' || men === '休' || men === '生')) {
      out.push({ name: '三奇临吉门', palace: gua, luck: '吉', note: `${g}奇临${men}门` })
    }
  }

  for (const [yi, gua] of PUNISHMENT) {
    if (heavenStems(b).some(([at, g]) => at === gua && g === yi)) {
      out.push({ name: '六仪击刑', palace: gua, luck: '凶', note: `${yi}落${gua}宫击刑，主受阻` })
    }
  }

  for (const [gua, g] of heavenStems(b)) {
    if (WONDER_TOMB[g] !== gua) continue
    out.push(
      tombOpen(g)
        ? {
            name: '三奇入墓(逢冲开)',
            palace: gua,
            luck: '平',
            note: `天盘${g}奇本落${gua}墓库，逢时支冲开、力得出，不以入墓论`,
          }
        : { name: '三奇入墓', palace: gua, luck: '凶', note: `天盘${g}奇落${gua}墓库，力受困` },
    )
  }

  const outer = [...b.sky.keys()].filter((g) => g !== '中')
  if (outer.length > 0 && outer.every((g) => b.sky.get(g) === b.earth.get(g))) {
    out.push({ name: '伏吟', luck: '凶', note: '天地盘全同，主停滞不动、宜静不宜进取' })
  } else if (outer.length > 0 && outer.every((g) => b.sky.get(g) === b.earth.get(OPPOSITE[g]!))) {
    out.push({ name: '反吟', luck: '凶', note: '天地盘对冲分布，主反复动荡、事有变卦' })
  }

  for (const [gua, g] of heavenStems(b)) {
    if (g !== '庚') continue
    const earths = gua === '坤' ? [b.earth.get(gua), b.earth.get('中')] : [b.earth.get(gua)]
    if (earths.includes(dayGan)) {
      out.push({ name: '日格', palace: gua, luck: '凶', note: '庚加日干，阻隔于己' })
    } else if (earths.includes(hourGan)) {
      out.push({ name: '时格', palace: gua, luck: '凶', note: '庚加时干，阻隔于事' })
    }
  }

  for (const [who, gan] of [
    ['日干', dayGan],
    ['时干', hourGan],
  ] as const) {
    // 乙丙丁 are covered by 三奇入墓.
    if (gan in WONDER_TOMB) continue
    const at = skyOf(gan)
    if (at === undefined || at !== ZHI_PALACE[TOMB_ZHI[elementOf(gan)!]!]) continue
    out.push(
      tombOpen(gan)
        ? {
            name: `${who}入墓(逢冲开)`,
            palace: at,
            luck: '平',
            note: `${gan}（${who}）本落${at}墓库，逢时支冲开、力得出`,
          }
        : {
            name: `${who}入墓`,
            palace: at,
            luck: '凶',
            note: `${gan}（${who}）落${at}墓库，主困滞、力不出`,
          },
    )
  }
  return out
}

const PATTERN_SCORE: Readonly<Record<string, number>> = { 大吉: 3, 吉: 1.5, 凶: -2 }

const WEALTH_VERDICT: Readonly<Record<string, string>> = {
  生: '财来生我，得财(吉)',
  同: '比和，平',
  泄: '我生财位、泄气耗身，财难聚(平偏耗)',
  克: '财克身，破财(忌)',
  受克: '我克财，可求得(吉)',
}

/**
 * 求财 report: the wealth element is the 生门 palace's heaven stem (earth stem as fallback),
 * the querent is the day stem's own element. Returns the report and the score adjustment;
 * no report when the 生门 or the day stem falls in the centre.
 */
function wealthReport(
  c: Context,
  yong: readonly QimenYongShen[],
): [QimenJudgement['wealth'], number] {
  const shengMen = yong[0]!.palace
  const dayPalace = yong[1]!.palace
  if (shengMen === null || dayPalace === null || shengMen === '中') {
    return [undefined, 0]
  }
  const b = c.board
  const wealthElement = elementOf(b.sky.get(shengMen) ?? b.earth.get(shengMen)!)!
  const relation = elementRelation(wealthElement, elementOf(c.dayGan)!)
  const report: NonNullable<QimenJudgement['wealth']> = {
    shengMenPalace: shengMen,
    dayPalace,
    relation,
    verdict: WEALTH_VERDICT[relation]!,
  }
  if (relation === '生' || relation === '受克') {
    // The day stem's season stands in for the querent's capacity to hold wealth.
    const state = seasonOf(elementOf(c.dayGan)!, c.monthZhi)
    if (state === '旺' || state === '相') return [{ ...report, renCai: `日干${state}·能任财` }, 1.5]
    if (state === '休') return [{ ...report, renCai: '日干休·任财力减' }, 0.9]
    return [{ ...report, renCai: `日干${state}·财旺难任(反耗)` }, -0.5]
  }
  return [report, relation === '克' ? -1.5 : 0]
}

/**
 * Judges the chart for `event`: locates each 用神 and evaluates its palace, detects patterns,
 * and scores palaces (each distinct palace once), patterns (palace patterns at half weight
 * away from 用神), 驿马, void 用神 and the 值使 state; a centred 值符 is read and scored at
 * 坤 like any centred 用神. For 求财 the
 * 生门-against-day-stem report adjusts the total.
 */
export function judge(board: Board, event: QimenEvent): QimenJudgement {
  const [, month, day, hour] = board.pillars
  const c: Context = {
    board,
    dayGan: day.charAt(0),
    hourGan: hour.charAt(0),
    hourZhi: hour.charAt(1),
    monthZhi: month.charAt(1),
    voidZhi: board.xunKong.hour,
  }

  const yong: QimenYongShen[] = YONG_SHEN[event].map(([role, loc]) => {
    const [palace, symbol] = locate(c, loc)
    if (palace === null) return { role, symbol, palace }
    // 中宫寄坤: a symbol in the centre is read at 坤.
    const read = palace === '中' ? '坤' : palace
    const report = palaceReport(c, read)
    const [isVoid, voidRelease] = voidState(c, read, report.starState)
    return {
      role,
      symbol,
      palace,
      ...(palace === read ? {} : { lodgedAt: '坤' as const }),
      report,
      void: isVoid,
      ...(voidRelease === undefined ? {} : { voidRelease }),
    }
  })

  const patterns = detectPatterns(c)
  const readPalaces = yong.map(readPalace).filter((p): p is string => p !== null)
  const yongPalaces = new Set(readPalaces)

  const palaceScores = new Map<string, number>()
  for (const u of yong) {
    const read = readPalace(u)
    if (read !== null && !palaceScores.has(read)) palaceScores.set(read, u.report?.score ?? 0)
  }
  let base = 0
  for (const s of palaceScores.values()) base += s

  let patternScore = 0.0
  for (const p of patterns) {
    let raw = PATTERN_SCORE[p.luck] ?? 0
    if (p.palace !== undefined) raw *= yongPalaces.has(p.palace) ? 1.0 : 0.5
    patternScore += raw
  }
  patternScore = round2(patternScore)

  const yiMaPalace = ZHI_PALACE[MA_BY_ZHI[c.hourZhi]!]!
  for (const u of yong) if (readPalace(u) === yiMaPalace) u.yiMa = true
  const yiMa = yongPalaces.has(yiMaPalace) ? 0.5 : 0.0

  const voidCount = yong.filter((u) => u.void === true).length
  const voidPenalty = voidCount === 0 ? 0.0 : -1.0 * voidCount

  const voidPalaces = new Set(yong.filter((u) => u.void === true).map(readPalace))
  const zhiShiPalace = board.zhiShi[1]
  let zhiShi = 0.0
  let zhiShiNote: string | null = null
  if (zhiShiPalace === '中') {
    zhiShi = -0.5
    zhiShiNote = '值使入中·门户不通'
  } else if (!voidPalaces.has(zhiShiPalace)) {
    // A void already charged to a 用神 palace is not charged again for the 值使.
    const [isVoid] = voidState(c, zhiShiPalace, palaceReport(c, zhiShiPalace).starState)
    if (isVoid) {
      zhiShi = -0.5
      zhiShiNote = '值使临空·事无出路'
    }
  }
  const subtotal = round2(base + patternScore + voidPenalty + yiMa + zhiShi)

  const [wealth, wealthDelta] = event === '求财' ? wealthReport(c, yong) : [undefined, 0]
  const total = wealthDelta === 0 ? subtotal : round2(subtotal + wealthDelta)

  return {
    event,
    yongShen: yong,
    patterns,
    yiMaPalace,
    zhiShiNote,
    score: {
      palaces: round2(base),
      patterns: patternScore,
      yiMa,
      void: voidPenalty,
      zhiShi,
      wealth: wealthDelta,
      total,
    },
    ...(wealth === undefined ? {} : { wealth }),
  }
}
